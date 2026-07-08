import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { toDecimal } from '../../shared/money';
import { pspWebhookTotal } from '../../shared/metrics';
import type { PspWebhookEvent } from '../../domain/providers/IPaymentProvider';
import { postLedgerEntry, getCapturedAmount } from './PaymentService.ledger';
import type { PaymentAuthorizationFlow } from './PaymentService.authorization';
import type { PaymentCaptureRefundFlow } from './PaymentService.captureRefund';

/**
 * PSP webhook reconciliation (P-3 / P-11), extracted from PaymentService (see
 * that file for the full payment-lifecycle overview). The PSP is authoritative
 * for async outcomes (disputes, chargebacks, hold expiry, settlement). Every
 * branch is status-guarded so re-delivery is a safe no-op.
 *
 * Delegates back into the authorization/capture flows for the events that
 * promote/finalize a payment, so all three flows share one transition-guard
 * story per payment.
 */
export class PaymentWebhookFlow {
  constructor(
    private readonly authFlow: PaymentAuthorizationFlow,
    private readonly captureFlow: PaymentCaptureRefundFlow,
  ) {}

  async handleWebhookEvent(event: PspWebhookEvent): Promise<void> {
    // Correlate by bookingId (the PSP's merchantTransactionId) when present — it is
    // stable across every transaction op, whereas the providerRef changes between the
    // pre-auth, capture, and refund (and isn't yet stored at authorization time).
    // Fall back to providerRef (legacy mock events carry only that).
    const payment = event.bookingId
      ? await prisma.payment.findUnique({ where: { bookingId: event.bookingId } })
      : await prisma.payment.findFirst({ where: { providerRef: event.providerRef } });
    if (!payment) {
      logger.warn({ event }, 'webhook: no payment for event, ignoring');
      pspWebhookTotal.inc({ type: event.type, result: 'error' });
      return;
    }

    switch (event.type) {
      case 'payment.authorized': {
        // Hosted-checkout authorization confirmed by the PSP (source of truth). Promote
        // even if the customer never returned to our status-query page. Idempotent:
        // applyAuthorization no-ops if the status query already promoted it.
        if (payment.status === 'PENDING') {
          await this.authFlow.applyAuthorization(payment.id, payment.bookingId, {
            state: 'authorized',
            providerRef: event.providerRef,
            amountJod: event.amountJod,
            currency: event.currency,
            cardBrand: event.cardBrand,
            cardLast4: event.cardLast4,
            resultCode: '',
            resultDescription: 'webhook',
          });
        }
        break;
      }
      case 'payment.captured': {
        // N-4: capture initiated out-of-band at the PSP (e.g. dashboard) →
        // reconcile into our state via the same finalize path.
        if (payment.status === 'PRE_AUTHORIZED') {
          const captured = toDecimal(event.amountJod ?? payment.amountJod);
          await this.captureFlow.finalizeCapture(payment.id, payment.bookingId, captured, event.providerRef);
        }
        break;
      }
      case 'payment.auth.expired': {
        const r = await prisma.payment.updateMany({
          where: { id: payment.id, status: 'PRE_AUTHORIZED' },
          data: { status: 'FAILED' },
        });
        if (r.count > 0) logger.error({ bookingId: payment.bookingId }, 'webhook: auth expired before capture — funds not collected');
        break;
      }
      case 'payment.dispute.opened': {
        const amount = toDecimal(event.amountJod ?? payment.capturedAmountJod ?? payment.amountJod);
        await prisma.$transaction(async (tx) => {
          // N-3: ALWAYS record the dispute (audit/visibility), even if the
          // payment isn't in a normally-disputable state.
          await tx.dispute.create({ data: { paymentId: payment.id, providerRef: event.providerRef, reason: event.reason, amountJod: amount } });
          const r = await tx.payment.updateMany({
            where: { id: payment.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
            data: { status: 'DISPUTED', disputedAt: new Date() },
          });
          if (r.count > 0) {
            await postLedgerEntry(tx, payment.id, 'DISPUTE', amount, `Dispute opened: ${event.reason ?? 'unspecified'}`);
            await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'DISPUTED' } }).catch(() => undefined);
          } else {
            // Dispute on a refunded/uncaptured payment → possible double-pay; flag.
            logger.error({ bookingId: payment.bookingId, status: payment.status }, 'webhook: dispute on a non-disputable payment — manual review required');
          }
        });
        break;
      }
      case 'payment.dispute.closed': {
        await prisma.$transaction(async (tx) => {
          const dispute = await tx.dispute.findFirst({ where: { paymentId: payment.id, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
          if (!dispute) {
            // N-5: out-of-order delivery (closed before opened) or already resolved.
            logger.warn({ bookingId: payment.bookingId }, 'webhook: dispute.closed with no open dispute — ignoring (out-of-order?)');
            return;
          }
          await tx.dispute.update({ where: { id: dispute.id }, data: { status: event.disputeWon ? 'WON' : 'LOST', resolvedAt: new Date() } });
          if (event.disputeWon) {
            await tx.payment.updateMany({ where: { id: payment.id, status: 'DISPUTED' }, data: { status: 'CAPTURED' } });
          } else {
            const r = await tx.payment.updateMany({ where: { id: payment.id, status: 'DISPUTED' }, data: { status: 'CHARGEBACK' } });
            if (r.count > 0) {
              await postLedgerEntry(tx, payment.id, 'CHARGEBACK', toDecimal(dispute.amountJod), 'Chargeback lost');
              const clawed = await tx.payout.updateMany({ where: { paymentId: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
              if (clawed.count === 0) {
                // N-2: payout already disbursed → platform absorbed the chargeback; alert for manual recovery.
                const paid = await tx.payout.findFirst({ where: { paymentId: payment.id, status: { in: ['PROCESSING', 'COMPLETED'] } } });
                if (paid) logger.error({ bookingId: payment.bookingId, payoutId: paid.id }, 'chargeback: payout already disbursed — manual clawback required');
              }
            }
          }
        });
        break;
      }
      case 'payment.refunded': {
        // Reconcile our refunded total to the PSP's authoritative figure (P-11 / F1).
        // Move the total FORWARD only. A re-delivery or a refund that doesn't advance
        // the total is a no-op (settled <= prior) — that keeps the ledger write below
        // idempotent (no duplicate REFUND row on webhook redelivery).
        const settled = toDecimal(event.amountJod ?? 0);
        const captured = getCapturedAmount(payment);
        const priorRefunded = toDecimal(payment.refundedAmountJod);
        if (settled.lessThanOrEqualTo(priorRefunded)) break;
        await prisma.$transaction(async (tx) => {
          // Exact-value optimistic guard on the amount we read (mirrors refundCaptured):
          // a concurrent app-side refund changes the value → count 0 → we skip, and that
          // writer already wrote its own ledger entry. No clobber, no double-apply.
          const r = await tx.payment.updateMany({
            where: {
              id: payment.id,
              refundedAmountJod: priorRefunded,
              status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
            },
            data: {
              refundedAmountJod: settled,
              status: settled.greaterThanOrEqualTo(captured) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              refundedAt: new Date(),
            },
          });
          // Write the REFUND ledger entry for the DELTA only when we actually moved the
          // total — without this, a refund initiated entirely PSP-side (dashboard) would
          // reconcile the amount but leave sum(ledger) != net cash, breaking the
          // ledger==entries invariant for that payment.
          if (r.count > 0) {
            await postLedgerEntry(tx, payment.id, 'REFUND', settled.minus(priorRefunded), 'Refund settled (PSP-side)');
          }
        });
        break;
      }
      default:
        logger.warn({ type: event.type }, 'webhook: unhandled event type, ignoring');
        pspWebhookTotal.inc({ type: event.type, result: 'error' });
        return;
    }
    pspWebhookTotal.inc({ type: event.type, result: 'ok' });
  }
}

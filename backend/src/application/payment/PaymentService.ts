import { Prisma, LedgerType, LedgerDirection } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { toDecimal, isPositive, splitCommission } from '../../shared/money';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { paymentOpsTotal, pspWebhookTotal } from '../../shared/metrics';
import type { IPaymentProvider, PspWebhookEvent } from '../../domain/providers/IPaymentProvider';

/** Cash-direction of each ledger type (CREDIT = into platform, DEBIT = out). */
const LEDGER_DIRECTION: Record<LedgerType, LedgerDirection> = {
  CHARGE: 'CREDIT',
  CAPTURE: 'CREDIT',
  FEE: 'CREDIT',
  REFUND: 'DEBIT',
  PAYOUT: 'DEBIT',
  DISPUTE: 'DEBIT',
  CHARGEBACK: 'DEBIT',
  ADJUSTMENT: 'CREDIT',
};

type Tx = Prisma.TransactionClient;

/**
 * Payment lifecycle for a booking, driven by outbox events + PSP webhooks.
 *
 * Outbox (at-least-once → every method idempotent):
 *   booking.created   → preAuthorizeForBooking  (place hold)
 *   booking.completed → captureForBooking       (capture + commission split + payout accrual)
 *   booking.cancelled → handleCancellation      (void hold OR refund capture, claw back payout)
 *
 * PSP webhooks (the PSP is the source of truth for async outcomes):
 *   dispute.opened/closed, auth.expired, refund.settled → handleWebhookEvent
 *
 * Safety model:
 *   - PSP idempotency keys de-dupe external calls across retries/crashes.
 *   - Transition-guarded writes (updateMany WHERE status=expected) make every
 *     DB mutation apply at most once, so replays/concurrent workers can't
 *     double-apply a state change or write a duplicate ledger row.
 *   - All money is Prisma.Decimal end-to-end (never float).
 */
export class PaymentService {
  constructor(
    private readonly provider: IPaymentProvider,
    private readonly providerName = 'mock',
  ) {}

  // ── helpers ───────────────────────────────────────────────────────────────
  private async ledger(
    tx: Tx,
    paymentId: string,
    type: LedgerType,
    amount: Prisma.Decimal,
    description: string,
  ): Promise<void> {
    await tx.ledgerEntry.create({
      data: { paymentId, type, direction: LEDGER_DIRECTION[type], amountJod: amount, currency: env().CURRENCY, description },
    });
  }

  // ── booking.created → place the hold ──────────────────────────────────────
  /** Place a hold for a new booking. Idempotent: no-op if an active Payment exists. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> {
    const existing = await prisma.payment.findUnique({ where: { bookingId } });
    // Skip only when a hold is already placed or settled. (We never create
    // PENDING/FAILED rows, so today this is equivalent to "any row", but the
    // explicit check is correct if that ever changes.)
    if (existing && existing.status !== 'PENDING') {
      logger.debug({ bookingId, status: existing.status }, 'preAuthorize: payment already active, skipping');
      paymentOpsTotal.inc({ op: 'preauth', result: 'skipped' });
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, totalJod: true },
    });
    if (!booking) {
      logger.warn({ bookingId }, 'preAuthorize: booking not found, skipping');
      paymentOpsTotal.inc({ op: 'preauth', result: 'skipped' });
      return;
    }

    const amount = toDecimal(booking.totalJod);
    if (!isPositive(amount)) {
      // A zero/negative booking total is a data anomaly — never call the PSP.
      logger.error({ bookingId, amount: amount.toString() }, 'preAuthorize: non-positive amount, refusing');
      paymentOpsTotal.inc({ op: 'preauth', result: 'failed' });
      return;
    }

    const result = await this.provider.preAuthorize(bookingId, amount.toNumber(), `preauth:${bookingId}`);

    try {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            bookingId,
            status: 'PRE_AUTHORIZED',
            provider: this.providerName,
            providerRef: result.providerRef,
            currency: env().CURRENCY,
            amountJod: amount,
            preAuthorizedAt: new Date(),
          },
        });
        await this.ledger(tx, payment.id, 'CHARGE', amount, 'Pre-authorization hold');
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.debug({ bookingId }, 'preAuthorize: payment created concurrently, skipping');
        paymentOpsTotal.inc({ op: 'preauth', result: 'skipped' });
        return;
      }
      paymentOpsTotal.inc({ op: 'preauth', result: 'failed' });
      throw err;
    }

    paymentOpsTotal.inc({ op: 'preauth', result: 'ok' });
    logger.info({ bookingId, amount: amount.toString() }, 'Payment pre-authorized');
  }

  // ── booking.completed → capture ───────────────────────────────────────────
  /**
   * Capture held funds on completion. Optional `requestedAmountJod` enables a
   * partial capture (≤ authorized) for partial-work scenarios; defaults to full.
   * Splits the platform commission and accrues the technician's payout. No-op
   * unless currently PRE_AUTHORIZED. Re-authorizes first if the hold has expired.
   */
  async captureForBooking(bookingId: string, requestedAmountJod?: number | string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || !payment.providerRef) {
      logger.warn({ bookingId }, 'capture: payment not found, skipping');
      paymentOpsTotal.inc({ op: 'capture', result: 'skipped' });
      return;
    }
    if (payment.status !== 'PRE_AUTHORIZED') {
      logger.debug({ bookingId, status: payment.status }, 'capture: not PRE_AUTHORIZED, skipping');
      paymentOpsTotal.inc({ op: 'capture', result: 'skipped' });
      return;
    }

    const authorized = toDecimal(payment.amountJod);
    const amount = requestedAmountJod !== undefined ? toDecimal(requestedAmountJod) : authorized;
    if (!isPositive(amount) || amount.greaterThan(authorized)) {
      logger.error({ bookingId, amount: amount.toString(), authorized: authorized.toString() }, 'capture: invalid amount, refusing');
      paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
      return;
    }

    // Re-authorize if the hold has likely expired at the PSP (P-2).
    let providerRef = payment.providerRef;
    const holdAgeMs = Date.now() - (payment.preAuthorizedAt?.getTime() ?? 0);
    const expiryMs = env().AUTH_HOLD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (payment.preAuthorizedAt && holdAgeMs > expiryMs) {
      logger.warn({ bookingId, holdAgeMs }, 'capture: hold expired, re-authorizing before capture');
      try {
        const reauth = await this.provider.preAuthorize(bookingId, authorized.toNumber(), `reauth:${bookingId}`);
        providerRef = reauth.providerRef;
        await prisma.payment.updateMany({
          where: { id: payment.id, status: 'PRE_AUTHORIZED' },
          data: { providerRef, preAuthorizedAt: new Date() },
        });
      } catch (err) {
        paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
        throw err; // outbox retries
      }
    }

    let result;
    try {
      result = await this.provider.capture(providerRef, amount.toNumber(), `capture:${bookingId}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
      throw err; // outbox retries; status stays PRE_AUTHORIZED
    }

    const captured = toDecimal(result.capturedAmountJod);
    const applied = await this.finalizeCapture(payment.id, bookingId, captured);

    if (!applied) {
      logger.debug({ bookingId }, 'capture: state changed under us (replay/concurrent), skipping');
      paymentOpsTotal.inc({ op: 'capture', result: 'skipped' });
      return;
    }

    // N-1: a partial capture leaves the uncaptured remainder of the hold
    // outstanding. Most PSPs auto-release it, but void best-effort so the
    // customer's funds are never stranded if a PSP doesn't.
    if (captured.lessThan(authorized)) {
      try {
        await this.provider.void(providerRef, `void-residual:${bookingId}`);
        logger.info({ bookingId, released: authorized.minus(captured).toString() }, 'capture: released residual hold');
      } catch (err) {
        logger.warn({ bookingId, err }, 'capture: residual-hold release best-effort failed (PSP may auto-release)');
      }
    }

    paymentOpsTotal.inc({ op: 'capture', result: 'ok' });
    logger.info({ bookingId, captured: captured.toString() }, 'Payment captured');
  }

  /**
   * Transactional capture finalize: flip PRE_AUTHORIZED → CAPTURED under a
   * transition guard, write CAPTURE + FEE ledger, and accrue the technician's
   * net payout. Shared by the completion flow and the out-of-band
   * `payment.captured` webhook (N-4). Returns true if this call applied it.
   */
  private async finalizeCapture(paymentId: string, bookingId: string, captured: Prisma.Decimal): Promise<boolean> {
    const { fee, net } = splitCommission(captured, env().PLATFORM_COMMISSION_PCT);
    return prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PRE_AUTHORIZED' },
        data: { status: 'CAPTURED', capturedAmountJod: captured, feeJod: fee, capturedAt: new Date() },
      });
      if (claim.count === 0) return false;

      await this.ledger(tx, paymentId, 'CAPTURE', captured, 'Capture on booking completion');
      if (isPositive(fee)) await this.ledger(tx, paymentId, 'FEE', fee, 'Platform commission');

      const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { technicianId: true } });
      if (booking?.technicianId && isPositive(net)) {
        await tx.payout.create({
          data: { technicianId: booking.technicianId, paymentId, amountJod: net, currency: env().CURRENCY },
        });
      } else if (!booking?.technicianId) {
        logger.error({ bookingId }, 'capture: no technician assigned — payout NOT accrued (needs manual review)');
      }
      return true;
    });
  }

  // ── booking.cancelled → release money ─────────────────────────────────────
  /**
   * Release money tied to a cancelled booking. Exhaustive + idempotent:
   *   PRE_AUTHORIZED                 → VOID the hold
   *   CAPTURED / PARTIALLY_REFUNDED  → REFUND the outstanding captured amount
   *                                    and claw back any not-yet-paid payout
   *   REFUNDED / FAILED / DISPUTED…  → no-op
   */
  async handleCancellation(bookingId: string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || !payment.providerRef) {
      logger.debug({ bookingId }, 'cancel: no payment to reverse, skipping');
      paymentOpsTotal.inc({ op: 'reverse', result: 'skipped' });
      return;
    }

    if (payment.status === 'PRE_AUTHORIZED') {
      await this.voidHold(bookingId, payment.id, payment.providerRef, toDecimal(payment.amountJod));
      return;
    }
    if (payment.status === 'CAPTURED' || payment.status === 'PARTIALLY_REFUNDED') {
      const captured = toDecimal(payment.capturedAmountJod ?? payment.amountJod);
      const outstanding = captured.minus(toDecimal(payment.refundedAmountJod));
      if (isPositive(outstanding)) {
        await this.refundCaptured(bookingId, payment.id, payment.providerRef, outstanding, toDecimal(payment.refundedAmountJod), captured);
      }
      return;
    }

    logger.debug({ bookingId, status: payment.status }, 'cancel: payment not reversible, skipping');
    paymentOpsTotal.inc({ op: 'reverse', result: 'skipped' });
  }

  private async voidHold(bookingId: string, paymentId: string, providerRef: string, amount: Prisma.Decimal): Promise<void> {
    try {
      await this.provider.void(providerRef, `void:${bookingId}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'void', result: 'failed' });
      throw err;
    }
    const applied = await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PRE_AUTHORIZED' },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await this.ledger(tx, paymentId, 'REFUND', amount, 'Hold released on cancellation');
      return true;
    });
    paymentOpsTotal.inc({ op: 'void', result: applied ? 'ok' : 'skipped' });
    if (applied) logger.info({ bookingId, amount: amount.toString() }, 'Hold voided on cancellation');
  }

  /** Refund an outstanding captured amount + claw back the unpaid payout. */
  private async refundCaptured(
    bookingId: string,
    paymentId: string,
    providerRef: string,
    amount: Prisma.Decimal,
    priorRefunded: Prisma.Decimal,
    captured: Prisma.Decimal,
  ): Promise<void> {
    try {
      await this.provider.refund(providerRef, amount.toNumber(), `refund:${bookingId}:${priorRefunded.toString()}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'refund', result: 'failed' });
      throw err;
    }
    const applied = await prisma.$transaction(async (tx) => {
      // Guard on the refunded total we read, so concurrent refunds can't stack.
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, refundedAmountJod: priorRefunded, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
        data: { status: 'REFUNDED', refundedAmountJod: captured, refundedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await this.ledger(tx, paymentId, 'REFUND', amount, 'Refund on cancellation');
      // Claw back the technician's payout if it hasn't been disbursed yet.
      const clawed = await tx.payout.updateMany({
        where: { paymentId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      if (clawed.count === 0) {
        const paid = await tx.payout.findFirst({ where: { paymentId, status: { in: ['PROCESSING', 'COMPLETED'] } } });
        if (paid) logger.error({ bookingId, payoutId: paid.id }, 'cancel: payout already disbursed — manual clawback required');
      }
      return true;
    });
    paymentOpsTotal.inc({ op: 'refund', result: applied ? 'ok' : 'skipped' });
    if (applied) logger.info({ bookingId, amount: amount.toString() }, 'Captured funds refunded on cancellation');
  }

  // ── admin-initiated partial refund (P-8) ──────────────────────────────────
  /** Refund a specific amount (≤ outstanding captured). Sets PARTIALLY_REFUNDED or REFUNDED. */
  async refundBooking(bookingId: string, amountJod: number | string) {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || !payment.providerRef) throw new NotFoundError('Captured payment');
    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new ConflictError(`Cannot refund a payment in status ${payment.status}`);
    }
    const captured = toDecimal(payment.capturedAmountJod ?? payment.amountJod);
    const priorRefunded = toDecimal(payment.refundedAmountJod);
    const outstanding = captured.minus(priorRefunded);
    const amount = toDecimal(amountJod);
    if (!isPositive(amount) || amount.greaterThan(outstanding)) {
      throw new ValidationError(`Refund amount ${amount.toString()} exceeds outstanding ${outstanding.toString()}`);
    }

    await this.provider.refund(payment.providerRef, amount.toNumber(), `refund:${bookingId}:${priorRefunded.toString()}`);

    const newRefunded = priorRefunded.plus(amount);
    const fullyRefunded = newRefunded.greaterThanOrEqualTo(captured);
    const applied = await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, refundedAmountJod: priorRefunded, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
        data: {
          status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAmountJod: newRefunded,
          refundedAt: fullyRefunded ? new Date() : payment.refundedAt,
        },
      });
      if (claim.count === 0) return false;
      await this.ledger(tx, payment.id, 'REFUND', amount, fullyRefunded ? 'Full refund' : 'Partial refund');
      if (fullyRefunded) {
        await tx.payout.updateMany({ where: { paymentId: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      }
      return true;
    });
    if (!applied) throw new ConflictError('Refund raced with a concurrent update; retry');
    paymentOpsTotal.inc({ op: 'refund', result: 'ok' });
    logger.info({ bookingId, amount: amount.toString(), fullyRefunded }, 'Manual refund applied');
    return prisma.payment.findUniqueOrThrow({ where: { bookingId } });
  }

  // ── PSP webhooks (P-3 / P-11) ─────────────────────────────────────────────
  /**
   * Apply a verified, deduped PSP webhook. The PSP is authoritative for async
   * outcomes (disputes, chargebacks, hold expiry, settlement). Every branch is
   * status-guarded so re-delivery is a safe no-op.
   */
  async handleWebhookEvent(event: PspWebhookEvent): Promise<void> {
    const payment = await prisma.payment.findFirst({ where: { providerRef: event.providerRef } });
    if (!payment) {
      logger.warn({ event }, 'webhook: no payment for providerRef, ignoring');
      pspWebhookTotal.inc({ type: event.type, result: 'error' });
      return;
    }

    switch (event.type) {
      case 'payment.captured': {
        // N-4: capture initiated out-of-band at the PSP (e.g. dashboard) →
        // reconcile into our state via the same finalize path.
        if (payment.status === 'PRE_AUTHORIZED') {
          const captured = toDecimal(event.amountJod ?? payment.amountJod);
          await this.finalizeCapture(payment.id, payment.bookingId, captured);
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
            await this.ledger(tx, payment.id, 'DISPUTE', amount, `Dispute opened: ${event.reason ?? 'unspecified'}`);
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
              await this.ledger(tx, payment.id, 'CHARGEBACK', toDecimal(dispute.amountJod), 'Chargeback lost');
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
        // Reconcile our refunded total to the PSP's authoritative figure (P-11).
        const settled = toDecimal(event.amountJod ?? 0);
        if (settled.greaterThan(toDecimal(payment.refundedAmountJod))) {
          const captured = toDecimal(payment.capturedAmountJod ?? payment.amountJod);
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              refundedAmountJod: settled,
              status: settled.greaterThanOrEqualTo(captured) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              refundedAt: new Date(),
            },
          });
        }
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

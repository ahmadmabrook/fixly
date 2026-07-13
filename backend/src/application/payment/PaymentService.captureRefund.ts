import { Prisma, PaymentStatus, PayoutStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { toDecimal, isPositive, splitCommission } from '../../shared/money';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { paymentOpsTotal } from '../../shared/metrics';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';
import { postLedgerEntry, getCapturedAmount } from './PaymentService.ledger';

type Tx = Prisma.TransactionClient;

/**
 * Capture, cancellation-release, and refund lifecycle, extracted from
 * PaymentService (see that file for the full payment-lifecycle overview):
 *   booking.completed → captureForBooking (capture + commission split + payout accrual)
 *   booking.cancelled → handleCancellation (void hold OR refund capture, claw back payout)
 *   admin-initiated   → refundBooking (partial refund, P-8)
 *
 * `finalizeCapture` is also invoked by PaymentWebhookFlow for the
 * `payment.captured` webhook, so it is exposed (not private) on this class.
 */
export class PaymentCaptureRefundFlow {
  constructor(
    private readonly provider: IPaymentProvider,
    private readonly providerName: string,
  ) {}

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
    if (payment.status !== PaymentStatus.PRE_AUTHORIZED) {
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
      if (this.provider.mode === 'hosted') {
        // Hosted checkout holds no reusable card token (card-on-file deferred), so an
        // expired hold cannot be re-authorized server-side. Fail loudly for manual
        // triage rather than silently delivering the service for free.
        logger.error({ bookingId, holdAgeMs }, 'capture: hold expired and not re-authorizable (hosted, no card-on-file) — manual review required');
        paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
        throw new Error('Authorization hold expired; capture requires manual re-authorization');
      }
      logger.warn({ bookingId, holdAgeMs }, 'capture: hold expired, re-authorizing before capture');
      try {
        const reauth = await this.provider.preAuthorize(bookingId, authorized.toString(), `reauth:${bookingId}`);
        providerRef = reauth.providerRef;
        await prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PRE_AUTHORIZED },
          data: { providerRef, preAuthorizedAt: new Date() },
        });
      } catch (err) {
        paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
        throw err; // outbox retries
      }
    }

    // Double-capture guard (hosted / real PSP): a prior attempt may have captured at the
    // PSP but failed to commit here (payment still PRE_AUTHORIZED → the outbox retries).
    // Re-capturing would double-charge. Reconcile first: if already CAPTURED at the PSP,
    // finalize without a second capture call. Gated to hosted mode — the mock's getStatus
    // is a constant CAPTURED stub, so prechecking it would break the instant path's tests.
    let captured: Prisma.Decimal;
    let captureRef = providerRef;
    if (this.provider.mode === 'hosted') {
      try {
        const status = await this.provider.getStatus(providerRef);
        if (status.state === 'CAPTURED') {
          captured = toDecimal(status.capturedAmountJod ?? amount);
          const reconciled = await this.finalizeCapture(payment.id, bookingId, captured, captureRef);
          paymentOpsTotal.inc({ op: 'capture', result: reconciled ? 'ok' : 'skipped' });
          if (reconciled) logger.info({ bookingId, captured: captured.toString() }, 'Payment capture reconciled (already captured at PSP)');
          return;
        }
      } catch (err) {
        // Status query failed — fall through to a normal capture (transition-guarded).
        logger.warn({ bookingId, err }, 'capture: pre-capture status reconcile failed, proceeding to capture');
      }
    }

    let result;
    try {
      result = await this.provider.capture(providerRef, amount.toString(), `capture:${bookingId}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
      throw err; // outbox retries; status stays PRE_AUTHORIZED
    }

    captured = toDecimal(result.capturedAmountJod);
    // OPPWA mints a new transaction id for the capture; later refunds must reference IT.
    captureRef = result.providerRef;
    const applied = await this.finalizeCapture(payment.id, bookingId, captured, captureRef);

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
  async finalizeCapture(paymentId: string, bookingId: string, captured: Prisma.Decimal, captureProviderRef?: string): Promise<boolean> {
    const { fee, net } = splitCommission(captured, env().PLATFORM_COMMISSION_PCT);
    return prisma.$transaction(async (tx) => {
      // Explicit row lock on the payment before the CAS-guarded update below. Postgres's
      // UPDATE ... WHERE already takes an implicit row lock (a concurrent capture/webhook
      // blocks until this transaction commits, then re-evaluates the WHERE and sees 0 rows),
      // so this is defense-in-depth rather than a behavior change — it makes the ledger's
      // single-writer-per-payment invariant explicit rather than relying on that implicit
      // semantic, and ensures the ledger-entry writes below are covered by the same lock.
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PRE_AUTHORIZED },
        // Persist the capture transaction id (when the PSP mints a new one) so later
        // refunds reference the capture, not the original pre-authorization.
        data: { status: PaymentStatus.CAPTURED, capturedAmountJod: captured, feeJod: fee, capturedAt: new Date(), ...(captureProviderRef ? { providerRef: captureProviderRef } : {}) },
      });
      if (claim.count === 0) return false;

      await postLedgerEntry(tx, paymentId, 'CAPTURE', captured, 'Capture on booking completion');
      if (isPositive(fee)) await postLedgerEntry(tx, paymentId, 'FEE', fee, 'Platform commission');

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

    if (payment.status === PaymentStatus.PRE_AUTHORIZED) {
      await this.voidHold(bookingId, payment.id, payment.providerRef, toDecimal(payment.amountJod));
      return;
    }
    if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.PARTIALLY_REFUNDED) {
      const captured = getCapturedAmount(payment);
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
    const applied = await prisma.$transaction(async (tx: Tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PRE_AUTHORIZED },
        data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await postLedgerEntry(tx, paymentId, 'REFUND', amount, 'Hold released on cancellation');
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
      await this.provider.refund(providerRef, amount.toString(), `refund:${bookingId}:${priorRefunded.toString()}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'refund', result: 'failed' });
      throw err;
    }
    const applied = await prisma.$transaction(async (tx: Tx) => {
      // Guard on the refunded total we read, so concurrent refunds can't stack.
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, refundedAmountJod: priorRefunded, status: { in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED] } },
        data: { status: PaymentStatus.REFUNDED, refundedAmountJod: captured, refundedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await postLedgerEntry(tx, paymentId, 'REFUND', amount, 'Refund on cancellation');
      // Claw back the technician's payout if it hasn't been disbursed yet.
      const clawed = await tx.payout.updateMany({
        where: { paymentId, status: PayoutStatus.PENDING },
        data: { status: PayoutStatus.FAILED },
      });
      if (clawed.count === 0) {
        const paid = await tx.payout.findFirst({ where: { paymentId, status: { in: [PayoutStatus.PROCESSING, PayoutStatus.COMPLETED] } } });
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
    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new ConflictError(`Cannot refund a payment in status ${payment.status}`);
    }
    const captured = getCapturedAmount(payment);
    const priorRefunded = toDecimal(payment.refundedAmountJod);
    const outstanding = captured.minus(priorRefunded);
    const amount = toDecimal(amountJod);
    if (!isPositive(amount) || amount.greaterThan(outstanding)) {
      throw new ValidationError(`Refund amount ${amount.toString()} exceeds outstanding ${outstanding.toString()}`);
    }

    await this.provider.refund(payment.providerRef, amount.toString(), `refund:${bookingId}:${priorRefunded.toString()}`);

    const newRefunded = priorRefunded.plus(amount);
    const fullyRefunded = newRefunded.greaterThanOrEqualTo(captured);
    const applied = await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, refundedAmountJod: priorRefunded, status: { in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED] } },
        data: {
          status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          refundedAmountJod: newRefunded,
          refundedAt: fullyRefunded ? new Date() : payment.refundedAt,
        },
      });
      if (claim.count === 0) return false;
      await postLedgerEntry(tx, payment.id, 'REFUND', amount, fullyRefunded ? 'Full refund' : 'Partial refund');
      if (fullyRefunded) {
        await tx.payout.updateMany({ where: { paymentId: payment.id, status: PayoutStatus.PENDING }, data: { status: PayoutStatus.FAILED } });
      }
      return true;
    });
    if (!applied) throw new ConflictError('Refund raced with a concurrent update; retry');
    paymentOpsTotal.inc({ op: 'refund', result: 'ok' });
    logger.info({ bookingId, amount: amount.toString(), fullyRefunded }, 'Manual refund applied');
    return prisma.payment.findUniqueOrThrow({ where: { bookingId } });
  }
}

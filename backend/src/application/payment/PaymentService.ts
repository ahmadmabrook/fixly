import { Prisma, LedgerType, LedgerDirection } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { toDecimal, isPositive, splitCommission } from '../../shared/money';
import { AppError, NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { paymentOpsTotal, pspWebhookTotal } from '../../shared/metrics';
import type { IPaymentProvider, PspWebhookEvent, PrepareCheckoutResult, CheckoutResult } from '../../domain/providers/IPaymentProvider';

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

/** Internal sentinel: a hosted authorization landed for a booking that is no longer
 *  AWAITING_PAYMENT (cancelled/expired). Used to roll back the promotion tx and void. */
class BookingNoLongerAwaitingError extends Error {}

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

  /**
   * Captured amount for a payment that should be CAPTURED/PARTIALLY_REFUNDED. The column is
   * always written by `finalizeCapture`, so a null here is data corruption. We return 0
   * rather than falling back to the (larger) authorized hold `amountJod` — that fallback
   * could over-refund a partial capture (F4). 0 makes any refund a safe no-op + alerts.
   */
  private capturedAmount(payment: { capturedAmountJod: Prisma.Decimal | null; amountJod: Prisma.Decimal; bookingId: string; status: string }): Prisma.Decimal {
    if (payment.capturedAmountJod == null) {
      logger.error({ bookingId: payment.bookingId, status: payment.status }, 'captured amount missing on a captured payment — data anomaly, manual review required');
      throw new AppError('Payment data anomaly: captured amount missing. Manual review required.', 500, 'DATA_ANOMALY');
    }
    return toDecimal(payment.capturedAmountJod);
  }

  // ── booking.created → place the hold ──────────────────────────────────────
  /** Place a hold for a new booking. Idempotent: no-op if an active Payment exists. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> {
    // Hosted-checkout providers authorize via the customer-driven checkout flow
    // (prepareCheckout → finalizeCheckout/webhook), not here. In hosted mode the
    // booking.created event is only emitted AFTER authorization, so this handler is
    // a safe no-op (the notification handler still runs). Guard anyway so a stray
    // event never reaches provider.preAuthorize (which throws for hosted).
    if (this.provider.mode === 'hosted') return;
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

    const result = await this.provider.preAuthorize(bookingId, amount.toString(), `preauth:${bookingId}`);

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

  // ── hosted checkout (real PSP): customer-driven pre-authorization ──────────
  /**
   * Open (or refresh) a hosted-checkout session for a booking awaiting payment.
   * Idempotent on bookingId: a Payment row is created PENDING (or reset to PENDING
   * on retry) and its `checkoutId` is updated to the new session. The booking stays
   * AWAITING_PAYMENT until `finalizeCheckout`/the webhook promotes it.
   */
  async prepareCheckout(bookingId: string): Promise<PrepareCheckoutResult> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, totalJod: true, status: true },
    });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== 'AWAITING_PAYMENT') {
      throw new ConflictError(`Booking is not awaiting payment (status ${booking.status})`);
    }
    const amount = toDecimal(booking.totalJod);
    if (!isPositive(amount)) throw new ValidationError('Booking total must be positive');

    const session = await this.provider.prepareCheckout({
      bookingId,
      amountJod: amount.toString(),
      currency: env().CURRENCY,
    });

    // Create the PENDING Payment, or refresh the session on a retry. Never touch a
    // row that has already moved past PENDING (authorization promotes it elsewhere).
    await prisma.payment.upsert({
      where: { bookingId },
      create: {
        bookingId,
        status: 'PENDING',
        provider: this.providerName,
        currency: env().CURRENCY,
        amountJod: amount,
        method: 'card',
        checkoutId: session.checkoutId,
      },
      update: { status: 'PENDING', checkoutId: session.checkoutId, amountJod: amount },
    });

    paymentOpsTotal.inc({ op: 'checkout', result: 'ok' });
    logger.info({ bookingId, checkoutId: session.checkoutId }, 'Hosted checkout prepared');
    return session;
  }

  /**
   * Query the hosted-checkout outcome and reconcile it into our state. Idempotent and
   * safe to call repeatedly (e.g. from the customer's return page):
   *   authorized → promote (Payment PRE_AUTHORIZED, Booking PENDING, emit booking.created)
   *   pending    → leave AWAITING_PAYMENT (a webhook will resolve it)
   *   rejected   → mark Payment FAILED so the customer can retry with a new session
   * Returns the resolved checkout state.
   */
  async finalizeCheckout(bookingId: string): Promise<'authorized' | 'pending' | 'rejected'> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment) throw new NotFoundError('Payment');
    // Already resolved → report idempotently without re-querying the PSP.
    if (payment.status === 'PRE_AUTHORIZED' || payment.status === 'CAPTURED') return 'authorized';
    if (payment.status === 'FAILED') return 'rejected';
    if (payment.status !== 'PENDING' || !payment.checkoutId) return 'pending';

    const result = await this.provider.getCheckoutResult(payment.checkoutId);
    if (result.state === 'authorized') {
      // 'rejected' here means an amount/currency mismatch was voided; 'promoted'/'already'
      // both mean the hold is good and the booking is (or just became) live.
      const outcome = await this.applyAuthorization(payment.id, bookingId, result);
      return outcome === 'rejected' ? 'rejected' : 'authorized';
    }
    if (result.state === 'rejected') {
      await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      paymentOpsTotal.inc({ op: 'authorize', result: 'failed' });
      logger.warn({ bookingId, code: result.resultCode }, 'Hosted checkout rejected');
      return 'rejected';
    }
    return 'pending';
  }

  /**
   * Promote a successfully-authorized checkout: flip Payment PENDING → PRE_AUTHORIZED
   * (+ providerRef, card metadata, CHARGE ledger) and Booking AWAITING_PAYMENT → PENDING,
   * emitting booking.created so technicians can see it. Transition-guarded and shared by
   * `finalizeCheckout` and the `payment.authorized` webhook, so the status query and the
   * webhook race safely (whichever wins promotes; the other no-ops).
   *
   * Verifies the authorized amount + currency match the booking before holding; on
   * mismatch (tampering / wrong session) it voids the hold and marks the payment FAILED.
   * On a duplicate authorization (a second session also authorized) it voids the extra hold.
   */
  private async applyAuthorization(paymentId: string, bookingId: string, result: CheckoutResult): Promise<'promoted' | 'already' | 'rejected'> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { totalJod: true, customerId: true } });
    if (!booking) {
      logger.error({ bookingId }, 'authorize: booking missing — cannot promote');
      return 'rejected';
    }
    const expected = toDecimal(booking.totalJod);
    const gotAmount = result.amountJod !== undefined ? toDecimal(result.amountJod) : expected;
    const currencyOk = !result.currency || result.currency === env().CURRENCY;
    if (!currencyOk || !gotAmount.equals(expected)) {
      logger.error(
        { bookingId, expected: expected.toString(), got: gotAmount.toString(), currency: result.currency },
        'authorize: amount/currency mismatch — voiding hold, refusing to promote',
      );
      if (result.providerRef) {
        try { await this.provider.void(result.providerRef, `void-mismatch:${bookingId}`); } catch (err) { logger.warn({ bookingId, err }, 'authorize: void of mismatched hold failed'); }
      }
      await prisma.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'FAILED' } });
      paymentOpsTotal.inc({ op: 'authorize', result: 'failed' });
      return 'rejected';
    }

    let applied: boolean;
    try {
      applied = await prisma.$transaction(async (tx) => {
        const claim = await tx.payment.updateMany({
          where: { id: paymentId, status: 'PENDING' },
          data: {
            status: 'PRE_AUTHORIZED',
            providerRef: result.providerRef,
            cardBrand: result.cardBrand,
            cardLast4: result.cardLast4,
            preAuthorizedAt: new Date(),
          },
        });
        if (claim.count === 0) return false; // already promoted (race / replay)
        // Make the booking live (technicians can now accept) — only from AWAITING_PAYMENT.
        const promoted = await tx.booking.updateMany({ where: { id: bookingId, status: 'AWAITING_PAYMENT' }, data: { status: 'PENDING' } });
        if (promoted.count === 0) {
          // The booking was cancelled/expired (e.g. the abandonment reconciler won the race)
          // between checkout and authorization. Abort the whole promotion so we never hold
          // funds for a dead booking — the catch below voids the hold at the PSP.
          throw new BookingNoLongerAwaitingError();
        }
        await this.ledger(tx, paymentId, 'CHARGE', expected, 'Pre-authorization hold (hosted checkout)');
        await tx.outboxEvent.create({ data: { bookingId, eventType: 'booking.created', payload: { bookingId, customerId: booking.customerId } } });
        return true;
      });
    } catch (err) {
      if (err instanceof BookingNoLongerAwaitingError) {
        logger.error({ bookingId }, 'authorize: booking no longer awaiting payment — voiding the hold (no funds held for a dead booking)');
        if (result.providerRef) {
          try { await this.provider.void(result.providerRef, `void-stale-booking:${bookingId}`); } catch (e) { logger.warn({ bookingId, err: e }, 'authorize: void of stale-booking hold failed'); }
        }
        await prisma.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'FAILED' } });
        paymentOpsTotal.inc({ op: 'authorize', result: 'failed' });
        return 'rejected';
      }
      throw err;
    }

    if (applied) {
      paymentOpsTotal.inc({ op: 'authorize', result: 'ok' });
      logger.info({ bookingId, amount: expected.toString() }, 'Payment authorized via hosted checkout');
      return 'promoted';
    }

    // Not applied: the payment is already authorized. If THIS authorization carries a
    // different providerRef, a second session authorized a duplicate hold — void it.
    const current = await prisma.payment.findUnique({ where: { id: paymentId }, select: { providerRef: true } });
    if (result.providerRef && current?.providerRef && current.providerRef !== result.providerRef) {
      logger.error({ bookingId, kept: current.providerRef, duplicate: result.providerRef }, 'authorize: duplicate hold detected — voiding the extra');
      try { await this.provider.void(result.providerRef, `void-duplicate:${bookingId}`); } catch (err) { logger.warn({ bookingId, err }, 'authorize: void of duplicate hold failed'); }
    }
    return 'already';
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
          where: { id: payment.id, status: 'PRE_AUTHORIZED' },
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
  private async finalizeCapture(paymentId: string, bookingId: string, captured: Prisma.Decimal, captureProviderRef?: string): Promise<boolean> {
    const { fee, net } = splitCommission(captured, env().PLATFORM_COMMISSION_PCT);
    return prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PRE_AUTHORIZED' },
        // Persist the capture transaction id (when the PSP mints a new one) so later
        // refunds reference the capture, not the original pre-authorization.
        data: { status: 'CAPTURED', capturedAmountJod: captured, feeJod: fee, capturedAt: new Date(), ...(captureProviderRef ? { providerRef: captureProviderRef } : {}) },
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
      const captured = this.capturedAmount(payment);
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
      await this.provider.refund(providerRef, amount.toString(), `refund:${bookingId}:${priorRefunded.toString()}`);
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
    const captured = this.capturedAmount(payment);
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
          await this.applyAuthorization(payment.id, payment.bookingId, {
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
          await this.finalizeCapture(payment.id, payment.bookingId, captured, event.providerRef);
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
        // Reconcile our refunded total to the PSP's authoritative figure (P-11 / F1).
        // Move the total FORWARD only. A re-delivery or a refund that doesn't advance
        // the total is a no-op (settled <= prior) — that keeps the ledger write below
        // idempotent (no duplicate REFUND row on webhook redelivery).
        const settled = toDecimal(event.amountJod ?? 0);
        const captured = this.capturedAmount(payment);
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
            await this.ledger(tx, payment.id, 'REFUND', settled.minus(priorRefunded), 'Refund settled (PSP-side)');
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

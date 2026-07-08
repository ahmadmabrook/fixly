import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { toDecimal, isPositive } from '../../shared/money';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { paymentOpsTotal } from '../../shared/metrics';
import type { IPaymentProvider, PrepareCheckoutResult, CheckoutResult } from '../../domain/providers/IPaymentProvider';
import { postLedgerEntry } from './PaymentService.ledger';

/** Internal sentinel: a hosted authorization landed for a booking that is no longer
 *  AWAITING_PAYMENT (cancelled/expired). Used to roll back the promotion tx and void. */
class BookingNoLongerAwaitingError extends Error {}

/**
 * Hold-placement and hosted-checkout authorization lifecycle, extracted from
 * PaymentService (see that file for the full payment-lifecycle overview):
 *   booking.created   → preAuthorizeForBooking  (place hold, instant/mock providers)
 *   hosted checkout   → prepareCheckout / finalizeCheckout / applyAuthorization
 *                       (customer-driven authorization for real PSPs)
 *
 * `applyAuthorization` is also invoked by PaymentWebhookFlow for the
 * `payment.authorized` webhook, so it is exposed (not private) on this class.
 */
export class PaymentAuthorizationFlow {
  constructor(
    private readonly provider: IPaymentProvider,
    private readonly providerName: string,
  ) {}

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
        await postLedgerEntry(tx, payment.id, 'CHARGE', amount, 'Pre-authorization hold');
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
  async applyAuthorization(paymentId: string, bookingId: string, result: CheckoutResult): Promise<'promoted' | 'already' | 'rejected'> {
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
        await postLedgerEntry(tx, paymentId, 'CHARGE', expected, 'Pre-authorization hold (hosted checkout)');
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
}

import { Prisma, PaymentStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { paymentOpsTotal } from '../../shared/metrics';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';

/**
 * Payment lifecycle for a booking, driven by outbox events:
 *   booking.created   → preAuthorizeForBooking  (place hold)
 *   booking.completed → captureForBooking       (take the held funds)
 *   booking.cancelled → handleCancellation      (void hold OR refund capture)
 *
 * The outbox delivers AT-LEAST-ONCE, so every method here is idempotent and
 * safe to replay. Two layers of protection:
 *   1. an **idempotency key** sent to the PSP (de-dupes the external call even
 *      if we crash between the call and our DB commit), and
 *   2. **transition-guarded** DB writes (`updateMany` with the expected current
 *      status in the WHERE clause) so a replay/concurrent worker can never
 *      double-apply a state change or write a duplicate ledger row.
 *
 * State machine: PENDING → PRE_AUTHORIZED → CAPTURED, with PRE_AUTHORIZED and
 * CAPTURED both able to move to REFUNDED on cancellation. FAILED is terminal.
 */
export class PaymentService {
  constructor(
    private readonly provider: IPaymentProvider,
    private readonly providerName = 'mock',
  ) {}

  // ── booking.created → place the hold ──────────────────────────────────────
  /** Place a hold for a new booking. Idempotent: no-op if a Payment already exists. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> {
    const existing = await prisma.payment.findUnique({ where: { bookingId } });
    // Any existing Payment means a prior (possibly concurrent) attempt already
    // placed — or is placing — the hold. Re-calling the PSP would risk a second
    // hold, so we stop here. The unique constraint below is the race backstop.
    if (existing) {
      logger.debug({ bookingId, status: existing.status }, 'preAuthorize: payment already exists, skipping');
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

    const amountJod = Number(booking.totalJod);
    const result = await this.provider.preAuthorize(bookingId, amountJod, `preauth:${bookingId}`);

    try {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            bookingId,
            status: 'PRE_AUTHORIZED',
            provider: this.providerName,
            providerRef: result.providerRef,
            amountJod,
            preAuthorizedAt: new Date(),
          },
        });
        await tx.ledgerEntry.create({
          data: { paymentId: payment.id, type: 'CHARGE', amountJod, description: 'Pre-authorization hold' },
        });
      });
    } catch (err) {
      // Concurrent worker won the create (Payment.bookingId is @unique) — the
      // hold is already recorded, so treat the duplicate as an idempotent no-op.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.debug({ bookingId }, 'preAuthorize: payment created concurrently, skipping');
        paymentOpsTotal.inc({ op: 'preauth', result: 'skipped' });
        return;
      }
      paymentOpsTotal.inc({ op: 'preauth', result: 'failed' });
      throw err;
    }

    paymentOpsTotal.inc({ op: 'preauth', result: 'ok' });
    logger.info({ bookingId, amountJod }, 'Payment pre-authorized');
  }

  // ── booking.completed → capture the hold ──────────────────────────────────
  /** Capture the held funds on completion. No-op unless currently PRE_AUTHORIZED. */
  async captureForBooking(bookingId: string): Promise<void> {
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

    let result;
    try {
      result = await this.provider.capture(payment.providerRef, `capture:${bookingId}`);
    } catch (err) {
      paymentOpsTotal.inc({ op: 'capture', result: 'failed' });
      throw err; // let the outbox retry; status stays PRE_AUTHORIZED
    }

    const applied = await prisma.$transaction(async (tx) => {
      // Transition guard: only flip PRE_AUTHORIZED → CAPTURED. A replay or a
      // concurrent worker sees count 0 and writes no duplicate CAPTURE ledger.
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PRE_AUTHORIZED' },
        data: { status: 'CAPTURED', capturedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await tx.ledgerEntry.create({
        data: {
          paymentId: payment.id,
          type: 'CAPTURE',
          amountJod: Number(payment.amountJod),
          description: 'Capture on booking completion',
        },
      });
      return true;
    });

    if (!applied) {
      logger.debug({ bookingId }, 'capture: state changed under us (replay/concurrent), skipping');
      paymentOpsTotal.inc({ op: 'capture', result: 'skipped' });
      return;
    }
    paymentOpsTotal.inc({ op: 'capture', result: 'ok' });
    logger.info({ bookingId, providerRef: result.providerRef }, 'Payment captured');
  }

  // ── booking.cancelled → release money ─────────────────────────────────────
  /**
   * Release any money tied to a cancelled booking. Idempotent and exhaustive:
   *   - no Payment yet (cancelled before pre-auth ran) → no-op
   *   - PRE_AUTHORIZED → VOID the hold (no funds were captured)
   *   - CAPTURED       → REFUND the captured funds
   *   - already REFUNDED / FAILED / PENDING → no-op
   * Without this, a pre-authorized-then-cancelled booking leaves the customer's
   * funds held until the PSP auto-expires the authorization (days).
   */
  async handleCancellation(bookingId: string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || !payment.providerRef) {
      logger.debug({ bookingId }, 'cancel: no payment to reverse, skipping');
      paymentOpsTotal.inc({ op: 'reverse', result: 'skipped' });
      return;
    }

    if (payment.status === 'PRE_AUTHORIZED') {
      await this.reverse(bookingId, payment.id, payment.providerRef, Number(payment.amountJod), 'PRE_AUTHORIZED', 'void');
      return;
    }
    if (payment.status === 'CAPTURED') {
      await this.reverse(bookingId, payment.id, payment.providerRef, Number(payment.amountJod), 'CAPTURED', 'refund');
      return;
    }

    logger.debug({ bookingId, status: payment.status }, 'cancel: payment not reversible, skipping');
    paymentOpsTotal.inc({ op: 'reverse', result: 'skipped' });
  }

  /**
   * Shared void/refund path. Calls the PSP (outside the tx), then flips the
   * Payment to REFUNDED under a transition guard and writes one REFUND ledger
   * entry — only if this call actually performed the transition.
   */
  private async reverse(
    bookingId: string,
    paymentId: string,
    providerRef: string,
    amountJod: number,
    fromStatus: PaymentStatus,
    kind: 'void' | 'refund',
  ): Promise<void> {
    try {
      if (kind === 'void') {
        await this.provider.void(providerRef, `void:${bookingId}`);
      } else {
        await this.provider.refund(providerRef, `refund:${bookingId}`);
      }
    } catch (err) {
      paymentOpsTotal.inc({ op: kind, result: 'failed' });
      throw err; // outbox retries; status unchanged
    }

    const applied = await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: fromStatus },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      if (claim.count === 0) return false;
      await tx.ledgerEntry.create({
        data: {
          paymentId,
          type: 'REFUND',
          amountJod,
          description: kind === 'void' ? 'Hold released on cancellation' : 'Refund on cancellation',
        },
      });
      return true;
    });

    if (!applied) {
      logger.debug({ bookingId, kind }, 'cancel: already reversed (replay/concurrent), skipping');
      paymentOpsTotal.inc({ op: kind, result: 'skipped' });
      return;
    }
    paymentOpsTotal.inc({ op: kind, result: 'ok' });
    logger.info({ bookingId, kind, amountJod }, 'Payment reversed on cancellation');
  }
}

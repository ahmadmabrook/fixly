import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';

/**
 * Payment lifecycle for a booking. Driven by outbox events (booking.created →
 * pre-authorize, booking.completed → capture) via thin handlers wired in main.ts.
 *
 * Both operations are idempotent: the outbox worker delivers at-least-once, so a
 * replay after a crash must not double-charge. We guard on the existing Payment
 * row (Payment.bookingId is @unique) and its status.
 */
export class PaymentService {
  constructor(private readonly provider: IPaymentProvider) {}

  /** Hold funds when a booking is created. No-op if already pre-authorized. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> {
    const existing = await prisma.payment.findUnique({ where: { bookingId } });
    if (existing) {
      logger.debug({ bookingId, status: existing.status }, 'preAuthorize: payment already exists, skipping');
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, totalJod: true },
    });
    if (!booking) {
      logger.warn({ bookingId }, 'preAuthorize: booking not found, skipping');
      return;
    }

    const amountJod = Number(booking.totalJod);
    const result = await this.provider.preAuthorize(bookingId, amountJod);

    try {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            bookingId,
            status: 'PRE_AUTHORIZED',
            provider: 'mock',
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
        return;
      }
      throw err;
    }

    logger.info({ bookingId, amountJod }, 'Payment pre-authorized');
  }

  /** Capture held funds when a booking completes. No-op unless PRE_AUTHORIZED. */
  async captureForBooking(bookingId: string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || !payment.providerRef) {
      logger.warn({ bookingId }, 'capture: payment not found, skipping');
      return;
    }
    if (payment.status !== 'PRE_AUTHORIZED') {
      logger.debug({ bookingId, status: payment.status }, 'capture: not in PRE_AUTHORIZED state, skipping');
      return;
    }

    const result = await this.provider.capture(payment.providerRef);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'CAPTURED', capturedAt: new Date() },
      });
      await tx.ledgerEntry.create({
        data: {
          paymentId: payment.id,
          type: 'CAPTURE',
          amountJod: Number(payment.amountJod),
          description: 'Capture on booking completion',
        },
      });
    });

    logger.info({ bookingId, providerRef: result.providerRef }, 'Payment captured');
  }
}

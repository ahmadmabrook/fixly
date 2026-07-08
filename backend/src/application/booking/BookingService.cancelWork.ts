import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';
import { paymentRequiresHostedCheckout } from '../../shared/env';
import { getBookingById } from './BookingService.reads';
import { recordBookingStatusHistory } from './bookingStatusHistory';

/**
 * Cancellation, reschedule, and additional-work flow, extracted from
 * BookingService (see that file for the full class overview). Stateless — no
 * injected dependencies — so this is a plain class with no constructor.
 */
export class BookingCancelFlow {
  async cancel(bookingId: string, userId: string, reason?: string) {
    await getBookingById(bookingId, userId); // authorize

    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (['COMPLETED', 'CANCELLED'].includes(fresh.status)) {
        throw new ConflictError('Cannot cancel a completed or already cancelled booking');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, version: { increment: 1 } },
      });
      await recordBookingStatusHistory(tx, bookingId, fresh.status, 'CANCELLED', userId);

      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: 'booking.cancelled',
          payload: { bookingId, reason },
        },
      });

      return updated;
    });
  }

  /**
   * Move a scheduled booking to a new time. Only the owning customer may do it,
   * only before the job starts, and only to a future time.
   */
  async reschedule(bookingId: string, userId: string, scheduledAt: string) {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new ValidationError('scheduledAt must be a future time');
    }
    // Re-read + optimistic-version guard inside a tx (mirrors cancel/advanceStatus)
    // so a reschedule racing an accept/cancel can't lost-update a booking that
    // has already moved on.
    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (fresh.customerId !== userId) throw new ForbiddenError();
      if (!['PENDING', 'CONFIRMED'].includes(fresh.status)) {
        throw new ConflictError('Only a not-yet-started booking can be rescheduled');
      }
      return tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { scheduledAt: when, rescheduledAt: new Date(), version: { increment: 1 } },
      });
    });
  }

  /** Technician proposes extra work mid-job (itemised). Customer must approve
   *  before it's added to the total. Only the assigned tech, only IN_PROGRESS. */
  async proposeAdditionalWork(bookingId: string, technicianUserId: string, description: string, amountJod: number | string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true, technician: { select: { userId: true } } } });
    if (!booking) throw new NotFoundError('Booking');
    if (!booking.technician || booking.technician.userId !== technicianUserId) throw new ForbiddenError();
    if (booking.status !== 'IN_PROGRESS') throw new ConflictError('Additional work can only be added while the job is in progress');
    const amount = new Prisma.Decimal(amountJod);
    if (amount.lessThanOrEqualTo(0) || amount.decimalPlaces() > 3) throw new ValidationError('Invalid amount');
    return prisma.additionalWorkItem.create({
      data: { bookingId, description: description.trim(), amountJod: amount, status: 'PROPOSED' },
    });
  }

  /** Customer approves/declines a proposed additional-work item. Approval adds
   *  the amount to the booking total atomically. */
  async respondAdditionalWork(bookingId: string, itemId: string, customerId: string, approve: boolean) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new NotFoundError('Booking');
      if (booking.customerId !== customerId) throw new ForbiddenError();
      const item = await tx.additionalWorkItem.findUnique({ where: { id: itemId } });
      if (!item || item.bookingId !== bookingId) throw new NotFoundError('AdditionalWorkItem');
      if (item.status !== 'PROPOSED') throw new ConflictError('Item already responded to');

      // Hosted checkout (real PSP) holds no reusable card token, so we cannot widen
      // the authorization server-side. Approving extra work would inflate the DB hold
      // (amountJod) past the actual PSP hold → capture-over-authorized at completion
      // (capture fails / silently caps → service delivered, tech unpaid). Until an
      // incremental-authorization call is wired (C1), refuse the approval in hosted
      // mode rather than create a capture the PSP will reject. The mock/instant
      // provider can widen its hold freely, so it is unaffected.
      if (approve && paymentRequiresHostedCheckout()) {
        throw new ConflictError('لا يمكن إضافة عمل إضافي على هذا الطلب حالياً. يرجى إنشاء طلب منفصل.');
      }

      const updated = await tx.additionalWorkItem.update({
        where: { id: itemId },
        data: { status: approve ? 'APPROVED' : 'DECLINED' },
      });
      if (approve) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { totalJod: { increment: item.amountJod } },
        });
        // Top up the authorization hold so completion captures the FULL new total
        // (otherwise capture is capped at the original pre-auth and the extra work
        // is never charged / never paid out). Instant/mock providers widen the hold
        // directly; hosted mode is rejected above until incremental-auth exists.
        const payment = await tx.payment.findUnique({ where: { bookingId } });
        if (payment && payment.status === 'PRE_AUTHORIZED') {
          await tx.payment.update({ where: { id: payment.id }, data: { amountJod: { increment: item.amountJod } } });
        }
      }
      return updated;
    });
  }
}

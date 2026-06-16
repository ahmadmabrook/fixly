import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';

const COMPLETABLE_STATUSES: BookingStatus[] = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

// Technician-driven forward transitions during an active job. COMPLETED is
// handled by complete() (it captures payment); CANCELLED by cancel().
const TECH_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  CONFIRMED: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['IN_PROGRESS'],
};
export const ADVANCEABLE_TO: BookingStatus[] = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

interface CreateBookingInput {
  customerId: string;
  serviceId: string;
  addressLine: string;
  addressLat: number;
  addressLng: number;
  scheduledAt?: string;
}

const LOCK_TTL_SECONDS = 30;

export class BookingService {
  async createBooking(input: CreateBookingInput) {
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ValidationError('Service is not available');

    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          customerId: input.customerId,
          serviceId: input.serviceId,
          addressLine: input.addressLine,
          addressLat: input.addressLat,
          addressLng: input.addressLng,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
          totalJod: service.priceJod,
          status: 'PENDING',
        },
      });

      await tx.outboxEvent.create({
        data: {
          bookingId: booking.id,
          eventType: 'booking.created',
          payload: { bookingId: booking.id, customerId: input.customerId },
        },
      });

      return booking;
    });
  }

  async listForUser(userId: string, role: string, limit = 50, offset = 0) {
    // Customers see their own bookings; technicians see ones assigned to them
    // (single query via relation filter — no separate profile lookup).
    const where: Prisma.BookingWhereInput =
      role === 'CUSTOMER' ? { customerId: userId } : { technician: { userId } };

    const [items, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        include: { service: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);
    return { items, total };
  }

  async getById(bookingId: string, userId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, payment: true },
    });
    if (!booking) throw new NotFoundError('Booking');

    // Fast path: customer owns it directly. Only look up a technician
    // profile when the requester isn't the customer.
    if (booking.customerId === userId) return booking;

    if (booking.technicianId) {
      const profile = await prisma.technicianProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (profile && booking.technicianId === profile.id) return booking;
    }

    throw new ForbiddenError();
  }

  async accept(bookingId: string, technicianUserId: string) {
    const lockKey = `booking_lock:${bookingId}`;
    const acquired = await redis.set(lockKey, technicianUserId, 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!acquired) throw new ConflictError('Booking already being accepted');

    try {
      const profile = await prisma.technicianProfile.findUnique({
        where: { userId: technicianUserId },
      });
      if (!profile) throw new NotFoundError('Technician profile');

      return await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!booking || booking.status !== 'PENDING') {
          throw new ConflictError('Booking no longer available');
        }

        const updated = await tx.booking.update({
          where: { id: bookingId, version: booking.version },
          data: { technicianId: profile.id, status: 'CONFIRMED', version: { increment: 1 } },
        });

        await tx.outboxEvent.create({
          data: {
            bookingId,
            eventType: 'booking.confirmed',
            payload: { bookingId, customerId: booking.customerId, technicianId: profile.id },
          },
        });

        return updated;
      });
    } finally {
      await redis.del(lockKey);
    }
  }

  /**
   * Technician advances an active booking through EN_ROUTE → ARRIVED →
   * IN_PROGRESS. Only the assigned technician may transition, and only along
   * the allowed ordering, under an optimistic version guard. Emits an outbox
   * event so the customer gets a live status notification.
   */
  async advanceStatus(bookingId: string, technicianUserId: string, to: BookingStatus) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId: technicianUserId },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenError('Not a technician');

    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (fresh.technicianId !== profile.id) throw new ForbiddenError('Not the assigned technician');

      const allowed = TECH_TRANSITIONS[fresh.status] ?? [];
      if (!allowed.includes(to)) {
        throw new ConflictError(`Cannot move booking from ${fresh.status} to ${to}`);
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: {
          status: to,
          version: { increment: 1 },
          ...(to === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        },
      });

      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: `booking.${to.toLowerCase()}`,
          payload: { bookingId, customerId: fresh.customerId, status: to },
        },
      });

      return updated;
    });
  }

  async complete(bookingId: string, userId: string) {
    // Authorize against the current row (ownership doesn't change concurrently).
    const booking = await this.getById(bookingId, userId);

    // Re-check status + write atomically with an optimistic version guard so a
    // concurrent complete/cancel can't both win (TOCTOU / lost update).
    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (!COMPLETABLE_STATUSES.includes(fresh.status)) {
        throw new ConflictError('Booking cannot be completed from its current status');
      }

      // Money guard: never let a booking complete (→ capture) unless its funds
      // were actually authorized — otherwise a pre-auth failure means delivering
      // the service for free.
      const payment = await tx.payment.findUnique({ where: { bookingId }, select: { status: true } });
      if (!payment || (payment.status !== 'PRE_AUTHORIZED' && payment.status !== 'CAPTURED')) {
        throw new ConflictError('Payment is not authorized for this booking');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
      });

      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: 'booking.completed',
          payload: { bookingId, customerId: booking.customerId },
        },
      });

      return updated;
    });
  }

  async cancel(bookingId: string, userId: string, reason?: string) {
    await this.getById(bookingId, userId); // authorize

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
}

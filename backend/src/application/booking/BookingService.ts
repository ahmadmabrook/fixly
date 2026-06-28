import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';
import { paymentRequiresHostedCheckout } from '../../shared/env';
import { PromoService } from '../promo/PromoService';
import { dispatchAcceptLatencySeconds, dispatchOffersTotal } from '../../shared/metrics';

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
  /** Optional promo/discount code applied to the fixed service price. */
  promoCode?: string;
}

const LOCK_TTL_SECONDS = 30;

export class BookingService {
  constructor(private readonly promoService: PromoService = new PromoService()) {}

  async createBooking(input: CreateBookingInput) {
    // Account standing (blocked/deleted) is enforced once by `requireActiveUser`
    // on the bookings router (POST) — no duplicate isActive lookup here.
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ValidationError('Service is not available');

    // Resolve any promo BEFORE opening the transaction so an invalid code fails
    // fast with its specific reason; redemption is recorded inside the tx.
    const quote = input.promoCode
      ? await this.promoService.quote(input.promoCode, input.customerId, service.priceJod)
      : null;
    const discountJod = quote ? quote.discountJod : new Prisma.Decimal(0);
    const totalJod = quote ? quote.finalJod : service.priceJod;

    // Hosted-checkout (real PSP): the booking starts in AWAITING_PAYMENT and is NOT yet
    // visible to technicians; it is promoted to PENDING (and booking.created is emitted)
    // only once the customer authorizes payment. Instant (mock) providers authorize on
    // booking.created, so the booking starts live at PENDING — unchanged behaviour.
    const hosted = paymentRequiresHostedCheckout();

    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          customerId: input.customerId,
          serviceId: input.serviceId,
          addressLine: input.addressLine,
          addressLat: input.addressLat,
          addressLng: input.addressLng,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
          discountJod,
          promoCodeId: quote?.promoCodeId,
          totalJod,
          status: hosted ? 'AWAITING_PAYMENT' : 'PENDING',
        },
      });

      if (quote) {
        await this.promoService.redeem(tx, quote.promoCodeId, input.customerId, booking.id, discountJod);
      }

      if (!hosted) {
        await tx.outboxEvent.create({
          data: {
            bookingId: booking.id,
            eventType: 'booking.created',
            payload: { bookingId: booking.id, customerId: input.customerId },
          },
        });
      }

      return booking;
    });
  }

  /**
   * Abandonment cleanup (hosted checkout): cancel bookings that have sat in
   * AWAITING_PAYMENT past the checkout TTL without the customer authorizing payment.
   * Transition-guarded so a booking that just got authorized (→ PENDING) in a race is
   * never cancelled. No money has moved (an authorized hold would have promoted it), so
   * this is a silent cleanup — no outbox/notification. Returns the number cancelled.
   */
  async expireUnpaidBookings(ttlMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    // One set-based update. The `status: AWAITING_PAYMENT` predicate is itself the
    // transition guard: a booking that just got authorized in a race is already PENDING,
    // so it no longer matches and is never cancelled. No money has moved (an authorized
    // hold would have promoted it) — silent cleanup, no outbox/notification.
    const { count } = await prisma.booking.updateMany({
      where: { status: 'AWAITING_PAYMENT', createdAt: { lt: cutoff } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Payment not completed in time' },
    });
    return count;
  }

  async listForUser(userId: string, role: string, limit = 50, offset = 0) {
    // Customers see their own bookings; technicians see ones assigned to them.
    // For technicians, resolve the profile id once and filter by the indexed
    // `technicianId` column (the `{ technician: { userId } }` relation filter
    // can't use @@index([technicianId, status]) and forces a join subquery —
    // costly on the 15s tech-dashboard poll).
    let where: Prisma.BookingWhereInput;
    if (role === 'CUSTOMER') {
      where = { customerId: userId };
    } else {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!profile) return { items: [], total: 0 };
      where = { technicianId: profile.id };
    }

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

        // Require an active dispatch offer for this tech.
        const offer = await tx.dispatchOffer.findUnique({
          where: { bookingId_technicianId: { bookingId, technicianId: profile.id } },
        });
        if (!offer || offer.status !== 'OFFERED') {
          throw new ConflictError('Booking no longer offered to you');
        }

        // Mark this offer ACCEPTED; supersede sibling OFFERED offers.
        const now = new Date();
        await tx.dispatchOffer.update({
          where: { id: offer.id },
          data: { status: 'ACCEPTED', respondedAt: now },
        });
        const superseded = await tx.dispatchOffer.updateMany({
          where: { bookingId, status: 'OFFERED', id: { not: offer.id } },
          data: { status: 'SUPERSEDED' },
        });
        if (superseded.count > 0) dispatchOffersTotal.inc({ result: 'superseded' }, superseded.count);
        dispatchOffersTotal.inc({ result: 'accepted' });

        // Record accept latency.
        const latencySec = (now.getTime() - offer.offeredAt.getTime()) / 1000;
        dispatchAcceptLatencySeconds.observe(latencySec);

        const updated = await tx.booking.update({
          where: { id: bookingId, version: booking.version },
          data: {
            technicianId: profile.id,
            status: 'CONFIRMED',
            dispatchExpiresAt: null,
            version: { increment: 1 },
          },
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
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { technician: { select: { userId: true } } } });
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

  async listAdditionalWork(bookingId: string, userId: string) {
    await this.getById(bookingId, userId); // authorize as a party
    return prisma.additionalWorkItem.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
  }
}

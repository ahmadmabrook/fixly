import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';
import { paymentRequiresHostedCheckout } from '../../shared/env';
import { PromoService } from '../promo/PromoService';
import { SubscriptionService } from '../subscription/SubscriptionService';
import { ServiceCreditService, LATE_COMPENSATION_JOD, LATE_GRACE_MINUTES } from '../credit/ServiceCreditService';
import { ReferralService } from '../referral/ReferralService';
import { dispatchAcceptLatencySeconds, dispatchOffersTotal } from '../../shared/metrics';
import { withDeadlockRetry } from '../../shared/dbRetry';

/** Immediate-booking arrival promise (§0.3): technician within 30 minutes. */
const SLA_ARRIVE_MINUTES = 30;

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
  /** Firm price from an accepted video pre-check quote (§0.3); overrides the
   *  service list price for this booking. */
  priceOverrideJod?: number | string | Prisma.Decimal;
}

const LOCK_TTL_SECONDS = 30;

export class BookingService {
  constructor(
    private readonly promoService: PromoService = new PromoService(),
    private readonly subscriptionService: SubscriptionService = new SubscriptionService(),
    private readonly creditService: ServiceCreditService = new ServiceCreditService(),
    private readonly referralService: ReferralService = new ReferralService(),
  ) {}

  /** Append-only audit row for a booking status transition (§ booking_status_history).
   *  Called alongside every status write below — never updated/deleted afterwards. */
  private async recordStatusHistory(
    tx: Prisma.TransactionClient,
    bookingId: string,
    fromStatus: BookingStatus | null,
    toStatus: BookingStatus,
    changedBy?: string,
  ): Promise<void> {
    await tx.bookingStatusHistory.create({
      data: { bookingId, fromStatus, toStatus, changedBy: changedBy ?? null },
    });
  }

  async createBooking(input: CreateBookingInput) {
    // Account standing (blocked/deleted) is enforced once by `requireActiveUser`
    // on the bookings router (POST) — no duplicate isActive lookup here.
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ValidationError('Service is not available');

    // List price = service price, unless this booking came from an accepted firm
    // video quote (§0.3), which fixes its own price. Wrap in Decimal so arithmetic
    // is exact and tolerant of numeric inputs.
    const listPrice = new Prisma.Decimal(input.priceOverrideJod ?? service.priceJod);

    // Protection subscription (§0.3): members get priority dispatch + a % discount.
    const subscription = await this.subscriptionService.activeFor(input.customerId);
    const isPriority = subscription?.priorityDispatch ?? false;
    const subDiscount = subscription
      ? listPrice.mul(subscription.discountPercent).div(100)
      : new Prisma.Decimal(0);
    const subscriberPrice = listPrice.sub(subDiscount);

    // Resolve any promo BEFORE opening the transaction so an invalid code fails
    // fast with its specific reason. Promo stacks on the subscriber price.
    const quote = input.promoCode
      ? await this.promoService.quote(input.promoCode, input.customerId, subscriberPrice)
      : null;
    const postPromo = quote ? quote.finalJod : subscriberPrice;
    // discountJod records list→charged reductions (subscription + promo). Wallet
    // credit is a separate REDEMPTION row, not a discount.
    const discountJod = listPrice.sub(postPromo);

    // Hosted-checkout (real PSP): the booking starts in AWAITING_PAYMENT and is NOT yet
    // visible to technicians; it is promoted to PENDING (and booking.created is emitted)
    // only once the customer authorizes payment. Instant (mock) providers authorize on
    // booking.created, so the booking starts live at PENDING — unchanged behaviour.
    const hosted = paymentRequiresHostedCheckout();

    // Concurrent bookings racing the SAME promo code deadlock in Postgres:
    // each transaction takes `SELECT ... FOR UPDATE` on the promo row plus an
    // FK-driven lock on the shared customer/promo parent rows, and with 3+
    // contenders those can queue into a genuine lock cycle (40P01) rather than
    // a clean serialize. Rather than lean on DB-level retries for something
    // this frequent, serialize redemption attempts for a given promo code at
    // the application layer first — same SETNX-lock convention as accept()'s
    // per-booking lock above — so at most one createBooking with this promo
    // is ever inside the transaction at a time. The transaction-level retry
    // stays as a backstop for any deadlock this doesn't fully rule out.
    const promoLockKey = quote ? `promo_lock:${quote.promoCodeId}` : null;
    if (promoLockKey) await this.acquirePromoLock(promoLockKey);

    try {
      return await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
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
            totalJod: postPromo,
            isPriority,
            status: hosted ? 'AWAITING_PAYMENT' : 'PENDING',
          },
        });
        await this.recordStatusHistory(tx, booking.id, null, booking.status, input.customerId);

        if (quote) {
          await this.promoService.redeem(tx, quote.promoCodeId, input.customerId, booking.id, quote.discountJod);
        }

        // Apply wallet credit against the amount due (capped, race-safe). The
        // authorized hold then covers only the net payable.
        const redeemed = await this.creditService.redeem(tx, input.customerId, postPromo, booking.id);
        if (redeemed.gt(0)) {
          await tx.booking.update({ where: { id: booking.id }, data: { totalJod: postPromo.sub(redeemed) } });
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

        return redeemed.gt(0) ? { ...booking, totalJod: postPromo.sub(redeemed) } : booking;
      }));
    } finally {
      if (promoLockKey) await redis.del(promoLockKey);
    }
  }

  /** Short-lived SETNX lock serializing redemption attempts for one promo
   *  code. Waits (briefly, with jitter) rather than failing immediately —
   *  losing this race is normal contention, not an error the customer caused. */
  private async acquirePromoLock(key: string, maxAttempts = 40): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const acquired = await redis.set(key, '1', 'EX', 10, 'NX');
      if (acquired) return;
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 25));
    }
    throw new ConflictError('عذراً، حاول مرة أخرى بعد قليل');
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
    const where = { status: 'AWAITING_PAYMENT' as const, createdAt: { lt: cutoff } };
    // Snapshot the ids before the bulk update so we can append one status-history
    // row per booking below (a set-based updateMany can't return affected rows).
    const candidates = await prisma.booking.findMany({ where, select: { id: true } });
    if (candidates.length === 0) return 0;

    // One set-based update. The `status: AWAITING_PAYMENT` predicate is itself the
    // transition guard: a booking that just got authorized in a race is already PENDING,
    // so it no longer matches and is never cancelled. No money has moved (an authorized
    // hold would have promoted it) — silent cleanup, no outbox/notification.
    const { count } = await prisma.booking.updateMany({
      where,
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Payment not completed in time' },
    });
    if (count > 0) {
      await prisma.bookingStatusHistory.createMany({
        data: candidates.map((b) => ({ bookingId: b.id, fromStatus: 'AWAITING_PAYMENT' as const, toStatus: 'CANCELLED' as const })),
      });
    }
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

        // Reset the consecutive-rejection streak on any accept.
        await tx.technicianProfile.update({
          where: { id: profile.id },
          data: { consecutiveRejections: 0 },
        });

        // Record accept latency.
        const latencySec = (now.getTime() - offer.offeredAt.getTime()) / 1000;
        dispatchAcceptLatencySeconds.observe(latencySec);

        const updated = await tx.booking.update({
          where: { id: bookingId, version: booking.version },
          data: {
            technicianId: profile.id,
            status: 'CONFIRMED',
            dispatchExpiresAt: null,
            // Arrival SLA promise (§0.3): immediate bookings commit to a 30-min
            // arrival window from acceptance. Scheduled bookings have no live SLA.
            slaArriveBy: booking.scheduledAt ? null : new Date(now.getTime() + SLA_ARRIVE_MINUTES * 60 * 1000),
            version: { increment: 1 },
          },
        });
        await this.recordStatusHistory(tx, bookingId, booking.status, 'CONFIRMED', technicianUserId);

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

      // Server-enforced pre-start SOP checklist (technician portal): the
      // technician must submit the pre-start checklist (POST .../checklist/pre-start)
      // before the job can move from ARRIVED to IN_PROGRESS.
      if (to === 'IN_PROGRESS' && !fresh.preStartChecklistAt) {
        throw new ValidationError('Pre-start checklist must be submitted before starting the job');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: {
          status: to,
          version: { increment: 1 },
          ...(to === 'ARRIVED' ? { arrivedAt: new Date() } : {}),
          ...(to === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        },
      });
      await this.recordStatusHistory(tx, bookingId, fresh.status, to, technicianUserId);

      // Late-arrival compensation (§0.3): if the technician arrives more than the
      // grace past the promised SLA window, grant the customer a one-time credit.
      if (to === 'ARRIVED' && fresh.slaArriveBy) {
        const arrivedAt = updated.arrivedAt ?? new Date();
        const deadline = new Date(fresh.slaArriveBy.getTime() + LATE_GRACE_MINUTES * 60 * 1000);
        if (arrivedAt.getTime() > deadline.getTime()) {
          const granted = await this.creditService.grant(tx, {
            customerId: fresh.customerId,
            amountJod: LATE_COMPENSATION_JOD,
            reason: 'LATE_COMPENSATION',
            bookingId,
            refKey: `latecomp:${bookingId}`,
          });
          if (granted) {
            await tx.booking.update({
              where: { id: bookingId },
              data: { lateCompJod: new Prisma.Decimal(LATE_COMPENSATION_JOD) },
            });
          }
        }
      }

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

      // Server-enforced pre-close SOP checklist (technician portal): must be
      // submitted (POST .../checklist/pre-close) before the job can be completed.
      if (!fresh.preCloseChecklistAt) {
        throw new ValidationError('Pre-close checklist must be submitted before completing the job');
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
      await this.recordStatusHistory(tx, bookingId, fresh.status, 'COMPLETED', userId);

      // Lifetime completed-job counter feeds the nightly trust-tier recompute (§0.2 #1).
      if (fresh.technicianId) {
        await tx.technicianProfile.update({
          where: { id: fresh.technicianId },
          data: { jobsCompleted: { increment: 1 } },
        });
      }

      // Referral credit (§ referrals): grants once, only on the referred
      // customer's first completed booking.
      await this.referralService.grantCreditIfEligible(tx, booking.customerId, bookingId, this.creditService);

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

  /**
   * Technician submits the pre-start SOP checklist (photos of the site/equipment
   * before beginning work). Only the assigned technician, only while ARRIVED —
   * this gates the ARRIVED→IN_PROGRESS transition in advanceStatus().
   */
  async submitPreStartChecklist(bookingId: string, technicianUserId: string, photoUrls: string[]) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: technicianUserId }, select: { id: true } });
    if (!profile) throw new ForbiddenError('Not a technician');

    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (fresh.technicianId !== profile.id) throw new ForbiddenError('Not the assigned technician');
      if (fresh.status !== 'ARRIVED') {
        throw new ConflictError('Pre-start checklist can only be submitted while ARRIVED');
      }
      return tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { preStartChecklistAt: new Date(), preStartPhotoUrls: photoUrls, version: { increment: 1 } },
      });
    });
  }

  /**
   * Technician submits the pre-close SOP checklist (photos of completed work).
   * Only the assigned technician, only while IN_PROGRESS — this gates
   * completion in complete().
   */
  async submitPreCloseChecklist(bookingId: string, technicianUserId: string, photoUrls: string[]) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: technicianUserId }, select: { id: true } });
    if (!profile) throw new ForbiddenError('Not a technician');

    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh) throw new NotFoundError('Booking');
      if (fresh.technicianId !== profile.id) throw new ForbiddenError('Not the assigned technician');
      if (fresh.status !== 'IN_PROGRESS') {
        throw new ConflictError('Pre-close checklist can only be submitted while IN_PROGRESS');
      }
      return tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { preCloseChecklistAt: new Date(), preClosePhotoUrls: photoUrls, version: { increment: 1 } },
      });
    });
  }

  /**
   * Technician reports the customer as a no-show after arriving (§ NO_SHOW).
   * Only the assigned technician, only from ARRIVED. Emits booking.no_show
   * with the callout fee in its payload; the outbox worker's payment handler
   * (registered in main.ts, same as booking.completed) captures that amount
   * out of the booking's existing pre-authorized hold — reusing
   * PaymentService.captureForBooking's normal, retry-safe, transition-guarded
   * capture path rather than calling the PSP synchronously here (a PSP outage
   * would otherwise strand the charge with no automatic retry).
   */
  async noShow(bookingId: string, technicianUserId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: technicianUserId }, select: { id: true } });
    if (!profile) throw new ForbiddenError('Not a technician');

    return prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId }, include: { service: { select: { calloutFeeJod: true } } } });
      if (!fresh) throw new NotFoundError('Booking');
      if (fresh.technicianId !== profile.id) throw new ForbiddenError('Not the assigned technician');
      if (fresh.status !== 'ARRIVED') {
        throw new ConflictError('No-show can only be reported while ARRIVED');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { status: 'NO_SHOW', cancelledAt: new Date(), cancelReason: 'Customer no-show', version: { increment: 1 } },
      });
      await this.recordStatusHistory(tx, bookingId, fresh.status, 'NO_SHOW', technicianUserId);

      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: 'booking.no_show',
          payload: {
            bookingId,
            customerId: fresh.customerId,
            status: 'NO_SHOW',
            calloutFeeJod: fresh.service.calloutFeeJod.toString(),
          },
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
      await this.recordStatusHistory(tx, bookingId, fresh.status, 'CANCELLED', userId);

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

  async listAdditionalWork(bookingId: string, userId: string) {
    await this.getById(bookingId, userId); // authorize as a party
    return prisma.additionalWorkItem.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
  }
}

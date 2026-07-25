import { BookingStatus, DispatchOfferStatus, PaymentStatus, CreditReason, PricingModel, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';
import { ServiceCreditService, LATE_COMPENSATION_JOD, LATE_GRACE_MINUTES } from '../credit/ServiceCreditService';
import { ReferralService } from '../referral/ReferralService';
import { dispatchAcceptLatencySeconds, dispatchOffersTotal } from '../../shared/metrics';
import { getBookingById } from './BookingService.reads';
import { recordBookingStatusHistory } from './bookingStatusHistory';
import { OutboxEventType } from '../../shared/outboxEvents';
import { lockBookingMaterials } from '../materials/BookingMaterialService';
import { CategoryReadinessService } from '../materials/CategoryReadinessService';
import { logger } from '../../shared/logger';

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

/**
 * The outbox event each technician-driven transition emits. Previously derived
 * as `booking.${to.toLowerCase()}`, which coupled two vocabularies — Prisma's
 * BookingStatus and the outbox's event names (see shared/outboxEvents.ts) — by
 * nothing but spelling coincidence. Renaming a BookingStatus member would have
 * silently produced an event no handler subscribes to (main.ts) and no
 * notification template matches (NotificationService), with no compile error and
 * no runtime warning. Mapping explicitly makes any such drift a type error.
 */
const ADVANCE_OUTBOX_EVENT: Readonly<Partial<Record<BookingStatus, OutboxEventType>>> = {
  [BookingStatus.EN_ROUTE]: OutboxEventType.BOOKING_EN_ROUTE,
  [BookingStatus.ARRIVED]: OutboxEventType.BOOKING_ARRIVED,
  [BookingStatus.IN_PROGRESS]: OutboxEventType.BOOKING_IN_PROGRESS,
};

const LOCK_TTL_SECONDS = 30;

/**
 * Technician-driven status-transition flow for an active booking, extracted
 * from BookingService (see that file for the full class overview): accept →
 * advanceStatus (EN_ROUTE/ARRIVED/IN_PROGRESS) → checklists → complete, plus
 * no-show reporting.
 */
export class BookingLifecycleFlow {
  constructor(
    private readonly creditService: ServiceCreditService,
    private readonly referralService: ReferralService,
    private readonly readinessService: CategoryReadinessService = new CategoryReadinessService(),
  ) {}

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
        if (!booking || booking.status !== BookingStatus.PENDING) {
          throw new ConflictError('Booking no longer available');
        }

        // Require an active dispatch offer for this tech.
        const offer = await tx.dispatchOffer.findUnique({
          where: { bookingId_technicianId: { bookingId, technicianId: profile.id } },
        });
        if (!offer || offer.status !== DispatchOfferStatus.OFFERED) {
          throw new ConflictError('Booking no longer offered to you');
        }

        // Mark this offer ACCEPTED; supersede sibling OFFERED offers.
        const now = new Date();
        await tx.dispatchOffer.update({
          where: { id: offer.id },
          data: { status: DispatchOfferStatus.ACCEPTED, respondedAt: now },
        });
        const superseded = await tx.dispatchOffer.updateMany({
          where: { bookingId, status: DispatchOfferStatus.OFFERED, id: { not: offer.id } },
          data: { status: DispatchOfferStatus.SUPERSEDED },
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
            status: BookingStatus.CONFIRMED,
            dispatchExpiresAt: null,
            // Arrival SLA promise (§0.3): immediate bookings commit to a 30-min
            // arrival window from acceptance. Scheduled bookings have no live SLA.
            slaArriveBy: booking.scheduledAt ? null : new Date(now.getTime() + SLA_ARRIVE_MINUTES * 60 * 1000),
            version: { increment: 1 },
          },
        });
        await recordBookingStatusHistory(tx, bookingId, booking.status, BookingStatus.CONFIRMED, technicianUserId);

        await tx.outboxEvent.create({
          data: {
            bookingId,
            eventType: OutboxEventType.BOOKING_CONFIRMED,
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
      if (to === BookingStatus.IN_PROGRESS && !fresh.preStartChecklistAt) {
        throw new ValidationError('Pre-start checklist must be submitted before starting the job');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: {
          status: to,
          version: { increment: 1 },
          ...(to === BookingStatus.ARRIVED ? { arrivedAt: new Date() } : {}),
          ...(to === BookingStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
        },
      });
      await recordBookingStatusHistory(tx, bookingId, fresh.status, to, technicianUserId);

      // BOM lock (§17.5.9): execution-ready material lines become immutable the
      // instant work starts, in the same transaction as the status change.
      // Post-lock material needs route through the existing extra-work gate,
      // never a silent BOM edit. Kept in its own materials-domain module
      // rather than folded into this file.
      if (to === BookingStatus.IN_PROGRESS) {
        await lockBookingMaterials(tx, bookingId);
      }

      // Late-arrival compensation (§0.3): if the technician arrives more than the
      // grace past the promised SLA window, grant the customer a one-time credit.
      if (to === BookingStatus.ARRIVED && fresh.slaArriveBy) {
        const arrivedAt = updated.arrivedAt ?? new Date();
        const deadline = new Date(fresh.slaArriveBy.getTime() + LATE_GRACE_MINUTES * 60 * 1000);
        if (arrivedAt.getTime() > deadline.getTime()) {
          const granted = await this.creditService.grant(tx, {
            customerId: fresh.customerId,
            amountJod: LATE_COMPENSATION_JOD,
            reason: CreditReason.LATE_COMPENSATION,
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

      const eventType = ADVANCE_OUTBOX_EVENT[to];
      if (!eventType) {
        // Unreachable: `to` is validated against ADVANCEABLE_TO at the route and
        // re-checked against TECH_TRANSITIONS above. Fail loudly rather than
        // writing an event nothing consumes if a new advanceable status is ever
        // added without a matching outbox mapping.
        throw new ValidationError(`No outbox event mapped for status ${to}`);
      }
      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType,
          payload: { bookingId, customerId: fresh.customerId, status: to },
        },
      });

      return updated;
    });
  }

  async complete(bookingId: string, userId: string) {
    // Authorize against the current row (ownership doesn't change concurrently).
    const booking = await getBookingById(bookingId, userId);

    // Re-check status + write atomically with an optimistic version guard so a
    // concurrent complete/cancel can't both win (TOCTOU / lost update).
    const updated = await prisma.$transaction(async (tx) => {
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
      if (!payment || (payment.status !== PaymentStatus.PRE_AUTHORIZED && payment.status !== PaymentStatus.CAPTURED)) {
        throw new ConflictError('Payment is not authorized for this booking');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { status: BookingStatus.COMPLETED, completedAt: new Date(), version: { increment: 1 } },
      });
      await recordBookingStatusHistory(tx, bookingId, fresh.status, BookingStatus.COMPLETED, userId);

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
          eventType: OutboxEventType.BOOKING_COMPLETED,
          payload: { bookingId, customerId: booking.customerId },
        },
      });

      return updated;
    });

    // Category-readiness gate recompute (§17.5.15) — a quote_first category
    // (e.g. Painting) can only unlock once its closed-quote/dispute/deviation
    // thresholds are met, recomputed after every completed booking. Best-effort
    // and outside the transaction above: it's a read-heavy aggregate over
    // already-committed rows, not something that must be atomic with
    // completion, and a fixed_scope booking (no bookingQuote rows for its
    // service) is a cheap no-op rather than something worth gating on.
    const service = await prisma.service.findUnique({ where: { id: updated.serviceId }, select: { pricingModel: true } });
    if (service?.pricingModel === PricingModel.QUOTE_FIRST) {
      await this.readinessService
        .recomputeForService(updated.serviceId)
        .catch((err) => logger.warn({ err, bookingId }, 'Category-readiness recompute failed'));
    }

    return updated;
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
      if (fresh.status !== BookingStatus.ARRIVED) {
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
      if (fresh.status !== BookingStatus.IN_PROGRESS) {
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
      if (fresh.status !== BookingStatus.ARRIVED) {
        throw new ConflictError('No-show can only be reported while ARRIVED');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: { status: BookingStatus.NO_SHOW, cancelledAt: new Date(), cancelReason: 'Customer no-show', version: { increment: 1 } },
      });
      await recordBookingStatusHistory(tx, bookingId, fresh.status, BookingStatus.NO_SHOW, technicianUserId);

      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: OutboxEventType.BOOKING_NO_SHOW,
          payload: {
            bookingId,
            customerId: fresh.customerId,
            status: BookingStatus.NO_SHOW,
            calloutFeeJod: fresh.service.calloutFeeJod.toString(),
          },
        },
      });

      return updated;
    });
  }
}

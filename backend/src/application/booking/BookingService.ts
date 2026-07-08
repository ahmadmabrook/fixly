import { BookingStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { PromoService } from '../promo/PromoService';
import { SubscriptionService } from '../subscription/SubscriptionService';
import { ServiceCreditService } from '../credit/ServiceCreditService';
import { ReferralService } from '../referral/ReferralService';
import { BookingCreateFlow, type CreateBookingInput } from './BookingService.create';
import { BookingLifecycleFlow, ADVANCEABLE_TO } from './BookingService.lifecycle';
import { BookingCancelFlow } from './BookingService.cancelWork';
import { getBookingById, listBookingsForUser, listAdditionalWorkItems } from './BookingService.reads';

export { ADVANCEABLE_TO };
export type { CreateBookingInput };

/**
 * Booking lifecycle: creation, technician-driven status transitions,
 * cancellation/reschedule/additional-work, and read/detail-view queries.
 *
 * The lifecycle is implemented across sibling files, composed here:
 *   bookingStatusHistory.ts      — shared status-history audit-row helper
 *   BookingService.reads.ts      — read-only / detail-view queries
 *   BookingService.create.ts     — booking-creation flow
 *   BookingService.lifecycle.ts  — accept/advanceStatus/complete/checklists/no-show
 *   BookingService.cancelWork.ts — cancel/reschedule/additional-work
 * This class is the public entry point; it delegates every method to the
 * relevant flow so its own signature and behavior are unchanged.
 */
export class BookingService {
  private readonly createFlow: BookingCreateFlow;
  private readonly lifecycleFlow: BookingLifecycleFlow;
  private readonly cancelFlow: BookingCancelFlow;

  constructor(
    private readonly promoService: PromoService = new PromoService(),
    private readonly subscriptionService: SubscriptionService = new SubscriptionService(),
    private readonly creditService: ServiceCreditService = new ServiceCreditService(),
    private readonly referralService: ReferralService = new ReferralService(),
  ) {
    this.createFlow = new BookingCreateFlow(promoService, subscriptionService, creditService);
    this.lifecycleFlow = new BookingLifecycleFlow(creditService, referralService);
    this.cancelFlow = new BookingCancelFlow();
  }

  async createBooking(input: CreateBookingInput) {
    return this.createFlow.createBooking(input);
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
    return listBookingsForUser(userId, role, limit, offset);
  }

  async getById(bookingId: string, userId: string) {
    return getBookingById(bookingId, userId);
  }

  async accept(bookingId: string, technicianUserId: string) {
    return this.lifecycleFlow.accept(bookingId, technicianUserId);
  }

  async advanceStatus(bookingId: string, technicianUserId: string, to: BookingStatus) {
    return this.lifecycleFlow.advanceStatus(bookingId, technicianUserId, to);
  }

  async complete(bookingId: string, userId: string) {
    return this.lifecycleFlow.complete(bookingId, userId);
  }

  async submitPreStartChecklist(bookingId: string, technicianUserId: string, photoUrls: string[]) {
    return this.lifecycleFlow.submitPreStartChecklist(bookingId, technicianUserId, photoUrls);
  }

  async submitPreCloseChecklist(bookingId: string, technicianUserId: string, photoUrls: string[]) {
    return this.lifecycleFlow.submitPreCloseChecklist(bookingId, technicianUserId, photoUrls);
  }

  async noShow(bookingId: string, technicianUserId: string) {
    return this.lifecycleFlow.noShow(bookingId, technicianUserId);
  }

  async cancel(bookingId: string, userId: string, reason?: string) {
    return this.cancelFlow.cancel(bookingId, userId, reason);
  }

  async reschedule(bookingId: string, userId: string, scheduledAt: string) {
    return this.cancelFlow.reschedule(bookingId, userId, scheduledAt);
  }

  async proposeAdditionalWork(bookingId: string, technicianUserId: string, description: string, amountJod: number | string) {
    return this.cancelFlow.proposeAdditionalWork(bookingId, technicianUserId, description, amountJod);
  }

  async respondAdditionalWork(bookingId: string, itemId: string, customerId: string, approve: boolean) {
    return this.cancelFlow.respondAdditionalWork(bookingId, itemId, customerId, approve);
  }

  async listAdditionalWork(bookingId: string, userId: string) {
    return listAdditionalWorkItems(bookingId, userId);
  }
}

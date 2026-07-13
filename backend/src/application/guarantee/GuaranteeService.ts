import { GuaranteeStatus, BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { guaranteeTicketsTotal } from '../../shared/metrics';
import { SubscriptionService } from '../subscription/SubscriptionService';
import { env } from '../../shared/env';
import { OutboxEventType } from '../../shared/outboxEvents';

/** Default post-service guarantee window (days); 2-hour admin response SLA.
 *  Protection subscribers get an extended window (§0.3, subscription.guaranteeDays). */
export const GUARANTEE_DAYS = 30;
const SLA_HOURS = 2;

export class GuaranteeService {
  constructor(private readonly subscriptionService: SubscriptionService = new SubscriptionService()) {}

  /** Guarantee window for a customer: the subscriber's extended window, else default. */
  private async windowDays(customerId: string): Promise<number> {
    const sub = await this.subscriptionService.activeFor(customerId);
    return sub?.guaranteeDays ?? GUARANTEE_DAYS;
  }

  /** Bookings still inside the guarantee window that don't yet have a ticket. */
  async eligibleBookings(customerId: string) {
    const days = await this.windowDays(customerId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return prisma.booking.findMany({
      where: {
        customerId,
        status: BookingStatus.COMPLETED,
        completedAt: { gte: cutoff },
        guarantee: null,
      },
      include: { service: { select: { nameAr: true, nameEn: true } } },
      orderBy: { completedAt: 'desc' },
      take: 100,
    });
  }

  async openTicket(bookingId: string, customerId: string, description: string, mediaUrls: string[] = []) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { guarantee: true } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.customerId !== customerId) throw new ForbiddenError();
    if (booking.status !== BookingStatus.COMPLETED || !booking.completedAt) {
      throw new ValidationError('Only completed bookings are covered by the guarantee');
    }
    const days = await this.windowDays(customerId);
    const ageMs = Date.now() - booking.completedAt.getTime();
    if (ageMs > days * 24 * 60 * 60 * 1000) {
      throw new ValidationError(`انتهت فترة الضمان (${days} يوماً)`);
    }
    if (booking.guarantee) throw new ConflictError('A guarantee ticket already exists for this booking');

    const expiresAt = new Date(Date.now() + SLA_HOURS * 60 * 60 * 1000);
    const ticket = await prisma.guaranteeTicket.create({
      data: { bookingId, description: description?.trim() || null, mediaUrls, expiresAt, status: GuaranteeStatus.OPEN },
    });
    guaranteeTicketsTotal.inc({ action: 'opened' });
    return ticket;
  }

  async listForCustomer(customerId: string) {
    return prisma.guaranteeTicket.findMany({
      where: { booking: { customerId } },
      include: { booking: { include: { service: { select: { nameAr: true, nameEn: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getForCustomer(id: string, customerId: string) {
    const ticket = await prisma.guaranteeTicket.findUnique({
      where: { id },
      include: { booking: { include: { service: { select: { nameAr: true, nameEn: true } } } } },
    });
    if (!ticket || ticket.booking.customerId !== customerId) throw new NotFoundError('GuaranteeTicket');
    return ticket;
  }

  // ── Admin ──────────────────────────────────────────────

  async listForAdmin(status?: GuaranteeStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.guaranteeTicket.findMany({
        where,
        include: { booking: { include: { customer: { select: { name: true } }, service: { select: { nameAr: true } } } } },
        orderBy: { createdAt: 'asc' }, // oldest first → SLA queue order
        skip: offset,
        take: limit,
      }),
      prisma.guaranteeTicket.count({ where }),
    ]);
    return { items, total };
  }

  /** Approve or reject a ticket. APPROVED may schedule a free re-visit. Notifies
   *  the customer of the outcome. */
  async review(id: string, decision: 'APPROVED' | 'REJECTED', adminNote?: string, scheduledVisitAt?: string) {
    const ticket = await prisma.guaranteeTicket.findUnique({
      where: { id },
      include: {
        booking: {
          select: {
            customerId: true, technicianId: true, serviceId: true,
            addressLine: true, addressLat: true, addressLng: true,
          },
        },
      },
    });
    if (!ticket) throw new NotFoundError('GuaranteeTicket');
    if (ticket.status === GuaranteeStatus.RESOLVED || ticket.status === GuaranteeStatus.REJECTED) {
      throw new ConflictError('Ticket already finalised');
    }
    const scheduleFollowup = decision === 'APPROVED' && !!scheduledVisitAt;

    const updated = await prisma.$transaction(async (tx) => {
      let followupBookingId: string | undefined;
      if (scheduleFollowup) {
        // Free re-visit: same customer/technician/service, zero cost. Created directly
        // (not via BookingService.createBooking) since it bypasses pricing/promo/dispatch
        // entirely — it's already assigned to the same technician who did the original job.
        const followup = await tx.booking.create({
          data: {
            customerId: ticket.booking.customerId,
            technicianId: ticket.booking.technicianId,
            serviceId: ticket.booking.serviceId,
            addressLine: ticket.booking.addressLine,
            addressLat: ticket.booking.addressLat,
            addressLng: ticket.booking.addressLng,
            scheduledAt: new Date(scheduledVisitAt as string),
            totalJod: 0,
            status: ticket.booking.technicianId ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
          },
        });
        followupBookingId = followup.id;
        await tx.bookingStatusHistory.create({
          data: { bookingId: followup.id, fromStatus: null, toStatus: followup.status },
        });
        // Zero-cost booking: create its Payment row directly as already-authorized so
        // BookingService.complete()'s money guard passes without ever calling the PSP
        // (preAuthorize refuses non-positive amounts) — nothing is held or captured.
        await tx.payment.create({
          data: {
            bookingId: followup.id,
            status: PaymentStatus.PRE_AUTHORIZED,
            provider: 'none',
            currency: env().CURRENCY,
            amountJod: new Prisma.Decimal(0),
            preAuthorizedAt: new Date(),
          },
        });
        // Reuse the existing booking.created notification fan-out (the outbox worker's
        // payment handler no-ops: a payment already exists in a non-PENDING state).
        await tx.outboxEvent.create({
          data: {
            bookingId: followup.id,
            eventType: OutboxEventType.BOOKING_CREATED,
            payload: { bookingId: followup.id, customerId: ticket.booking.customerId },
          },
        });
      }

      const result = await tx.guaranteeTicket.update({
        where: { id },
        data: {
          status: decision === 'APPROVED' ? GuaranteeStatus.RESOLVED : GuaranteeStatus.REJECTED,
          adminNote: adminNote?.trim() || null,
          scheduledVisitAt: decision === 'APPROVED' && scheduledVisitAt ? new Date(scheduledVisitAt) : null,
          followupBookingId,
          resolvedAt: new Date(),
        },
      });
      await createUserNotification(tx, {
        userId: ticket.booking.customerId,
        bookingId: ticket.bookingId,
        titleAr: 'تحديث على طلب الضمان',
        bodyAr: decision === 'APPROVED' ? 'تمت الموافقة على طلب الضمان. سنتواصل لجدولة زيارة مجانية.' : 'تم رفض طلب الضمان. راجع الملاحظة أو تواصل مع الدعم.',
      });
      return result;
    });
    // Count only after commit (no over-count on rollback).
    guaranteeTicketsTotal.inc({ action: decision === 'APPROVED' ? 'approved' : 'rejected' });
    return updated;
  }

  /** Move a ticket into review (admin picked it up). */
  async markInReview(id: string) {
    const ticket = await prisma.guaranteeTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError('GuaranteeTicket');
    if (ticket.status !== GuaranteeStatus.OPEN) return ticket;
    return prisma.guaranteeTicket.update({ where: { id }, data: { status: GuaranteeStatus.IN_REVIEW } });
  }
}

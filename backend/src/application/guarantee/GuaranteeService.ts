import { GuaranteeStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { guaranteeTicketsTotal } from '../../shared/metrics';

/** 30-day post-service guarantee window; 2-hour admin response SLA. */
export const GUARANTEE_DAYS = 30;
const SLA_HOURS = 2;

export class GuaranteeService {
  /** Bookings still inside the 30-day window that don't yet have a ticket. */
  async eligibleBookings(customerId: string) {
    const cutoff = new Date(Date.now() - GUARANTEE_DAYS * 24 * 60 * 60 * 1000);
    return prisma.booking.findMany({
      where: {
        customerId,
        status: 'COMPLETED',
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
    if (booking.status !== 'COMPLETED' || !booking.completedAt) {
      throw new ValidationError('Only completed bookings are covered by the guarantee');
    }
    const ageMs = Date.now() - booking.completedAt.getTime();
    if (ageMs > GUARANTEE_DAYS * 24 * 60 * 60 * 1000) {
      throw new ValidationError('انتهت فترة الضمان (30 يوماً)');
    }
    if (booking.guarantee) throw new ConflictError('A guarantee ticket already exists for this booking');

    const expiresAt = new Date(Date.now() + SLA_HOURS * 60 * 60 * 1000);
    const ticket = await prisma.guaranteeTicket.create({
      data: { bookingId, description: description?.trim() || null, mediaUrls, expiresAt, status: 'OPEN' },
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
      include: { booking: { select: { customerId: true } } },
    });
    if (!ticket) throw new NotFoundError('GuaranteeTicket');
    if (ticket.status === 'RESOLVED' || ticket.status === 'REJECTED') {
      throw new ConflictError('Ticket already finalised');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.guaranteeTicket.update({
        where: { id },
        data: {
          status: decision === 'APPROVED' ? 'RESOLVED' : 'REJECTED',
          adminNote: adminNote?.trim() || null,
          scheduledVisitAt: decision === 'APPROVED' && scheduledVisitAt ? new Date(scheduledVisitAt) : null,
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
    if (ticket.status !== 'OPEN') return ticket;
    return prisma.guaranteeTicket.update({ where: { id }, data: { status: 'IN_REVIEW' } });
  }
}

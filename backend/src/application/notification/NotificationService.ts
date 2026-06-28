import { Prisma } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';

interface BookingEventPayload {
  bookingId: string;
  customerId?: string;
}

/** Arabic copy per booking lifecycle event. */
const NOTIFICATION_COPY: Record<string, { titleAr: string; bodyAr: string; status: string }> = {
  'booking.created': { titleAr: 'تم استلام طلبك', bodyAr: 'جارٍ البحث عن أقرب فني متاح.', status: 'PENDING' },
  'booking.confirmed': { titleAr: 'تم قبول طلبك', bodyAr: 'قبل أحد الفنيين طلبك وسيتواصل معك قريباً.', status: 'CONFIRMED' },
  'booking.en_route': { titleAr: 'الفني في الطريق', bodyAr: 'الفني في طريقه إلى موقعك الآن.', status: 'EN_ROUTE' },
  'booking.arrived': { titleAr: 'وصل الفني', bodyAr: 'وصل الفني إلى موقعك.', status: 'ARRIVED' },
  'booking.in_progress': { titleAr: 'بدأت الخدمة', bodyAr: 'بدأ الفني تنفيذ الخدمة.', status: 'IN_PROGRESS' },
  'booking.completed': { titleAr: 'اكتملت الخدمة', bodyAr: 'تم إنجاز طلبك بنجاح. نتمنى أن تكون راضياً.', status: 'COMPLETED' },
  'booking.cancelled': { titleAr: 'تم إلغاء الطلب', bodyAr: 'تم إلغاء طلبك. إن كان لديك استفسار تواصل مع الدعم.', status: 'CANCELLED' },
};

/**
 * Persists in-app notifications and pushes a real-time status update to the
 * customer's personal socket room. Invoked by the outbox worker, so it must be
 * resilient: the customerId is resolved from the booking when absent from the
 * payload (e.g. booking.cancelled carries only a reason).
 */
export class NotificationService {
  constructor(private readonly io: SocketServer) {}

  async handleBookingEvent(eventType: string, payload: BookingEventPayload): Promise<void> {
    const copy = NOTIFICATION_COPY[eventType];
    if (!copy) {
      logger.warn({ eventType }, 'NotificationService: no copy for event, skipping');
      return;
    }

    const customerId = payload.customerId ?? (await this.resolveCustomerId(payload.bookingId));
    if (!customerId) {
      logger.warn({ bookingId: payload.bookingId }, 'NotificationService: customer not found, skipping');
      return;
    }

    // Idempotent: the outbox is at-least-once, so a re-delivery must not create
    // a duplicate row. The unique dedupeKey makes the second insert a no-op.
    const dedupeKey = `${payload.bookingId}:${eventType}`;
    try {
      await prisma.notification.create({
        data: {
          userId: customerId,
          bookingId: payload.bookingId,
          dedupeKey,
          titleAr: copy.titleAr,
          bodyAr: copy.bodyAr,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.debug({ dedupeKey }, 'Notification already sent — skipping duplicate');
        return; // already delivered; don't re-emit
      }
      throw err;
    }

    const at = Date.now();
    this.io.to(`user:${customerId}`).emit('booking:status', {
      bookingId: payload.bookingId,
      status: copy.status,
      titleAr: copy.titleAr,
      at,
    });
    this.io.to(`user:${customerId}`).emit('notification:new', {
      titleAr: copy.titleAr,
      bodyAr: copy.bodyAr,
      bookingId: payload.bookingId,
      at,
    });

    logger.debug({ bookingId: payload.bookingId, eventType }, 'Notification dispatched');
  }

  private async resolveCustomerId(bookingId: string): Promise<string | null> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true },
    });
    return booking?.customerId ?? null;
  }
}

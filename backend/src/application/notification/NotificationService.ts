import { Prisma, BookingStatus } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { PrismaErrorCode } from '../../shared/errors';
import { OutboxEventType } from '../../shared/outboxEvents';

interface BookingEventPayload {
  bookingId: string;
  customerId?: string;
}

/** Arabic copy per booking lifecycle event. */
const NOTIFICATION_COPY: Record<string, { titleAr: string; bodyAr: string; status: BookingStatus }> = {
  [OutboxEventType.BOOKING_CREATED]: { titleAr: 'تم استلام طلبك', bodyAr: 'جارٍ البحث عن أقرب فني متاح.', status: BookingStatus.PENDING },
  [OutboxEventType.BOOKING_CONFIRMED]: { titleAr: 'تم قبول طلبك', bodyAr: 'قبل أحد الفنيين طلبك وسيتواصل معك قريباً.', status: BookingStatus.CONFIRMED },
  [OutboxEventType.BOOKING_EN_ROUTE]: { titleAr: 'الفني في الطريق', bodyAr: 'الفني في طريقه إلى موقعك الآن.', status: BookingStatus.EN_ROUTE },
  [OutboxEventType.BOOKING_ARRIVED]: { titleAr: 'وصل الفني', bodyAr: 'وصل الفني إلى موقعك.', status: BookingStatus.ARRIVED },
  [OutboxEventType.BOOKING_IN_PROGRESS]: { titleAr: 'بدأت الخدمة', bodyAr: 'بدأ الفني تنفيذ الخدمة.', status: BookingStatus.IN_PROGRESS },
  [OutboxEventType.BOOKING_COMPLETED]: { titleAr: 'اكتملت الخدمة', bodyAr: 'تم إنجاز طلبك بنجاح. نتمنى أن تكون راضياً.', status: BookingStatus.COMPLETED },
  [OutboxEventType.BOOKING_CANCELLED]: { titleAr: 'تم إلغاء الطلب', bodyAr: 'تم إلغاء طلبك. إن كان لديك استفسار تواصل مع الدعم.', status: BookingStatus.CANCELLED },
  [OutboxEventType.BOOKING_NO_SHOW]: { titleAr: 'لم يتم العثور عليك', bodyAr: 'أبلغ الفني بعدم تواجدك في العنوان. تم تحصيل رسوم الزيارة.', status: BookingStatus.NO_SHOW },
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
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

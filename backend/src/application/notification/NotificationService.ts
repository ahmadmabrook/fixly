import { Prisma, BookingStatus } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { PrismaErrorCode } from '../../shared/errors';
import { OutboxEventType } from '../../shared/outboxEvents';

interface BookingEventPayload {
  bookingId: string;
  customerId?: string;
  /** Only meaningful for BOOKING_CANCELLED — distinguishes a system-initiated
   *  cancellation (dispatch exhausted every round, no technician available)
   *  from the customer's own cancel, which needs no special reassurance. */
  reason?: string;
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

/** §2.6 dispatch exhaustion — reassuring, action-oriented copy instead of the
 *  generic cancel message, since this is Fixly's own gap (no tech found), not
 *  something the customer did. Mirrors the design's dedicated "no technicians
 *  available" screen (retry / book later) rather than a flat "cancelled". */
const NO_TECHNICIAN_COPY = {
  titleAr: 'لم نجد فنياً متاحاً',
  bodyAr: 'تعذّر إيجاد فني متاح حالياً وتم استرداد المبلغ بالكامل. جرّب الطلب مرة أخرى أو اختر موعداً لاحقاً.',
  status: BookingStatus.CANCELLED,
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
    const copy = eventType === OutboxEventType.BOOKING_CANCELLED && payload.reason === 'no_technician_available'
      ? NO_TECHNICIAN_COPY
      : NOTIFICATION_COPY[eventType];
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

  /** §2.6 extra-work rule: technician proposes → customer sees it live, not
   *  just on next inbox poll (the whole point of the fixed-price gate is that
   *  the customer notices before it's silently added to their total). */
  async handleExtraWorkProposed(payload: { bookingId: string; customerId: string; description: string; amountJod: string }): Promise<void> {
    const dedupeKey = `${payload.bookingId}:extra_proposed:${payload.description}:${payload.amountJod}`;
    const notified = await this.tryNotify(payload.customerId, payload.bookingId, dedupeKey, 'عمل إضافي مقترح', `اقترح الفني عملاً إضافياً بقيمة ${payload.amountJod} دينار — يحتاج موافقتك.`);
    if (!notified) return;
    this.io.to(`user:${payload.customerId}`).emit('booking:extra_proposed', payload);
  }

  /** Mirrors handleExtraWorkProposed for the technician-facing decision. */
  async handleExtraWorkDecided(payload: { bookingId: string; technicianUserId: string; approved: boolean; amountJod: string }): Promise<void> {
    const dedupeKey = `${payload.bookingId}:extra_decided:${payload.approved}:${payload.amountJod}`;
    const title = payload.approved ? 'تمت الموافقة على العمل الإضافي' : 'تم رفض العمل الإضافي';
    const body = payload.approved ? `وافق العميل على ${payload.amountJod} دينار عمل إضافي.` : 'رفض العميل العمل الإضافي المقترح.';
    const notified = await this.tryNotify(payload.technicianUserId, payload.bookingId, dedupeKey, title, body);
    if (!notified) return;
    this.io.to(`user:${payload.technicianUserId}`).emit('booking:extra_decided', payload);
  }

  /** §17.5.3/§17.5.12 — live push only. setQuote/sendItemizedQuote already
   *  write the inbox Notification row directly (createUserNotification) at
   *  the call site; this only adds the socket push, so retries of this
   *  at-least-once outbox event just re-emit a harmless duplicate live toast
   *  instead of a second inbox row. */
  async handleQuoteReady(payload: { bookingId: string; customerId: string; quoteId: string }): Promise<void> {
    this.io.to(`user:${payload.customerId}`).emit('quote:ready', payload);
  }

  /** Wallet-credit grants (late-comp, referral, etc.) — live balance nudge. */
  async handleCreditGranted(payload: { bookingId: string; customerId: string; amountJod: string; reason: string }): Promise<void> {
    const dedupeKey = `${payload.bookingId}:credit_granted:${payload.reason}`;
    const notified = await this.tryNotify(payload.customerId, payload.bookingId, dedupeKey, 'تمت إضافة رصيد', `أُضيف ${payload.amountJod} دينار إلى رصيدك.`);
    if (!notified) return;
    this.io.to(`user:${payload.customerId}`).emit('credit:granted', payload);
  }

  /** Shared idempotent-insert-then-decide-whether-to-emit helper — the same
   *  at-least-once/dedupeKey shape as handleBookingEvent, factored out so the
   *  four handlers above don't each re-implement the try/catch. Returns false
   *  (skip the emit) only when this exact event was already delivered. */
  private async tryNotify(userId: string, bookingId: string, dedupeKey: string, titleAr: string, bodyAr: string): Promise<boolean> {
    try {
      await prisma.notification.create({ data: { userId, bookingId, dedupeKey, titleAr, bodyAr, sentAt: new Date() } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        logger.debug({ dedupeKey }, 'Notification already sent — skipping duplicate');
        return false;
      }
      throw err;
    }
  }

  private async resolveCustomerId(bookingId: string): Promise<string | null> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true },
    });
    return booking?.customerId ?? null;
  }
}

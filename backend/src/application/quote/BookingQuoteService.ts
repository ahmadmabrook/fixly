import { Prisma, QuoteStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { BookingService } from '../booking/BookingService';
import { createUserNotification } from '../notification/notify';

/** Video pre-check quotes are valid for this long once a firm price is set. */
export const QUOTE_TTL_DAYS = 7;

interface CreateQuoteInput {
  serviceId: string;
  videoUrl: string;
  description?: string;
  addressLine?: string;
  addressLat?: number;
  addressLng?: number;
}

/**
 * Video pre-check quotes (§0.3): a customer uploads a problem video, a qualified
 * technician / ops sets a FIRM price, and on accept it becomes a booking at exactly
 * that price — preserving the "no surprises" promise for non-standard jobs.
 */
export class BookingQuoteService {
  constructor(private readonly bookingService: BookingService = new BookingService()) {}

  async create(customerId: string, input: CreateQuoteInput) {
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ConflictError('Service is not available');
    return prisma.bookingQuote.create({
      data: {
        customerId,
        serviceId: input.serviceId,
        status: 'PENDING',
        videoUrl: input.videoUrl,
        description: input.description ?? null,
        addressLine: input.addressLine ?? null,
        addressLat: input.addressLat ?? null,
        addressLng: input.addressLng ?? null,
        expiresAt: new Date(Date.now() + QUOTE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  async getForCustomer(id: string, customerId: string) {
    const quote = await prisma.bookingQuote.findUnique({
      where: { id },
      include: { service: { select: { nameAr: true, nameEn: true } } },
    });
    if (!quote || quote.customerId !== customerId) throw new NotFoundError('Quote');
    return quote;
  }

  async listForCustomer(customerId: string, limit = 50) {
    return prisma.bookingQuote.findMany({
      where: { customerId },
      include: { service: { select: { nameAr: true, nameEn: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Technician / ops sets a FIRM price on a pending quote. */
  async setQuote(id: string, quotedById: string, quotedJod: number | string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.status !== 'PENDING') throw new ConflictError('Quote is not pending');
    const updated = await prisma.bookingQuote.update({
      where: { id },
      data: { status: 'QUOTED', quotedJod: new Prisma.Decimal(quotedJod), quotedById },
    });
    await createUserNotification(prisma, {
      userId: quote.customerId,
      titleAr: 'تم تسعير طلبك',
      bodyAr: `السعر النهائي: ${new Prisma.Decimal(quotedJod).toFixed(3)} دينار. راجع العرض للتأكيد.`,
    });
    return updated;
  }

  /**
   * Customer accepts a firm quote → creates a booking at exactly `quotedJod`.
   * The quote flips to ACCEPTED and links the booking. Idempotency-safe: a quote
   * that already produced a booking cannot be accepted twice (status guard).
   */
  async accept(id: string, customerId: string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.customerId !== customerId) throw new ForbiddenError();
    if (quote.status !== 'QUOTED' || quote.quotedJod == null) {
      throw new ConflictError('Quote is not ready to accept');
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      await prisma.bookingQuote.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw new ConflictError('انتهت صلاحية العرض');
    }

    const booking = await this.bookingService.createBooking({
      customerId,
      serviceId: quote.serviceId,
      addressLine: quote.addressLine ?? 'من طلب الفحص المرئي',
      addressLat: quote.addressLat ?? 0,
      addressLng: quote.addressLng ?? 0,
      priceOverrideJod: quote.quotedJod,
    });

    await prisma.bookingQuote.update({
      where: { id },
      data: { status: 'ACCEPTED', bookingId: booking.id },
    });
    return booking;
  }

  async listForAdmin(status?: QuoteStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.bookingQuote.findMany({
        where,
        include: {
          service: { select: { nameAr: true } },
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.bookingQuote.count({ where }),
    ]);
    return { items, total };
  }
}

import { Prisma, QuoteStatus, QuoteLineKind, MaterialSource, PricingModel } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { BookingService } from '../booking/BookingService';
import { createUserNotification } from '../notification/notify';
import { MaterialCatalogService } from '../materials/MaterialCatalogService';
import { fromMinorUnits } from '../../shared/money';
import { env } from '../../shared/env';

/** Video pre-check quotes are valid for this long once a firm price is set. */
export const QUOTE_TTL_DAYS = 7;

interface CreateQuoteInput {
  serviceId: string;
  videoUrl?: string;
  description?: string;
  addressLine?: string;
  addressLat?: number;
  addressLng?: number;
  /** v1.7 quote_first intake (§17.5.3 step 2) — required instead of videoUrl
   *  when the target service's pricingModel is QUOTE_FIRST. */
  siteMediaUrls?: string[];
  dimensionsNote?: string;
  requestedTier?: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
}

export interface QuoteLineInput {
  kind: QuoteLineKind;
  materialId?: string | null;
  description: string;
  qty?: number | string | Prisma.Decimal;
  unit?: string | null;
  unitPriceFils: number;
  source?: MaterialSource;
}

/**
 * QuoteLineKind buckets that roll into the BookingQuote/Booking labourFils vs
 * materialsFils split (§17.5.4 three-line invoice rule: Labour · Materials ·
 * Platform fee — the platform-fee split is a computed display value from
 * PLATFORM_COMMISSION_PCT, not a stored column here, matching how Booking has
 * no platformFeeFils field either). LABOUR + FEE are service-side charges;
 * MATERIAL + PREP are physical-material-adjacent, matching the §17.5.3 worked
 * example where the prep line sits with the material lines, distinct from the
 * single labour line.
 */
const LABOUR_BUCKET_KINDS: QuoteLineKind[] = [QuoteLineKind.LABOUR, QuoteLineKind.FEE];

/**
 * Two uses of one service (§0.3, §17.5.1): (a) fixed_scope convenience —
 * customer uploads a problem video, tech/ops sets ONE firm price (v1.6,
 * unchanged: create/setQuote/accept below); (b) quote_first categories
 * (mandatory) — inspection/media assessment produces an ITEMIZED quote via
 * addLine/removeLine, gated by sendItemizedQuote's ops-review check, that the
 * customer approves digitally via the same accept() every quote uses.
 */
export class BookingQuoteService {
  constructor(
    private readonly bookingService: BookingService = new BookingService(),
    private readonly catalogService: MaterialCatalogService = new MaterialCatalogService(),
  ) {}

  async create(customerId: string, input: CreateQuoteInput) {
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ConflictError('Service is not available');

    // Archetype-gated intake (§17.5.1): a quote_first service is never sold on
    // a bare video, and a fixed_scope video pre-check needs no site media.
    if (service.pricingModel === PricingModel.QUOTE_FIRST) {
      if (!input.siteMediaUrls || input.siteMediaUrls.length === 0) {
        throw new ValidationError('siteMediaUrls is required to request a quote_first assessment');
      }
    } else if (!input.videoUrl) {
      throw new ValidationError('videoUrl is required for a fixed_scope video pre-check quote');
    }

    return prisma.bookingQuote.create({
      data: {
        customerId,
        serviceId: input.serviceId,
        status: QuoteStatus.PENDING,
        videoUrl: input.videoUrl ?? null,
        siteMediaUrls: input.siteMediaUrls ?? [],
        dimensionsNote: input.dimensionsNote ?? null,
        requestedTier: input.requestedTier ?? undefined,
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
      include: { service: { select: { nameAr: true, nameEn: true } }, lines: true },
    });
    if (!quote || quote.customerId !== customerId) throw new NotFoundError('Quote');
    return quote;
  }

  async listForCustomer(customerId: string, limit = 50) {
    return prisma.bookingQuote.findMany({
      where: { customerId },
      include: { service: { select: { nameAr: true, nameEn: true } }, lines: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Technician / ops sets a FIRM price on a pending video pre-check quote
   *  (fixed_scope path, v1.6 — unchanged). Itemized quote_first quotes use
   *  addLine/removeLine + sendItemizedQuote instead. */
  async setQuote(id: string, quotedById: string, quotedJod: number | string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.status !== QuoteStatus.PENDING) throw new ConflictError('Quote is not pending');
    const updated = await prisma.bookingQuote.update({
      where: { id },
      data: { status: QuoteStatus.QUOTED, quotedJod: new Prisma.Decimal(quotedJod), quotedById },
    });
    await createUserNotification(prisma, {
      userId: quote.customerId,
      titleAr: 'تم تسعير طلبك',
      bodyAr: `السعر النهائي: ${new Prisma.Decimal(quotedJod).toFixed(3)} دينار. راجع العرض للتأكيد.`,
    });
    return updated;
  }

  /**
   * Assessor (technician or ops) drafts one itemized line (§17.5.3 step 4).
   * Material lines price against the catalog and must sit within its band —
   * MaterialCatalogService.assertPriceBand is the single source of truth for
   * that check (§17.5.5 q4), reused here rather than re-implemented.
   * Off-catalogue material lines (no materialId) are allowed but flow into
   * sendItemizedQuote's ops-review requirement.
   */
  async addLine(quoteId: string, input: QuoteLineInput) {
    await this.requireDraftableQuote(quoteId);
    const totalFils = await this.priceAndValidateLine(input);

    await prisma.quoteLine.create({
      data: {
        quoteId,
        kind: input.kind,
        materialId: input.materialId ?? null,
        description: input.description,
        qty: new Prisma.Decimal(input.qty ?? 1),
        unit: input.unit ?? null,
        unitPriceFils: input.unitPriceFils,
        totalFils,
        source: input.source ?? MaterialSource.TECHNICIAN_PROCURED,
      },
    });
    return this.recomputeTotals(quoteId);
  }

  async updateLine(quoteId: string, lineId: string, input: Partial<QuoteLineInput>) {
    await this.requireDraftableQuote(quoteId);
    const existing = await prisma.quoteLine.findUnique({ where: { id: lineId } });
    if (!existing || existing.quoteId !== quoteId) throw new NotFoundError('QuoteLine');

    const merged: QuoteLineInput = {
      kind: input.kind ?? existing.kind,
      materialId: input.materialId !== undefined ? input.materialId : existing.materialId,
      description: input.description ?? existing.description,
      qty: input.qty ?? existing.qty,
      unit: input.unit !== undefined ? input.unit : existing.unit,
      unitPriceFils: input.unitPriceFils ?? existing.unitPriceFils,
      source: input.source ?? existing.source,
    };
    const totalFils = await this.priceAndValidateLine(merged);

    await prisma.quoteLine.update({
      where: { id: lineId },
      data: {
        kind: merged.kind,
        materialId: merged.materialId ?? null,
        description: merged.description,
        qty: new Prisma.Decimal(merged.qty ?? 1),
        unit: merged.unit ?? null,
        unitPriceFils: merged.unitPriceFils,
        totalFils,
        source: merged.source,
      },
    });
    return this.recomputeTotals(quoteId);
  }

  async removeLine(quoteId: string, lineId: string) {
    await this.requireDraftableQuote(quoteId);
    const line = await prisma.quoteLine.findUnique({ where: { id: lineId } });
    if (!line || line.quoteId !== quoteId) throw new NotFoundError('QuoteLine');
    await prisma.quoteLine.delete({ where: { id: lineId } });
    return this.recomputeTotals(quoteId);
  }

  /**
   * Ops sign-off (§17.5.12 control #5) — required by sendItemizedQuote before
   * a quote at/above OPS_REVIEW_THRESHOLD_FILS or containing any off-catalogue
   * material line can be sent. Does not itself send the quote.
   */
  async opsReview(quoteId: string, adminId: string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.status !== QuoteStatus.PENDING) throw new ConflictError('Quote is not pending');
    return prisma.bookingQuote.update({
      where: { id: quoteId },
      data: { opsReviewedById: adminId, opsReviewedAt: new Date() },
    });
  }

  /**
   * Send an itemized quote_first quote to the customer. Requires at least one
   * line, and — above OPS_REVIEW_THRESHOLD_FILS or with any off-catalogue
   * material line — a prior opsReview() call, checked here rather than only
   * documented, so the gate can't be bypassed. quotedJod is set from the
   * summed lines so every existing reader of that field (web/admin UI, the
   * TTL/accept flow below) keeps working unchanged for either quote path.
   */
  async sendItemizedQuote(quoteId: string, quotedById: string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id: quoteId }, include: { lines: true } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.status !== QuoteStatus.PENDING) throw new ConflictError('Quote is not pending');
    if (quote.lines.length === 0) throw new ValidationError('Cannot send a quote with no lines');

    const totalFils = (quote.labourFils ?? 0) + (quote.materialsFils ?? 0);
    const hasOffCatalogueLine = quote.lines.some((l) => l.kind === QuoteLineKind.MATERIAL && l.materialId == null);
    const needsOpsReview = totalFils >= env().OPS_REVIEW_THRESHOLD_FILS || hasOffCatalogueLine;
    if (needsOpsReview && !quote.opsReviewedAt) {
      throw new ConflictError('This quote requires ops review before it can be sent');
    }

    const quotedJod = fromMinorUnits(totalFils);
    const updated = await prisma.bookingQuote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.QUOTED, quotedById, quotedJod },
    });
    await createUserNotification(prisma, {
      userId: quote.customerId,
      titleAr: 'عرض السعر جاهز',
      bodyAr: `السعر الإجمالي: ${quotedJod.toFixed(3)} دينار (أجور + مواد). راجع تفاصيل العرض للموافقة.`,
    });
    return updated;
  }

  /**
   * Customer accepts a firm quote → creates a booking at exactly `quotedJod`.
   * The quote flips to ACCEPTED and links the booking. Idempotency-safe: a
   * quote that already produced a booking cannot be accepted twice (status
   * guard). For an itemized quote_first quote (has lines), the booking also
   * carries the labourFils/materialsFils split (§17.5) for the customer
   * invoice breakdown; a fixed_scope video-quote booking is unchanged.
   */
  async accept(id: string, customerId: string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id }, include: { lines: true } });
    if (!quote) throw new NotFoundError('Quote');
    if (quote.customerId !== customerId) throw new ForbiddenError();
    if (quote.status !== QuoteStatus.QUOTED || quote.quotedJod == null) {
      throw new ConflictError('Quote is not ready to accept');
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      await prisma.bookingQuote.update({ where: { id }, data: { status: QuoteStatus.EXPIRED } });
      throw new ConflictError('انتهت صلاحية العرض');
    }

    const isItemized = (quote.lines ?? []).length > 0;
    const booking = await this.bookingService.createBooking({
      customerId,
      serviceId: quote.serviceId,
      addressLine: quote.addressLine ?? 'من طلب الفحص المرئي',
      addressLat: quote.addressLat ?? 0,
      addressLng: quote.addressLng ?? 0,
      priceOverrideJod: quote.quotedJod,
      ...(isItemized ? { labourFils: quote.labourFils ?? 0, materialsFils: quote.materialsFils ?? 0 } : {}),
    });

    await prisma.bookingQuote.update({
      where: { id },
      data: { status: QuoteStatus.ACCEPTED, bookingId: booking.id },
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
          lines: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.bookingQuote.count({ where }),
    ]);
    return { items, total };
  }

  private async requireDraftableQuote(quoteId: string) {
    const quote = await prisma.bookingQuote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundError('Quote');
    // Lines are immutable once the quote is sent (§17.5.11: "quote_lines are
    // immutable after acceptance") — enforced here from QUOTED onward, before
    // the customer has even acted, so a sent quote can never be quietly edited.
    if (quote.status !== QuoteStatus.PENDING) throw new ConflictError('Quote is no longer editable');
    return quote;
  }

  private async priceAndValidateLine(input: QuoteLineInput): Promise<number> {
    const qty = new Prisma.Decimal(input.qty ?? 1);
    const totalFils = new Prisma.Decimal(input.unitPriceFils).times(qty).toDecimalPlaces(0).toNumber();
    if (input.kind === QuoteLineKind.MATERIAL && input.materialId) {
      const material = await this.catalogService.get(input.materialId);
      this.catalogService.assertPriceBand(input.unitPriceFils, material.priceMinFils, material.priceMaxFils);
    }
    return totalFils;
  }

  /** Sums this quote's lines into the denormalized labourFils/materialsFils
   *  split, recomputed after every line add/update/remove so reads never see
   *  a stale total (§17.5.3). */
  private async recomputeTotals(quoteId: string) {
    const lines = await prisma.quoteLine.findMany({ where: { quoteId } });
    const labourFils = lines.filter((l) => LABOUR_BUCKET_KINDS.includes(l.kind)).reduce((sum, l) => sum + l.totalFils, 0);
    const materialsFils = lines
      .filter((l) => !LABOUR_BUCKET_KINDS.includes(l.kind))
      .reduce((sum, l) => sum + l.totalFils, 0);
    return prisma.bookingQuote.update({
      where: { id: quoteId },
      data: { labourFils, materialsFils },
      include: { lines: true },
    });
  }
}

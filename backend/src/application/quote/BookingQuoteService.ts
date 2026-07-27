import { Prisma, QuoteStatus, QuoteLineKind, MaterialSource, MaterialTier, PriceConfidence, PricingModel } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { BookingService } from '../booking/BookingService';
import { createUserNotification } from '../notification/notify';
import { MaterialCatalogService } from '../materials/MaterialCatalogService';
import { fromMinorUnits } from '../../shared/money';
import { env } from '../../shared/env';

// ── Singleton accessor (routes reach the io-bound instance, same pattern as
// DispatchService) — a BookingQuote has no Booking row until accept(), so
// quote:ready can't ride the booking-scoped outbox; it needs a direct socket
// handle instead. ──────────────────────────────────────────────────────────
let instance: BookingQuoteService | null = null;

export function setBookingQuoteService(svc: BookingQuoteService): void { instance = svc; }
export function getBookingQuoteService(): BookingQuoteService {
  if (!instance) throw new Error('BookingQuoteService not initialised');
  return instance;
}

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
 * QuoteLineKind buckets that roll into the BookingQuote/Booking three-way
 * split (§17.5.4: Labour · Materials · Platform/service fee — never one
 * opaque total). FEE lines get their own feesFils bucket (mirrors
 * Booking.feesFils) rather than being folded into labour; MATERIAL + PREP
 * stay together as materialsFils, matching the §17.5.3 worked example where
 * the prep line sits with the material lines.
 */
const MATERIALS_BUCKET_KINDS: QuoteLineKind[] = [QuoteLineKind.MATERIAL, QuoteLineKind.PREP];

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
    // Optional: undefined in the module-level route singletons constructed
    // before main.ts creates the socket server. emitQuoteReady no-ops when
    // absent rather than throwing, so quote drafting/sending still works
    // without live push (matches the pre-existing inbox-only notification).
    private readonly io?: SocketServer,
  ) {}

  private emitQuoteReady(quoteId: string, customerId: string): void {
    this.io?.to(`user:${customerId}`).emit('quote:ready', { quoteId, customerId });
  }

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

    // §2.6 materials rule 5 / service_material_policies.quote_validity_hours —
    // per-service override of the default 7-day window (168h, same default the
    // policy column itself carries, so a service with no policy row behaves
    // exactly as before this read was wired in).
    const policy = await prisma.serviceMaterialPolicy.findUnique({ where: { serviceId: input.serviceId } });
    const validityHours = policy?.quoteValidityHours ?? QUOTE_TTL_DAYS * 24;

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
        expiresAt: new Date(Date.now() + validityHours * 60 * 60 * 1000),
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
    this.emitQuoteReady(quote.id, quote.customerId);
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
    const quote = await this.requireDraftableQuote(quoteId);
    const { unitPriceFils, totalFils } = await this.priceAndValidateLine(input, quote.serviceId, quote.requestedTier);

    await prisma.quoteLine.create({
      data: {
        quoteId,
        kind: input.kind,
        materialId: input.materialId ?? null,
        description: input.description,
        qty: new Prisma.Decimal(input.qty ?? 1),
        unit: input.unit ?? null,
        unitPriceFils,
        totalFils,
        source: input.source ?? MaterialSource.TECHNICIAN_PROCURED,
      },
    });
    return this.recomputeTotals(quoteId);
  }

  async updateLine(quoteId: string, lineId: string, input: Partial<QuoteLineInput>) {
    const quote = await this.requireDraftableQuote(quoteId);
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
    const { unitPriceFils, totalFils } = await this.priceAndValidateLine(merged, quote.serviceId, quote.requestedTier);

    await prisma.quoteLine.update({
      where: { id: lineId },
      data: {
        kind: merged.kind,
        materialId: merged.materialId ?? null,
        description: merged.description,
        qty: new Prisma.Decimal(merged.qty ?? 1),
        unit: merged.unit ?? null,
        unitPriceFils,
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

    const totalFils = (quote.labourFils ?? 0) + (quote.materialsFils ?? 0) + (quote.feesFils ?? 0);
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
    this.emitQuoteReady(quote.id, quote.customerId);
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
      ...(isItemized ? { labourFils: quote.labourFils ?? 0, materialsFils: quote.materialsFils ?? 0, feesFils: quote.feesFils ?? 0 } : {}),
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

  /** Resolves the enforced unit price (overriding a MATERIAL/LABOUR line's
   *  typed price where a governed source exists) and prices the line.
   *  serviceId/requestedTier come from the parent quote — a line is never
   *  priced in isolation from the job it belongs to. */
  private async priceAndValidateLine(
    input: QuoteLineInput, serviceId: string, requestedTier?: MaterialTier | null,
  ): Promise<{ unitPriceFils: number; totalFils: number }> {
    let unitPriceFils = input.unitPriceFils;

    if (input.kind === QuoteLineKind.LABOUR) {
      // §17.5.8: area/quantity-driven work (e.g. painting per m²) is COMPUTED
      // from a tier rate card, not typed by the assessor — removes pricing
      // discretion from the single highest-leverage line on the quote. A
      // service with no rate cards (most fixed_scope categories) is unaffected.
      const rateCard = await prisma.serviceRateCard.findFirst({
        where: { serviceId, tier: requestedTier ?? MaterialTier.STANDARD, isActive: true, effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (rateCard) unitPriceFils = rateCard.rateFils;
    }

    if (input.kind === QuoteLineKind.MATERIAL && input.materialId) {
      const material = await this.catalogService.get(input.materialId);
      this.catalogService.assertPriceBand(unitPriceFils, material.priceMinFils, material.priceMaxFils);
      // §17.5.13(c): an unconfirmed catalog price cannot silently back a firm,
      // customer-facing quote line.
      if (material.priceConfidence !== PriceConfidence.CONFIRMED) {
        throw new ValidationError(`Material price is ${material.priceConfidence.toLowerCase()}, not confirmed — cannot back a firm quote line yet`);
      }
    }

    const qty = new Prisma.Decimal(input.qty ?? 1);
    const totalFils = new Prisma.Decimal(unitPriceFils).times(qty).toDecimalPlaces(0).toNumber();
    return { unitPriceFils, totalFils };
  }

  /** Sums this quote's lines into the denormalized labourFils/materialsFils/
   *  feesFils split, recomputed after every line add/update/remove so reads
   *  never see a stale total (§17.5.3). */
  private async recomputeTotals(quoteId: string) {
    const lines = await prisma.quoteLine.findMany({ where: { quoteId } });
    const labourFils = lines.filter((l) => l.kind === QuoteLineKind.LABOUR).reduce((sum, l) => sum + l.totalFils, 0);
    const feesFils = lines.filter((l) => l.kind === QuoteLineKind.FEE).reduce((sum, l) => sum + l.totalFils, 0);
    const materialsFils = lines
      .filter((l) => MATERIALS_BUCKET_KINDS.includes(l.kind))
      .reduce((sum, l) => sum + l.totalFils, 0);
    return prisma.bookingQuote.update({
      where: { id: quoteId },
      data: { labourFils, materialsFils, feesFils },
      include: { lines: true },
    });
  }
}

import { Prisma, BookingStatus, MaterialLineStatus, MaterialSource, MaterialTier, SubstitutionPolicy, VerificationStatus, VarianceReason } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { MaterialCatalogService } from './MaterialCatalogService';
import { BPS_DENOMINATOR, VARIANCE_JUSTIFY_BPS, MATERIAL_VERIFICATION_DEADLINE_HOURS, BOM_REVIEW_TIMEOUT_HOURS } from './constants';

type Tx = Prisma.TransactionClient;

/** Booking statuses in which the BOM may still be created against (before the
 *  ARRIVED -> IN_PROGRESS lock point). New needs after this route through the
 *  existing extra-work gate (AdditionalWorkItem), never a new BOM line. */
const BOM_CREATABLE_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.EN_ROUTE, BookingStatus.ARRIVED];

/** Line statuses that are still editable/resolvable (haven't reached a
 *  terminal or locked state yet). */
const EDITABLE_LINE_STATUSES: MaterialLineStatus[] = [MaterialLineStatus.PENDING, MaterialLineStatus.PENDING_REVIEW];

/** §17.5.10 case 1 — substitution policy default (SAME_OR_HIGHER_TIER). */
const TIER_RANK: Record<MaterialTier, number> = {
  [MaterialTier.ECONOMY]: 0,
  [MaterialTier.STANDARD]: 1,
  [MaterialTier.PREMIUM]: 2,
};

export interface CreateBookingMaterialInput {
  materialId?: string | null;
  description: string;
  brand?: string | null;
  qty?: number | string;
  unit?: string | null;
  unitPriceFils: number;
  /** §2.6 materials rule 3 — who is providing this line. Defaults to the
   *  platform's normal Asset-Light flow (technician buys, referral commission
   *  only); CUSTOMER_SUPPLIED is the "أنا سأوفر المواد" path, which shifts the
   *  warranty boundary to workmanship-only (§17.8, see approveByCustomer). */
  source?: MaterialSource;
}

/**
 * Bill of Materials (§17.5.9) — created and approved BEFORE execution, never
 * reconstructed from memory/receipts afterwards. Locked at work start
 * (`lockBookingMaterials`, called from BookingLifecycleFlow.advanceStatus on
 * ARRIVED -> IN_PROGRESS); post-lock discoveries route through the existing
 * extra-work gate, never a silent BOM edit.
 */
export class BookingMaterialService {
  constructor(private readonly catalogService: MaterialCatalogService = new MaterialCatalogService()) {}

  async listForBooking(bookingId: string, userId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { technician: { select: { userId: true } } } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.customerId !== userId && booking.technician?.userId !== userId) throw new ForbiddenError();
    // §3.4 ("lines that are not confirmed are labelled as estimated") + §17.5.13
    // ("show a band, not a number") — the customer BOM screen needs the
    // catalog's band/confidence/tier/name alongside each line, not just the
    // booking-specific price the technician recorded.
    return prisma.bookingMaterial.findMany({
      where: { bookingId },
      include: { material: { select: { nameAr: true, nameEn: true, tier: true, priceMinFils: true, priceMaxFils: true, priceConfidence: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createLine(bookingId: string, technicianUserId: string, input: CreateBookingMaterialInput) {
    const { booking } = await this.resolveAssignedTechnician(bookingId, technicianUserId);
    if (!BOM_CREATABLE_STATUSES.includes(booking.status)) {
      throw new ConflictError('BOM lines can only be added before work starts; use the extra-work gate afterwards');
    }
    const priced = await this.priceLine(booking.serviceId, input.materialId ?? null, input.unitPriceFils, input.qty ?? 1);

    const created = await prisma.bookingMaterial.create({
      data: {
        bookingId,
        materialId: input.materialId ?? null,
        source: input.source ?? MaterialSource.TECHNICIAN_PROCURED,
        description: input.description,
        brand: input.brand ?? null,
        qty: priced.qty,
        unit: input.unit ?? null,
        unitPriceFils: input.unitPriceFils,
        totalFils: priced.totalFils,
        referencePriceFils: priced.referencePriceFils,
        varianceBps: priced.varianceBps,
        isMicro: priced.isMicro,
        status: priced.needsReview ? MaterialLineStatus.PENDING_REVIEW : MaterialLineStatus.PENDING,
      },
    });

    // §8.12 — the customer sees the BOM as soon as a line exists; a drafted
    // line awaiting approval must not be silent (work-start is gated on this
    // approval below, in BookingLifecycleFlow.advanceStatus).
    await this.notifyCustomerOfLine(bookingId, 'مطلوب اعتماد قائمة المواد', 'أضاف الفني مادة إلى طلبك. راجع القائمة واعتمدها قبل بدء العمل.');
    return created;
  }

  async updateLine(bookingId: string, lineId: string, technicianUserId: string, input: Partial<CreateBookingMaterialInput>) {
    const { booking } = await this.resolveAssignedTechnician(bookingId, technicianUserId);
    const line = await this.requireEditableLine(bookingId, lineId);

    const materialId = input.materialId !== undefined ? input.materialId : line.materialId;
    const unitPriceFils = input.unitPriceFils ?? line.unitPriceFils;
    const qty = input.qty ?? line.qty;
    const priced = await this.priceLine(booking.serviceId, materialId, unitPriceFils, qty);

    return prisma.bookingMaterial.update({
      where: { id: lineId },
      data: {
        materialId: materialId ?? null,
        description: input.description ?? line.description,
        brand: input.brand === undefined ? undefined : input.brand,
        qty: priced.qty,
        unit: input.unit === undefined ? undefined : input.unit,
        unitPriceFils,
        totalFils: priced.totalFils,
        referencePriceFils: priced.referencePriceFils,
        varianceBps: priced.varianceBps,
        isMicro: priced.isMicro,
        status: priced.needsReview ? MaterialLineStatus.PENDING_REVIEW : MaterialLineStatus.PENDING,
        // A price/material edit reopens any prior variance justification — the
        // technician must re-justify against the new numbers.
        varianceReason: null,
        varianceReasonNote: null,
        customerAckAt: null,
      },
    });
  }

  /**
   * §17.5.9: every material purchase requires an uploaded official shop
   * invoice. §17.5.14 step 1: a line priced beyond VARIANCE_JUSTIFY_BPS above
   * reference cannot "complete the invoice" without a recorded varianceReason.
   */
  async uploadInvoice(bookingId: string, lineId: string, technicianUserId: string, invoiceUrl: string, varianceReason?: { reason: VarianceReason; note?: string }) {
    await this.resolveAssignedTechnician(bookingId, technicianUserId);
    const line = await this.requireEditableLine(bookingId, lineId);

    const needsJustification = (line.varianceBps ?? 0) > VARIANCE_JUSTIFY_BPS;
    const reason = varianceReason?.reason ?? line.varianceReason;
    if (needsJustification && !reason) {
      throw new ValidationError(`A varianceReason is required before the invoice can be completed (price is ${line.varianceBps}bps above reference)`);
    }

    return prisma.bookingMaterial.update({
      where: { id: lineId },
      data: {
        supplierInvoiceUrl: invoiceUrl,
        ...(varianceReason ? { varianceReason: varianceReason.reason, varianceReasonNote: varianceReason.note ?? null } : {}),
        status: needsJustification ? MaterialLineStatus.PENDING_REVIEW : line.status,
      },
    });
  }

  /** §8.12 — customer approves a normal (no open price dispute) BOM line.
   *  Digital, explicit action; silence is not consent (§17.5.14 principle
   *  applied to the whole BOM, not just variance-disputed lines). Gates the
   *  ARRIVED→IN_PROGRESS transition — see BookingLifecycleFlow.advanceStatus.
   *  A line with an open variance dispute uses ackByCustomer instead (it
   *  additionally requires the recorded reason to exist before consent is
   *  meaningful). */
  async approveByCustomer(bookingId: string, lineId: string, customerId: string) {
    const line = await this.resolveCustomerLine(bookingId, lineId, customerId);
    if (line.status !== MaterialLineStatus.PENDING) {
      throw new ConflictError(`Line is ${line.status.toLowerCase()} and is not awaiting direct approval — an under-review or disputed line is resolved by ops or by ackByCustomer/declineByCustomer`);
    }
    const updated = await prisma.bookingMaterial.update({ where: { id: lineId }, data: { customerAckAt: new Date() } });

    // §17.8 workmanship-only warranty boundary: recorded once, at the moment
    // the customer approves a customer-supplied line, so GuaranteeService can
    // read it directly instead of re-deriving the boundary from line sources
    // at claim time (a claim may be filed long after other lines change).
    if (line.source === MaterialSource.CUSTOMER_SUPPLIED) {
      await prisma.booking.updateMany({
        where: { id: bookingId, customerSuppliedMaterialsAckAt: null },
        data: { customerSuppliedMaterialsAckAt: new Date() },
      });
    }
    return updated;
  }

  /**
   * §17.5.10 case 1 / §3.4 — technician swaps an already-recorded line for a
   * different material (out of stock, customer changed mind, etc.). Creates a
   * NEW line linked via replacesLineId and marks the old one REPLACED, rather
   * than editing the old line in place, so the original price/approval trail
   * stays intact. The new line goes through the identical pricing/variance/
   * approval path as any other line (§17.5.9) — substitution is never a
   * shortcut around review or customer approval.
   */
  async substituteLine(bookingId: string, oldLineId: string, technicianUserId: string, input: CreateBookingMaterialInput) {
    const { booking } = await this.resolveAssignedTechnician(bookingId, technicianUserId);
    const oldLine = await prisma.bookingMaterial.findUnique({ where: { id: oldLineId } });
    if (!oldLine || oldLine.bookingId !== bookingId) throw new NotFoundError('BookingMaterial');
    // Pre-lock only, same as create/updateLine — a LOCKED line has already
    // passed the customer-approval gate at work-start; substituting it here
    // would put a fresh, unapproved line into a job that's already running
    // with no later re-check. Post-lock material changes go through the
    // existing extra-work gate instead, never a silent BOM edit.
    if (!EDITABLE_LINE_STATUSES.includes(oldLine.status)) {
      throw new ConflictError(`Line is ${oldLine.status.toLowerCase()} and can no longer be substituted`);
    }

    // Checked unconditionally — NOT_ALLOWED must block an off-catalogue
    // substitute too, not just a catalogue-linked one.
    const policy = await prisma.serviceMaterialPolicy.findUnique({ where: { serviceId: booking.serviceId } });
    if (policy?.substitution === SubstitutionPolicy.NOT_ALLOWED) {
      throw new ValidationError('This service does not allow material substitution');
    }

    if (input.materialId) {
      const [oldMaterial, newMaterial] = await Promise.all([
        oldLine.materialId ? this.catalogService.get(oldLine.materialId) : null,
        this.catalogService.get(input.materialId),
      ]);
      if (oldMaterial && TIER_RANK[newMaterial.tier] < TIER_RANK[oldMaterial.tier]) {
        throw new ValidationError('A substitute material must be the same tier or higher');
      }
    }

    const priced = await this.priceLine(booking.serviceId, input.materialId ?? null, input.unitPriceFils, input.qty ?? 1);
    return prisma.$transaction(async (tx) => {
      await tx.bookingMaterial.update({ where: { id: oldLineId }, data: { status: MaterialLineStatus.REPLACED } });
      return tx.bookingMaterial.create({
        data: {
          bookingId,
          materialId: input.materialId ?? null,
          source: input.source ?? oldLine.source,
          description: input.description,
          brand: input.brand ?? null,
          qty: priced.qty,
          unit: input.unit ?? null,
          unitPriceFils: input.unitPriceFils,
          totalFils: priced.totalFils,
          referencePriceFils: priced.referencePriceFils,
          varianceBps: priced.varianceBps,
          isMicro: priced.isMicro,
          replacesLineId: oldLineId,
          status: priced.needsReview ? MaterialLineStatus.PENDING_REVIEW : MaterialLineStatus.PENDING,
        },
      });
    });
  }

  /** §17.5.14 step 2 — customer's digital pre-execution consent to a
   *  justified over-reference line. Silence is not consent; this is an
   *  explicit action. */
  async ackByCustomer(bookingId: string, lineId: string, customerId: string) {
    const line = await this.resolveCustomerLine(bookingId, lineId, customerId);
    if (!line.varianceReason) {
      throw new ValidationError('This line has no recorded price variance awaiting consent');
    }
    return prisma.bookingMaterial.update({ where: { id: lineId }, data: { customerAckAt: new Date() } });
  }

  /**
   * §17.5.14 step 3 — customer declines the over-reference price: opens a
   * MaterialVerificationRequest with a 24h deadline instead of silently
   * blocking or force-approving the line.
   */
  async declineByCustomer(bookingId: string, lineId: string, customerId: string) {
    const line = await this.resolveCustomerLine(bookingId, lineId, customerId);
    if (!line.varianceReason) {
      throw new ValidationError('This line has no recorded price variance awaiting consent');
    }
    if (line.referencePriceFils == null) {
      throw new ConflictError('Cannot open a verification request for a line with no catalog reference price');
    }

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { technician: { select: { id: true, userId: true } } } });
    if (!booking.technician) throw new ConflictError('Booking has no assigned technician');

    // Qty-weighted: a per-unit difference on a line with qty > 1 must scale by
    // qty, or a disputed multi-unit line under-deducts the technician's dues
    // by a factor of qty when settleExpiredVerifications applies deltaFils.
    const deltaFils = new Prisma.Decimal(line.unitPriceFils - line.referencePriceFils)
      .times(line.qty)
      .toDecimalPlaces(0)
      .toNumber();
    const request = await prisma.$transaction(async (tx) => {
      await tx.bookingMaterial.update({ where: { id: lineId }, data: { status: MaterialLineStatus.PENDING_REVIEW } });
      return tx.materialVerificationRequest.create({
        data: {
          bookingMaterialId: lineId,
          bookingId,
          technicianId: booking.technician!.id,
          status: VerificationStatus.OPEN,
          referencePriceFils: line.referencePriceFils!,
          chargedPriceFils: line.unitPriceFils,
          deltaFils,
          deadlineAt: new Date(Date.now() + MATERIAL_VERIFICATION_DEADLINE_HOURS * 60 * 60 * 1000),
        },
      });
    });

    await createUserNotification(prisma, {
      userId: booking.technician.userId,
      bookingId,
      titleAr: 'مطلوب إثبات فاتورة',
      bodyAr: `اعترض العميل على سعر مادة. الرجاء رفع فاتورة الشراء الأصلية خلال ${MATERIAL_VERIFICATION_DEADLINE_HOURS} ساعة.`,
    });
    return request;
  }

  /** Admin review queue: every line currently flagged pending_review
   *  (off-catalogue or over-band, §17.5.9), oldest first. */
  async listPendingReview(limit = 50, offset = 0) {
    const where = { status: MaterialLineStatus.PENDING_REVIEW };
    const [items, total] = await prisma.$transaction([
      prisma.bookingMaterial.findMany({
        where,
        include: { booking: { select: { id: true, customerId: true, addressLine: true } } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.bookingMaterial.count({ where }),
    ]);
    return { items, total };
  }

  /** Ops review of a pending_review line (off-catalogue or over-band). §17.5.9
   *  v1.11: every material purchase requires an uploaded shop invoice — an
   *  off-catalogue line specifically cannot be approved without one
   *  (§8.12: "Rejected — cannot be approved" when off-catalogue + no invoice). */
  async adminReview(lineId: string, decision: 'APPROVED' | 'DECLINED', adminId: string) {
    const line = await prisma.bookingMaterial.findUnique({ where: { id: lineId } });
    if (!line) throw new NotFoundError('BookingMaterial');
    if (line.status !== MaterialLineStatus.PENDING_REVIEW) throw new ConflictError('Line is not pending review');
    if (decision === 'APPROVED' && line.materialId == null && !line.supplierInvoiceUrl) {
      throw new ValidationError('An off-catalogue line cannot be approved without an uploaded supplier invoice');
    }
    return prisma.bookingMaterial.update({
      where: { id: lineId },
      data: {
        status: decision === 'APPROVED' ? MaterialLineStatus.APPROVED : MaterialLineStatus.DECLINED,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * §0.6.2 / §3.4 founder-on-a-phone auto-fallback — called from the periodic
   * sweep (main.ts) alongside settleExpiredVerifications. A pending_review
   * line nobody actioned within BOM_REVIEW_TIMEOUT_HOURS auto-approves rather
   * than blocking the customer's BOM approval (and therefore work-start)
   * indefinitely behind an unattended queue.
   */
  async settleExpiredBomReviews(): Promise<number> {
    const cutoff = new Date(Date.now() - BOM_REVIEW_TIMEOUT_HOURS * 60 * 60 * 1000);
    // Single bulk update — the where clause re-filters by status, so this is
    // safe to run concurrently with itself without a per-row loop.
    const { count } = await prisma.bookingMaterial.updateMany({
      where: { status: MaterialLineStatus.PENDING_REVIEW, createdAt: { lt: cutoff } },
      data: { status: MaterialLineStatus.APPROVED, reviewedAt: new Date() },
    });
    return count;
  }

  /** Resolve → price → variance a line's inputs against the catalog. Shared
   *  by createLine/updateLine so both apply the identical §17.5.5 q4 rule
   *  (materials priced ONLY against the catalog, within its band) and the
   *  §17.5.9 auto-flag rule (off-catalogue or over-band → pending_review). */
  private async priceLine(serviceId: string, materialId: string | null, unitPriceFils: number, qtyInput: number | string | Prisma.Decimal) {
    const qty = new Prisma.Decimal(qtyInput);
    const totalFils = new Prisma.Decimal(unitPriceFils).times(qty).toDecimalPlaces(0).toNumber();

    if (materialId == null) {
      // Off-catalogue: no reference to check against; §17.5.9 auto-flags it.
      return { qty, totalFils, referencePriceFils: null, varianceBps: null, isMicro: false, needsReview: true };
    }

    const material = await this.catalogService.get(materialId);
    this.catalogService.assertPriceBand(unitPriceFils, material.priceMinFils, material.priceMaxFils);
    const referencePriceFils = material.unitPriceFils;
    const varianceBps = referencePriceFils === 0 ? 0 : Math.round(((unitPriceFils - referencePriceFils) / referencePriceFils) * BPS_DENOMINATOR);
    const needsReview = Math.abs(varianceBps) > material.varianceAlertBps;

    const policy = await prisma.serviceMaterialPolicy.findUnique({ where: { serviceId } });
    const isMicro = policy != null && totalFils <= policy.microThresholdFils;

    return { qty, totalFils, referencePriceFils, varianceBps, isMicro, needsReview };
  }

  private async notifyCustomerOfLine(bookingId: string, titleAr: string, bodyAr: string): Promise<void> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true } });
    if (!booking) return;
    await createUserNotification(prisma, { userId: booking.customerId, bookingId, titleAr, bodyAr });
  }

  private async resolveAssignedTechnician(bookingId: string, technicianUserId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: technicianUserId }, select: { id: true } });
    if (!profile) throw new ForbiddenError('Not a technician');
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.technicianId !== profile.id) throw new ForbiddenError('Not the assigned technician');
    return { profile, booking };
  }

  private async resolveCustomerLine(bookingId: string, lineId: string, customerId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.customerId !== customerId) throw new ForbiddenError();
    return this.requireEditableLine(bookingId, lineId);
  }

  private async requireEditableLine(bookingId: string, lineId: string) {
    const line = await prisma.bookingMaterial.findUnique({ where: { id: lineId } });
    if (!line || line.bookingId !== bookingId) throw new NotFoundError('BookingMaterial');
    if (!EDITABLE_LINE_STATUSES.includes(line.status)) {
      throw new ConflictError(`Line is ${line.status.toLowerCase()} and can no longer be edited`);
    }
    return line;
  }
}

/**
 * §8.12 work-start gate: every PENDING line (a normal line with no open price
 * dispute) must carry the customer's digital approval before the booking may
 * enter IN_PROGRESS. Called from BookingLifecycleFlow.advanceStatus, inside
 * the same transaction, immediately before lockBookingMaterials. Deliberately
 * does NOT also require PENDING_REVIEW lines to be resolved — see
 * lockBookingMaterials' own comment; that stricter reading was left alone as
 * a considered, separate decision, not folded into this gate.
 */
export async function requireBomApprovedForWorkStart(tx: Tx, bookingId: string): Promise<void> {
  const unapproved = await tx.bookingMaterial.count({
    where: { bookingId, status: MaterialLineStatus.PENDING, customerAckAt: null },
  });
  if (unapproved > 0) {
    throw new ValidationError('Customer must approve the Bill of Materials before work can start');
  }
}

/**
 * Locks every execution-ready BOM line (PENDING/APPROVED) for a booking, then
 * folds their totalFils into the booking's materialsFils/totalJod — the BOM
 * is built out across CONFIRMED/EN_ROUTE/ARRIVED (BOM_CREATABLE_STATUSES) and
 * this lock point is the first time its final cost is known, so it's also the
 * single authoritative point that cost gets charged (mirrors how an accepted
 * quote_first quote sets the same two fields at booking creation). Called
 * from BookingLifecycleFlow.advanceStatus on the ARRIVED -> IN_PROGRESS
 * transition, inside the SAME transaction, so lock + charge are atomic with
 * the status change. Deliberately does NOT lock PENDING_REVIEW lines — an
 * unresolved off-catalogue/over-band/variance-disputed line stays editable by
 * its normal reviewers (ops / customer ack / decline) even after work starts;
 * only lines that were already clean at the lock instant become immutable
 * (and only those are counted into the charge here — an unresolved line is
 * charged once it resolves, via the existing extra-work gate).
 */
export async function lockBookingMaterials(tx: Tx, bookingId: string): Promise<void> {
  const toLock = await tx.bookingMaterial.findMany({
    where: { bookingId, status: { in: [MaterialLineStatus.PENDING, MaterialLineStatus.APPROVED] } },
    select: { totalFils: true },
  });
  if (toLock.length === 0) return;

  await tx.bookingMaterial.updateMany({
    where: { bookingId, status: { in: [MaterialLineStatus.PENDING, MaterialLineStatus.APPROVED] } },
    data: { status: MaterialLineStatus.LOCKED },
  });

  const materialsFils = toLock.reduce((sum, l) => sum + l.totalFils, 0);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { totalJod: true } });
  const materialsJod = new Prisma.Decimal(materialsFils).dividedBy(1000);
  await tx.booking.update({
    where: { id: bookingId },
    data: {
      // Additive: a quote_first booking may already carry the accepted
      // quote's materialsFils from creation; BOM lines added afterwards (or
      // for a fixed_scope booking with governed add-ons) top up both fields
      // by exactly the newly-locked amount rather than overwrite them.
      materialsFils: { increment: materialsFils },
      totalJod: booking.totalJod.add(materialsJod),
    },
  });
}

/**
 * §17.5.9 v1.11 "every material purchase requires an uploaded shop invoice" —
 * enforced at completion (not creation) for LOCKED/APPROVED lines, since a
 * PENDING line only becomes a real purchase once it's approved/locked; a
 * DECLINED or UNUSED line was never bought and needs none. Called from
 * BookingLifecycleFlow.complete() before the booking (and its payment
 * capture) is allowed to finalize.
 */
export async function requireMaterialInvoicesComplete(tx: Tx, bookingId: string): Promise<void> {
  const missingInvoice = await tx.bookingMaterial.count({
    where: {
      bookingId,
      status: { in: [MaterialLineStatus.LOCKED, MaterialLineStatus.APPROVED] },
      supplierInvoiceUrl: null,
    },
  });
  if (missingInvoice > 0) {
    throw new ValidationError('All purchased materials must have an uploaded supplier invoice before the job can complete');
  }
}

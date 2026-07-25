import { Prisma, BookingStatus, MaterialLineStatus, VerificationStatus, VarianceReason } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { MaterialCatalogService } from './MaterialCatalogService';
import { BPS_DENOMINATOR, VARIANCE_JUSTIFY_BPS, MATERIAL_VERIFICATION_DEADLINE_HOURS } from './constants';

type Tx = Prisma.TransactionClient;

/** Booking statuses in which the BOM may still be created against (before the
 *  ARRIVED -> IN_PROGRESS lock point). New needs after this route through the
 *  existing extra-work gate (AdditionalWorkItem), never a new BOM line. */
const BOM_CREATABLE_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.EN_ROUTE, BookingStatus.ARRIVED];

/** Line statuses that are still editable/resolvable (haven't reached a
 *  terminal or locked state yet). */
const EDITABLE_LINE_STATUSES: MaterialLineStatus[] = [MaterialLineStatus.PENDING, MaterialLineStatus.PENDING_REVIEW];

export interface CreateBookingMaterialInput {
  materialId?: string | null;
  description: string;
  brand?: string | null;
  qty?: number | string;
  unit?: string | null;
  unitPriceFils: number;
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
    return prisma.bookingMaterial.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
  }

  async createLine(bookingId: string, technicianUserId: string, input: CreateBookingMaterialInput) {
    const { booking } = await this.resolveAssignedTechnician(bookingId, technicianUserId);
    if (!BOM_CREATABLE_STATUSES.includes(booking.status)) {
      throw new ConflictError('BOM lines can only be added before work starts; use the extra-work gate afterwards');
    }
    const priced = await this.priceLine(booking.serviceId, input.materialId ?? null, input.unitPriceFils, input.qty ?? 1);

    return prisma.bookingMaterial.create({
      data: {
        bookingId,
        materialId: input.materialId ?? null,
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

    const deltaFils = line.unitPriceFils - line.referencePriceFils;
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

  /** Ops review of a pending_review line (off-catalogue or over-band). */
  async adminReview(lineId: string, decision: 'APPROVED' | 'DECLINED', adminId: string) {
    const line = await prisma.bookingMaterial.findUnique({ where: { id: lineId } });
    if (!line) throw new NotFoundError('BookingMaterial');
    if (line.status !== MaterialLineStatus.PENDING_REVIEW) throw new ConflictError('Line is not pending review');
    return prisma.bookingMaterial.update({
      where: { id: lineId },
      data: {
        status: decision === 'APPROVED' ? MaterialLineStatus.APPROVED : MaterialLineStatus.DECLINED,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
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
 * Locks every execution-ready BOM line (PENDING/APPROVED) for a booking.
 * Called from BookingLifecycleFlow.advanceStatus on the ARRIVED -> IN_PROGRESS
 * transition, inside the SAME transaction, so the lock is atomic with the
 * status change. Deliberately does NOT lock PENDING_REVIEW lines — an
 * unresolved off-catalogue/over-band/variance-disputed line stays editable by
 * its normal reviewers (ops / customer ack / decline) even after work starts;
 * only lines that were already clean at the lock instant become immutable.
 */
export async function lockBookingMaterials(tx: Tx, bookingId: string): Promise<void> {
  await tx.bookingMaterial.updateMany({
    where: { bookingId, status: { in: [MaterialLineStatus.PENDING, MaterialLineStatus.APPROVED] } },
    data: { status: MaterialLineStatus.LOCKED },
  });
}

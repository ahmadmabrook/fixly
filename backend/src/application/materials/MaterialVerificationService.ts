import { VerificationStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { fromMinorUnits } from '../../shared/money';
import { postVarianceDeduction, DeductionAlreadyAppliedError } from './materialLedger';

type DeductionOutcome = 'deducted' | 'already_deducted' | 'insufficient';

interface DeductibleRequest {
  id: string;
  technicianId: string;
  bookingId: string;
  deltaFils: number;
}

const RESOLVED_STATUSES: VerificationStatus[] = [VerificationStatus.UPHELD, VerificationStatus.DEDUCTED, VerificationStatus.WITHDRAWN];

/**
 * §17.5.14 steps 3-4 — the verification-request lifecycle: technician
 * invoice upload within the 24h deadline, ops resolution, and the automatic
 * settle for requests where the deadline passed with no invoice.
 */
export class MaterialVerificationService {
  async listForTechnician(technicianUserId: string, status?: VerificationStatus, limit = 50, offset = 0) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: technicianUserId }, select: { id: true } });
    if (!profile) throw new ForbiddenError('Not a technician');
    const where = { technicianId: profile.id, ...(status ? { status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.materialVerificationRequest.findMany({ where, orderBy: { deadlineAt: 'asc' }, take: limit, skip: offset }),
      prisma.materialVerificationRequest.count({ where }),
    ]);
    return { items, total };
  }

  async listForAdmin(status?: VerificationStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.materialVerificationRequest.findMany({
        where,
        orderBy: { deadlineAt: 'asc' },
        take: limit,
        skip: offset,
        include: {
          technician: { select: { user: { select: { name: true, phone: true } } } },
          bookingMaterial: { select: { description: true, unitPriceFils: true, referencePriceFils: true } },
        },
      }),
      prisma.materialVerificationRequest.count({ where }),
    ]);
    return { items, total };
  }

  private async getOwned(id: string, technicianUserId: string) {
    const request = await prisma.materialVerificationRequest.findUnique({
      where: { id },
      include: { technician: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundError('MaterialVerificationRequest');
    if (request.technician.userId !== technicianUserId) throw new ForbiddenError();
    return request;
  }

  /** Technician uploads the disputed line's original purchase invoice within
   *  the 24h deadline (§17.5.14 step 3) — resolves "Verify" without money
   *  moving; ops still decides UPHELD vs DEDUCTED from the evidence. */
  async uploadInvoice(id: string, technicianUserId: string, invoiceUrl: string) {
    const request = await this.getOwned(id, technicianUserId);
    if (request.status !== VerificationStatus.OPEN) {
      throw new ConflictError(`Request is ${request.status.toLowerCase()}, not OPEN`);
    }
    return prisma.materialVerificationRequest.update({
      where: { id },
      data: { invoiceUrl, status: VerificationStatus.INVOICE_PROVIDED },
    });
  }

  /**
   * Ops decision on a request. UPHELD/WITHDRAWN close it with no money
   * movement (the admin judges the invoice/circumstances justified the
   * price, or the request is otherwise moot); DEDUCTED posts the deduction
   * immediately rather than waiting for the 24h auto-settle. Mirrors the
   * direct-enum-passthrough pattern already used by
   * ConductReportService.resolve / GuaranteeService.review — the admin picks
   * the terminal status directly, not a translated verb this service
   * reinterprets.
   */
  async adminResolve(id: string, decision: 'UPHELD' | 'DEDUCTED' | 'WITHDRAWN', adminId: string) {
    const request = await prisma.materialVerificationRequest.findUnique({
      where: { id },
      include: { technician: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundError('MaterialVerificationRequest');
    if (RESOLVED_STATUSES.includes(request.status)) {
      throw new ConflictError(`Request is already resolved (${request.status})`);
    }

    if (decision !== 'DEDUCTED') {
      return prisma.materialVerificationRequest.update({
        where: { id },
        data: {
          status: decision === 'UPHELD' ? VerificationStatus.UPHELD : VerificationStatus.WITHDRAWN,
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
      });
    }

    const outcome = await this.attemptDeduction(request, adminId);
    if (outcome === 'insufficient') {
      throw new ConflictError('Technician has no PENDING payout to deduct from right now — retry once one accrues');
    }
    if (outcome === 'deducted') await this.notifyTechnicianOfDeduction(request);
    return prisma.materialVerificationRequest.findUniqueOrThrow({ where: { id } });
  }

  /**
   * §17.5.14 step 4 — for every expired, still-OPEN request (deadline passed
   * with no invoice uploaded), settle automatically. A plain service method,
   * not wired to a real cron (per the brief: "not necessarily a real cron a
   * route or later a scheduled job can call"). Self-healing: a request that
   * can't be settled this run (see materialLedger.ts's documented gap around
   * technicians with no PENDING payout) simply stays OPEN and is retried
   * next time this runs — it never marks DEDUCTED without money actually
   * moving.
   */
  async settleExpiredVerifications(): Promise<{ settled: number; skipped: number }> {
    const expired = await prisma.materialVerificationRequest.findMany({
      where: { status: VerificationStatus.OPEN, deadlineAt: { lt: new Date() } },
      include: { technician: { select: { userId: true } } },
    });

    let settled = 0;
    let skipped = 0;
    for (const request of expired) {
      const outcome = await this.attemptDeduction(request, null);
      if (outcome === 'insufficient') {
        skipped++;
        continue;
      }
      settled++;
      if (outcome === 'deducted') await this.notifyTechnicianOfDeduction(request);
    }
    return { settled, skipped };
  }

  private async attemptDeduction(request: DeductibleRequest, resolvedById: string | null): Promise<DeductionOutcome> {
    try {
      const applied = await prisma.$transaction(async (tx) => {
        const posted = await postVarianceDeduction(tx, {
          verificationRequestId: request.id,
          technicianId: request.technicianId,
          bookingId: request.bookingId,
          deltaFils: request.deltaFils,
          description: `Material price variance settled — verification request ${request.id}`,
        });
        if (!posted.applied) return false;
        await tx.materialVerificationRequest.update({
          where: { id: request.id },
          data: { status: VerificationStatus.DEDUCTED, resolvedById, resolvedAt: new Date() },
        });
        return true;
      });
      return applied ? 'deducted' : 'insufficient';
    } catch (e) {
      if (e instanceof DeductionAlreadyAppliedError) return 'already_deducted';
      throw e;
    }
  }

  private async notifyTechnicianOfDeduction(request: { id: string; bookingId: string; deltaFils: number; technician: { userId: string } }) {
    await createUserNotification(prisma, {
      userId: request.technician.userId,
      bookingId: request.bookingId,
      titleAr: 'تم خصم فرق سعر المواد',
      bodyAr: `تم خصم ${fromMinorUnits(request.deltaFils).toFixed(3)} دينار من مستحقاتك — لم يتم تقديم فاتورة الشراء خلال المهلة المحددة.`,
      dedupeKey: `matverif-deducted:${request.id}`,
    });
  }
}

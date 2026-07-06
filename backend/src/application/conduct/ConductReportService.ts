import { ConductKind, ConductStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';

interface CreateReportInput {
  kind: ConductKind;
  subjectTechId?: string;
  bookingId?: string;
  details?: string;
}

/**
 * Conduct reports (§0.2 #2 — anti-disintermediation + quality). Customers report
 * off-platform solicitation, no-shows, quality/safety issues. When an admin UPHOLDS
 * a report, the subject technician's `offPlatformFlags` is incremented, which the
 * nightly trust-tier recompute uses to demote / suspend repeat offenders.
 */
export class ConductReportService {
  async create(reporterId: string, input: CreateReportInput) {
    if (input.subjectTechId) {
      const tech = await prisma.technicianProfile.findUnique({ where: { id: input.subjectTechId }, select: { id: true } });
      if (!tech) throw new NotFoundError('Technician');
    }
    return prisma.conductReport.create({
      data: {
        reporterId,
        kind: input.kind,
        subjectTechId: input.subjectTechId ?? null,
        bookingId: input.bookingId ?? null,
        details: input.details ?? null,
        status: 'OPEN',
      },
    });
  }

  async listForAdmin(status?: ConductStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.conductReport.findMany({
        where,
        include: {
          reporter: { select: { name: true, phone: true } },
          subjectTech: { select: { id: true, userId: true, user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' }, // oldest first = review queue order
        skip: offset,
        take: limit,
      }),
      prisma.conductReport.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Resolve a report. UPHELD increments the subject technician's offPlatformFlags
   * (feeds tier demotion); DISMISSED just closes it. Atomic so the flag increment
   * and the status change commit together.
   */
  async resolve(id: string, decision: 'UPHELD' | 'DISMISSED', resolvedById: string) {
    const report = await prisma.conductReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError('ConductReport');
    if (report.status === 'UPHELD' || report.status === 'DISMISSED') {
      throw new ConflictError('Report already resolved');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.conductReport.update({
        where: { id },
        data: { status: decision, resolvedById },
      });
      if (decision === 'UPHELD' && report.subjectTechId) {
        await tx.technicianProfile.update({
          where: { id: report.subjectTechId },
          data: { offPlatformFlags: { increment: 1 } },
        });
      }
      return updated;
    });
  }
}

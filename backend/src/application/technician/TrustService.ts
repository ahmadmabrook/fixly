import { BgCheckStatus, TrustTier } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError } from '../../shared/errors';

/** Probation technicians are dispatched only within this radius (§0.2 #1). */
export const PROBATION_MAX_RADIUS_KM = 5;
/** Upheld off-platform flags at/above this auto-suspend the technician (§0.2 #1: "2 upheld complaints"). */
export const SUSPEND_FLAG_THRESHOLD = 2;

interface TierInputs {
  rating: { toString(): string } | number;
  jobsCompleted: number;
  offPlatformFlags: number;
  bgCheckStatus: BgCheckStatus;
  skillsTestPassedAt: Date | null;
}

/**
 * Pure tier policy (§0.2 #1). Vetting (background check + skills test) is the floor
 * for VERIFIED; rating + volume lift to PRO / ELITE; any upheld off-platform flags
 * hold a technician at (or push back to) PROBATION so only proven techs reach the
 * priority lane — which bounds the guarantee liability.
 */
export function computeTier(t: TierInputs): TrustTier {
  const rating = Number(t.rating);
  if (t.offPlatformFlags >= SUSPEND_FLAG_THRESHOLD) return 'PROBATION';
  const vetted = t.bgCheckStatus === 'PASSED' && t.skillsTestPassedAt != null;
  if (vetted && t.offPlatformFlags === 0 && rating >= 4.8 && t.jobsCompleted >= 100) return 'ELITE';
  if (vetted && t.offPlatformFlags === 0 && rating >= 4.7 && t.jobsCompleted >= 30) return 'PRO';
  if (vetted && t.offPlatformFlags < 2) return 'VERIFIED';
  return 'PROBATION';
}

export class TrustService {
  /** Admin override of a technician's trust tier. */
  async setTrustTier(techId: string, tier: TrustTier) {
    const tech = await prisma.technicianProfile.findUnique({ where: { id: techId }, select: { id: true } });
    if (!tech) throw new NotFoundError('Technician');
    return prisma.technicianProfile.update({ where: { id: techId }, data: { trustTier: tier } });
  }

  /** Record a background-check result, then recompute the tier. */
  async recordBgCheck(techId: string, result: 'PASSED' | 'FAILED') {
    const tech = await prisma.technicianProfile.findUnique({ where: { id: techId } });
    if (!tech) throw new NotFoundError('Technician');
    await prisma.technicianProfile.update({ where: { id: techId }, data: { bgCheckStatus: result } });
    return this.recomputeOne(techId);
  }

  /** Mark the skills test passed, then recompute the tier. */
  async markSkillsTestPassed(techId: string) {
    const tech = await prisma.technicianProfile.findUnique({ where: { id: techId }, select: { id: true } });
    if (!tech) throw new NotFoundError('Technician');
    await prisma.technicianProfile.update({ where: { id: techId }, data: { skillsTestPassedAt: new Date() } });
    return this.recomputeOne(techId);
  }

  async setInsured(techId: string, isInsured: boolean) {
    const tech = await prisma.technicianProfile.findUnique({ where: { id: techId }, select: { id: true } });
    if (!tech) throw new NotFoundError('Technician');
    return prisma.technicianProfile.update({ where: { id: techId }, data: { isInsured } });
  }

  /** Recompute one technician's tier + auto-suspend on excess flags. */
  async recomputeOne(techId: string) {
    const t = await prisma.technicianProfile.findUnique({
      where: { id: techId },
      select: { id: true, status: true, rating: true, jobsCompleted: true, offPlatformFlags: true, bgCheckStatus: true, skillsTestPassedAt: true },
    });
    if (!t) throw new NotFoundError('Technician');
    const tier = computeTier(t);
    const suspend = t.offPlatformFlags >= SUSPEND_FLAG_THRESHOLD && t.status === 'APPROVED';
    return prisma.technicianProfile.update({
      where: { id: techId },
      data: { trustTier: tier, ...(suspend ? { status: 'SUSPENDED' } : {}) },
    });
  }

  /**
   * Nightly recompute across all approved technicians. Returns how many tiers
   * changed. Cheap: reads only the fields the policy needs, writes only on change.
   */
  async recomputeAll(): Promise<{ scanned: number; changed: number; suspended: number }> {
    const techs = await prisma.technicianProfile.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, trustTier: true, rating: true, jobsCompleted: true, offPlatformFlags: true, bgCheckStatus: true, skillsTestPassedAt: true },
    });
    let changed = 0;
    let suspended = 0;
    for (const t of techs) {
      const tier = computeTier(t);
      const suspend = t.offPlatformFlags >= SUSPEND_FLAG_THRESHOLD;
      if (tier !== t.trustTier || suspend) {
        await prisma.technicianProfile.update({
          where: { id: t.id },
          data: { trustTier: tier, ...(suspend ? { status: 'SUSPENDED' } : {}) },
        });
        if (tier !== t.trustTier) changed++;
        if (suspend) suspended++;
      }
    }
    return { scanned: techs.length, changed, suspended };
  }

  /** Admin quality board: tiers, vetting state, flags. */
  async qualityBoard(limit = 100, offset = 0) {
    const [items, total] = await prisma.$transaction([
      prisma.technicianProfile.findMany({
        select: {
          id: true, trustTier: true, bgCheckStatus: true, skillsTestPassedAt: true,
          isInsured: true, rating: true, totalReviews: true, jobsCompleted: true,
          offPlatformFlags: true, status: true,
          user: { select: { name: true, phone: true } },
        },
        orderBy: [{ offPlatformFlags: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      prisma.technicianProfile.count(),
    ]);
    return { items, total };
  }
}

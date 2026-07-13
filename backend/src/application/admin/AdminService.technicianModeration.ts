import { Prisma, TechnicianStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { audit } from './adminAudit';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { omitFields } from '../../shared/sanitize';

/**
 * Technician moderation actions, extracted from AdminService (see that file
 * for the full class overview). Stateless — no injected dependencies.
 */

/** Approve a pending technician (sets status + back-compat isVerified flag). */
export async function verifyTechnician(id: string, actorId: string, ip?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.technicianProfile.findUnique({ where: { id }, include: { user: true } });
      if (!existing) throw new NotFoundError('TechnicianProfile');
      if (existing.isVerified && existing.status === TechnicianStatus.APPROVED) return omitFields(existing, 'nationalIdEnc');

      const profile = await tx.technicianProfile.update({
        where: { id },
        data: { isVerified: true, status: TechnicianStatus.APPROVED, approvedAt: new Date(), rejectionReason: null },
        include: { user: true },
      });
      await audit(tx, actorId, 'technician.approve', { type: 'TechnicianProfile', id }, undefined, ip);
      return omitFields(profile, 'nationalIdEnc');
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('TechnicianProfile');
    }
    throw err;
  }
}

/** Reject a technician application with a reason. */
export async function rejectTechnician(id: string, reason: string, actorId: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.technicianProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('TechnicianProfile');
    const profile = await tx.technicianProfile.update({
      where: { id },
      data: { status: TechnicianStatus.REJECTED, isVerified: false, isAvailable: false, rejectionReason: reason },
      include: { user: true },
    });
    await audit(tx, actorId, 'technician.reject', { type: 'TechnicianProfile', id }, { reason }, ip);
    return omitFields(profile, 'nationalIdEnc');
  });
}

/** Suspend (block) an approved technician — they go offline and can't take jobs. */
export async function suspendTechnician(id: string, reason: string, actorId: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.technicianProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('TechnicianProfile');
    const profile = await tx.technicianProfile.update({
      where: { id },
      data: { status: TechnicianStatus.SUSPENDED, isVerified: false, isAvailable: false, rejectionReason: reason },
      include: { user: true },
    });
    await audit(tx, actorId, 'technician.suspend', { type: 'TechnicianProfile', id }, { reason }, ip);
    return omitFields(profile, 'nationalIdEnc');
  });
}

/**
 * Reinstate a suspended technician back to APPROVED. Only valid from
 * SUSPENDED — there was previously no way back from suspension at all, which
 * meant every suspension (including mistaken ones) was permanent. Leaves
 * offPlatformFlags/trustTier untouched (those are a separate conduct record,
 * not reset by reinstatement) and leaves isAvailable false, mirroring
 * verifyTechnician's own choice to require the technician to go online again
 * rather than auto-broadcasting them as available.
 */
export async function reinstateTechnician(id: string, actorId: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.technicianProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('TechnicianProfile');
    if (existing.status !== TechnicianStatus.SUSPENDED) {
      throw new ValidationError('Only a suspended technician can be reinstated');
    }
    const profile = await tx.technicianProfile.update({
      where: { id },
      data: { status: TechnicianStatus.APPROVED, isVerified: true, rejectionReason: null },
      include: { user: true },
    });
    await audit(tx, actorId, 'technician.reinstate', { type: 'TechnicianProfile', id }, undefined, ip);
    return omitFields(profile, 'nationalIdEnc');
  });
}

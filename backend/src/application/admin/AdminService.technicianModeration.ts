import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { audit } from './adminAudit';
import { NotFoundError } from '../../shared/errors';
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
      if (existing.isVerified && existing.status === 'APPROVED') return omitFields(existing, 'nationalIdEnc');

      const profile = await tx.technicianProfile.update({
        where: { id },
        data: { isVerified: true, status: 'APPROVED', approvedAt: new Date(), rejectionReason: null },
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
      data: { status: 'REJECTED', isVerified: false, isAvailable: false, rejectionReason: reason },
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
      data: { status: 'SUSPENDED', isVerified: false, isAvailable: false, rejectionReason: reason },
      include: { user: true },
    });
    await audit(tx, actorId, 'technician.suspend', { type: 'TechnicianProfile', id }, { reason }, ip);
    return omitFields(profile, 'nationalIdEnc');
  });
}

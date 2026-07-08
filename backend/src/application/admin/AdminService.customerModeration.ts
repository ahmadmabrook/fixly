import { prisma } from '../../infrastructure/database/prisma';
import { audit } from './adminAudit';
import { NotFoundError } from '../../shared/errors';

/**
 * Customer moderation actions, extracted from AdminService (see that file
 * for the full class overview). Stateless — no injected dependencies.
 */

/** Block or unblock a customer account (isActive toggle). */
export async function setCustomerBlocked(id: string, blocked: boolean, actorId: string, ip?: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id, role: 'CUSTOMER' } });
    if (!user) throw new NotFoundError('Customer');
    const updated = await tx.user.update({
      where: { id },
      data: { isActive: !blocked },
      select: { id: true, name: true, phone: true, isActive: true },
    });
    await audit(tx, actorId, blocked ? 'customer.block' : 'customer.unblock', { type: 'User', id }, undefined, ip);
    return updated;
  });
}

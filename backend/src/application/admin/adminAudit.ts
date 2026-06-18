import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Append an immutable admin audit record. Pass the tx client to keep the audit
 * atomic with the mutation it records. Shared by AdminService + AdminOpsService.
 */
export async function audit(
  client: DbClient,
  actorId: string,
  action: string,
  target?: { type: string; id: string },
  metadata?: Prisma.InputJsonValue,
  ip?: string,
): Promise<void> {
  await client.adminAuditLog.create({
    data: { actorId, action, targetType: target?.type, targetId: target?.id, metadata, ip },
  });
}

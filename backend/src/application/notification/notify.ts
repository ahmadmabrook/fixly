import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { PrismaErrorCode } from '../../shared/errors';

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Persist a single in-app notification for a user. Socket-free (unlike the
 * booking-lifecycle path) so non-realtime domains — guarantee, support — can
 * fan out an inbox entry without holding a socket handle. The user picks it up
 * on the next `/notifications` fetch.
 *
 * `dedupeKey` is optional; when provided, a unique-violation re-insert is a
 * silent no-op (safe to call from at-least-once flows).
 */
export async function createUserNotification(
  client: DbClient,
  input: { userId: string; titleAr: string; bodyAr: string; bookingId?: string | null; dedupeKey?: string },
): Promise<void> {
  try {
    await client.notification.create({
      data: {
        userId: input.userId,
        titleAr: input.titleAr,
        bodyAr: input.bodyAr,
        bookingId: input.bookingId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        sentAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
      logger.debug({ dedupeKey: input.dedupeKey }, 'Notification already sent — skipping duplicate');
      return;
    }
    throw err;
  }
}

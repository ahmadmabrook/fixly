import { Prisma, CreditReason } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { PrismaErrorCode } from '../../shared/errors';

/** Automatic late-arrival compensation (§0.3): 20 JOD if the technician arrives
 *  more than this grace past the promised SLA window. */
export const LATE_COMPENSATION_JOD = 20;
export const LATE_GRACE_MINUTES = 30;

type Tx = Prisma.TransactionClient;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION;
}

/**
 * Customer service-credit wallet (late compensation / referral / goodwill).
 * Balance = SUM(amountJod). Grants are exactly-once via `refKey`; redemption is a
 * negative row capped at the amount due, serialized per customer with a Postgres
 * advisory lock so two concurrent bookings can't double-spend the same balance.
 */
export class ServiceCreditService {
  /** Current wallet balance for a customer. */
  async balance(customerId: string): Promise<Prisma.Decimal> {
    const agg = await prisma.serviceCredit.aggregate({
      where: { customerId },
      _sum: { amountJod: true },
    });
    return agg._sum.amountJod ?? new Prisma.Decimal(0);
  }

  /** Ledger history (most recent first). */
  async list(customerId: string, limit = 50) {
    return prisma.serviceCredit.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Grant a credit. When `refKey` is supplied the grant is exactly-once — a
   * duplicate (P2002 on the unique refKey) is swallowed and returns `false`.
   */
  async grant(
    tx: Tx,
    params: {
      customerId: string;
      amountJod: number | string | Prisma.Decimal;
      reason: CreditReason;
      bookingId?: string;
      refKey?: string;
    },
  ): Promise<boolean> {
    try {
      await tx.serviceCredit.create({
        data: {
          customerId: params.customerId,
          amountJod: new Prisma.Decimal(params.amountJod),
          reason: params.reason,
          bookingId: params.bookingId ?? null,
          refKey: params.refKey ?? null,
        },
      });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false; // already granted for this refKey
      throw e;
    }
  }

  /**
   * Redeem up to `amountDue` from the wallet, inside the caller's transaction.
   * Posts a negative REDEMPTION row and returns the amount actually redeemed
   * (0 when the wallet is empty). Never exceeds the amount due, never negative.
   */
  async redeem(tx: Tx, customerId: string, amountDue: Prisma.Decimal, bookingId?: string): Promise<Prisma.Decimal> {
    if (amountDue.lte(0)) return new Prisma.Decimal(0);
    // Serialize credit math per customer for the duration of this tx so two
    // concurrent bookings can't both read the same balance and over-redeem.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customerId}))`;
    const agg = await tx.serviceCredit.aggregate({ where: { customerId }, _sum: { amountJod: true } });
    const bal = agg._sum.amountJod ?? new Prisma.Decimal(0);
    if (bal.lte(0)) return new Prisma.Decimal(0);
    const redeemed = Prisma.Decimal.min(bal, amountDue);
    if (redeemed.lte(0)) return new Prisma.Decimal(0);
    await tx.serviceCredit.create({
      data: {
        customerId,
        amountJod: redeemed.negated(),
        reason: CreditReason.REDEMPTION,
        bookingId: bookingId ?? null,
      },
    });
    return redeemed;
  }
}

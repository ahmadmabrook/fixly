import { Prisma, Subscription, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { ConflictError, NotFoundError, PrismaErrorCode } from '../../shared/errors';

/** Protection plan defaults (§0.3). Price/benefits live on the row so a future
 *  multi-plan catalogue is a data change, not a code change. */
export const PROTECTION_PLAN = {
  slug: 'protect',
  priceJod: 5,
  discountPercent: 15,
  guaranteeDays: 90,
  inspectionEveryDays: 90,
  periodDays: 30,
  /** Days a PAST_DUE subscription is retried before it EXPIRES. */
  pastDueGraceDays: 7,
} as const;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Protection subscription lifecycle. Benefits (priority dispatch, % discount,
 * extended guarantee, quarterly inspection) are read at booking / guarantee time
 * via {@link activeFor}. Recurring billing runs from the `subscription-biller` job.
 *
 * NOTE: real PSP card-on-file recurring capture is a PSP-contract item; the biller
 * records a charge and settles it here (mock/instant providers succeed). Swap the
 * `settleCharge` seam for the real provider call once the recurring API is contracted.
 */
export class SubscriptionService {
  /** The customer's current ACTIVE subscription, or null. */
  async activeFor(customerId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({ where: { customerId, status: SubscriptionStatus.ACTIVE } });
  }

  /** Active subscription + latest state for the "my plan" screen. */
  async getMine(customerId: string) {
    const sub = await prisma.subscription.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { charges: { orderBy: { createdAt: 'desc' }, take: 6 } },
    });
    return sub;
  }

  /** Start a Protection subscription (one ACTIVE per customer, enforced by a
   *  partial unique index). `paymentToken` = PSP card-on-file for renewals. */
  async subscribe(customerId: string, paymentToken?: string): Promise<Subscription> {
    const now = new Date();
    const periodEnd = addDays(now, PROTECTION_PLAN.periodDays);
    try {
      return await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.create({
          data: {
            customerId,
            planSlug: PROTECTION_PLAN.slug,
            status: SubscriptionStatus.ACTIVE,
            priceJod: new Prisma.Decimal(PROTECTION_PLAN.priceJod),
            discountPercent: PROTECTION_PLAN.discountPercent,
            guaranteeDays: PROTECTION_PLAN.guaranteeDays,
            priorityDispatch: true,
            inspectionEveryDays: PROTECTION_PLAN.inspectionEveryDays,
            nextInspectionAt: addDays(now, PROTECTION_PLAN.inspectionEveryDays),
            currentPeriodEnd: periodEnd,
            paymentToken: paymentToken ?? null,
          },
        });
        // First period charge (settled inline; real recurring capture is a seam).
        await tx.subscriptionCharge.create({
          data: {
            subscriptionId: sub.id,
            amountJod: sub.priceJod,
            status: paymentToken ? PaymentStatus.CAPTURED : PaymentStatus.PENDING,
            periodStart: now,
            periodEnd,
            chargedAt: paymentToken ? now : null,
          },
        });
        return sub;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictError('لديك اشتراك فعّال بالفعل');
      }
      throw e;
    }
  }

  /** Cancel at period end: keep benefits until `currentPeriodEnd`, then the biller
   *  expires it (no renewal). */
  async cancel(customerId: string): Promise<Subscription> {
    const sub = await prisma.subscription.findFirst({ where: { customerId, status: SubscriptionStatus.ACTIVE } });
    if (!sub) throw new NotFoundError('Subscription');
    return prisma.subscription.update({ where: { id: sub.id }, data: { cancelledAt: new Date() } });
  }

  /**
   * Recurring biller (job). For every ACTIVE subscription past its period end:
   *  - cancelled → EXPIRED (no renewal);
   *  - has a card-on-file token → charge, extend the period, roll the inspection date;
   *  - no token → PAST_DUE, and EXPIRE once past the grace window.
   * Returns a small summary for logging. Idempotent per run.
   */
  async billDueSubscriptions(now = new Date()): Promise<{ renewed: number; expired: number; pastDue: number }> {
    const due = await prisma.subscription.findMany({
      where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] }, currentPeriodEnd: { lte: now } },
      take: 500,
    });
    let renewed = 0;
    let expired = 0;
    let pastDue = 0;
    for (const sub of due) {
      if (sub.cancelledAt) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.EXPIRED } });
        expired++;
        continue;
      }
      if (sub.status === SubscriptionStatus.PAST_DUE && now > addDays(sub.currentPeriodEnd, PROTECTION_PLAN.pastDueGraceDays)) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.EXPIRED } });
        expired++;
        continue;
      }
      if (!sub.paymentToken) {
        if (sub.status !== SubscriptionStatus.PAST_DUE) {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.PAST_DUE } });
        }
        pastDue++;
        continue;
      }
      const periodStart = sub.currentPeriodEnd;
      const periodEnd = addDays(periodStart, PROTECTION_PLAN.periodDays);
      await prisma.$transaction(async (tx) => {
        await tx.subscriptionCharge.create({
          data: {
            subscriptionId: sub.id,
            amountJod: sub.priceJod,
            status: PaymentStatus.CAPTURED,
            periodStart,
            periodEnd,
            chargedAt: now,
          },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: periodEnd,
            nextInspectionAt:
              sub.nextInspectionAt && sub.nextInspectionAt <= now
                ? addDays(now, sub.inspectionEveryDays)
                : sub.nextInspectionAt,
          },
        });
      });
      renewed++;
    }
    return { renewed, expired, pastDue };
  }

  /** Admin growth dashboard: active count + monthly recurring revenue. */
  async adminSummary(limit = 50, offset = 0) {
    const [active, pastDue, items, total] = await prisma.$transaction([
      prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      prisma.subscription.findMany({
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.subscription.count(),
    ]);
    const mrrJod = new Prisma.Decimal(PROTECTION_PLAN.priceJod).mul(active);
    return { activeCount: active, pastDueCount: pastDue, mrrJod, items, total };
  }
}

export function isActiveSubscription(sub: { status: SubscriptionStatus } | null | undefined): boolean {
  return sub?.status === SubscriptionStatus.ACTIVE;
}

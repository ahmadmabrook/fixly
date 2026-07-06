import { Prisma } from '@prisma/client';
import { SubscriptionService, PROTECTION_PLAN } from './SubscriptionService';
import { prisma } from '../../infrastructure/database/prisma';
import { ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    subscription: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    subscriptionCharge: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mocked = prisma as unknown as {
  subscription: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  subscriptionCharge: { create: jest.Mock };
  $transaction: jest.Mock;
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

describe('SubscriptionService', () => {
  const svc = new SubscriptionService();
  beforeEach(() => jest.clearAllMocks());

  describe('subscribe', () => {
    it('maps the ACTIVE-per-customer unique violation to ConflictError', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
      mocked.$transaction.mockRejectedValue(err);
      await expect(svc.subscribe('c1', 'tok')).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('billDueSubscriptions', () => {
    it('expires a cancelled subscription at period end (no renewal)', async () => {
      mocked.subscription.findMany.mockResolvedValue([
        { id: 's1', status: 'ACTIVE', cancelledAt: daysAgo(1), currentPeriodEnd: daysAgo(1), paymentToken: 'tok', priceJod: new Prisma.Decimal(5) },
      ]);
      const res = await svc.billDueSubscriptions();
      expect(mocked.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
      expect(res.expired).toBe(1);
      expect(res.renewed).toBe(0);
    });

    it('marks a tokenless subscription PAST_DUE', async () => {
      mocked.subscription.findMany.mockResolvedValue([
        { id: 's2', status: 'ACTIVE', cancelledAt: null, currentPeriodEnd: daysAgo(1), paymentToken: null, priceJod: new Prisma.Decimal(5) },
      ]);
      const res = await svc.billDueSubscriptions();
      expect(mocked.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAST_DUE' } }));
      expect(res.pastDue).toBe(1);
    });

    it('expires a PAST_DUE subscription once past the grace window', async () => {
      mocked.subscription.findMany.mockResolvedValue([
        { id: 's3', status: 'PAST_DUE', cancelledAt: null, currentPeriodEnd: daysAgo(PROTECTION_PLAN.pastDueGraceDays + 1), paymentToken: null, priceJod: new Prisma.Decimal(5) },
      ]);
      const res = await svc.billDueSubscriptions();
      expect(mocked.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
      expect(res.expired).toBe(1);
    });

    it('renews a subscription with a card-on-file token (charge + roll period)', async () => {
      mocked.subscription.findMany.mockResolvedValue([
        { id: 's4', status: 'ACTIVE', cancelledAt: null, currentPeriodEnd: daysAgo(0), paymentToken: 'tok', priceJod: new Prisma.Decimal(5), nextInspectionAt: null, inspectionEveryDays: 90 },
      ]);
      const tx = { subscriptionCharge: { create: jest.fn().mockResolvedValue({}) }, subscription: { update: jest.fn().mockResolvedValue({}) } };
      mocked.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
      const res = await svc.billDueSubscriptions();
      expect(tx.subscriptionCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CAPTURED' }) }),
      );
      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
      expect(res.renewed).toBe(1);
    });
  });
});

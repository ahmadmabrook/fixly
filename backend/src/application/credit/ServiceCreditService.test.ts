import { Prisma } from '@prisma/client';
import { ServiceCreditService } from './ServiceCreditService';
import { prisma } from '../../infrastructure/database/prisma';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    serviceCredit: { aggregate: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  serviceCredit: { aggregate: jest.Mock; create: jest.Mock; findMany: jest.Mock };
};

function txMock(balance: number) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    serviceCredit: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountJod: new Prisma.Decimal(balance) } }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('ServiceCreditService', () => {
  const svc = new ServiceCreditService();
  beforeEach(() => jest.clearAllMocks());

  describe('balance', () => {
    it('returns SUM(amountJod)', async () => {
      mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: new Prisma.Decimal('12.5') } });
      expect((await svc.balance('c1')).toString()).toBe('12.5');
    });
    it('returns 0 for an empty wallet', async () => {
      mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: null } });
      expect((await svc.balance('c1')).toString()).toBe('0');
    });
  });

  describe('redeem', () => {
    it('redeems only up to the amount due when the balance is larger', async () => {
      const tx = txMock(50);
      const redeemed = await svc.redeem(tx as never, 'c1', new Prisma.Decimal(20), 'b1');
      expect(redeemed.toString()).toBe('20');
      expect(tx.serviceCredit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountJod: expect.objectContaining({}), reason: 'REDEMPTION' }) }),
      );
    });

    it('redeems the whole balance when it is smaller than the amount due', async () => {
      const tx = txMock(8);
      const redeemed = await svc.redeem(tx as never, 'c1', new Prisma.Decimal(20));
      expect(redeemed.toString()).toBe('8');
    });

    it('is a no-op (0) for an empty wallet', async () => {
      const tx = txMock(0);
      const redeemed = await svc.redeem(tx as never, 'c1', new Prisma.Decimal(20));
      expect(redeemed.toString()).toBe('0');
      expect(tx.serviceCredit.create).not.toHaveBeenCalled();
    });

    it('takes a per-customer advisory lock before reading the balance', async () => {
      const tx = txMock(10);
      await svc.redeem(tx as never, 'c1', new Prisma.Decimal(5));
      expect(tx.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('grant', () => {
    it('returns true on a fresh grant', async () => {
      const tx = { serviceCredit: { create: jest.fn().mockResolvedValue({}) } };
      const ok = await svc.grant(tx as never, { customerId: 'c1', amountJod: 20, reason: 'LATE_COMPENSATION', refKey: 'latecomp:b1' });
      expect(ok).toBe(true);
    });

    it('is exactly-once: a duplicate refKey (P2002) returns false, not throw', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
      const tx = { serviceCredit: { create: jest.fn().mockRejectedValue(err) } };
      const ok = await svc.grant(tx as never, { customerId: 'c1', amountJod: 20, reason: 'LATE_COMPENSATION', refKey: 'latecomp:b1' });
      expect(ok).toBe(false);
    });

    it('rethrows non-unique errors', async () => {
      const tx = { serviceCredit: { create: jest.fn().mockRejectedValue(new Error('boom')) } };
      await expect(
        svc.grant(tx as never, { customerId: 'c1', amountJod: 20, reason: 'GOODWILL' }),
      ).rejects.toThrow('boom');
    });

    it('§3.3 credit:granted — writes a booking-scoped outbox event when bookingId is present', async () => {
      const outboxCreate = jest.fn().mockResolvedValue({});
      const tx = { serviceCredit: { create: jest.fn().mockResolvedValue({}) }, outboxEvent: { create: outboxCreate } };
      await svc.grant(tx as never, { customerId: 'c1', amountJod: 20, reason: 'LATE_COMPENSATION', bookingId: 'b1', refKey: 'latecomp:b1' });
      expect(outboxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingId: 'b1', eventType: 'credit.granted', payload: expect.objectContaining({ customerId: 'c1', amountJod: '20' }) }),
        }),
      );
    });

    it('skips the outbox event entirely for a bookingId-less (pure goodwill) grant', async () => {
      // No `outboxEvent` on the tx stub at all — if the code tried to reach it
      // unconditionally, this would throw "Cannot read properties of undefined".
      const tx = { serviceCredit: { create: jest.fn().mockResolvedValue({}) } };
      const ok = await svc.grant(tx as never, { customerId: 'c1', amountJod: 20, reason: 'GOODWILL' });
      expect(ok).toBe(true);
    });
  });
});

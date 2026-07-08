import { Prisma } from '@prisma/client';
import { ReferralService, REFERRAL_CREDIT_JOD } from './ReferralService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError } from '../../shared/errors';
import type { ServiceCreditService } from '../credit/ServiceCreditService';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    referralRedemption: { count: jest.fn() },
    serviceCredit: { aggregate: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  referralRedemption: { count: jest.Mock };
  serviceCredit: { aggregate: jest.Mock };
};

function isUniqueViolation() {
  return Object.assign(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }), {});
}

describe('ReferralService', () => {
  const svc = new ReferralService();
  beforeEach(() => jest.clearAllMocks());

  describe('getOrCreateCode', () => {
    it('returns the existing code without writing', async () => {
      mocked.user.findUnique.mockResolvedValue({ referralCode: 'AHMED5' });
      const code = await svc.getOrCreateCode('u1');
      expect(code).toBe('AHMED5');
      expect(mocked.user.update).not.toHaveBeenCalled();
    });

    it('generates and persists a code on first access', async () => {
      mocked.user.findUnique.mockResolvedValue({ referralCode: null });
      mocked.user.update.mockResolvedValue({ referralCode: 'ABCD12' });
      const code = await svc.getOrCreateCode('u1');
      expect(code).toEqual(expect.any(String));
      expect(code.length).toBeGreaterThan(0);
      expect(mocked.user.update).toHaveBeenCalledTimes(1);
    });

    it('retries on a unique-constraint collision', async () => {
      mocked.user.findUnique.mockResolvedValue({ referralCode: null });
      mocked.user.update
        .mockRejectedValueOnce(isUniqueViolation())
        .mockResolvedValueOnce({ referralCode: 'RETRY1' });
      const code = await svc.getOrCreateCode('u1');
      expect(code).toBe('RETRY1');
      expect(mocked.user.update).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundError for an unknown user', async () => {
      mocked.user.findUnique.mockResolvedValue(null);
      await expect(svc.getOrCreateCode('missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getMyStats', () => {
    it('returns code + referral count + credit earned', async () => {
      mocked.user.findUnique.mockResolvedValue({ referralCode: 'AHMED5' });
      mocked.referralRedemption.count.mockResolvedValue(3);
      mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: new Prisma.Decimal(15) } });

      const stats = await svc.getMyStats('u1');
      expect(stats).toEqual({ referralCode: 'AHMED5', totalReferred: 3, totalCreditEarnedJod: 15 });
      expect(mocked.serviceCredit.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'u1', reason: 'REFERRAL' } }),
      );
    });

    it('defaults credit earned to 0 with no grants yet', async () => {
      mocked.user.findUnique.mockResolvedValue({ referralCode: 'AHMED5' });
      mocked.referralRedemption.count.mockResolvedValue(0);
      mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: null } });

      const stats = await svc.getMyStats('u1');
      expect(stats.totalCreditEarnedJod).toBe(0);
    });
  });

  describe('captureAtSignup', () => {
    function txMock(referrer: { id: string } | null) {
      return {
        user: { findUnique: jest.fn().mockResolvedValue(referrer) },
        referralRedemption: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    it('no-ops when the code is unknown', async () => {
      const tx = txMock(null);
      await svc.captureAtSignup(tx as never, 'newUser1', 'NOPE99');
      expect(tx.referralRedemption.create).not.toHaveBeenCalled();
    });

    it('no-ops on self-referral', async () => {
      const tx = txMock({ id: 'newUser1' });
      await svc.captureAtSignup(tx as never, 'newUser1', 'SELF01');
      expect(tx.referralRedemption.create).not.toHaveBeenCalled();
    });

    it('creates a redemption row, uppercasing + trimming the code', async () => {
      const tx = txMock({ id: 'referrer-1' });
      await svc.captureAtSignup(tx as never, 'newUser1', ' ahmed5 ');
      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { referralCode: 'AHMED5' }, select: { id: true } });
      expect(tx.referralRedemption.create).toHaveBeenCalledWith({
        data: { referrerId: 'referrer-1', referredUserId: 'newUser1' },
      });
    });

    it('swallows a unique-violation race (already captured)', async () => {
      const tx = {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'referrer-1' }) },
        referralRedemption: { create: jest.fn().mockRejectedValue(isUniqueViolation()) },
      };
      await expect(svc.captureAtSignup(tx as never, 'newUser1', 'AHMED5')).resolves.toBeUndefined();
    });

    it('no-ops for an empty/whitespace code', async () => {
      const tx = txMock({ id: 'referrer-1' });
      await svc.captureAtSignup(tx as never, 'newUser1', '   ');
      expect(tx.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('grantCreditIfEligible', () => {
    function makeTx(overrides: Record<string, unknown> = {}) {
      return {
        referralRedemption: {
          findUnique: jest.fn().mockResolvedValue({ id: 'redemption-1', referrerId: 'referrer-1', creditGrantedAt: null }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        booking: { count: jest.fn().mockResolvedValue(1) },
        ...overrides,
      };
    }

    it('grants REFERRAL credit to the referrer on the first completed booking', async () => {
      const tx = makeTx();
      const grant = jest.fn().mockResolvedValue(true);
      await svc.grantCreditIfEligible(tx as never, 'customer-1', 'booking-1', { grant } as unknown as ServiceCreditService);

      expect(tx.booking.count).toHaveBeenCalledWith({ where: { customerId: 'customer-1', status: 'COMPLETED' } });
      expect(grant).toHaveBeenCalledWith(tx, {
        customerId: 'referrer-1',
        amountJod: REFERRAL_CREDIT_JOD,
        reason: 'REFERRAL',
        bookingId: 'booking-1',
        refKey: 'referral:redemption-1',
      });
    });

    it('does nothing when the customer was never referred', async () => {
      const tx = makeTx({ referralRedemption: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() } });
      const grant = jest.fn();
      await svc.grantCreditIfEligible(tx as never, 'customer-1', 'booking-1', { grant } as unknown as ServiceCreditService);
      expect(grant).not.toHaveBeenCalled();
    });

    it('does nothing when the credit was already granted', async () => {
      const tx = makeTx({
        referralRedemption: {
          findUnique: jest.fn().mockResolvedValue({ id: 'redemption-1', referrerId: 'referrer-1', creditGrantedAt: new Date() }),
          updateMany: jest.fn(),
        },
      });
      const grant = jest.fn();
      await svc.grantCreditIfEligible(tx as never, 'customer-1', 'booking-1', { grant } as unknown as ServiceCreditService);
      expect(grant).not.toHaveBeenCalled();
    });

    it('does nothing when this is not the first completed booking', async () => {
      const tx = makeTx({ booking: { count: jest.fn().mockResolvedValue(2) } });
      const grant = jest.fn();
      await svc.grantCreditIfEligible(tx as never, 'customer-1', 'booking-2', { grant } as unknown as ServiceCreditService);
      expect(grant).not.toHaveBeenCalled();
    });

    it('does nothing when it loses the race to mark creditGrantedAt', async () => {
      const tx = makeTx({
        referralRedemption: {
          findUnique: jest.fn().mockResolvedValue({ id: 'redemption-1', referrerId: 'referrer-1', creditGrantedAt: null }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });
      const grant = jest.fn();
      await svc.grantCreditIfEligible(tx as never, 'customer-1', 'booking-1', { grant } as unknown as ServiceCreditService);
      expect(grant).not.toHaveBeenCalled();
    });
  });
});

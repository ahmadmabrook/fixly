import { Prisma } from '@prisma/client';
import { PromoService } from './PromoService';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    promoCode: { findUnique: jest.fn() },
    promoRedemption: { count: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  promoCode: { findUnique: jest.Mock };
  promoRedemption: { count: jest.Mock };
};

const D = (v: number | string) => new Prisma.Decimal(v);

function promo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'promo-1',
    code: 'WELCOME10',
    type: 'PERCENT',
    value: D(10),
    minOrderJod: null,
    maxRedemptions: null,
    perUserLimit: 1,
    timesRedeemed: 0,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

describe('PromoService.quote', () => {
  let service: PromoService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromoService();
    mockedPrisma.promoRedemption.count.mockResolvedValue(0);
  });

  it('applies a PERCENT discount (10% of 50 = 5; final 45)', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo());
    const q = await service.quote('welcome10', 'u1', D(50));
    expect(q.discountJod.toString()).toBe('5');
    expect(q.finalJod.toString()).toBe('45');
  });

  it('applies a FIXED discount capped at the order total', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ type: 'FIXED', value: D(70) }));
    const q = await service.quote('X', 'u1', D(50));
    expect(q.discountJod.toString()).toBe('50'); // capped, never negative final
    expect(q.finalJod.toString()).toBe('0');
  });

  it('rounds a fils-fractional PERCENT discount DOWN', async () => {
    // 15% of 33.333 = 4.99995 → floored to 4.999 (3dp / fils)
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ value: D(15) }));
    const q = await service.quote('X', 'u1', D('33.333'));
    expect(q.discountJod.toString()).toBe('4.999');
  });

  it('rejects an unknown / inactive code', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(null);
    await expect(service.quote('NOPE', 'u1', D(50))).rejects.toMatchObject({ code: 'PROMO_INVALID' });
  });

  it('rejects an expired code', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.quote('X', 'u1', D(50))).rejects.toMatchObject({ code: 'PROMO_EXPIRED' });
  });

  it('enforces the minimum-order floor', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ minOrderJod: D(40) }));
    await expect(service.quote('X', 'u1', D(30))).rejects.toMatchObject({ code: 'PROMO_MIN_ORDER' });
  });

  it('enforces the global redemption cap', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ maxRedemptions: 5, timesRedeemed: 5 }));
    await expect(service.quote('X', 'u1', D(50))).rejects.toMatchObject({ code: 'PROMO_EXHAUSTED' });
  });

  it('enforces the per-user limit', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(promo({ perUserLimit: 1 }));
    mockedPrisma.promoRedemption.count.mockResolvedValue(1);
    await expect(service.quote('X', 'u1', D(50))).rejects.toMatchObject({ code: 'PROMO_USER_LIMIT' });
  });

  it('throws an AppError (422) shape for failures', async () => {
    mockedPrisma.promoCode.findUnique.mockResolvedValue(null);
    await expect(service.quote('NOPE', 'u1', D(50))).rejects.toBeInstanceOf(AppError);
  });
});

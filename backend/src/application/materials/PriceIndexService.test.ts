import { Prisma, PriceIndexKind } from '@prisma/client';
import { PriceIndexService, rebasePrice } from './PriceIndexService';
import { prisma } from '../../infrastructure/database/prisma';
import { ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    priceIndexReading: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    materialCatalog: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const mocked = prisma as unknown as {
  priceIndexReading: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock };
  materialCatalog: { findMany: jest.Mock; update: jest.Mock };
};

describe('rebasePrice (pure formula)', () => {
  it('applies newReferencePrice = base * (1 + cpiPctChange)', () => {
    expect(rebasePrice(1000, 0.05)).toBe(1050); // +5%
    expect(rebasePrice(1000, -0.1)).toBe(900); // -10%
    expect(rebasePrice(1000, 0)).toBe(1000);
  });

  it('rounds to the nearest whole fils', () => {
    expect(rebasePrice(999, 0.0249)).toBe(1024); // 999 * 1.0249 = 1023.8751 -> rounds up to 1024
  });
});

describe('PriceIndexService.recordReading', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a duplicate [kind, periodMonth] reading as a conflict', async () => {
    mocked.priceIndexReading.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.22.0' }),
    );
    const svc = new PriceIndexService();
    await expect(
      svc.recordReading({ kind: PriceIndexKind.DOS_CPI, periodMonth: '2026-04-01', valueNumeric: '113.42' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('sets a baseline only (0 items re-based) when there is no prior reading', async () => {
    const periodMonth = new Date('2026-04-01');
    mocked.priceIndexReading.create.mockResolvedValue({ id: 1, kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: new Prisma.Decimal('113.42') });
    mocked.priceIndexReading.findUnique.mockResolvedValue({ valueNumeric: new Prisma.Decimal('113.42') });
    mocked.priceIndexReading.findFirst.mockResolvedValue(null); // no previous reading
    const svc = new PriceIndexService();

    const { rebasedCount } = await svc.recordReading({ kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: '113.42' });

    expect(rebasedCount).toBe(0);
    expect(mocked.materialCatalog.findMany).not.toHaveBeenCalled();
  });

  it('re-bases bound catalog items by the pct change vs the previous reading', async () => {
    const periodMonth = new Date('2026-05-01');
    mocked.priceIndexReading.create.mockResolvedValue({ id: 2, kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: new Prisma.Decimal('116.0') });
    mocked.priceIndexReading.findUnique.mockResolvedValue({ valueNumeric: new Prisma.Decimal('116.0') });
    mocked.priceIndexReading.findFirst.mockResolvedValue({ valueNumeric: new Prisma.Decimal('113.42') }); // prior month value → CPI +2.2740...%
    mocked.materialCatalog.findMany.mockResolvedValue([
      { id: 'm1', slug: 'paint-standard', baseReferenceFils: 3000, priceMinFils: 2000, priceMaxFils: 5000 },
    ]);
    mocked.materialCatalog.update.mockResolvedValue({});
    const svc = new PriceIndexService();

    const { rebasedCount } = await svc.recordReading({ kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: '116.0' });

    expect(rebasedCount).toBe(1);
    expect(mocked.materialCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ unitPriceFils: expect.any(Number) }) }),
    );
    const newPrice = mocked.materialCatalog.update.mock.calls[0][0].data.unitPriceFils;
    expect(newPrice).toBeGreaterThan(3000); // CPI rose, price should re-base upward
    expect(newPrice).toBeLessThanOrEqual(5000); // stays within the band
  });

  it('clamps a re-based price that would fall outside the catalog band', async () => {
    const periodMonth = new Date('2026-05-01');
    mocked.priceIndexReading.create.mockResolvedValue({ id: 3, kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: new Prisma.Decimal('200') });
    mocked.priceIndexReading.findUnique.mockResolvedValue({ valueNumeric: new Prisma.Decimal('200') });
    mocked.priceIndexReading.findFirst.mockResolvedValue({ valueNumeric: new Prisma.Decimal('100') }); // +100% swing
    mocked.materialCatalog.findMany.mockResolvedValue([
      { id: 'm1', slug: 'paint-standard', baseReferenceFils: 3000, priceMinFils: 2000, priceMaxFils: 5000 },
    ]);
    mocked.materialCatalog.update.mockResolvedValue({});
    const svc = new PriceIndexService();

    await svc.recordReading({ kind: PriceIndexKind.DOS_CPI, periodMonth, valueNumeric: '200' });

    // 3000 * (1 + 1.00) = 6000, clamped to the 5000 ceiling.
    expect(mocked.materialCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitPriceFils: 5000 }) }),
    );
  });
});

import { MaterialCatalogService } from './MaterialCatalogService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    materialCatalog: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const mocked = prisma as unknown as {
  materialCatalog: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
};

const validInput = {
  slug: 'breaker-16a-standard',
  nameAr: 'قاطع 16 أمبير',
  nameEn: 'MCB Breaker 16A',
  unit: 'piece',
  unitPriceFils: 5000,
  priceMinFils: 3000,
  priceMaxFils: 7000,
};

describe('MaterialCatalogService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a unitPriceFils below priceMinFils', async () => {
    const svc = new MaterialCatalogService();
    await expect(svc.create({ ...validInput, unitPriceFils: 2000 })).rejects.toBeInstanceOf(ValidationError);
    expect(mocked.materialCatalog.create).not.toHaveBeenCalled();
  });

  it('rejects a unitPriceFils above priceMaxFils', async () => {
    const svc = new MaterialCatalogService();
    await expect(svc.create({ ...validInput, unitPriceFils: 9000 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects priceMinFils > priceMaxFils', async () => {
    const svc = new MaterialCatalogService();
    await expect(svc.create({ ...validInput, priceMinFils: 8000, priceMaxFils: 1000 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects missing required fields', async () => {
    const svc = new MaterialCatalogService();
    await expect(svc.create({ nameAr: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates when the price sits within the band', async () => {
    mocked.materialCatalog.create.mockResolvedValue({ id: 'm1', ...validInput });
    const svc = new MaterialCatalogService();
    const created = await svc.create(validInput);
    expect(created).toEqual(expect.objectContaining({ id: 'm1' }));
    expect(mocked.materialCatalog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: validInput.slug, unitPriceFils: 5000 }) }),
    );
  });
});

describe('MaterialCatalogService.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError for a missing id', async () => {
    mocked.materialCatalog.findUnique.mockResolvedValue(null);
    const svc = new MaterialCatalogService();
    await expect(svc.update('missing', { unitPriceFils: 5000 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('re-validates the full band using existing values when only one field is patched', async () => {
    mocked.materialCatalog.findUnique.mockResolvedValue({ id: 'm1', ...validInput });
    const svc = new MaterialCatalogService();
    // Lowering priceMaxFils below the existing unitPriceFils (5000) must fail
    // even though priceMaxFils alone isn't out of range.
    await expect(svc.update('m1', { priceMaxFils: 4000 })).rejects.toBeInstanceOf(ValidationError);
    expect(mocked.materialCatalog.update).not.toHaveBeenCalled();
  });

  it('applies a valid patch', async () => {
    mocked.materialCatalog.findUnique.mockResolvedValue({ id: 'm1', ...validInput });
    mocked.materialCatalog.update.mockResolvedValue({ id: 'm1', ...validInput, unitPriceFils: 6000 });
    const svc = new MaterialCatalogService();
    const updated = await svc.update('m1', { unitPriceFils: 6000 });
    expect(updated.unitPriceFils).toBe(6000);
  });
});

describe('MaterialCatalogService.assertPriceBand', () => {
  it('accepts a price at either edge of the band (inclusive)', () => {
    const svc = new MaterialCatalogService();
    expect(() => svc.assertPriceBand(3000, 3000, 7000)).not.toThrow();
    expect(() => svc.assertPriceBand(7000, 3000, 7000)).not.toThrow();
  });
});

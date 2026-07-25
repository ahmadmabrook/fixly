import { SupplierService } from './SupplierService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    supplier: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const mocked = prisma as unknown as {
  supplier: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
};

describe('SupplierService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires a name', async () => {
    const svc = new SupplierService();
    await expect(svc.create({})).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a pilot supplier with sane defaults', async () => {
    mocked.supplier.create.mockResolvedValue({ id: 's1', name: 'Amman Hardware', isPilot: true });
    const svc = new SupplierService();
    const created = await svc.create({ name: 'Amman Hardware' });
    expect(created).toEqual(expect.objectContaining({ id: 's1' }));
    expect(mocked.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Amman Hardware', categories: [] }) }),
    );
  });
});

describe('SupplierService.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError for a missing id', async () => {
    mocked.supplier.findUnique.mockResolvedValue(null);
    const svc = new SupplierService();
    await expect(svc.update('missing', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records the 30-day field-test verdict', async () => {
    mocked.supplier.findUnique.mockResolvedValue({ id: 's1', name: 'Amman Hardware' });
    mocked.supplier.update.mockResolvedValue({ id: 's1', commissionPaidOk: true, priceManipulationObserved: false });
    const svc = new SupplierService();
    const updated = await svc.update('s1', { commissionPaidOk: true, priceManipulationObserved: false });
    expect(updated.commissionPaidOk).toBe(true);
    expect(mocked.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ commissionPaidOk: true, priceManipulationObserved: false }) }),
    );
  });
});

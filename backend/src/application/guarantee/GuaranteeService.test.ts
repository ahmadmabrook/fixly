import { GuaranteeService } from './GuaranteeService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    booking: { findMany: jest.fn(), findUnique: jest.fn() },
    guaranteeTicket: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  booking: { findMany: jest.Mock; findUnique: jest.Mock };
  guaranteeTicket: { findUnique: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5);
const base = { id: 'bk1', customerId: 'cust1', status: 'COMPLETED', completedAt: daysAgo(2), guarantee: null };

describe('GuaranteeService.openTicket', () => {
  let service: GuaranteeService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuaranteeService();
  });

  it('throws NotFound when the booking is missing', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(null);
    await expect(service.openTicket('bk1', 'cust1', 'issue')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids opening a ticket for someone else’s booking', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({ ...base, customerId: 'other' });
    await expect(service.openTicket('bk1', 'cust1', 'issue')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a non-completed booking', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({ ...base, status: 'IN_PROGRESS', completedAt: null });
    await expect(service.openTicket('bk1', 'cust1', 'issue')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a booking past the 30-day window', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({ ...base, completedAt: daysAgo(31) });
    await expect(service.openTicket('bk1', 'cust1', 'issue')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects when a ticket already exists', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({ ...base, guarantee: { id: 'g1' } });
    await expect(service.openTicket('bk1', 'cust1', 'issue')).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a ticket for an eligible booking (trimming description)', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(base);
    mockedPrisma.guaranteeTicket.create.mockResolvedValue({ id: 'g1', status: 'OPEN' });
    const t = await service.openTicket('bk1', 'cust1', '  leak  ', ['u1']);
    expect(t).toEqual({ id: 'g1', status: 'OPEN' });
    expect(mockedPrisma.guaranteeTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookingId: 'bk1', description: 'leak', mediaUrls: ['u1'], status: 'OPEN' }) }),
    );
  });
});

describe('GuaranteeService.review', () => {
  let service: GuaranteeService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuaranteeService();
  });

  it('finalises APPROVED → RESOLVED and notifies the customer', async () => {
    mockedPrisma.guaranteeTicket.findUnique.mockResolvedValue({ id: 'g1', bookingId: 'bk1', status: 'OPEN', booking: { customerId: 'cust1' } });
    const txUpdate = jest.fn().mockResolvedValue({ id: 'g1', status: 'RESOLVED' });
    const notifCreate = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ guaranteeTicket: { update: txUpdate }, notification: { create: notifCreate } }),
    );
    const r = await service.review('g1', 'APPROVED', 'ok', new Date(Date.now() + 864e5).toISOString());
    expect(r.status).toBe('RESOLVED');
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) }));
    expect(notifCreate).toHaveBeenCalled();
  });

  it('rejects re-finalising an already-resolved ticket', async () => {
    mockedPrisma.guaranteeTicket.findUnique.mockResolvedValue({ id: 'g1', bookingId: 'bk1', status: 'RESOLVED', booking: { customerId: 'cust1' } });
    await expect(service.review('g1', 'REJECTED')).rejects.toBeInstanceOf(ConflictError);
  });
});

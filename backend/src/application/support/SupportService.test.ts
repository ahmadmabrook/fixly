import { SupportService } from './SupportService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    supportTicket: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  supportTicket: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('SupportService', () => {
  let service: SupportService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new SupportService();
  });

  it('createTicket opens a ticket with the first customer message', async () => {
    mockedPrisma.supportTicket.create.mockResolvedValue({ id: 't1', messages: [{ id: 'm1' }] });
    const t = await service.createTicket('u1', '  subj  ', '  body  ');
    expect(t).toEqual({ id: 't1', messages: [{ id: 'm1' }] });
    expect(mockedPrisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', subject: 'subj' }) }),
    );
  });

  it('addCustomerMessage throws NotFound when the caller is not the owner', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ supportTicket: { findUnique: jest.fn().mockResolvedValue({ id: 't1', userId: 'other', status: 'OPEN' }) } }),
    );
    await expect(service.addCustomerMessage('t1', 'u1', 'hi')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('addCustomerMessage reopens a CLOSED ticket', async () => {
    const update = jest.fn().mockResolvedValue({ id: 't1', status: 'OPEN' });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        supportTicket: { findUnique: jest.fn().mockResolvedValue({ id: 't1', userId: 'u1', status: 'CLOSED' }), update },
        supportMessage: { create: jest.fn().mockResolvedValue({}) },
      }),
    );
    await service.addCustomerMessage('t1', 'u1', 'still broken');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) }));
  });

  it('addAdminMessage moves OPEN → IN_PROGRESS and notifies the customer', async () => {
    mockedPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', subject: 'x', status: 'OPEN' });
    const update = jest.fn().mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });
    const notifCreate = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ supportMessage: { create: jest.fn().mockResolvedValue({}) }, supportTicket: { update }, notification: { create: notifCreate } }),
    );
    await service.addAdminMessage('t1', 'reply');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }));
    expect(notifCreate).toHaveBeenCalled();
  });

  it('setCategory updates the ticket category', async () => {
    mockedPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1' });
    mockedPrisma.supportTicket.update.mockResolvedValue({ id: 't1', category: 'PRICING' });
    const result = await service.setCategory('t1', 'PRICING');
    expect(result).toEqual({ id: 't1', category: 'PRICING' });
    expect(mockedPrisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { category: 'PRICING' } });
  });

  it('setCategory throws NotFound when the ticket does not exist', async () => {
    mockedPrisma.supportTicket.findUnique.mockResolvedValue(null);
    await expect(service.setCategory('missing', 'OTHER')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('escalate sets escalatedAt on the first call', async () => {
    mockedPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', escalatedAt: null });
    mockedPrisma.supportTicket.update.mockResolvedValue({ id: 't1', escalatedAt: new Date('2026-01-01') });
    const result = await service.escalate('t1');
    expect(mockedPrisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { escalatedAt: expect.any(Date) } });
    expect(result.escalatedAt).not.toBeNull();
  });

  it('escalate is idempotent — no-op if already escalated', async () => {
    const existing = { id: 't1', escalatedAt: new Date('2026-01-01') };
    mockedPrisma.supportTicket.findUnique.mockResolvedValue(existing);
    const result = await service.escalate('t1');
    expect(mockedPrisma.supportTicket.update).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

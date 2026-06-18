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
});

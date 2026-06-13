import { AdminService } from './AdminService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    payout: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    adminAuditLog: { create: jest.fn() },
    adminUser: { findUnique: jest.fn() },
    technicianProfile: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../shared/env', () => ({
  env: () => ({ PAYMENT_PROVIDER: 'mock', JWT_SECRET: 'x'.repeat(32), JWT_ACCESS_EXPIRES_IN: '15m' }),
}));

const mockedPrisma = prisma as unknown as {
  payout: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  ledgerEntry: { create: jest.Mock };
  adminAuditLog: { create: jest.Mock };
  adminUser: { findUnique: jest.Mock };
  technicianProfile: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

let service: AdminService;

describe('AdminService.processPayout', () => {
  let provider: jest.Mocked<IPayoutProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = { disburse: jest.fn().mockResolvedValue({ providerRef: 'mock_payout_1', status: 'DISBURSED' }) };
    service = new AdminService(provider);
    // finalize tx runs its callback against a tx with the needed writers
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        payout: { update: jest.fn().mockResolvedValue({ id: 'p1', status: 'COMPLETED' }) },
        ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );
  });

  it('throws NotFound when the payout does not exist', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue(null);
    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
    expect(provider.disburse).not.toHaveBeenCalled();
  });

  it('is idempotent: a COMPLETED payout returns without disbursing again', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'COMPLETED', amountJod: 50 });
    mockedPrisma.payout.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'COMPLETED' });
    await service.processPayout('p1', 'admin1');
    expect(provider.disburse).not.toHaveBeenCalled();
    expect(mockedPrisma.payout.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a payout already in PROCESSING (claim lost)', async () => {
    mockedPrisma.payout.findUnique
      .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', amountJod: 50 }) // initial read
      .mockResolvedValueOnce({ id: 'p1', status: 'PROCESSING' });             // post-claim re-read
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it
    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
    expect(provider.disburse).not.toHaveBeenCalled();
  });

  it('disburses a PENDING payout then finalizes COMPLETED + ledger + audit', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountJod: 50 });
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 1 }); // claim won

    await service.processPayout('p1', 'admin1', '1.2.3.4');

    expect(provider.disburse).toHaveBeenCalledWith('p1', 50);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1); // finalize tx
  });

  it('marks the payout FAILED and throws when disbursement fails', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountJod: 50 });
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 1 });
    provider.disburse.mockRejectedValue(new Error('provider down'));

    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockedPrisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { status: 'FAILED' } }),
    );
  });
});

describe('AdminService.verifyTechnician (idempotency)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The tx client only needs to support the calls the code path actually makes.
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );
  });

  it('is a no-op (no audit row, no update) when the technician is already verified', async () => {
    const update = jest.fn();
    const audit = jest.fn();
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', isVerified: true, user: { id: 'u1' } }),
          update,
        },
        adminAuditLog: { create: audit },
      }),
    );
    const result = await service.verifyTechnician('tp1', 'admin1', '1.2.3.4');
    expect(result).toEqual({ id: 'tp1', isVerified: true, user: { id: 'u1' } });
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('updates + audits on the first call (PENDING → VERIFIED)', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'tp1', isVerified: true, user: { id: 'u1' } });
    const audit = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', isVerified: false, user: { id: 'u1' } }),
          update,
        },
        adminAuditLog: { create: audit },
      }),
    );
    await service.verifyTechnician('tp1', 'admin1', '1.2.3.4');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tp1' }, data: { isVerified: true },
    }));
    expect(audit).toHaveBeenCalled();
  });

  it('throws NotFound when the technician profile does not exist', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
        adminAuditLog: { create: jest.fn() },
      }),
    );
    await expect(service.verifyTechnician('missing', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('AdminService.login (failed-login logging)', () => {
  // We spy on the logger singleton to verify the audit-shaped warn log fires.
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    // The audit-table mock for the SUCCESS path.
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ adminAuditLog: { create: jest.fn().mockResolvedValue({}) } }),
    );
    warnSpy = jest.spyOn(require('../../shared/logger').logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warnSpy.mockRestore());

  it('logs at warn level with reason="no_user" when the email is unknown', async () => {
    (mockedPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
    const { UnauthorizedError } = require('../../shared/errors');
    await expect(service.login('nobody@fixly.jo', 'whatever', '1.2.3.4'))
      .rejects.toBeInstanceOf(UnauthorizedError);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.login.fail',
        email: 'nobody@fixly.jo',
        ip: '1.2.3.4',
        reason: 'no_user',
      }),
      expect.any(String),
    );
  });

  it('logs at warn level with reason="disabled" when the user is inactive', async () => {
    (mockedPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1', email: 'a@b.c', isActive: false, passwordHash: 'whatever',
    });
    const { UnauthorizedError } = require('../../shared/errors');
    await expect(service.login('a@b.c', 'pw', '1.2.3.4'))
      .rejects.toBeInstanceOf(UnauthorizedError);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'disabled' }),
      expect.any(String),
    );
  });

  it('logs at warn level with reason="bad_password" when bcrypt mismatches', async () => {
    (mockedPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1', email: 'a@b.c', isActive: true,
      // Pre-computed bcrypt hash for "right" so anything else mismatches.
      passwordHash: '$2a$12$0000000000000000000000.0000000000000000000000000000000000',
    });
    const { UnauthorizedError } = require('../../shared/errors');
    await expect(service.login('a@b.c', 'wrong', '1.2.3.4'))
      .rejects.toBeInstanceOf(UnauthorizedError);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'bad_password' }),
      expect.any(String),
    );
  });
});

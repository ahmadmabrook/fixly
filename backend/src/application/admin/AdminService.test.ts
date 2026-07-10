import { AdminService } from './AdminService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    payout: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    adminAuditLog: { create: jest.fn() },
    adminUser: { findUnique: jest.fn() },
    technicianProfile: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    booking: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    bookingStatusHistory: { findMany: jest.fn() },
    additionalWorkItem: { findMany: jest.fn() },
    service: { findMany: jest.fn() },
    guaranteeTicket: { count: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../shared/env', () => {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return {
    env: () => ({
      PAYMENT_PROVIDER: 'mock',
      JWT_SECRET: 'x'.repeat(32),
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_KEYS: { current: { kid: 'test-kid', privateKey, publicKey } },
    }),
  };
});

const mockedPrisma = prisma as unknown as {
  payout: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock; count: jest.Mock };
  ledgerEntry: { create: jest.Mock };
  adminAuditLog: { create: jest.Mock };
  adminUser: { findUnique: jest.Mock };
  technicianProfile: { findUnique: jest.Mock; update: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
  booking: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
  bookingStatusHistory: { findMany: jest.Mock };
  additionalWorkItem: { findMany: jest.Mock };
  service: { findMany: jest.Mock };
  guaranteeTicket: { count: jest.Mock };
  $transaction: jest.Mock;
};

let service: AdminService;

describe('AdminService.processPayout', () => {
  let provider: jest.Mocked<IPayoutProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = {
      disburse: jest.fn().mockResolvedValue({ providerRef: 'mock_payout_1', status: 'DISBURSED' }),
      getStatus: jest.fn().mockResolvedValue({ state: 'COMPLETED', providerRef: 'mock_payout_1' }),
    };
    service = new AdminService(provider);
    // finalize tx runs its callback against a tx with the needed writers.
    // finalizePayout uses a transition-guarded updateMany (count=1 = it won).
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        payout: {
          update: jest.fn().mockResolvedValue({ id: 'p1', status: 'COMPLETED' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
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
      .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', amountJod: 50, technician: { user: { isActive: true } } }) // initial read
      .mockResolvedValueOnce({ id: 'p1', status: 'PROCESSING' });             // post-claim re-read
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it
    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
    expect(provider.disburse).not.toHaveBeenCalled();
  });

  it('disburses a PENDING payout then finalizes COMPLETED + ledger + audit', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountJod: 50, technician: { user: { isActive: true } } });
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 1 }); // claim won

    await service.processPayout('p1', 'admin1', '1.2.3.4');

    expect(provider.disburse).toHaveBeenCalledWith('p1', 50);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1); // finalize tx
  });

  it('marks the payout FAILED and throws when disbursement fails', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountJod: 50, technician: { user: { isActive: true } } });
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 1 });
    provider.disburse.mockRejectedValue(new Error('provider down'));

    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockedPrisma.payout.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'p1', status: 'PROCESSING' }, data: { status: 'FAILED' } }),
    );
  });

  it('blocks disbursement to an inactive technician (N-6)', async () => {
    mockedPrisma.payout.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountJod: 50, technician: { user: { isActive: false } } });
    await expect(service.processPayout('p1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
    expect(provider.disburse).not.toHaveBeenCalled();
    expect(mockedPrisma.payout.updateMany).not.toHaveBeenCalled();
  });
});

describe('AdminService.refundBookingPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to PaymentService.refundBooking and writes an audit record', async () => {
    const refundBooking = jest.fn().mockResolvedValue({ id: 'pay-1', status: 'PARTIALLY_REFUNDED' });
    const paymentService = { refundBooking } as unknown as import('../payment/PaymentService').PaymentService;
    const adminService = new AdminService({ disburse: jest.fn(), getStatus: jest.fn() } as unknown as IPayoutProvider, paymentService);

    const result = await adminService.refundBookingPayment('bk-1', 5, 'admin1', '1.2.3.4');

    expect(refundBooking).toHaveBeenCalledWith('bk-1', 5);
    expect(mockedPrisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'payment.refund', targetId: 'bk-1', actorId: 'admin1' }) }),
    );
    expect(result).toEqual({ id: 'pay-1', status: 'PARTIALLY_REFUNDED' });
  });
});

describe('AdminService.reconcileStuckPayouts', () => {
  let provider: jest.Mocked<IPayoutProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = {
      disburse: jest.fn(),
      getStatus: jest.fn(),
    };
    service = new AdminService(provider);
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        payout: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
        adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );
  });

  it('finalizes a stuck payout when the provider reports COMPLETED (money was sent)', async () => {
    mockedPrisma.payout.findMany.mockResolvedValue([{ id: 'p1', amountJod: 50 }]);
    provider.getStatus.mockResolvedValue({ state: 'COMPLETED', providerRef: 'r1' });

    const resolved = await service.reconcileStuckPayouts();

    expect(resolved).toBe(1);
    expect(provider.getStatus).toHaveBeenCalledWith('p1');
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1); // guarded finalize
  });

  it('marks a stuck payout FAILED when the provider reports FAILED (no money moved)', async () => {
    mockedPrisma.payout.findMany.mockResolvedValue([{ id: 'p1', amountJod: 50 }]);
    provider.getStatus.mockResolvedValue({ state: 'FAILED' });
    mockedPrisma.payout.updateMany.mockResolvedValue({ count: 1 });

    const resolved = await service.reconcileStuckPayouts();

    expect(resolved).toBe(1);
    expect(mockedPrisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', status: 'PROCESSING' }, data: { status: 'FAILED' } }),
    );
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled(); // no finalize
  });

  it('leaves a payout PROCESSING when the provider state is still PENDING/UNKNOWN', async () => {
    mockedPrisma.payout.findMany.mockResolvedValue([{ id: 'p1', amountJod: 50 }]);
    provider.getStatus.mockResolvedValue({ state: 'PENDING' });

    const resolved = await service.reconcileStuckPayouts();

    expect(resolved).toBe(0);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.payout.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when there are no stuck payouts', async () => {
    mockedPrisma.payout.findMany.mockResolvedValue([]);
    expect(await service.reconcileStuckPayouts()).toBe(0);
    expect(provider.getStatus).not.toHaveBeenCalled();
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
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', isVerified: true, status: 'APPROVED', user: { id: 'u1' } }),
          update,
        },
        adminAuditLog: { create: audit },
      }),
    );
    const result = await service.verifyTechnician('tp1', 'admin1', '1.2.3.4');
    expect(result).toEqual({ id: 'tp1', isVerified: true, status: 'APPROVED', user: { id: 'u1' } });
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('updates + audits on the first call (PENDING → APPROVED)', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'tp1', isVerified: true, status: 'APPROVED', user: { id: 'u1' } });
    const audit = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', isVerified: false, status: 'PENDING', user: { id: 'u1' } }),
          update,
        },
        adminAuditLog: { create: audit },
      }),
    );
    await service.verifyTechnician('tp1', 'admin1', '1.2.3.4');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tp1' },
      data: expect.objectContaining({ isVerified: true, status: 'APPROVED' }),
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

describe('AdminService.reinstateTechnician', () => {
  beforeEach(() => jest.clearAllMocks());

  it('moves a SUSPENDED technician back to APPROVED and audits it', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'tp1', isVerified: true, status: 'APPROVED', user: { id: 'u1' } });
    const audit = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', status: 'SUSPENDED' }),
          update,
        },
        adminAuditLog: { create: audit },
      }),
    );
    await service.reinstateTechnician('tp1', 'admin1', '1.2.3.4');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tp1' },
      data: expect.objectContaining({ status: 'APPROVED', isVerified: true, rejectionReason: null }),
    }));
    expect(audit).toHaveBeenCalled();
  });

  it('rejects reinstating a technician that is not SUSPENDED', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tp1', status: 'APPROVED' }),
          update: jest.fn(),
        },
        adminAuditLog: { create: jest.fn() },
      }),
    );
    await expect(service.reinstateTechnician('tp1', 'admin1')).rejects.toThrow('Only a suspended technician can be reinstated');
  });

  it('throws NotFound when the technician profile does not exist', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        technicianProfile: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
        adminAuditLog: { create: jest.fn() },
      }),
    );
    await expect(service.reinstateTechnician('missing', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
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
    // Email is now logged as a 12-char fingerprint (emailFp) so logs are safe
    // to export to third-party observability without leaking admin emails.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.login.fail',
        emailFp: expect.stringMatching(/^[0-9a-f]{12}$/),
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

describe('AdminService.getStats (bookingsByService)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService({ disburse: jest.fn(), getStatus: jest.fn() } as unknown as IPayoutProvider);
    // The parallel header block — values are irrelevant to the new logic, just resolvable.
    mockedPrisma.booking.count.mockResolvedValue(0);
    mockedPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalJod: 0 } });
    mockedPrisma.technicianProfile.count.mockResolvedValue(0);
    mockedPrisma.technicianProfile.aggregate.mockResolvedValue({ _avg: { rating: 0 } });
    mockedPrisma.guaranteeTicket.count.mockResolvedValue(0);
    mockedPrisma.payout.count.mockResolvedValue(0);
  });

  it('maps grouped booking counts to their Arabic service names, preserving desc order', async () => {
    mockedPrisma.booking.groupBy.mockResolvedValue([
      { serviceId: 'svc-1', _count: { id: 9 } },
      { serviceId: 'svc-2', _count: { id: 4 } },
    ]);
    // findMany may return rows in any order — the service builds a Map, so order-independent.
    mockedPrisma.service.findMany.mockResolvedValue([
      { id: 'svc-2', nameAr: 'سباكة' },
      { id: 'svc-1', nameAr: 'كهرباء' },
    ]);

    const stats = await service.getStats();

    expect(stats.bookingsByService).toEqual([
      { serviceId: 'svc-1', nameAr: 'كهرباء', count: 9 },
      { serviceId: 'svc-2', nameAr: 'سباكة', count: 4 },
    ]);
    // groupBy is capped at the top 10 — a sanity check on the query shape.
    expect(mockedPrisma.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['serviceId'], take: 10, orderBy: { _count: { id: 'desc' } } }),
    );
    // The name lookup only fetches the grouped service ids (no full-table scan).
    expect(mockedPrisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['svc-1', 'svc-2'] } } }),
    );
  });

  it('falls back to the serviceId when a name row is missing (deleted service)', async () => {
    mockedPrisma.booking.groupBy.mockResolvedValue([{ serviceId: 'svc-gone', _count: { id: 2 } }]);
    mockedPrisma.service.findMany.mockResolvedValue([]); // name not found

    const stats = await service.getStats();

    expect(stats.bookingsByService).toEqual([{ serviceId: 'svc-gone', nameAr: 'svc-gone', count: 2 }]);
  });

  it('returns an empty bookingsByService when there are no bookings', async () => {
    mockedPrisma.booking.groupBy.mockResolvedValue([]);
    mockedPrisma.service.findMany.mockResolvedValue([]);

    const stats = await service.getStats();

    expect(stats.bookingsByService).toEqual([]);
    expect(mockedPrisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] } } }),
    );
  });
});

describe('AdminService.getBookingDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService({ disburse: jest.fn(), getStatus: jest.fn() } as unknown as IPayoutProvider);
  });

  it('throws NotFoundError when the booking does not exist', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(null);
    await expect(service.getBookingDetail('missing', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns a consolidated shape and audits the read', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({
      id: 'bk1',
      status: 'COMPLETED',
      totalJod: 50,
      customer: { id: 'c1', name: 'Sara', phone: '0790000000' },
      technician: { id: 't1', rating: 4.8, hourlyRateJod: 45, user: { id: 'u1', name: 'Omar', phone: '0791111111' } },
      service: { id: 's1', nameAr: 'كهرباء', nameEn: 'Electrical', priceJod: 50, calloutFeeJod: 5, durationMin: 60 },
      payment: { id: 'pay1', status: 'CAPTURED' },
    });
    mockedPrisma.bookingStatusHistory.findMany.mockResolvedValue([{ id: 'h1', toStatus: 'CONFIRMED' }]);
    mockedPrisma.additionalWorkItem.findMany.mockResolvedValue([{ id: 'aw1', description: 'extra part', amountJod: 10 }]);

    const detail = await service.getBookingDetail('bk1', 'admin1', '1.2.3.4');

    expect(detail.booking.id).toBe('bk1');
    expect(detail.booking).not.toHaveProperty('payment');
    expect(detail.statusHistory).toEqual([{ id: 'h1', toStatus: 'CONFIRMED' }]);
    expect(detail.additionalWork).toEqual([{ id: 'aw1', description: 'extra part', amountJod: 10 }]);
    expect(detail.payment).toEqual({ id: 'pay1', status: 'CAPTURED' });
    expect(mockedPrisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'booking.view_detail', targetId: 'bk1', actorId: 'admin1' }) }),
    );
  });

  it('returns payment: null when the booking has no payment row', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({
      id: 'bk2', status: 'PENDING', customer: {}, technician: null, service: {}, payment: null,
    });
    mockedPrisma.bookingStatusHistory.findMany.mockResolvedValue([]);
    mockedPrisma.additionalWorkItem.findMany.mockResolvedValue([]);

    const detail = await service.getBookingDetail('bk2', 'admin1');
    expect(detail.payment).toBeNull();
  });
});

describe('AdminService.listBookingsForExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService({ disburse: jest.fn(), getStatus: jest.fn() } as unknown as IPayoutProvider);
  });

  it('passes the status filter and row cap through to the query', async () => {
    mockedPrisma.booking.findMany.mockResolvedValue([]);
    await service.listBookingsForExport('COMPLETED', 5000);
    expect(mockedPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'COMPLETED' }, take: 5000 }),
    );
  });

  it('omits the status filter when none is given', async () => {
    mockedPrisma.booking.findMany.mockResolvedValue([]);
    await service.listBookingsForExport(undefined, 5000);
    expect(mockedPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 5000 }),
    );
  });
});


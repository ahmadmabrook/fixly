import { Prisma } from '@prisma/client';
import { TechnicianService } from './TechnicianService';
import { prisma } from '../../infrastructure/database/prisma';
import { ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    service: { findMany: jest.fn() },
    technicianProfile: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    payout: { aggregate: jest.fn() },
    withdrawalRequest: { aggregate: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    dispatchOffer: { findMany: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  service: { findMany: jest.Mock };
  technicianProfile: { findUnique: jest.Mock; update: jest.Mock; upsert: jest.Mock };
  payout: { aggregate: jest.Mock };
  withdrawalRequest: { aggregate: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  booking: { findMany: jest.Mock };
  dispatchOffer: { findMany: jest.Mock };
  user: { update: jest.Mock };
  $transaction: jest.Mock;
};

const D = (v: number) => new Prisma.Decimal(v);
const approved = { id: 'tp1', status: 'APPROVED', lastWithdrawalAt: null };

describe('TechnicianService.apply', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('rejects an hourly rate below 40', async () => {
    await expect(service.apply('u1', { serviceIds: ['s1'], hourlyRateJod: 30 })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an hourly rate above 60', async () => {
    await expect(service.apply('u1', { serviceIds: ['s1'], hourlyRateJod: 70 })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an empty service list', async () => {
    await expect(service.apply('u1', { serviceIds: [], hourlyRateJod: 45 })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an unknown service id', async () => {
    mockedPrisma.service.findMany.mockResolvedValue([{ id: 's1' }]); // only 1 of 2 valid
    await expect(service.apply('u1', { serviceIds: ['s1', 's2'], hourlyRateJod: 45 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('TechnicianService approval gates', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('setAvailability forbids a non-approved technician', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'PENDING' });
    await expect(service.setAvailability('u1', true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('nearbyJobs forbids a non-approved technician (PII guard)', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'PENDING', services: [{ id: 's1' }] });
    await expect(service.nearbyJobs('u1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('nearbyJobs returns ONLY bookings with an active OFFERED dispatch offer for this tech, as COARSE rows', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED', currentLat: 31.95, currentLng: 35.93, services: [{ id: 's1' }] });
    // Source reads dispatchOffer.findMany (status OFFERED, this tech) and projects the booking.
    mockedPrisma.dispatchOffer.findMany.mockResolvedValue([
      { booking: { id: 'bk1', totalJod: D(50), addressLat: 31.96, addressLng: 35.94, service: { nameAr: 'كهرباء', nameEn: 'E', priceJod: D(50), durationMin: 45 } } },
    ]);

    const jobs = await service.nearbyJobs('u1');

    // The query is scoped to this technician's OFFERED offers, NOT a free-for-all booking scan.
    expect(mockedPrisma.dispatchOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ technicianId: 'tp1', status: 'OFFERED' }) }),
    );
    expect(mockedPrisma.booking.findMany).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('bk1');
    // Coarse data only — raw address fields are never leaked.
    expect(jobs[0]).not.toHaveProperty('addressLine');
    expect(jobs[0]).not.toHaveProperty('addressLat');
    expect(typeof jobs[0].distanceKm).toBe('number');
  });

  it('nearbyJobs returns an empty list when the tech has no OFFERED offers', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED', currentLat: 31.95, currentLng: 35.93, services: [{ id: 's1' }] });
    mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]);
    await expect(service.nearbyJobs('u1')).resolves.toEqual([]);
  });
});

describe('TechnicianService.earnings', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('balance = earned − paid-out − pending-withdrawals', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', lastWithdrawalAt: null });
    // payout.aggregate calls (Promise.all order): total, today, month
    mockedPrisma.payout.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(300) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(85) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(240) } });
    // withdrawalRequest.aggregate: PAID, then REQUESTED/PROCESSING
    mockedPrisma.withdrawalRequest.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(100) } }) // withdrawn
      .mockResolvedValueOnce({ _sum: { amountJod: D(20) } }); // pending
    const e = await service.earnings('u1');
    expect(e.totalJod).toBe('300');
    expect(e.todayJod).toBe('85');
    expect(e.balanceJod).toBe('180'); // 300 - 100 - 20
  });
});

describe('TechnicianService.requestWithdrawal', () => {
  let service: TechnicianService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new TechnicianService();
    // requireApproved + earnings both read technicianProfile.findUnique.
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(approved);
  });

  function mockBalance(total: number) {
    mockedPrisma.payout.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(total) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
    mockedPrisma.withdrawalRequest.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
  }

  it('rejects below the 20 JOD minimum', async () => {
    await expect(service.requestWithdrawal('u1', 10)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects within the 24h cooldown', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ ...approved, lastWithdrawalAt: new Date() });
    await expect(service.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects an amount above the available balance', async () => {
    mockBalance(30);
    await expect(service.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(ValidationError);
  });

  it('maps a unique-violation (concurrent pending) to a Conflict', async () => {
    mockBalance(500);
    mockedPrisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    await expect(service.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a REQUESTED withdrawal on the happy path', async () => {
    mockBalance(500);
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        withdrawalRequest: { create: jest.fn().mockResolvedValue({ id: 'w1', status: 'REQUESTED' }) },
        technicianProfile: { update: jest.fn().mockResolvedValue({}) },
      }),
    );
    const w = await service.requestWithdrawal('u1', 50, 'JO00');
    expect(w).toEqual({ id: 'w1', status: 'REQUESTED' });
  });
});

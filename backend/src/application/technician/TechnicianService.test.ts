import { Prisma } from '@prisma/client';
import { TechnicianService } from './TechnicianService';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { ForbiddenError, ConflictError, ValidationError, NotFoundError } from '../../shared/errors';

jest.mock('../../infrastructure/cache/redis', () => ({
  redis: { geoadd: jest.fn(), zadd: jest.fn(), set: jest.fn() },
  TECH_LOCATIONS_KEY: 'tech:locations',
  TECH_HEARTBEAT_KEY: 'tech:heartbeat',
}));
jest.mock('../../shared/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    service: { findMany: jest.fn() },
    technicianProfile: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    technicianNotificationPrefs: { upsert: jest.fn() },
    payout: { aggregate: jest.fn() },
    withdrawalRequest: { aggregate: jest.fn(), create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    booking: { findMany: jest.fn(), count: jest.fn() },
    dispatchOffer: { findMany: jest.fn(), count: jest.fn() },
    guaranteeTicket: { count: jest.fn() },
    conductReport: { count: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  service: { findMany: jest.Mock };
  technicianProfile: { findUnique: jest.Mock; update: jest.Mock; upsert: jest.Mock };
  technicianNotificationPrefs: { upsert: jest.Mock };
  payout: { aggregate: jest.Mock };
  withdrawalRequest: { aggregate: jest.Mock; create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  booking: { findMany: jest.Mock; count: jest.Mock };
  dispatchOffer: { findMany: jest.Mock; count: jest.Mock };
  guaranteeTicket: { count: jest.Mock };
  conductReport: { count: jest.Mock };
  user: { update: jest.Mock };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

const mockedRedis = redis as unknown as { geoadd: jest.Mock; zadd: jest.Mock; set: jest.Mock };

const D = (v: number) => new Prisma.Decimal(v);
const approved = { id: 'tp1', status: 'APPROVED', lastWithdrawalAt: null };

describe('TechnicianService.apply', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('rejects an hourly rate below 40', async () => {
    await expect(service.apply('u1', { serviceIds: ['s1'], hourlyRateJod: 30, agreementAccepted: true })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an hourly rate above 60', async () => {
    await expect(service.apply('u1', { serviceIds: ['s1'], hourlyRateJod: 70, agreementAccepted: true })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an empty service list', async () => {
    await expect(service.apply('u1', { serviceIds: [], hourlyRateJod: 45, agreementAccepted: true })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an unknown service id', async () => {
    mockedPrisma.service.findMany.mockResolvedValue([{ id: 's1' }]); // only 1 of 2 valid
    await expect(service.apply('u1', { serviceIds: ['s1', 's2'], hourlyRateJod: 45, agreementAccepted: true })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects when the onboarding agreement is not accepted', async () => {
    await expect(service.apply('u1', { serviceIds: ['s1'], hourlyRateJod: 45, agreementAccepted: false })).rejects.toBeInstanceOf(ValidationError);
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
    // Regression: must also require booking.status === PENDING, otherwise a booking that
    // exhausted dispatch or was cancelled (leaving a dangling OFFERED offer row) would show
    // up here forever as a phantom "nearby job".
    expect(mockedPrisma.dispatchOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ technicianId: 'tp1', status: 'OFFERED', booking: { status: 'PENDING' } }),
      }),
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

describe('TechnicianService.updateLocation (Redis GEO, §2.4)', () => {
  let service: TechnicianService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new TechnicianService();
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED' });
    mockedRedis.geoadd.mockResolvedValue(1);
    mockedRedis.zadd.mockResolvedValue(1);
    mockedPrisma.technicianProfile.update.mockResolvedValue({ id: 'tp1', currentLat: 31.95, currentLng: 35.93 });
  });

  it('writes GEOADD + heartbeat ZADD on every call', async () => {
    mockedRedis.set.mockResolvedValue('OK'); // cooldown claimed → first ping this window
    await service.updateLocation('u1', 31.95, 35.93);
    expect(mockedRedis.geoadd).toHaveBeenCalledWith('tech:locations', 35.93, 31.95, 'tp1');
    expect(mockedRedis.zadd).toHaveBeenCalledWith('tech:heartbeat', expect.any(Number), 'tp1');
  });

  it('writes through to Postgres when the write-through cooldown is not held (first ping)', async () => {
    mockedRedis.set.mockResolvedValue('OK'); // SET NX succeeded → not throttled
    await service.updateLocation('u1', 31.95, 35.93);
    expect(mockedPrisma.technicianProfile.update).toHaveBeenCalledWith({
      where: { id: 'tp1' },
      data: { currentLat: 31.95, currentLng: 35.93, locationUpdatedAt: expect.any(Date) },
    });
  });

  it('skips the Postgres write-through when the cooldown is already held (rate-limited)', async () => {
    mockedRedis.set.mockResolvedValue(null); // SET NX failed → still within the 10s window
    const result = await service.updateLocation('u1', 31.95, 35.93);
    expect(mockedPrisma.technicianProfile.update).not.toHaveBeenCalled();
    // Response still reflects the just-submitted position (API contract unchanged).
    expect(result).toMatchObject({ currentLat: 31.95, currentLng: 35.93 });
  });

  it('still writes through to Postgres if the cooldown check itself errors (fail open)', async () => {
    mockedRedis.set.mockRejectedValue(new Error('redis down'));
    await service.updateLocation('u1', 31.95, 35.93);
    expect(mockedPrisma.technicianProfile.update).toHaveBeenCalled();
  });

  it('still writes through to Postgres if the Redis GEO write itself fails (fail open)', async () => {
    mockedRedis.geoadd.mockRejectedValue(new Error('redis down'));
    mockedRedis.set.mockResolvedValue('OK');
    await service.updateLocation('u1', 31.95, 35.93);
    expect(mockedPrisma.technicianProfile.update).toHaveBeenCalled();
  });

  it('forbids a non-approved technician (existing gate preserved)', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'PENDING' });
    await expect(service.updateLocation('u1', 31.95, 35.93)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedRedis.geoadd).not.toHaveBeenCalled();
  });
});

describe('TechnicianService.getMe', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('throws NotFoundError when the profile does not exist', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
    await expect(service.getMe('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('includes platformCommissionPct (from env) alongside the profile, and never leaks nationalIdEnc', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({
      id: 'tp1',
      userId: 'u1',
      status: 'APPROVED',
      hourlyRateJod: D(45),
      nationalIdEnc: 'encrypted-secret',
      services: [{ id: 's1', nameAr: 'كهرباء', nameEn: 'Electricity' }],
    });

    const me = await service.getMe('u1');

    // Default PLATFORM_COMMISSION_PCT is 20 when unset (see shared/env.ts).
    expect(me.platformCommissionPct).toBe(20);
    expect(me).not.toHaveProperty('nationalIdEnc');
    expect(me.id).toBe('tp1');
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
    // Last withdrawal with a stored IBAN — surfaced so the tech can re-use it.
    mockedPrisma.withdrawalRequest.findFirst.mockResolvedValue({ iban: 'JO94CBJO0010', bankName: 'Arab Bank' });
    const e = await service.earnings('u1');
    expect(e.totalJod).toBe('300');
    expect(e.todayJod).toBe('85');
    expect(e.balanceJod).toBe('180'); // 300 - 100 - 20
    // Saved bank details echoed back from the tech's own last withdrawal.
    expect(e.savedIban).toBe('JO94CBJO0010');
    expect(e.savedBankName).toBe('Arab Bank');
  });

  it('returns null saved bank details when the tech has no prior withdrawal with an IBAN', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', lastWithdrawalAt: null });
    mockedPrisma.payout.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
    mockedPrisma.withdrawalRequest.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
    mockedPrisma.withdrawalRequest.findFirst.mockResolvedValue(null);
    const e = await service.earnings('u1');
    expect(e.savedIban).toBeNull();
    expect(e.savedBankName).toBeNull();
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
    // earnings() (called inside requestWithdrawal) now also looks up the last
    // withdrawal for saved bank details — keep it resolvable in the balance path.
    mockedPrisma.withdrawalRequest.findFirst.mockResolvedValue(null);
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

describe('TechnicianService scorecard', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  function mockScorecardCounts(overrides: Partial<{
    arrivedTotal: number; onTime: number; completedTotal: number; guaranteeCount: number;
    bookingsTotal: number; upheldComplaints: number; offersTotal: number; offersAccepted: number;
  }> = {}) {
    const v = {
      arrivedTotal: 10, onTime: 8, completedTotal: 9, guaranteeCount: 1,
      bookingsTotal: 12, upheldComplaints: 1, offersTotal: 20, offersAccepted: 15,
      ...overrides,
    };
    mockedPrisma.booking.count
      .mockResolvedValueOnce(v.arrivedTotal)
      .mockResolvedValueOnce(v.completedTotal)
      .mockResolvedValueOnce(v.bookingsTotal);
    mockedPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(v.onTime) }]);
    mockedPrisma.guaranteeTicket.count.mockResolvedValueOnce(v.guaranteeCount);
    mockedPrisma.conductReport.count.mockResolvedValueOnce(v.upheldComplaints);
    mockedPrisma.dispatchOffer.count
      .mockResolvedValueOnce(v.offersTotal)
      .mockResolvedValueOnce(v.offersAccepted);
  }

  it('getMyScorecard throws NotFoundError when the technician has no profile', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
    await expect(service.getMyScorecard('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('computes on-time/redo/complaint/acceptance rates as percentages', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockScorecardCounts();

    const scorecard = await service.getMyScorecard('u1');

    expect(scorecard.onTimeRate).toBeCloseTo(80.0); // 8/10
    expect(scorecard.redoRate).toBeCloseTo(11.1, 1); // 1/9
    expect(scorecard.complaintRate).toBeCloseTo(8.3, 1); // 1/12
    expect(scorecard.acceptanceRate).toBeCloseTo(75.0); // 15/20
  });

  it('returns 0 rates (not NaN/Infinity) when the denominator is 0', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockScorecardCounts({ arrivedTotal: 0, onTime: 0, completedTotal: 0, guaranteeCount: 0, bookingsTotal: 0, upheldComplaints: 0, offersTotal: 0, offersAccepted: 0 });

    const scorecard = await service.getMyScorecard('u1');

    expect(scorecard.onTimeRate).toBe(0);
    expect(scorecard.redoRate).toBe(0);
    expect(scorecard.complaintRate).toBe(0);
    expect(scorecard.acceptanceRate).toBe(0);
  });

  it('getScorecardById resolves by TechnicianProfile id (admin path)', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockScorecardCounts();
    await service.getScorecardById('tp1');
    expect(mockedPrisma.technicianProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tp1' } }));
  });
});

describe('TechnicianService.getOrCreateNotificationPrefs / updateNotificationPrefs', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('throws NotFoundError when the technician has no profile', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
    await expect(service.getOrCreateNotificationPrefs('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('upserts a default (all-true) row on first read', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockedPrisma.technicianNotificationPrefs.upsert.mockResolvedValue({
      newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true,
    });
    const prefs = await service.getOrCreateNotificationPrefs('u1');
    expect(prefs).toEqual({ newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true });
    expect(mockedPrisma.technicianNotificationPrefs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { technicianId: 'tp1' }, create: { technicianId: 'tp1' } }),
    );
  });

  it('partially updates only the provided toggles', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockedPrisma.technicianNotificationPrefs.upsert.mockResolvedValue({
      newJobRequests: false, reminders: true, earningsUpdates: true, promotions: true,
    });
    const prefs = await service.updateNotificationPrefs('u1', { newJobRequests: false });
    expect(prefs.newJobRequests).toBe(false);
    expect(mockedPrisma.technicianNotificationPrefs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { newJobRequests: false }, create: { technicianId: 'tp1', newJobRequests: false } }),
    );
  });
});

describe('TechnicianService.getBankAccount / updateBankAccount', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('getBankAccount throws NotFoundError when the technician has no profile', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
    await expect(service.getBankAccount('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getBankAccount returns saved iban/bankName', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ bankIban: 'JO00', bankName: 'Arab Bank' });
    await expect(service.getBankAccount('u1')).resolves.toEqual({ iban: 'JO00', bankName: 'Arab Bank' });
  });

  it('updateBankAccount persists directly to the profile', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
    mockedPrisma.technicianProfile.update.mockResolvedValue({ bankIban: 'JO11', bankName: 'Housing Bank' });
    const result = await service.updateBankAccount('u1', 'JO11', 'Housing Bank');
    expect(result).toEqual({ iban: 'JO11', bankName: 'Housing Bank' });
    expect(mockedPrisma.technicianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tp1' }, data: { bankIban: 'JO11', bankName: 'Housing Bank' } }),
    );
  });

  it('requestWithdrawal falls back to the saved profile iban/bankName when omitted', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED', lastWithdrawalAt: null, bankIban: 'JO99', bankName: 'Cairo Amman Bank' });
    mockedPrisma.payout.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(500) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
    mockedPrisma.withdrawalRequest.aggregate
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } })
      .mockResolvedValueOnce({ _sum: { amountJod: D(0) } });
    mockedPrisma.withdrawalRequest.findFirst.mockResolvedValue(null);
    let capturedData: unknown;
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        withdrawalRequest: {
          create: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
            capturedData = data;
            return { id: 'w1', status: 'REQUESTED' };
          }),
        },
        technicianProfile: { update: jest.fn().mockResolvedValue({}) },
      }),
    );
    await service.requestWithdrawal('u1', 50);
    expect(capturedData).toEqual(expect.objectContaining({ iban: 'JO99', bankName: 'Cairo Amman Bank' }));
  });
});

describe('TechnicianService.updateServicesPricing', () => {
  let service: TechnicianService;
  beforeEach(() => { jest.clearAllMocks(); service = new TechnicianService(); });

  it('rejects when the technician is not APPROVED', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'PENDING' });
    await expect(service.updateServicesPricing('u1', ['s1'], 45)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when the technician has no profile', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
    await expect(service.updateServicesPricing('u1', ['s1'], 45)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a rate below 40', async () => {
    await expect(service.updateServicesPricing('u1', ['s1'], 30)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a rate above 60', async () => {
    await expect(service.updateServicesPricing('u1', ['s1'], 70)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an empty service list', async () => {
    await expect(service.updateServicesPricing('u1', [], 45)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an invalid/inactive service id', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED' });
    mockedPrisma.service.findMany.mockResolvedValue([{ id: 's1' }]); // only 1 of 2 valid
    await expect(service.updateServicesPricing('u1', ['s1', 's2'], 45)).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates hourly rate + services on the happy path', async () => {
    mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1', status: 'APPROVED' });
    mockedPrisma.service.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    mockedPrisma.technicianProfile.update.mockResolvedValue({ id: 'tp1', hourlyRateJod: D(50), services: [{ id: 's1' }, { id: 's2' }] });
    const result = await service.updateServicesPricing('u1', ['s1', 's2'], 50);
    expect(mockedPrisma.technicianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tp1' },
        data: { hourlyRateJod: 50, services: { set: [{ id: 's1' }, { id: 's2' }] } },
      }),
    );
    expect(result).not.toHaveProperty('nationalIdEnc');
  });
});

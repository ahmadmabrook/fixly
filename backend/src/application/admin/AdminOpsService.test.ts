import { AdminOpsService } from './AdminOpsService';
import { prisma } from '../../infrastructure/database/prisma';
import { ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    adminUser: { findUnique: jest.fn(), create: jest.fn() },
    dispatchOffer: { count: jest.fn() },
    booking: { count: jest.fn(), findMany: jest.fn() },
    conductReport: { count: jest.fn() },
    payment: { findMany: jest.fn() },
    guaranteeTicket: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  adminUser: { findUnique: jest.Mock; create: jest.Mock };
  dispatchOffer: { count: jest.Mock };
  booking: { count: jest.Mock; findMany: jest.Mock };
  conductReport: { count: jest.Mock };
  payment: { findMany: jest.Mock };
  guaranteeTicket: { findMany: jest.Mock };
  user: { findMany: jest.Mock };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

describe('AdminOpsService admin-user management guards', () => {
  let service: AdminOpsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService();
  });

  it('rejects creating an admin with a password under 12 chars (before any DB call)', async () => {
    await expect(service.createAdmin('x@y.z', 'short', 'Name', 'OPS', 'actor')).rejects.toBeInstanceOf(ConflictError);
    expect(mockedPrisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects creating an admin whose email already exists', async () => {
    mockedPrisma.adminUser.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.createAdmin('x@y.z', 'a-strong-password-123', 'Name', 'OPS', 'actor')).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to let an admin disable their own account (lockout guard)', async () => {
    await expect(service.setAdminActive('me', false, 'me')).rejects.toBeInstanceOf(ConflictError);
    // Guard fires before opening a transaction.
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AdminOpsService.getOperationalStats', () => {
  let service: AdminOpsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService();
  });

  function mockCounts(overrides: Partial<{
    offersTotal: number; offersAccepted: number; bookingsTotal: number; bookingsCancelled: number;
    completedTotal: number; upheldComplaints: number;
  }> = {}) {
    const v = {
      offersTotal: 40, offersAccepted: 30, bookingsTotal: 50, bookingsCancelled: 5,
      completedTotal: 35, upheldComplaints: 2,
      ...overrides,
    };
    mockedPrisma.dispatchOffer.count
      .mockResolvedValueOnce(v.offersTotal)
      .mockResolvedValueOnce(v.offersAccepted);
    mockedPrisma.$queryRaw
      .mockResolvedValueOnce([{ avg_seconds: 120.5 }]) // time-to-assign
      .mockResolvedValueOnce([{ avg_seconds: 300.2 }]) // arrival delay
      .mockResolvedValueOnce([{ total: BigInt(10), repeat: BigInt(3) }]); // repeat-booking
    mockedPrisma.booking.count
      .mockResolvedValueOnce(v.bookingsTotal)
      .mockResolvedValueOnce(v.bookingsCancelled)
      .mockResolvedValueOnce(v.completedTotal);
    mockedPrisma.conductReport.count.mockResolvedValueOnce(v.upheldComplaints);
  }

  it('clamps windowDays to the 1-90 bound', async () => {
    mockCounts();
    const stats = await service.getOperationalStats(365);
    expect(stats.windowDays).toBe(90);
  });

  it('defaults an unset windowDays to at least 1', async () => {
    mockCounts();
    const stats = await service.getOperationalStats(0);
    expect(stats.windowDays).toBe(1);
  });

  it('computes acceptance/cancellation/complaint/repeat-booking rates as percentages', async () => {
    mockCounts();
    const stats = await service.getOperationalStats(30);

    expect(stats.acceptanceRate).toBeCloseTo(75.0); // 30/40
    expect(stats.cancellationRate).toBeCloseTo(10.0); // 5/50
    expect(stats.complaintRate).toBeCloseTo(5.7, 1); // 2/35
    expect(stats.repeatBookingRate).toBeCloseTo(30.0); // 3/10
    expect(stats.avgTimeToAssignSeconds).toBe(121); // rounded
    expect(stats.avgArrivalDelaySeconds).toBe(300); // rounded
  });

  it('returns null averages (not NaN) when there is no data in the window', async () => {
    mockedPrisma.dispatchOffer.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockedPrisma.$queryRaw
      .mockResolvedValueOnce([{ avg_seconds: null }])
      .mockResolvedValueOnce([{ avg_seconds: null }])
      .mockResolvedValueOnce([{ total: BigInt(0), repeat: BigInt(0) }]);
    mockedPrisma.booking.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockedPrisma.conductReport.count.mockResolvedValueOnce(0);

    const stats = await service.getOperationalStats(30);

    expect(stats.avgTimeToAssignSeconds).toBeNull();
    expect(stats.avgArrivalDelaySeconds).toBeNull();
    expect(stats.acceptanceRate).toBe(0);
    expect(stats.cancellationRate).toBe(0);
    expect(stats.complaintRate).toBe(0);
    expect(stats.repeatBookingRate).toBe(0);
  });
});

describe('AdminOpsService.getAtRiskOrders', () => {
  let service: AdminOpsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService();
  });

  it('splits results into late (past SLA, not yet arrived) and unassigned (no tech past the grace period)', async () => {
    const lateBooking = { id: 'late-1', status: 'EN_ROUTE', slaArriveBy: new Date(Date.now() - 60_000) };
    const unassignedBooking = { id: 'pending-1', status: 'PENDING', createdAt: new Date(Date.now() - 20 * 60_000) };
    mockedPrisma.booking.findMany
      .mockResolvedValueOnce([lateBooking])
      .mockResolvedValueOnce([unassignedBooking]);

    const { items, total } = await service.getAtRiskOrders(50);

    expect(total).toBe(2);
    expect(items).toEqual([
      { ...lateBooking, riskType: 'late' },
      { ...unassignedBooking, riskType: 'unassigned' },
    ]);

    // "late" query: active statuses, technician assigned, slaArriveBy passed, not yet arrived.
    const lateArgs = mockedPrisma.booking.findMany.mock.calls[0][0];
    expect(lateArgs.where).toEqual(
      expect.objectContaining({
        status: { in: ['PENDING', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] },
        technicianId: { not: null },
        arrivedAt: null,
      }),
    );

    // "unassigned" query: still PENDING, no technician, older than the grace period.
    const unassignedArgs = mockedPrisma.booking.findMany.mock.calls[1][0];
    expect(unassignedArgs.where).toEqual(
      expect.objectContaining({ status: 'PENDING', technicianId: null }),
    );
  });

  it('clamps the limit to the [1, 200] range', async () => {
    mockedPrisma.booking.findMany.mockResolvedValue([]);
    await service.getAtRiskOrders(9999);
    expect(mockedPrisma.booking.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('returns an empty result when nothing is at risk', async () => {
    mockedPrisma.booking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { items, total } = await service.getAtRiskOrders();
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});

describe('AdminOpsService.getActivityFeed', () => {
  let service: AdminOpsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService();
  });

  it('merges booking/payment/guarantee/customer events, sorted by time descending, capped at limit', async () => {
    const now = Date.now();
    mockedPrisma.booking.findMany.mockResolvedValue([
      { id: 'b1', status: 'CONFIRMED', updatedAt: new Date(now - 1000) },
    ]);
    mockedPrisma.payment.findMany.mockResolvedValue([
      { id: 'p1', bookingId: 'b2', capturedAt: new Date(now - 5000) },
    ]);
    mockedPrisma.guaranteeTicket.findMany.mockResolvedValue([
      { id: 'g1', createdAt: new Date(now - 2000) },
    ]);
    mockedPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'سارة', createdAt: new Date(now) }, // most recent
    ]);

    const feed = await service.getActivityFeed(20);

    expect(feed).toHaveLength(4);
    // Sorted newest-first: new_customer (now), booking (now-1000), guarantee (now-2000), payment (now-5000).
    expect(feed.map((e) => e.type)).toEqual(['new_customer', 'booking_status', 'guarantee_opened', 'payment_captured']);
    expect(feed[0].message).toContain('سارة');
    expect(feed[1].message).toContain('#b1'.slice(0, 3)); // sanity: booking id fragment present
  });

  it('skips booking statuses with no configured activity message (e.g. AWAITING_PAYMENT)', async () => {
    mockedPrisma.booking.findMany.mockResolvedValue([
      { id: 'b1', status: 'AWAITING_PAYMENT', updatedAt: new Date() },
      { id: 'b2', status: 'PENDING', updatedAt: new Date() },
    ]);
    mockedPrisma.payment.findMany.mockResolvedValue([]);
    mockedPrisma.guaranteeTicket.findMany.mockResolvedValue([]);
    mockedPrisma.user.findMany.mockResolvedValue([]);

    const feed = await service.getActivityFeed(20);
    expect(feed).toEqual([]);
  });

  it('clamps the limit to the [1, 100] range and slices the merged result', async () => {
    mockedPrisma.booking.findMany.mockResolvedValue([]);
    mockedPrisma.payment.findMany.mockResolvedValue([]);
    mockedPrisma.guaranteeTicket.findMany.mockResolvedValue([]);
    mockedPrisma.user.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, name: null, createdAt: new Date(Date.now() - i * 1000) })),
    );

    const feed = await service.getActivityFeed(2);
    expect(feed).toHaveLength(2);
    expect(mockedPrisma.user.findMany.mock.calls[0][0].take).toBe(2);
  });
});

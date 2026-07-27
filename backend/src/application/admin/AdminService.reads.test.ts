import { Prisma } from '@prisma/client';
import { getAdminStats } from './AdminService.reads';
import { prisma } from '../../infrastructure/database/prisma';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    booking: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    technicianProfile: { count: jest.fn(), aggregate: jest.fn() },
    guaranteeTicket: { count: jest.fn() },
    payout: { count: jest.fn() },
    serviceCredit: { aggregate: jest.fn() },
    service: { findMany: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  booking: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
  technicianProfile: { count: jest.Mock; aggregate: jest.Mock };
  guaranteeTicket: { count: jest.Mock };
  payout: { count: jest.Mock };
  serviceCredit: { aggregate: jest.Mock };
  service: { findMany: jest.Mock };
};

describe('getAdminStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.booking.count.mockResolvedValue(0);
    mocked.booking.aggregate.mockResolvedValue({ _sum: { totalJod: null } });
    mocked.booking.groupBy.mockResolvedValue([]);
    mocked.technicianProfile.count.mockResolvedValue(0);
    mocked.technicianProfile.aggregate.mockResolvedValue({ _avg: { rating: null } });
    mocked.guaranteeTicket.count.mockResolvedValue(0);
    mocked.payout.count.mockResolvedValue(0);
    mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: null } });
    mocked.service.findMany.mockResolvedValue([]);
  });

  it('reports 0 outstanding credits when the ledger has no rows', async () => {
    const stats = await getAdminStats();
    expect(stats.totalOutstandingCreditsJod).toBe(0);
  });

  it('nets platform-wide outstanding credits from the signed SUM(amountJod) — grants minus redemptions', async () => {
    // e.g. 3 grants of 20 minus a 15 redemption nets to 45, not the gross 60.
    mocked.serviceCredit.aggregate.mockResolvedValue({ _sum: { amountJod: new Prisma.Decimal('45') } });
    const stats = await getAdminStats();
    expect(stats.totalOutstandingCreditsJod).toBe(45);
    expect(mocked.serviceCredit.aggregate).toHaveBeenCalledWith({ _sum: { amountJod: true } });
  });
});

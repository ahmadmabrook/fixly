import { BookingStatus, VerificationStatus, ReadinessState } from '@prisma/client';
import { CategoryReadinessService } from './CategoryReadinessService';
import { prisma } from '../../infrastructure/database/prisma';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    bookingQuote: { findMany: jest.fn() },
    categoryReadinessGate: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const mocked = prisma as unknown as {
  bookingQuote: { findMany: jest.Mock };
  categoryReadinessGate: { findUnique: jest.Mock; upsert: jest.Mock };
};

function executedQuote(opts: { labourFils?: number; materialsFils?: number; totalJod?: number; status?: BookingStatus; verificationStatuses?: VerificationStatus[] } = {}) {
  return {
    labourFils: opts.labourFils ?? 40_000,
    materialsFils: opts.materialsFils ?? 20_000,
    booking: {
      status: opts.status ?? BookingStatus.COMPLETED,
      totalJod: opts.totalJod ?? 60, // 60 JOD = 60000 fils, matches estimate exactly by default
      verificationRequests: (opts.verificationStatuses ?? []).map((status) => ({ status })),
    },
  };
}

describe('CategoryReadinessService.recomputeForService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays COLLECTING below the quotesRequired threshold even with perfect quotes', async () => {
    mocked.bookingQuote.findMany.mockResolvedValue([executedQuote(), executedQuote()]);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue(null);
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.create }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.quotesClosed).toBe(2);
    expect(result.disputeBps).toBe(0);
    expect(result.priceDeviationBps).toBe(0);
    expect(result.state).toBe(ReadinessState.COLLECTING);
  });

  it('promotes to READY once quotesClosed/disputeBps/priceDeviationBps all clear their thresholds', async () => {
    const quotes = Array.from({ length: 50 }, () => executedQuote());
    mocked.bookingQuote.findMany.mockResolvedValue(quotes);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue({
      quotesRequired: 50, maxDisputeBps: 800, maxPriceDeviationBps: 1500, state: ReadinessState.COLLECTING, openedAt: null,
    });
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.update }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.quotesClosed).toBe(50);
    expect(result.state).toBe(ReadinessState.READY);
    expect(mocked.categoryReadinessGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ openedAt: expect.any(Date) }) }),
    );
  });

  it('counts a DEDUCTED verification request (confirmed overcharge) as disputed, lowering quotesClosed and raising disputeBps', async () => {
    const quotes = [
      ...Array.from({ length: 9 }, () => executedQuote()),
      executedQuote({ verificationStatuses: [VerificationStatus.DEDUCTED] }),
    ];
    mocked.bookingQuote.findMany.mockResolvedValue(quotes);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue(null);
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.create }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.quotesClosed).toBe(9); // 10 executed - 1 disputed
    expect(result.disputeBps).toBe(1000); // 1/10 = 10%
  });

  it('does NOT count an UPHELD (cleared) verification request as disputed', async () => {
    const quotes = [executedQuote({ verificationStatuses: [VerificationStatus.UPHELD] })];
    mocked.bookingQuote.findMany.mockResolvedValue(quotes);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue(null);
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.create }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.quotesClosed).toBe(1);
    expect(result.disputeBps).toBe(0);
  });

  it('computes priceDeviationBps from |final - estimated| / estimated', async () => {
    // estimated 60 JOD, final 66 JOD -> 10% deviation = 1000 bps
    mocked.bookingQuote.findMany.mockResolvedValue([executedQuote({ totalJod: 66 })]);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue(null);
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.create }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.priceDeviationBps).toBe(1000);
  });

  it('never demotes an already-READY gate back to COLLECTING', async () => {
    mocked.bookingQuote.findMany.mockResolvedValue([]); // 0 executed this round — numbers would otherwise fail every threshold
    mocked.categoryReadinessGate.findUnique.mockResolvedValue({
      quotesRequired: 50, maxDisputeBps: 800, maxPriceDeviationBps: 1500, state: ReadinessState.READY, openedAt: new Date('2026-01-01'),
    });
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.update }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.state).toBe(ReadinessState.READY);
    // openedAt must not be touched a second time.
    expect(mocked.categoryReadinessGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.not.objectContaining({ openedAt: expect.anything() }) }),
    );
  });

  it('never auto-promotes a BLOCKED gate even when thresholds are met', async () => {
    const quotes = Array.from({ length: 50 }, () => executedQuote());
    mocked.bookingQuote.findMany.mockResolvedValue(quotes);
    mocked.categoryReadinessGate.findUnique.mockResolvedValue({
      quotesRequired: 50, maxDisputeBps: 800, maxPriceDeviationBps: 1500, state: ReadinessState.BLOCKED, openedAt: null,
    });
    mocked.categoryReadinessGate.upsert.mockImplementation((args) => Promise.resolve({ serviceId: 's1', ...args.update }));

    const svc = new CategoryReadinessService();
    const result = await svc.recomputeForService('s1');

    expect(result.state).toBe(ReadinessState.BLOCKED);
  });
});

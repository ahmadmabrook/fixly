import { Prisma } from '@prisma/client';
import { BookingQuoteService } from './BookingQuoteService';
import type { BookingService } from '../booking/BookingService';
import type { MaterialCatalogService } from '../materials/MaterialCatalogService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    bookingQuote: { findUnique: jest.fn(), update: jest.fn() },
    quoteLine: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({}) },
    // §17.5.8 computed labour pricing — findFirst resolves null (no rate
    // card) by default, so existing tests that don't care about this new
    // path keep using the assessor-typed unitPriceFils unchanged.
    serviceRateCard: { findFirst: jest.fn().mockResolvedValue(null) },
    serviceMaterialPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));

const mocked = prisma as unknown as {
  bookingQuote: { findUnique: jest.Mock; update: jest.Mock };
  quoteLine: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
  serviceRateCard: { findFirst: jest.Mock };
  serviceMaterialPolicy: { findUnique: jest.Mock };
};

// Mirrors DispatchService.test.ts's makeIo helper.
function makeIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { io: { to } as unknown as import('socket.io').Server, to, emit };
}

function makeService(
  createBooking = jest.fn().mockResolvedValue({ id: 'b1', totalJod: new Prisma.Decimal(40) }),
  catalogGet = jest.fn(),
  assertPriceBand = jest.fn(),
  io?: import('socket.io').Server,
) {
  const bookingStub = { createBooking } as unknown as BookingService;
  const catalogStub = { get: catalogGet, assertPriceBand } as unknown as MaterialCatalogService;
  return { svc: new BookingQuoteService(bookingStub, catalogStub, io), createBooking, catalogGet, assertPriceBand };
}

const future = () => new Date(Date.now() + 3 * 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

describe('BookingQuoteService.setQuote (§17.5.3/§17.5.12 live push)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits quote:ready to the customer room in addition to the existing inbox notification', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', customerId: 'c1' });
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', status: 'QUOTED' });
    const { emit, to, io } = makeIo();
    const { svc } = makeService(undefined, undefined, undefined, io);

    await svc.setQuote('q1', 'admin1', 25);

    expect(to).toHaveBeenCalledWith('user:c1');
    expect(emit).toHaveBeenCalledWith('quote:ready', { quoteId: 'q1', customerId: 'c1' });
  });

  it('does not throw when no io was injected (route-level singleton constructed before main.ts wires the socket server)', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', customerId: 'c1' });
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', status: 'QUOTED' });
    const { svc } = makeService(); // no io
    await expect(svc.setQuote('q1', 'admin1', 25)).resolves.toBeDefined();
  });
});

describe('BookingQuoteService.accept', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError when the quote is missing', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue(null);
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids a non-owner', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'other', status: 'QUOTED', quotedJod: new Prisma.Decimal(40), expiresAt: future(), lines: [] });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a quote that is not in QUOTED state', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'c1', status: 'PENDING', quotedJod: null, expiresAt: future(), lines: [] });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('expires an overdue quote and refuses it', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'c1', status: 'QUOTED', quotedJod: new Prisma.Decimal(40), expiresAt: past(), lines: [] });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ConflictError);
    expect(mocked.bookingQuote.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
  });

  it('creates a booking at the firm quoted price and links it (video pre-check path, no lines)', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', customerId: 'c1', serviceId: 's1', status: 'QUOTED',
      quotedJod: new Prisma.Decimal(40), addressLine: 'Amman', addressLat: 31.9, addressLng: 35.9, expiresAt: future(), lines: [],
    });
    mocked.bookingQuote.update.mockResolvedValue({});
    const { svc, createBooking } = makeService();

    const booking = await svc.accept('q1', 'c1');

    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c1', serviceId: 's1', priceOverrideJod: expect.anything() }),
    );
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty('labourFils');
    expect(mocked.bookingQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED', bookingId: 'b1' } }),
    );
    expect(booking).toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('passes the labour/materials split for an itemized quote_first quote', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', customerId: 'c1', serviceId: 's1', status: 'QUOTED',
      quotedJod: new Prisma.Decimal(105), addressLine: 'Amman', addressLat: 31.9, addressLng: 35.9, expiresAt: future(),
      labourFils: 45_000, materialsFils: 60_000,
      lines: [{ id: 'l1', kind: 'LABOUR', totalFils: 45_000 }, { id: 'l2', kind: 'MATERIAL', totalFils: 60_000 }],
    });
    mocked.bookingQuote.update.mockResolvedValue({});
    const { svc, createBooking } = makeService();

    await svc.accept('q1', 'c1');

    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ labourFils: 45_000, materialsFils: 60_000 }),
    );
  });
});

describe('BookingQuoteService.addLine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a material line priced outside the catalog band', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING' });
    const { svc, catalogGet, assertPriceBand } = makeService();
    catalogGet.mockResolvedValue({ priceMinFils: 10_000, priceMaxFils: 20_000 });
    assertPriceBand.mockImplementation(() => { throw new ValidationError('out of band'); });

    await expect(
      svc.addLine('q1', { kind: 'MATERIAL' as never, materialId: 'm1', description: 'Paint', unitPriceFils: 99_000 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocked.quoteLine.create).not.toHaveBeenCalled();
  });

  it('rejects adding a line to a quote that is no longer PENDING', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'QUOTED' });
    const { svc } = makeService();
    await expect(
      svc.addLine('q1', { kind: 'LABOUR' as never, description: 'Labour', unitPriceFils: 45_000 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a labour line without a catalog check and recomputes totals', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING' });
    mocked.quoteLine.create.mockResolvedValue({});
    mocked.quoteLine.findMany.mockResolvedValue([{ kind: 'LABOUR', totalFils: 45_000 }]);
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', labourFils: 45_000, materialsFils: 0 });
    const { svc, catalogGet } = makeService();

    const result = await svc.addLine('q1', { kind: 'LABOUR' as never, description: 'Room painting, 2 coats', unitPriceFils: 45_000 });

    expect(catalogGet).not.toHaveBeenCalled();
    expect(mocked.quoteLine.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalFils: 45_000 }) }));
    expect(result).toEqual(expect.objectContaining({ labourFils: 45_000 }));
  });

  it('overrides an assessor-typed labour price with the tier rate card, when one exists (§17.5.8)', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', serviceId: 'svc1', requestedTier: 'STANDARD' });
    mocked.serviceRateCard.findFirst.mockResolvedValue({ rateFils: 8000 });
    mocked.quoteLine.create.mockResolvedValue({});
    mocked.quoteLine.findMany.mockResolvedValue([{ kind: 'LABOUR', totalFils: 40_000 }]);
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', labourFils: 40_000, materialsFils: 0 });
    const { svc } = makeService();

    // Assessor types 45,000 fils/m²; the rate card says 8,000/m² — the card wins.
    await svc.addLine('q1', { kind: 'LABOUR' as never, description: 'Room painting, 5m²', qty: 5, unitPriceFils: 45_000 });

    expect(mocked.serviceRateCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ serviceId: 'svc1', tier: 'STANDARD' }) }),
    );
    expect(mocked.quoteLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitPriceFils: 8000, totalFils: 40_000 }) }),
    );
  });

  it('rejects a material line backed by an unconfirmed catalog price (§17.5.13(c))', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', serviceId: 'svc1' });
    const { svc, catalogGet, assertPriceBand } = makeService(
      undefined,
      jest.fn().mockResolvedValue({ priceMinFils: 100, priceMaxFils: 500, priceConfidence: 'ESTIMATED' }),
      jest.fn(),
    );
    await expect(
      svc.addLine('q1', { kind: 'MATERIAL' as never, materialId: 'mat1', description: 'Paint', unitPriceFils: 300 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(catalogGet).toHaveBeenCalled();
    expect(assertPriceBand).toHaveBeenCalled();
    expect(mocked.quoteLine.create).not.toHaveBeenCalled();
  });
});

describe('BookingQuoteService.sendItemizedQuote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses to send a quote with no lines', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', status: 'PENDING', lines: [] });
    const { svc } = makeService();
    await expect(svc.sendItemizedQuote('q1', 'admin1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires ops review above the review threshold before sending', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', status: 'PENDING', customerId: 'c1', labourFils: 20_000, materialsFils: 20_000, opsReviewedAt: null,
      lines: [{ kind: 'LABOUR', materialId: null }],
    });
    const { svc } = makeService();
    // 40_000 fils total >= default OPS_REVIEW_THRESHOLD_FILS (30_000) and opsReviewedAt is null.
    await expect(svc.sendItemizedQuote('q1', 'admin1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('sends a small, catalog-only quote without requiring ops review', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', status: 'PENDING', customerId: 'c1', labourFils: 5_000, materialsFils: 5_000, opsReviewedAt: null,
      lines: [{ kind: 'LABOUR', materialId: null }, { kind: 'MATERIAL', materialId: 'm1' }],
    });
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', status: 'QUOTED' });
    const { svc } = makeService();

    const result = await svc.sendItemizedQuote('q1', 'admin1');

    expect(mocked.bookingQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'QUOTED', quotedById: 'admin1' }) }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'QUOTED' }));
  });

  it('emits quote:ready to the customer room on send', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', status: 'PENDING', customerId: 'c1', labourFils: 5_000, materialsFils: 5_000, opsReviewedAt: null,
      lines: [{ kind: 'LABOUR', materialId: null }],
    });
    mocked.bookingQuote.update.mockResolvedValue({ id: 'q1', status: 'QUOTED' });
    const { emit, to, io } = makeIo();
    const { svc } = makeService(undefined, undefined, undefined, io);

    await svc.sendItemizedQuote('q1', 'admin1');

    expect(to).toHaveBeenCalledWith('user:c1');
    expect(emit).toHaveBeenCalledWith('quote:ready', { quoteId: 'q1', customerId: 'c1' });
  });
});

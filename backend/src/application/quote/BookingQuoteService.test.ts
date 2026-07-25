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
  },
}));

const mocked = prisma as unknown as {
  bookingQuote: { findUnique: jest.Mock; update: jest.Mock };
  quoteLine: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
};

function makeService(
  createBooking = jest.fn().mockResolvedValue({ id: 'b1', totalJod: new Prisma.Decimal(40) }),
  catalogGet = jest.fn(),
  assertPriceBand = jest.fn(),
) {
  const bookingStub = { createBooking } as unknown as BookingService;
  const catalogStub = { get: catalogGet, assertPriceBand } as unknown as MaterialCatalogService;
  return { svc: new BookingQuoteService(bookingStub, catalogStub), createBooking, catalogGet, assertPriceBand };
}

const future = () => new Date(Date.now() + 3 * 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

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
});

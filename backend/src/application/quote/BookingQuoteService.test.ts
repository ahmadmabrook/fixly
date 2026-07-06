import { Prisma } from '@prisma/client';
import { BookingQuoteService } from './BookingQuoteService';
import type { BookingService } from '../booking/BookingService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    bookingQuote: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  bookingQuote: { findUnique: jest.Mock; update: jest.Mock };
};

function makeService(createBooking = jest.fn().mockResolvedValue({ id: 'b1', totalJod: new Prisma.Decimal(40) })) {
  const bookingStub = { createBooking } as unknown as BookingService;
  return { svc: new BookingQuoteService(bookingStub), createBooking };
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
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'other', status: 'QUOTED', quotedJod: new Prisma.Decimal(40), expiresAt: future() });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a quote that is not in QUOTED state', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'c1', status: 'PENDING', quotedJod: null, expiresAt: future() });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('expires an overdue quote and refuses it', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({ id: 'q1', customerId: 'c1', status: 'QUOTED', quotedJod: new Prisma.Decimal(40), expiresAt: past() });
    const { svc } = makeService();
    await expect(svc.accept('q1', 'c1')).rejects.toBeInstanceOf(ConflictError);
    expect(mocked.bookingQuote.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
  });

  it('creates a booking at the firm quoted price and links it', async () => {
    mocked.bookingQuote.findUnique.mockResolvedValue({
      id: 'q1', customerId: 'c1', serviceId: 's1', status: 'QUOTED',
      quotedJod: new Prisma.Decimal(40), addressLine: 'Amman', addressLat: 31.9, addressLng: 35.9, expiresAt: future(),
    });
    mocked.bookingQuote.update.mockResolvedValue({});
    const { svc, createBooking } = makeService();

    const booking = await svc.accept('q1', 'c1');

    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c1', serviceId: 's1', priceOverrideJod: expect.anything() }),
    );
    expect(mocked.bookingQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED', bookingId: 'b1' } }),
    );
    expect(booking).toEqual(expect.objectContaining({ id: 'b1' }));
  });
});

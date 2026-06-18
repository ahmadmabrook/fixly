import { ReviewService } from './ReviewService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    booking: { findUnique: jest.fn() },
    review: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  booking: { findUnique: jest.Mock };
  review: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const completedBooking = {
  id: 'bk1',
  status: 'COMPLETED',
  customerId: 'cust1',
  technician: { id: 'tp1', userId: 'tech1' },
};

describe('ReviewService.submitReview', () => {
  let service: ReviewService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewService();
    mockedPrisma.review.findUnique.mockResolvedValue(null); // no prior review by default
  });

  it('rejects a rating outside 1–5 before touching the DB', async () => {
    await expect(service.submitReview({ bookingId: 'bk1', reviewerId: 'cust1', rating: 6 })).rejects.toBeInstanceOf(ValidationError);
    expect(mockedPrisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFound when the booking does not exist', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(null);
    await expect(service.submitReview({ bookingId: 'bk1', reviewerId: 'cust1', rating: 5 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects reviewing a non-completed booking', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue({ ...completedBooking, status: 'IN_PROGRESS' });
    await expect(service.submitReview({ bookingId: 'bk1', reviewerId: 'cust1', rating: 5 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('forbids a non-party from reviewing', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(completedBooking);
    await expect(service.submitReview({ bookingId: 'bk1', reviewerId: 'stranger', rating: 5 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a duplicate review for the same booking+reviewer', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(completedBooking);
    mockedPrisma.review.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.submitReview({ bookingId: 'bk1', reviewerId: 'cust1', rating: 5 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('on a customer→technician review, creates it and recomputes the technician aggregate', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(completedBooking);
    const review = { id: 'rv1' };
    const txUpdate = jest.fn().mockResolvedValue({});
    const txAggregate = jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: { rating: 2 } });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        review: { create: jest.fn().mockResolvedValue(review), aggregate: txAggregate },
        technicianProfile: { update: txUpdate },
      }),
    );
    const result = await service.submitReview({ bookingId: 'bk1', reviewerId: 'cust1', rating: 5, comment: 'great' });
    expect(result).toBe(review);
    expect(txAggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { revieweeId: 'tech1' } }));
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tp1' },
      data: expect.objectContaining({ totalReviews: 2 }),
    }));
  });

  it('on a technician→customer review, does NOT recompute an aggregate', async () => {
    mockedPrisma.booking.findUnique.mockResolvedValue(completedBooking);
    const txAggregate = jest.fn();
    const txUpdate = jest.fn();
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        review: { create: jest.fn().mockResolvedValue({ id: 'rv2' }), aggregate: txAggregate },
        technicianProfile: { update: txUpdate },
      }),
    );
    await service.submitReview({ bookingId: 'bk1', reviewerId: 'tech1', rating: 4 });
    expect(txAggregate).not.toHaveBeenCalled();
    expect(txUpdate).not.toHaveBeenCalled();
  });
});

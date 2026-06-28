import { BookingService } from './BookingService';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../shared/errors';
import { paymentRequiresHostedCheckout } from '../../shared/env';

jest.mock('../../infrastructure/cache/redis', () => ({
  redis: { set: jest.fn(), del: jest.fn() },
}));

// Keep real env/loadEnv; only stub the payment-mode flag so we can exercise both branches.
jest.mock('../../shared/env', () => ({
  ...jest.requireActual('../../shared/env'),
  paymentRequiresHostedCheckout: jest.fn(() => false),
}));

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    service: { findUnique: jest.fn() },
    booking: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    technicianProfile: { findUnique: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedHosted = paymentRequiresHostedCheckout as jest.Mock;
const mockedPrisma = prisma as unknown as {
  service: { findUnique: jest.Mock };
  booking: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  technicianProfile: { findUnique: jest.Mock };
  outboxEvent: { create: jest.Mock };
  $transaction: jest.Mock;
};

describe('BookingService', () => {
  let service: BookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedHosted.mockReturnValue(false); // default to instant mode; hosted tests opt in
    service = new BookingService();
  });

  describe('createBooking', () => {
    const input = {
      customerId: 'c1',
      serviceId: 's1',
      addressLine: 'Amman',
      addressLat: 31.95,
      addressLng: 35.93,
    };

    it('throws NotFoundError when the service does not exist', async () => {
      mockedPrisma.service.findUnique.mockResolvedValue(null);
      await expect(service.createBooking(input)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError when the service is inactive', async () => {
      mockedPrisma.service.findUnique.mockResolvedValue({ id: 's1', priceJod: 20, isActive: false });
      await expect(service.createBooking(input)).rejects.toBeInstanceOf(ValidationError);
    });


    it('writes booking + outbox event atomically in one transaction', async () => {
      mockedPrisma.service.findUnique.mockResolvedValue({ id: 's1', priceJod: 20, isActive: true });
      const tx = {
        booking: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

      const result = await service.createBooking(input);

      expect(tx.booking.create).toHaveBeenCalled();
      expect(tx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.created' }) }),
      );
      expect(result).toEqual({ id: 'b1' });
    });

    it('hosted checkout: starts AWAITING_PAYMENT and does NOT emit booking.created yet', async () => {
      mockedHosted.mockReturnValue(true);
      mockedPrisma.service.findUnique.mockResolvedValue({ id: 's1', priceJod: 20, isActive: true });
      const tx = {
        booking: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

      await service.createBooking(input);

      expect(tx.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'AWAITING_PAYMENT' }) }),
      );
      expect(tx.outboxEvent.create).not.toHaveBeenCalled(); // emitted only on authorization
    });
  });

  describe('expireUnpaidBookings', () => {
    it('cancels AWAITING_PAYMENT bookings older than the TTL in one set-based update', async () => {
      mockedPrisma.booking.updateMany.mockResolvedValue({ count: 2 });
      const cancelled = await service.expireUnpaidBookings(30);
      expect(cancelled).toBe(2);
      expect(mockedPrisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'AWAITING_PAYMENT', createdAt: { lt: expect.any(Date) } }),
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });
  });

  describe('accept', () => {
    it('rejects when the distributed lock is already held', async () => {
      mockedRedis.set.mockResolvedValue(null); // SETNX failed
      await expect(service.accept('b1', 'tech-user')).rejects.toBeInstanceOf(ConflictError);
    });

    it('releases the lock even when the booking is no longer pending', async () => {
      mockedRedis.set.mockResolvedValue('OK');
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { findUnique: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }), update: jest.fn() } }),
      );

      await expect(service.accept('b1', 'tech-user')).rejects.toBeInstanceOf(ConflictError);
      expect(mockedRedis.del).toHaveBeenCalledWith('booking_lock:b1');
    });

    // Helper: a tx where dispatchOffer.findUnique returns `offer`; captures the
    // booking.update / dispatchOffer.update(s) / outbox spies for assertions.
    function acceptTx(fresh: Record<string, unknown>, offer: Record<string, unknown> | null) {
      const bookingUpdate = jest.fn().mockResolvedValue({ id: 'b1', status: 'CONFIRMED', technicianId: 'tp1' });
      const offerUpdate = jest.fn().mockResolvedValue({});
      const offerUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const outboxCreate = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({
          booking: { findUnique: jest.fn().mockResolvedValue(fresh), update: bookingUpdate },
          dispatchOffer: { findUnique: jest.fn().mockResolvedValue(offer), update: offerUpdate, updateMany: offerUpdateMany },
          outboxEvent: { create: outboxCreate },
        }),
      );
      return { bookingUpdate, offerUpdate, offerUpdateMany, outboxCreate };
    }

    it('rejects with ConflictError when the tech has NO offer for this booking', async () => {
      mockedRedis.set.mockResolvedValue('OK');
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      const { bookingUpdate } = acceptTx({ id: 'b1', status: 'PENDING', version: 2, customerId: 'c1' }, null);

      await expect(service.accept('b1', 'tech-user')).rejects.toBeInstanceOf(ConflictError);
      expect(bookingUpdate).not.toHaveBeenCalled();
      expect(mockedRedis.del).toHaveBeenCalledWith('booking_lock:b1'); // lock still released
    });

    it('rejects with ConflictError when the offer is no longer OFFERED (e.g. SUPERSEDED/EXPIRED)', async () => {
      mockedRedis.set.mockResolvedValue('OK');
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      const { bookingUpdate } = acceptTx(
        { id: 'b1', status: 'PENDING', version: 2, customerId: 'c1' },
        { id: 'o1', status: 'SUPERSEDED', offeredAt: new Date() },
      );

      await expect(service.accept('b1', 'tech-user')).rejects.toBeInstanceOf(ConflictError);
      expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it('accepts with an active OFFERED offer: marks it ACCEPTED, supersedes siblings, CONFIRMS booking, clears expiry, emits booking.confirmed', async () => {
      mockedRedis.set.mockResolvedValue('OK');
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      const { bookingUpdate, offerUpdate, offerUpdateMany, outboxCreate } = acceptTx(
        { id: 'b1', status: 'PENDING', version: 2, customerId: 'c1' },
        { id: 'o1', status: 'OFFERED', offeredAt: new Date(Date.now() - 30_000) },
      );

      const result = await service.accept('b1', 'tech-user');

      // The winning offer is marked ACCEPTED.
      expect(offerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1' }, data: expect.objectContaining({ status: 'ACCEPTED' }) }),
      );
      // Sibling OFFERED offers (not this one) are SUPERSEDED.
      expect(offerUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bookingId: 'b1', status: 'OFFERED', id: { not: 'o1' } }),
          data: { status: 'SUPERSEDED' },
        }),
      );
      // Booking → CONFIRMED, under the version guard, with dispatchExpiresAt cleared.
      expect(bookingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', version: 2 },
          data: expect.objectContaining({ technicianId: 'tp1', status: 'CONFIRMED', dispatchExpiresAt: null }),
        }),
      );
      expect(outboxCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.confirmed' }) }));
      expect(result).toMatchObject({ status: 'CONFIRMED' });
      expect(mockedRedis.del).toHaveBeenCalledWith('booking_lock:b1');
    });
  });

  describe('advanceStatus', () => {
    it('rejects a non-technician', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
      await expect(service.advanceStatus('b1', 'u1', 'EN_ROUTE')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects a technician who is not the assigned one', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { findUnique: jest.fn().mockResolvedValue({ technicianId: 'tp2', status: 'CONFIRMED', version: 0 }), update: jest.fn() }, outboxEvent: { create: jest.fn() } }),
      );
      await expect(service.advanceStatus('b1', 'u1', 'EN_ROUTE')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects an out-of-order transition (CONFIRMED → ARRIVED)', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { findUnique: jest.fn().mockResolvedValue({ technicianId: 'tp1', status: 'CONFIRMED', version: 0, customerId: 'c1' }), update: jest.fn() }, outboxEvent: { create: jest.fn() } }),
      );
      await expect(service.advanceStatus('b1', 'u1', 'ARRIVED')).rejects.toBeInstanceOf(ConflictError);
    });

    it('advances CONFIRMED → EN_ROUTE with a version guard + booking.en_route event', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp1' });
      const update = jest.fn().mockResolvedValue({ id: 'b1', status: 'EN_ROUTE' });
      const create = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { findUnique: jest.fn().mockResolvedValue({ technicianId: 'tp1', status: 'CONFIRMED', version: 5, customerId: 'c1' }), update }, outboxEvent: { create } }),
      );

      await service.advanceStatus('b1', 'u1', 'EN_ROUTE');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1', version: 5 }, data: expect.objectContaining({ status: 'EN_ROUTE', version: { increment: 1 } }) }),
      );
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.en_route' }) }));
    });
  });

  // Helper: a $transaction tx whose booking.findUnique returns `fresh`.
  // `payment` is the row complete()'s money-guard reads (default: authorized).
  function txWith(fresh: Record<string, unknown>, payment: Record<string, unknown> | null = { status: 'PRE_AUTHORIZED' }) {
    const update = jest.fn().mockResolvedValue({ id: 'b1', status: 'DONE' });
    const create = jest.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({
        booking: { findUnique: jest.fn().mockResolvedValue(fresh), update },
        payment: { findUnique: jest.fn().mockResolvedValue(payment) },
        outboxEvent: { create },
      }),
    );
    return { update, create };
  }

  describe('complete', () => {
    it('throws NotFoundError when the booking does not exist', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue(null); // getById
      await expect(service.complete('b1', 'c1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError when the requester does not own the booking', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({
        id: 'b1', customerId: 'c1', technicianId: null, status: 'IN_PROGRESS',
      });
      await expect(service.complete('b1', 'stranger')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ConflictError when the fresh status is not completable', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null, status: 'COMPLETED' });
      txWith({ id: 'b1', status: 'COMPLETED', version: 0 });
      await expect(service.complete('b1', 'c1')).rejects.toBeInstanceOf(ConflictError);
    });

    it('completes from IN_PROGRESS with a version guard + booking.completed outbox event', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null, status: 'IN_PROGRESS' });
      const { update, create } = txWith({ id: 'b1', status: 'IN_PROGRESS', version: 3 });

      await service.complete('b1', 'c1');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', version: 3 },
          data: expect.objectContaining({ status: 'COMPLETED', version: { increment: 1 } }),
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.completed' }) }),
      );
    });

    it('refuses to complete when the payment is not authorized (P-1: no free service)', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null, status: 'IN_PROGRESS' });
      const { create } = txWith({ id: 'b1', status: 'IN_PROGRESS', version: 3 }, null); // no payment row
      await expect(service.complete('b1', 'c1')).rejects.toBeInstanceOf(ConflictError);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('throws ConflictError when already COMPLETED', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null, status: 'COMPLETED' });
      txWith({ id: 'b1', status: 'COMPLETED', version: 0 });
      await expect(service.cancel('b1', 'c1', 'changed mind')).rejects.toBeInstanceOf(ConflictError);
    });

    it('cancels a PENDING booking with version guard + booking.cancelled outbox event', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null, status: 'PENDING' });
      const { update, create } = txWith({ id: 'b1', status: 'PENDING', version: 1 });

      await service.cancel('b1', 'c1', 'changed mind');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', version: 1 },
          data: expect.objectContaining({ status: 'CANCELLED', version: { increment: 1 } }),
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.cancelled' }) }),
      );
    });
  });

  describe('getById', () => {
    it('returns immediately for the owning customer without a profile lookup', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: null });
      const result = await service.getById('b1', 'c1');
      expect(result).toEqual({ id: 'b1', customerId: 'c1', technicianId: null });
      expect(mockedPrisma.technicianProfile.findUnique).not.toHaveBeenCalled();
    });

    it('forbids a user who is neither the customer nor the assigned technician', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'b1', customerId: 'c1', technicianId: 'tp1' });
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp2' });
      await expect(service.getById('b1', 'other')).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

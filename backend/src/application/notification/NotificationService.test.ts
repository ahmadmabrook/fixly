import { Prisma } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { prisma } from '../../infrastructure/database/prisma';
import type { Server as SocketServer } from 'socket.io';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    notification: { create: jest.fn() },
    booking: { findUnique: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  notification: { create: jest.Mock };
  booking: { findUnique: jest.Mock };
};

function makeIo() {
  const emit = jest.fn();
  const io = { to: jest.fn().mockReturnValue({ emit }) } as unknown as SocketServer;
  return { io, emit, to: io.to as jest.Mock };
}

describe('NotificationService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a notification and emits to the customer room (payload has customerId)', async () => {
    const { io, emit, to } = makeIo();
    mockedPrisma.notification.create.mockResolvedValue({});
    const svc = new NotificationService(io);

    await svc.handleBookingEvent('booking.created', { bookingId: 'bk-1', customerId: 'cu-1' });

    expect(mockedPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'cu-1', bookingId: 'bk-1' }) }));
    expect(to).toHaveBeenCalledWith('user:cu-1');
    expect(emit).toHaveBeenCalledWith('booking:status', expect.objectContaining({ status: 'PENDING' }));
    expect(mockedPrisma.booking.findUnique).not.toHaveBeenCalled(); // customerId from payload, no lookup
  });

  it('sets a dedupeKey and is idempotent: a duplicate (P2002) is swallowed, no re-emit', async () => {
    const { io, emit } = makeIo();
    mockedPrisma.notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );
    const svc = new NotificationService(io);

    await expect(svc.handleBookingEvent('booking.confirmed', { bookingId: 'bk-1', customerId: 'cu-1' })).resolves.toBeUndefined();

    expect(mockedPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dedupeKey: 'bk-1:booking.confirmed' }) }));
    expect(emit).not.toHaveBeenCalled(); // duplicate → no socket emit
  });

  it('resolves customerId from the booking when absent (booking.cancelled)', async () => {
    const { io, to } = makeIo();
    mockedPrisma.booking.findUnique.mockResolvedValue({ customerId: 'cu-9' });
    mockedPrisma.notification.create.mockResolvedValue({});
    const svc = new NotificationService(io);

    await svc.handleBookingEvent('booking.cancelled', { bookingId: 'bk-2' });

    expect(mockedPrisma.booking.findUnique).toHaveBeenCalled();
    expect(to).toHaveBeenCalledWith('user:cu-9');
  });

  it('skips unknown event types', async () => {
    const { io } = makeIo();
    const svc = new NotificationService(io);
    await svc.handleBookingEvent('booking.weird', { bookingId: 'bk-1', customerId: 'cu-1' });
    expect(mockedPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('skips when the customer cannot be resolved', async () => {
    const { io } = makeIo();
    mockedPrisma.booking.findUnique.mockResolvedValue(null);
    const svc = new NotificationService(io);
    await svc.handleBookingEvent('booking.completed', { bookingId: 'ghost' });
    expect(mockedPrisma.notification.create).not.toHaveBeenCalled();
  });
});

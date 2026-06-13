import { OutboxWorker, OutboxHandlerTimeoutError } from './OutboxWorker';
import { prisma } from '../../infrastructure/database/prisma';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    outboxEvent: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  outboxEvent: { findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

function makeEvent(overrides: Partial<{ id: string; eventType: string; payload: unknown; attempts: number; bookingId: string }> = {}) {
  return { id: 'evt-1', bookingId: 'bk-1', eventType: 'booking.created', payload: { bookingId: 'bk-1' }, attempts: 0, ...overrides };
}

let worker: OutboxWorker;

describe('OutboxWorker (dispatcher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    worker = new OutboxWorker();
    mockedPrisma.outboxEvent.update.mockResolvedValue({});
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 }); // claim/reap succeed by default
  });

  it('processes nothing when there are no PENDING events (only the stale reaper runs)', async () => {
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([]);
    expect(await worker.drain()).toBe(0);
    expect(mockedPrisma.outboxEvent.update).not.toHaveBeenCalled(); // no per-event status writes
  });

  it('reaps stale PROCESSING rows back to PENDING each cycle', async () => {
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([]);
    await worker.drain();
    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PROCESSING' }),
        data: expect.objectContaining({ status: 'PENDING', lockedAt: null }),
      }),
    );
  });

  it('atomically claims (PROCESSING, status=PENDING guard) then marks DONE after all handlers succeed', async () => {
    const h1 = jest.fn().mockResolvedValue(undefined);
    const h2 = jest.fn().mockResolvedValue(undefined);
    worker.register('booking.created', h1).register('booking.created', h2);
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);

    const count = await worker.drain();

    expect(count).toBe(1);
    expect(h1).toHaveBeenCalledWith({ bookingId: 'bk-1' });
    expect(h2).toHaveBeenCalledWith({ bookingId: 'bk-1' }); // fan-out
    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    );
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
    );
  });

  it('skips an event already claimed by another instance (claim count 0)', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    worker.register('booking.created', handler);
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 }); // lost the race

    expect(await worker.drain()).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(mockedPrisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('marks an event with no registered handler DONE (no-op)', async () => {
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ eventType: 'unknown.event' })]);
    expect(await worker.drain()).toBe(1);
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
    );
  });

  it('returns a failed event to PENDING for retry below MAX_ATTEMPTS', async () => {
    worker.register('booking.created', jest.fn().mockRejectedValue(new Error('boom')));
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ attempts: 0 })]);

    expect(await worker.drain()).toBe(0);
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', errorMsg: 'boom' }) }),
    );
  });

  it('marks an event terminal FAILED on the final attempt', async () => {
    worker.register('booking.created', jest.fn().mockRejectedValue(new Error('still broken')));
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ attempts: 4 })]); // +1 = 5 = MAX

    await worker.drain();
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('processes other bookings even when one bookings event fails (parallel across bookings)', async () => {
    worker.register('booking.created', jest.fn().mockRejectedValue(new Error('x')));
    worker.register('booking.completed', jest.fn().mockResolvedValue(undefined));
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([
      makeEvent({ id: 'evt-1', bookingId: 'bk-A', eventType: 'booking.created' }),   // fails
      makeEvent({ id: 'evt-2', bookingId: 'bk-B', eventType: 'booking.completed' }), // different booking → independent
    ]);

    expect(await worker.drain()).toBe(1); // bk-B succeeds independently of bk-A
  });

  it('stops a bookings later events when an earlier one fails (ordering preserved)', async () => {
    worker.register('booking.created', jest.fn().mockRejectedValue(new Error('boom')));
    const completed = jest.fn().mockResolvedValue(undefined);
    worker.register('booking.completed', completed);
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([
      makeEvent({ id: 'evt-1', bookingId: 'bk-1', eventType: 'booking.created' }),   // fails
      makeEvent({ id: 'evt-2', bookingId: 'bk-1', eventType: 'booking.completed' }), // same booking → must NOT run
    ]);

    expect(await worker.drain()).toBe(0);
    expect(completed).not.toHaveBeenCalled(); // ordering: later event held back
  });
});

describe('OutboxWorker (handler timeout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    worker = new OutboxWorker({ handlerTimeoutMs: 50 });
    worker.register('booking.created', jest.fn());
    mockedPrisma.outboxEvent.update.mockResolvedValue({});
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);
  });

  it('marks the event PENDING with a timeout error when a handler hangs', async () => {
    // Replace the registered handler with one that never resolves.
    worker = new OutboxWorker({ handlerTimeoutMs: 30 });
    worker.register('booking.created', () => new Promise(() => {})); // never resolves
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ attempts: 0 })]);

    expect(await worker.drain()).toBe(0);
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          errorMsg: expect.stringContaining('exceeded 30ms'),
        }),
      }),
    );
  });

  it('exposes the timeout as a typed error so callers can distinguish it', () => {
    const err = new OutboxHandlerTimeoutError(1000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OutboxHandlerTimeoutError');
    expect(err.message).toContain('1000ms');
    expect(err.handlerTimeoutMs).toBe(1000);
  });

  it('a fast handler is unaffected by the timeout', async () => {
    const fast = jest.fn().mockResolvedValue(undefined);
    worker = new OutboxWorker({ handlerTimeoutMs: 100 });
    worker.register('booking.created', fast);
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);

    expect(await worker.drain()).toBe(1);
    expect(fast).toHaveBeenCalled();
    expect(mockedPrisma.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
    );
  });
});

describe('OutboxWorker (shutdown drain)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    worker = new OutboxWorker();
    mockedPrisma.outboxEvent.update.mockResolvedValue({});
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it('stop() awaits an in-flight drain tick', async () => {
    // Block the drain on a controllable promise so we can prove stop() is
    // waiting for it (and not just resolving the same tick).
    let release!: () => void;
    const blocker = new Promise<unknown[]>((resolve) => { release = () => resolve([]); });
    mockedPrisma.outboxEvent.findMany.mockReturnValue(blocker);

    // Manually install an in-flight drain (mimics tick() having set it).
    const inflight = (worker as unknown as { drain(): Promise<number> }).drain();
    (worker as unknown as { inflightDrain: Promise<number> | null }).inflightDrain = inflight;

    // stop() should now observe inflightDrain and wait on it.
    let stopResolved = false;
    worker.stop().then(() => { stopResolved = true; });
    await new Promise((r) => setImmediate(r));
    expect(stopResolved).toBe(false);

    // Release the blocked findMany → drain completes → stop() unblocks.
    release();
    await inflight;
    await new Promise((r) => setImmediate(r));
    expect(stopResolved).toBe(true);
  });
});

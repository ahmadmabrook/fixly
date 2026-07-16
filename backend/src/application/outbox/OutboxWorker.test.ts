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

describe('OutboxWorker (drainToEmpty — burst throughput)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.outboxEvent.update.mockResolvedValue({});
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it('keeps fetching batches until the queue is empty (no 1-batch/poll ceiling)', async () => {
    worker = new OutboxWorker({ batchSize: 2 });
    worker.register('booking.created', jest.fn().mockResolvedValue(undefined));
    mockedPrisma.outboxEvent.findMany
      .mockResolvedValueOnce([makeEvent({ id: 'e1', bookingId: 'b1' }), makeEvent({ id: 'e2', bookingId: 'b2' })]) // full → keep going
      .mockResolvedValueOnce([]); // empty → stop

    expect(await worker.drainToEmpty()).toBe(2);
    expect(mockedPrisma.outboxEvent.findMany).toHaveBeenCalledTimes(2);
  });

  it('respects maxBatchesPerTick so one tick cannot run unbounded', async () => {
    worker = new OutboxWorker({ batchSize: 1, maxBatchesPerTick: 3 });
    worker.register('booking.created', jest.fn().mockResolvedValue(undefined));
    // A never-ending stream of DISTINCT new events (a genuinely busy queue) →
    // would loop forever without the cap. Ids must differ per batch: repeating one
    // id would model the same row being re-fetched, which the per-tick attempt
    // guard now (correctly) filters out.
    let nextId = 0;
    mockedPrisma.outboxEvent.findMany.mockImplementation(() => {
      nextId += 1;
      return Promise.resolve([makeEvent({ id: `e${nextId}`, bookingId: `b${nextId}` })]);
    });

    expect(await worker.drainToEmpty()).toBe(3);
    expect(mockedPrisma.outboxEvent.findMany).toHaveBeenCalledTimes(3);
  });

  it('does not re-attempt an event that already failed in this tick (retry budget is not burned intra-tick)', async () => {
    worker = new OutboxWorker({ batchSize: 2, maxAttempts: 5 });
    const okHandler = jest.fn().mockResolvedValue(undefined);
    const failHandler = jest.fn().mockRejectedValue(new Error('PSP 503'));
    worker.register('booking.created', okHandler);
    worker.register('payment.preauth', failHandler);

    const failing = makeEvent({ id: 'bad', bookingId: 'b-bad', eventType: 'payment.preauth' });
    mockedPrisma.outboxEvent.findMany
      // b-ok succeeds, b-bad fails → processed>0 so the loop continues...
      .mockResolvedValueOnce([makeEvent({ id: 'ok', bookingId: 'b-ok' }), failing])
      // ...and the failed row is back to PENDING, so it is fetched again here.
      .mockResolvedValue([failing]);

    await worker.drainToEmpty();

    // Exactly ONE attempt this tick, despite being re-fetched: the retry belongs
    // to a later tick. Previously this burned a second attempt immediately.
    expect(failHandler).toHaveBeenCalledTimes(1);
    // ...and it went back to PENDING for that later retry, not terminal FAILED.
    expect(mockedPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bad' },
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('still drains new events that arrive alongside a failed one', async () => {
    worker = new OutboxWorker({ batchSize: 2 });
    worker.register('booking.created', jest.fn().mockResolvedValue(undefined));
    worker.register('payment.preauth', jest.fn().mockRejectedValue(new Error('PSP 503')));

    const failing = makeEvent({ id: 'bad', bookingId: 'b-bad', eventType: 'payment.preauth' });
    mockedPrisma.outboxEvent.findMany
      .mockResolvedValueOnce([makeEvent({ id: 'ok1', bookingId: 'b1' }), failing])
      // The failed row lingers, but a genuinely new event arrived — it must still drain.
      .mockResolvedValueOnce([failing, makeEvent({ id: 'ok2', bookingId: 'b2' })])
      .mockResolvedValue([failing]);

    expect(await worker.drainToEmpty()).toBe(2); // ok1 + ok2
  });

  it('stops early when a batch makes no progress (all claimed by other instances)', async () => {
    worker = new OutboxWorker({ batchSize: 2 });
    worker.register('booking.created', jest.fn().mockResolvedValue(undefined));
    mockedPrisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ id: 'e1' })]);
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 }); // claim always lost

    expect(await worker.drainToEmpty()).toBe(0);
    expect(mockedPrisma.outboxEvent.findMany).toHaveBeenCalledTimes(1); // no spin
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

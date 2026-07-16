import { OutboxStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { outboxEventsProcessedTotal, outboxDrainedPerTick } from '../../shared/metrics';

export type OutboxEventHandler = (payload: unknown) => Promise<void>;

export interface OutboxWorkerOptions {
  /** ms between drain cycles when no events are pending. */
  pollIntervalMs?: number;
  /** max events claimed per batch (one DB fetch). */
  batchSize?: number;
  /** max full batches to drain in a single tick before yielding. Caps the
   *  worst case so one tick can't run unbounded, while letting a tick clear a
   *  large burst instead of leaking 1 batch/poll (the old throughput ceiling). */
  maxBatchesPerTick?: number;
  /** max retries before a FAILED event is moved to terminal FAILED. */
  maxAttempts?: number;
  /** per-handler timeout. A handler that doesn't resolve within this window
   *  is treated as failed for that cycle (event returns to PENDING with
   *  attempts+1). Keeps a hung provider from freezing the booking's queue. */
  handlerTimeoutMs?: number;
}

const DEFAULT_POLL_MS = 2000;
const BATCH_SIZE = 200;
const MAX_BATCHES_PER_TICK = 50; // up to BATCH_SIZE × this per tick
const MAX_ATTEMPTS = 5;
const ERROR_MSG_MAX = 500;
// A claimed (PROCESSING) row whose worker crashed is requeued after this long.
const PROCESSING_TIMEOUT_MS = 120_000;
// The reaper only needs to run periodically, not on every poll cycle.
const REAP_INTERVAL_MS = 60_000;
const DEFAULT_HANDLER_TIMEOUT_MS = 10_000;

/** A per-handler timeout error so logs can identify it without guessing. */
export class OutboxHandlerTimeoutError extends Error {
  constructor(public readonly handlerTimeoutMs: number) {
    super(`Outbox handler exceeded ${handlerTimeoutMs}ms`);
    this.name = 'OutboxHandlerTimeoutError';
  }
}

/**
 * Transactional-outbox consumer. Polls PENDING rows and fans each one out to
 * every handler registered for its eventType. Pure transport: it owns NO
 * business logic — payment/notification live in their own services and are
 * wired in as handlers (see main.ts).
 *
 * Delivery is at-least-once. Handlers MUST be idempotent. A handler failure
 * returns the event to PENDING (retried next cycle) until MAX_ATTEMPTS, then
 * it becomes terminal FAILED for out-of-band inspection.
 */
export class OutboxWorker {
  private readonly handlers = new Map<string, OutboxEventHandler[]>();
  private readonly options: Required<OutboxWorkerOptions>;
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private lastReapAt = 0;
  // Tracks any in-flight drain so stop() can wait for it to settle before
  // letting the process exit. Without this, a SIGTERM during a payment
  // pre-auth leaves the row in PROCESSING for up to PROCESSING_TIMEOUT_MS
  // before the reaper picks it up.
  private inflightDrain: Promise<number> | null = null;

  constructor(options: OutboxWorkerOptions = {}) {
    this.options = {
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_MS,
      batchSize: options.batchSize ?? BATCH_SIZE,
      maxBatchesPerTick: options.maxBatchesPerTick ?? MAX_BATCHES_PER_TICK,
      maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
      handlerTimeoutMs: options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
    };
  }

  /** Register a handler for an eventType. Multiple handlers fan out in order. */
  register(eventType: string, handler: OutboxEventHandler): this {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
    return this;
  }

  /** Begin the background poll loop. Idempotent. */
  start(intervalMs?: number): void {
    if (this.timer) return;
    const interval = intervalMs ?? this.options.pollIntervalMs;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    logger.info({ intervalMs: interval }, 'OutboxWorker started');
  }

  /**
   * Stop the poll loop AND wait for any in-flight drain to complete. Safe to
   * call multiple times — concurrent callers all wait on the same promise.
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('OutboxWorker stopped');
    }
    if (this.inflightDrain) {
      try {
        await this.inflightDrain;
        logger.info('OutboxWorker: in-flight drain settled');
      } catch (err) {
        logger.error({ err }, 'OutboxWorker: in-flight drain error during shutdown');
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.draining) return; // never overlap drain cycles
    this.draining = true;
    this.inflightDrain = this.drainToEmpty();
    try {
      const drained = await this.inflightDrain;
      outboxDrainedPerTick.observe(drained);
    } catch (err) {
      logger.error(err, 'OutboxWorker: drain cycle error');
    } finally {
      this.draining = false;
      this.inflightDrain = null;
    }
  }

  /**
   * Drain repeatedly within a single tick until the queue is empty (or no
   * forward progress is made, or the per-tick batch cap is hit). This is what
   * lets the worker keep up with bursts: a full batch means "probably more
   * waiting", so we immediately fetch the next one instead of sleeping a whole
   * poll interval. Returns the total events marked DONE this tick.
   */
  async drainToEmpty(): Promise<number> {
    let total = 0;
    // Event ids that already had an attempt during THIS tick. A failed handler
    // returns its event straight to PENDING, so without this guard the very next
    // batch in this same loop re-fetches and re-attempts it with zero delay —
    // burning the entire retry budget (maxAttempts) in milliseconds and turning a
    // transient provider blip into a terminal FAILED payment event. Retries are
    // meant to land on a LATER tick; this keeps them there while still letting the
    // loop drain genuinely-new events aggressively (the burst-throughput intent).
    const attemptedThisTick = new Set<string>();
    for (let i = 0; i < this.options.maxBatchesPerTick; i++) {
      const { fetched, processed } = await this.drainBatch(attemptedThisTick);
      total += processed;
      // Nothing new left to claim (empty queue, or every remaining row is a retry
      // deferred to the next tick), or a batch that made no progress — stop.
      if (fetched === 0 || processed === 0) break;
    }
    return total;
  }

  /**
   * Requeue events stuck in PROCESSING past the timeout (worker crashed between
   * claim and completion). Without this they'd be invisible to the poll forever.
   */
  async reapStale(): Promise<number> {
    const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
    const reaped = await prisma.outboxEvent.updateMany({
      where: { status: OutboxStatus.PROCESSING, lockedAt: { lt: cutoff } },
      data: { status: OutboxStatus.PENDING, lockedAt: null },
    });
    if (reaped.count > 0) logger.warn({ count: reaped.count }, 'OutboxWorker: requeued stale PROCESSING events');
    return reaped.count;
  }

  /** Process one batch of PENDING events concurrently. Returns the count marked DONE. */
  async drain(): Promise<number> {
    return (await this.drainBatch()).processed;
  }

  /** One batch: reap stale rows, fetch up to batchSize PENDING, dispatch them.
   *  `attemptedThisTick` carries the ids already attempted in the current
   *  drainToEmpty pass so a failed event isn't retried again within that pass.
   *  Returns how many NEW events were fetched (to decide whether to keep
   *  draining) and how many reached DONE. */
  private async drainBatch(attemptedThisTick: Set<string> = new Set()): Promise<{ fetched: number; processed: number }> {
    if (Date.now() - this.lastReapAt > REAP_INTERVAL_MS) {
      this.lastReapAt = Date.now();
      await this.reapStale();
    }

    const fetchedEvents = await prisma.outboxEvent.findMany({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: this.options.batchSize,
    });

    // Drop rows this tick already attempted — they are failures that bounced back
    // to PENDING and must wait for the next tick rather than re-burn attempts now.
    const events = fetchedEvents.filter((event) => !attemptedThisTick.has(event.id));
    for (const event of events) attemptedThisTick.add(event.id);

    // A booking's events are causally ordered (created → confirmed → … →
    // completed): the capture handler depends on the pre-auth handler having
    // run. So we process events of ONE booking sequentially, but different
    // bookings concurrently — parallel throughput without breaking ordering.
    const byBooking = new Map<string, typeof events>();
    for (const event of events) {
      const group = byBooking.get(event.bookingId) ?? [];
      group.push(event);
      byBooking.set(event.bookingId, group);
    }

    const results = await Promise.allSettled([...byBooking.values()].map((g) => this.processGroup(g)));
    const processed = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
    // A group rejection here is an unexpected processGroup failure (not a
    // handler rejection — those are caught inside processOne). It would
    // otherwise vanish silently and the worker would just process 0 events.
    for (const r of results) {
      if (r.status === 'rejected') {
        logger.error({ err: r.reason }, 'OutboxWorker: processGroup rejected unexpectedly');
      }
    }
    return { fetched: events.length, processed };
  }

  /** Process one booking's events in createdAt order; stop at the first that
   *  isn't DONE so a failed event doesn't let a later one jump ahead of it. */
  private async processGroup(events: { id: string; eventType: string; payload: unknown; attempts: number }[]): Promise<number> {
    let processed = 0;
    for (const event of events) {
      if (await this.processOne(event)) processed++;
      else break;
    }
    return processed;
  }

  /** Claim + dispatch a single event. Returns true if marked DONE. */
  private async processOne(event: { id: string; eventType: string; payload: unknown; attempts: number }): Promise<boolean> {
    // Atomic claim: only succeeds if the row is STILL pending. A concurrent
    // worker (another instance) that already claimed it yields count 0, so we
    // skip — this removes the read-then-write double-process race.
    const claim = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 }, lockedAt: new Date() },
    });
    if (claim.count === 0) return false;

    const handlers = this.handlers.get(event.eventType) ?? [];
    try {
      // Handlers for one event are independent — run them concurrently, each
      // wrapped in a per-handler timeout. A hung provider must not freeze
      // the booking's queue (we process events sequentially within a booking).
      await Promise.all(handlers.map((h) => this.runWithTimeout(h, event.payload, event.eventType)));
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: OutboxStatus.DONE, processedAt: new Date(), lockedAt: null },
      });
      outboxEventsProcessedTotal.inc({ event_type: event.eventType, result: 'done' });
      return true;
    } catch (err) {
      const errorMsg = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MSG_MAX);
      const attempts = event.attempts + 1;
      const terminal = attempts >= this.options.maxAttempts;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: terminal
          ? { status: OutboxStatus.FAILED, failedAt: new Date(), errorMsg, lockedAt: null }
          : { status: OutboxStatus.PENDING, errorMsg, lockedAt: null }, // back to the queue for retry
      });
      outboxEventsProcessedTotal.inc({ event_type: event.eventType, result: terminal ? 'failed' : 'retry' });
      logger.error({ eventId: event.id, eventType: event.eventType, attempts, terminal, errorMsg }, 'Outbox handler failed');
      return false;
    }
  }

  /**
   * Run a single handler under a wall-clock timeout. The losing branch keeps
   * running in the background but its result is discarded — keeps the
   * worker from blocking on a hung provider while the rows it would have
   * written remain owned by the original (stale) process for the reaper to
   * recover.
   */
  private async runWithTimeout(
    handler: OutboxEventHandler,
    payload: unknown,
    eventType: string,
  ): Promise<void> {
    const timeoutMs = this.options.handlerTimeoutMs;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        handler(payload),
        new Promise<void>((_, reject) => {
          timer = setTimeout(
            () => reject(new OutboxHandlerTimeoutError(timeoutMs)),
            timeoutMs,
          );
          timer.unref?.();
        }),
      ]);
    } catch (err) {
      // If we timed out, log a clear warning so triage can find it.
      if (err instanceof OutboxHandlerTimeoutError) {
        logger.warn({ eventType, timeoutMs }, 'Outbox handler timed out');
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

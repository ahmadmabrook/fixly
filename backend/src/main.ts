import 'dotenv/config';
import type { Server } from 'http';
import { loadEnv } from './shared/env';
import { createApp } from './interface/http/app';
import { createSocketServer } from './interface/socket/server';
import { logger } from './shared/logger';
import { prisma } from './infrastructure/database/prisma';
import { redis } from './infrastructure/cache/redis';
import { OutboxWorker } from './application/outbox/OutboxWorker';
import { PaymentService } from './application/payment/PaymentService';
import { NotificationService } from './application/notification/NotificationService';
import { PaymentProviderFactory } from './infrastructure/providers/PaymentProviderFactory';
import { outboxPendingGauge } from './shared/metrics';

const PENDING_GAUGE_INTERVAL_MS = 15_000;

async function main() {
  const env = loadEnv(); // fail-fast on missing/unsafe config

  installCrashHandlers();

  await prisma.$connect();
  logger.info('Database connected');

  await redis.ping();
  logger.info('Redis connected');

  const { app, httpServer } = createApp();
  const io = createSocketServer(httpServer);

  const worker = buildOutboxWorker(io, env.OUTBOX_BATCH_SIZE, env.OUTBOX_MAX_BATCHES_PER_TICK);
  worker.start(env.OUTBOX_POLL_MS);

  // Periodically publish the PENDING backlog as a gauge so an operator can
  // alert when the worker falls behind (kept out of the worker's hot path).
  const gaugeTimer = setInterval(() => void refreshPendingGauge(), PENDING_GAUGE_INTERVAL_MS);
  gaugeTimer.unref();

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Fixly backend running');
  });

  registerShutdown(httpServer, io.close.bind(io), worker, gaugeTimer);
}

async function refreshPendingGauge(): Promise<void> {
  try {
    const pending = await prisma.outboxEvent.count({ where: { status: 'PENDING' } });
    outboxPendingGauge.set(pending);
  } catch (err) {
    logger.warn({ err }, 'Failed to refresh outbox pending gauge');
  }
}

/** Wires the outbox worker to its handlers (payment + notification fan-out). */
function buildOutboxWorker(
  io: ReturnType<typeof createSocketServer>,
  batchSize: number,
  maxBatchesPerTick: number,
): OutboxWorker {
  const payment = new PaymentService(PaymentProviderFactory.create());
  const notification = new NotificationService(io);
  const bookingId = (p: unknown) => (p as { bookingId: string }).bookingId;

  const worker = new OutboxWorker({ batchSize, maxBatchesPerTick })
    .register('booking.created', (p) => payment.preAuthorizeForBooking(bookingId(p)))
    .register('booking.completed', (p) => payment.captureForBooking(bookingId(p)))
    // Cancellation releases money: void an uncaptured hold, or refund a capture.
    .register('booking.cancelled', (p) => payment.handleCancellation(bookingId(p)));

  // Every lifecycle event notifies the customer (idempotent handler).
  for (const eventType of [
    'booking.created', 'booking.confirmed', 'booking.en_route',
    'booking.arrived', 'booking.in_progress', 'booking.completed', 'booking.cancelled',
  ]) {
    worker.register(eventType, (p) => notification.handleBookingEvent(eventType, p as { bookingId: string }));
  }

  return worker;
}

/**
 * Last-resort process guards. An unhandled rejection or uncaught exception
 * leaves the process in an undefined state — log it and exit non-zero so the
 * orchestrator restarts a clean pod rather than serving from a corrupt one.
 */
function installCrashHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — exiting');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

function registerShutdown(
  httpServer: Server,
  closeIo: () => void,
  worker: OutboxWorker,
  gaugeTimer: NodeJS.Timeout,
) {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const timer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    timer.unref();

    try {
      clearInterval(gaugeTimer);
      // Stop the worker and wait for any in-flight drain to settle BEFORE
      // tearing down the DB / Redis — otherwise a pre-auth mid-flight would
      // crash and need the reaper to recover.
      await worker.stop();
      closeIo();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
      await prisma.$disconnect();
      await redis.quit();
      logger.info('Clean shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
});

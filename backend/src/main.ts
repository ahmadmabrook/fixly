// dotenv is a devDependency; in production/staging env vars come from the
// platform (Fly secrets), not a .env file — skip the import so the prod
// image doesn't need dotenv installed.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { require('dotenv/config'); } catch { /* optional */ }
}
import type { Server } from 'http';
import { OutboxStatus, PaymentStatus, BookingStatus } from '@prisma/client';
import { loadEnv, env } from './shared/env';
import { createApp } from './interface/http/app';
import { createSocketServer } from './interface/socket/server';
import { logger } from './shared/logger';
import { prisma } from './infrastructure/database/prisma';
import { redis } from './infrastructure/cache/redis';
import { OutboxWorker } from './application/outbox/OutboxWorker';
import { OutboxEventType } from './shared/outboxEvents';
import { PaymentService } from './application/payment/PaymentService';
import { NotificationService } from './application/notification/NotificationService';
import { AdminService } from './application/admin/AdminService';
import { BookingService } from './application/booking/BookingService';
import { DispatchService, setDispatchService, getDispatchService } from './application/dispatch/DispatchService';
import { SubscriptionService } from './application/subscription/SubscriptionService';
import { TrustService } from './application/technician/TrustService';
import { MaterialVerificationService } from './application/materials/MaterialVerificationService';
import { PaymentProviderFactory } from './infrastructure/providers/PaymentProviderFactory';
import {
  outboxPendingGauge, outboxFailedGauge, paymentStuckPreauthGauge,
  bookingsAwaitingPaymentGauge, bookingsExpiredUnpaidTotal,
} from './shared/metrics';

const PENDING_GAUGE_INTERVAL_MS = 15_000;
const PAYOUT_RECONCILE_INTERVAL_MS = 60_000;
const CHECKOUT_RECONCILE_INTERVAL_MS = 60_000;
// Subscription renewals + trust-tier recompute run on coarse cadences (hourly);
// billing/tier changes don't need finer granularity and this keeps DB load low.
const SUBSCRIPTION_BILLER_INTERVAL_MS = 60 * 60_000;
const TRUST_RECOMPUTE_INTERVAL_MS = 60 * 60_000;
// §17.5.14 step 4: a 24h dispute deadline doesn't need fine-grained polling —
// 15 minutes keeps the overshoot small without adding meaningful DB load.
const MATERIAL_VERIFICATION_SETTLE_INTERVAL_MS = 15 * 60_000;

async function main() {
  const env = loadEnv(); // fail-fast on missing/unsafe config

  installCrashHandlers();

  await prisma.$connect();
  logger.info('Database connected');

  await redis.ping();
  logger.info('Redis connected');

  const { httpServer } = createApp();
  const io = createSocketServer(httpServer);

  const worker = buildOutboxWorker(io, env.OUTBOX_BATCH_SIZE, env.OUTBOX_MAX_BATCHES_PER_TICK);
  worker.start(env.OUTBOX_POLL_MS);

  // Periodically publish the PENDING backlog as a gauge so an operator can
  // alert when the worker falls behind (kept out of the worker's hot path).
  const gaugeTimer = setInterval(() => void refreshPendingGauge(), PENDING_GAUGE_INTERVAL_MS);
  gaugeTimer.unref();

  // Reconcile payouts stranded in PROCESSING by a crash between the external
  // disbursement and the finalize commit (money-safety recovery).
  const adminService = new AdminService();
  const reconcileTimer = setInterval(() => {
    void adminService
      .reconcileStuckPayouts()
      .catch((err) => logger.warn({ err }, 'Payout reconciliation cycle failed'));
  }, PAYOUT_RECONCILE_INTERVAL_MS);
  reconcileTimer.unref();

  // Cancel hosted-checkout bookings abandoned in AWAITING_PAYMENT past the TTL so the
  // queue doesn't accumulate unpaid bookings (no money has moved — silent cleanup).
  const bookingService = new BookingService();
  const checkoutExpiryTimer = setInterval(() => {
    void bookingService
      .expireUnpaidBookings(env.CHECKOUT_TTL_MINUTES)
      .then((n) => {
        if (n > 0) {
          bookingsExpiredUnpaidTotal.inc(n);
          logger.warn({ count: n }, 'Cancelled unpaid bookings past the checkout TTL');
        }
      })
      .catch((err) => logger.warn({ err }, 'Checkout-expiry cycle failed'));
  }, CHECKOUT_RECONCILE_INTERVAL_MS);
  checkoutExpiryTimer.unref();

  // Dispatch sweep: expire timed-out rounds + bootstrap un-dispatched bookings.
  setDispatchService(new DispatchService(io));
  const dispatchSweepTimer = setInterval(() => {
    void getDispatchService()
      .expireRounds()
      .catch((err) => logger.warn({ err }, 'Dispatch sweep failed'));
  }, env.DISPATCH_SWEEP_INTERVAL_MS);
  dispatchSweepTimer.unref();

  // Protection subscription renewals (§0.3): charge card-on-file, roll periods,
  // expire cancelled/past-due plans.
  const subscriptionService = new SubscriptionService();
  const subscriptionBillerTimer = setInterval(() => {
    void subscriptionService
      .billDueSubscriptions()
      .then((r) => {
        if (r.renewed || r.expired) logger.info(r, 'Subscription billing cycle');
      })
      .catch((err) => logger.warn({ err }, 'Subscription billing cycle failed'));
  }, SUBSCRIPTION_BILLER_INTERVAL_MS);
  subscriptionBillerTimer.unref();

  // Trust-tier recompute (§0.2 #1): recompute technician tiers from rating/volume/
  // upheld conduct flags; auto-suspend repeat off-platform offenders.
  const trustService = new TrustService();
  const trustRecomputeTimer = setInterval(() => {
    void trustService
      .recomputeAll()
      .then((r) => {
        if (r.changed || r.suspended) logger.info(r, 'Trust-tier recompute');
      })
      .catch((err) => logger.warn({ err }, 'Trust-tier recompute failed'));
  }, TRUST_RECOMPUTE_INTERVAL_MS);
  trustRecomputeTimer.unref();

  // Price-variance dispute auto-settle (§17.5.14 step 4): once a customer
  // declines a justified over-reference line, the technician has 24h to
  // upload the original invoice; past deadline the difference is deducted
  // from their dues automatically (via LedgerEntry, refKey-guarded exactly-once).
  const materialVerificationService = new MaterialVerificationService();
  const materialVerificationSettleTimer = setInterval(() => {
    void materialVerificationService
      .settleExpiredVerifications()
      .then((r) => {
        if (r.settled) logger.info(r, 'Material-verification auto-settle cycle');
      })
      .catch((err) => logger.warn({ err }, 'Material-verification auto-settle cycle failed'));
  }, MATERIAL_VERIFICATION_SETTLE_INTERVAL_MS);
  materialVerificationSettleTimer.unref();

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Fixly backend running');
  });

  registerShutdown(httpServer, io.close.bind(io), worker, [
    gaugeTimer, reconcileTimer, checkoutExpiryTimer, dispatchSweepTimer,
    subscriptionBillerTimer, trustRecomputeTimer, materialVerificationSettleTimer,
  ]);
}

async function refreshPendingGauge(): Promise<void> {
  try {
    const expiryCutoff = new Date(Date.now() - loadEnv().AUTH_HOLD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const [pending, failed, stuckPreauth, awaitingPayment] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
      // Terminal-FAILED money events = uncollected revenue / held customer funds.
      prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      // Holds past expiry that were never captured → capture at risk.
      prisma.payment.count({ where: { status: PaymentStatus.PRE_AUTHORIZED, preAuthorizedAt: { lt: expiryCutoff } } }),
      // Bookings awaiting hosted-checkout authorization (visibility into the funnel).
      prisma.booking.count({ where: { status: BookingStatus.AWAITING_PAYMENT } }),
    ]);
    outboxPendingGauge.set(pending);
    outboxFailedGauge.set(failed);
    paymentStuckPreauthGauge.set(stuckPreauth);
    bookingsAwaitingPaymentGauge.set(awaitingPayment);
    if (failed > 0) logger.error({ failed }, 'Outbox has terminal-FAILED events — money action(s) need triage');
    if (stuckPreauth > 0) logger.error({ stuckPreauth }, 'Pre-authorizations past expiry without capture — funds at risk');
  } catch (err) {
    logger.warn({ err }, 'Failed to refresh health gauges');
  }
}

/** Wires the outbox worker to its handlers (payment + notification fan-out). */
function buildOutboxWorker(
  io: ReturnType<typeof createSocketServer>,
  batchSize: number,
  maxBatchesPerTick: number,
): OutboxWorker {
  const payment = new PaymentService(PaymentProviderFactory.create(), env().PAYMENT_PROVIDER);
  const notification = new NotificationService(io);
  const bookingId = (p: unknown) => (p as { bookingId: string }).bookingId;

  const worker = new OutboxWorker({ batchSize, maxBatchesPerTick })
    .register(OutboxEventType.BOOKING_CREATED, (p) => payment.preAuthorizeForBooking(bookingId(p)))
    .register(OutboxEventType.BOOKING_COMPLETED, (p) => payment.captureForBooking(bookingId(p)))
    // Cancellation releases money: void an uncaptured hold, or refund a capture.
    .register(OutboxEventType.BOOKING_CANCELLED, (p) => payment.handleCancellation(bookingId(p)))
    // No-show charges the flat callout fee by capturing it out of the existing
    // pre-authorized hold (same retry-safe capture path as booking.completed).
    .register(OutboxEventType.BOOKING_NO_SHOW, (p) => payment.captureForBooking(bookingId(p), (p as { calloutFeeJod: string }).calloutFeeJod));

  // Every lifecycle event notifies the customer (idempotent handler).
  for (const eventType of [
    OutboxEventType.BOOKING_CREATED, OutboxEventType.BOOKING_CONFIRMED, OutboxEventType.BOOKING_EN_ROUTE,
    OutboxEventType.BOOKING_ARRIVED, OutboxEventType.BOOKING_IN_PROGRESS, OutboxEventType.BOOKING_COMPLETED, OutboxEventType.BOOKING_CANCELLED,
    OutboxEventType.BOOKING_NO_SHOW,
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
  timers: NodeJS.Timeout[],
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
      for (const t of timers) clearInterval(t);
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

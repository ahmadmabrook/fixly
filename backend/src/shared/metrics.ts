import client from 'prom-client';

/**
 * Prometheus metrics registry. One process-wide registry holds every series.
 * Scraped at GET /metrics (see interface/http/app.ts). Default Node metrics
 * (event-loop lag, GC, heap, CPU, handles) are collected so an operator can
 * see process health, not just app counters.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

/** Latency + count of every HTTP request, labelled by method/route/status. */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  // Tuned for a JSON API: sub-ms to ~2s tail.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

/** Outbox events processed, labelled by event type and terminal result. */
export const outboxEventsProcessedTotal = new client.Counter({
  name: 'outbox_events_processed_total',
  help: 'Outbox events processed by the worker',
  labelNames: ['event_type', 'result'] as const, // result: done | retry | failed
  registers: [registry],
});

/** Current backlog of PENDING outbox rows (set periodically from main.ts). */
export const outboxPendingGauge = new client.Gauge({
  name: 'outbox_pending_events',
  help: 'Number of outbox events currently in PENDING state',
  registers: [registry],
});

/** Events drained per tick — lets you see the worker keeping up (or not). */
export const outboxDrainedPerTick = new client.Histogram({
  name: 'outbox_drained_per_tick',
  help: 'Number of outbox events drained in a single tick',
  buckets: [0, 1, 10, 50, 100, 500, 1000, 5000],
  registers: [registry],
});

/** Payment operations, labelled by op (preauth/capture/void/refund) and result. */
export const paymentOpsTotal = new client.Counter({
  name: 'payment_operations_total',
  help: 'Payment lifecycle operations',
  labelNames: ['op', 'result'] as const, // result: ok | skipped | failed
  registers: [registry],
});

/** Payouts resolved by the reconciliation job, labelled by outcome. */
export const payoutReconciledTotal = new client.Counter({
  name: 'payout_reconciled_total',
  help: 'Stuck payouts resolved by reconciliation',
  labelNames: ['outcome'] as const, // completed | failed | unresolved
  registers: [registry],
});

/** Payouts currently stuck in PROCESSING (set by the reconciliation job). */
export const payoutStuckGauge = new client.Gauge({
  name: 'payout_stuck_processing',
  help: 'Payouts currently in PROCESSING (disbursement not yet finalized)',
  registers: [registry],
});

/** Outbox events in terminal FAILED — a payment FAILED here = money not moved. */
export const outboxFailedGauge = new client.Gauge({
  name: 'outbox_failed_events',
  help: 'Outbox events in terminal FAILED state (need manual triage)',
  registers: [registry],
});

/** Payments stuck in PRE_AUTHORIZED past the hold-expiry window (capture at risk). */
export const paymentStuckPreauthGauge = new client.Gauge({
  name: 'payment_stuck_preauthorized',
  help: 'Payments still PRE_AUTHORIZED past the hold-expiry window',
  registers: [registry],
});

/** Bookings auto-cancelled because the customer never completed hosted checkout. */
export const bookingsExpiredUnpaidTotal = new client.Counter({
  name: 'bookings_expired_unpaid_total',
  help: 'Bookings cancelled by the reconciler after the checkout TTL with no authorization',
  registers: [registry],
});

/** Bookings currently sitting in AWAITING_PAYMENT (checkout opened, not yet authorized). */
export const bookingsAwaitingPaymentGauge = new client.Gauge({
  name: 'bookings_awaiting_payment',
  help: 'Bookings awaiting hosted-checkout authorization',
  registers: [registry],
});

/** PSP webhook events handled, labelled by type + result. */
export const pspWebhookTotal = new client.Counter({
  name: 'psp_webhook_events_total',
  help: 'Inbound PSP webhook events processed',
  labelNames: ['type', 'result'] as const, // result: ok | duplicate | invalid | error
  registers: [registry],
});

// ── Domain counters (guarantee / support / withdrawals / broadcasts) ──────────

/** Guarantee tickets opened (customer) and reviewed (admin), by outcome. */
export const guaranteeTicketsTotal = new client.Counter({
  name: 'guarantee_tickets_total',
  help: 'Guarantee ticket lifecycle events',
  labelNames: ['action'] as const, // opened | approved | rejected
  registers: [registry],
});

/** Support tickets opened by customers. */
export const supportTicketsTotal = new client.Counter({
  name: 'support_tickets_total',
  help: 'Support tickets opened',
  registers: [registry],
});

/** Technician withdrawals requested (tech) and processed (finance), by decision. */
export const withdrawalsRequestedTotal = new client.Counter({
  name: 'withdrawals_requested_total',
  help: 'Technician withdrawal requests created',
  registers: [registry],
});
export const withdrawalsProcessedTotal = new client.Counter({
  name: 'withdrawals_processed_total',
  help: 'Technician withdrawals finalised by an admin',
  labelNames: ['decision'] as const, // PAID | REJECTED
  registers: [registry],
});

/** Admin broadcasts sent, by audience segment. */
export const broadcastsSentTotal = new client.Counter({
  name: 'broadcasts_sent_total',
  help: 'Admin broadcast notifications sent',
  labelNames: ['segment'] as const, // ALL | CUSTOMERS | TECHNICIANS
  registers: [registry],
});

/** Reviews submitted, by direction. */
export const reviewsSubmittedTotal = new client.Counter({
  name: 'reviews_submitted_total',
  help: 'Reviews submitted after completion',
  labelNames: ['direction'] as const, // customer_to_tech | tech_to_customer
  registers: [registry],
});

// ── Dispatch (broadcast-and-accept) ──────────────────────────────────────────

/** Dispatch offers created, by outcome (offered → accepted/rejected/expired/superseded). */
export const dispatchOffersTotal = new client.Counter({
  name: 'dispatch_offers_total',
  help: 'Dispatch offers sent to technicians',
  labelNames: ['result'] as const, // offered | accepted | rejected | expired | superseded
  registers: [registry],
});

/** Dispatch rounds opened (one per radius expansion). */
export const dispatchRoundsTotal = new client.Counter({
  name: 'dispatch_rounds_total',
  help: 'Dispatch rounds opened (radius expansions)',
  registers: [registry],
});

/** Bookings exhausted (no technician available at max radius). */
export const dispatchExhaustedTotal = new client.Counter({
  name: 'dispatch_exhausted_total',
  help: 'Bookings cancelled because no technician accepted at max radius',
  registers: [registry],
});

/** Time from offer to accept (seconds) — measures technician response speed. */
export const dispatchAcceptLatencySeconds = new client.Histogram({
  name: 'dispatch_accept_latency_seconds',
  help: 'Seconds between offer and technician accept',
  buckets: [5, 15, 30, 60, 120, 180, 300],
  registers: [registry],
});

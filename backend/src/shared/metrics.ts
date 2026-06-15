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

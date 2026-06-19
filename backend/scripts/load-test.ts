/**
 * Repeatable load test with hard pass/fail thresholds. Runs against an
 * already-running backend (default http://localhost:4000). Exits non-zero if
 * any scenario breaches its SLO, so it can gate CI and catch perf regressions.
 *
 * Usage:
 *   1. Start the backend (rate limiter OFF so we measure app capacity, not the
 *      limiter):  NODE_ENV=test LOG_LEVEL=silent node dist/main.js
 *   2. pnpm --filter backend perf            # or: BASE_URL=... DURATION=20 pnpm perf
 *
 * Scenarios: a read path (GET /services) and the heavy write path
 * (POST /bookings — DB transaction + outbox insert), authenticated via the
 * mock-OTP flow.
 */
import autocannon, { type Result } from 'autocannon';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const DURATION = Number(process.env.DURATION ?? 15);
const READ_CONNECTIONS = Number(process.env.READ_CONNECTIONS ?? 50);
const WRITE_CONNECTIONS = Number(process.env.WRITE_CONNECTIONS ?? 25);

// SLO thresholds. Defaults are tight floors the app clears on a dev laptop;
// throughput is hardware-dependent, so CI (shared 2-core runners) overrides the
// rps/p99 floors via env while the error-rate gate stays strict everywhere —
// that's the real correctness signal, the rest is noise on shared hardware.
const READ_MIN_RPS = Number(process.env.READ_MIN_RPS ?? 1500);
const READ_MAX_P99 = Number(process.env.READ_MAX_P99 ?? 150);
const WRITE_MIN_RPS = Number(process.env.WRITE_MIN_RPS ?? 300);
const WRITE_MAX_P99 = Number(process.env.WRITE_MAX_P99 ?? 400);
const MAX_ERROR_RATE = Number(process.env.MAX_ERROR_RATE ?? 0.001);

interface Threshold {
  minRps: number;
  maxP99Ms: number;
  maxErrorRate: number; // fraction of non-2xx/3xx + errors
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE_URL + path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Mock-OTP login → access token for the authenticated write scenario. */
async function login(phone: string): Promise<string> {
  await getJson('/api/v1/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const verify = await getJson<{ data: { accessToken: string } }>('/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '000000' }),
  });
  return verify.data.accessToken;
}

function run(opts: autocannon.Options): Promise<Result> {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function evaluate(name: string, r: Result, t: Threshold): boolean {
  const total = r.requests.total || 1;
  const errorRate = (r.non2xx + r.errors + r.timeouts) / total;
  const rps = r.requests.average;
  const p99 = r.latency.p99;
  const pass =
    rps >= t.minRps && p99 <= t.maxP99Ms && errorRate <= t.maxErrorRate;

  console.log(`\n── ${name} ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   rps:        ${rps.toFixed(0)}   (min ${t.minRps})`);
  console.log(`   p99 (ms):   ${p99.toFixed(1)}  (max ${t.maxP99Ms})`);
  console.log(`   error rate: ${(errorRate * 100).toFixed(2)}%  (max ${(t.maxErrorRate * 100).toFixed(0)}%)`);
  console.log(`   2xx/non2xx/err/timeout: ${total}/${r.non2xx}/${r.errors}/${r.timeouts}`);
  return pass;
}

async function main(): Promise<void> {
  console.log(`Load test → ${BASE_URL} (duration ${DURATION}s/scenario)`);

  const token = await login('+962780000777');
  const services = await getJson<{ data: Array<{ id: string }> }>('/api/v1/services');
  const serviceId = services.data[0]?.id;
  if (!serviceId) throw new Error('No services seeded — run `pnpm --filter backend seed` first');

  const readResult = await run({
    url: `${BASE_URL}/api/v1/services`,
    connections: READ_CONNECTIONS,
    duration: DURATION,
  });

  const writeResult = await run({
    url: `${BASE_URL}/api/v1/bookings`,
    connections: WRITE_CONNECTIONS,
    duration: DURATION,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      serviceId,
      addressLine: 'Load test, Amman',
      addressLat: 31.95,
      addressLng: 35.93,
    }),
  });

  // SLOs: env-overridable floors (see the constants above). Defaults are the
  // tight laptop floors; CI relaxes rps/p99 but keeps the error-rate gate.
  const readOk = evaluate('GET /services (read)', readResult, {
    minRps: READ_MIN_RPS,
    maxP99Ms: READ_MAX_P99,
    maxErrorRate: MAX_ERROR_RATE,
  });
  const writeOk = evaluate('POST /bookings (write: tx + outbox)', writeResult, {
    minRps: WRITE_MIN_RPS,
    maxP99Ms: WRITE_MAX_P99,
    maxErrorRate: MAX_ERROR_RATE,
  });

  if (!readOk || !writeOk) {
    console.error('\nLoad test FAILED — an SLO was breached.');
    process.exit(1);
  }
  console.log('\nLoad test PASSED — all SLOs met.');
}

main().catch((err) => {
  console.error('Load test error:', err);
  process.exit(1);
});

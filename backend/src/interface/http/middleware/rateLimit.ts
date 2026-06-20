import { rateLimit, Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../../infrastructure/cache/redis';
import { env } from '../../../shared/env';

/** Rate limiting is on everywhere except the test environment. */
export const rateLimitEnabled = (): boolean => env().NODE_ENV !== 'test';

/**
 * Distributed rate limiting backed by Redis so limits hold across multiple
 * backend instances (a per-process memory store would let N instances allow
 * N× the traffic). Returns a structured error matching the app envelope.
 */
function build(prefix: string, windowMs: number, max: number) {
  const config: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<never>,
    }),
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests — slow down' },
      });
    },
  };
  return rateLimit(config);
}

// Broad protection for the whole API surface.
export const globalLimiter = build('global', 60_000, 300);

// Tighter cap on auth endpoints (credential stuffing / OTP abuse defence-in-depth;
// AuthService also enforces per-phone OTP cooldown + attempt lockout).
export const authLimiter = build('auth', 60_000, 20);

// PSP webhooks are mounted before the global limiter (they need the raw body), so they
// would otherwise be unmetered. The real PSP is a single source that may legitimately
// burst, so the cap is generous — it only exists to bound a flood of forged/garbage
// deliveries (which decodeWebhook already rejects before any DB work).
export const webhookLimiter = build('webhook', 60_000, 600);

import { Request, Response, NextFunction } from 'express';
import { redis } from '../../../infrastructure/cache/redis';
import { logger } from '../../../shared/logger';

const RESPONSE_TTL_SECONDS = 24 * 60 * 60; // §3.1/§3.2/§5.1: 24h idempotency window.
// Short lock while the original request is still in flight — bounds how long a
// crashed/hung handler can strand a concurrent retry (vs. the full 24h response TTL).
const PROCESSING_TTL_SECONDS = 30;

interface CachedEntry {
  status: 'processing' | number;
  body?: unknown;
}

/**
 * Idempotency-Key support for client-originated, money-moving POSTs (§3.1/§3.2/§5.1).
 * Additive: a request without the header behaves exactly as before. With the header:
 *
 *   - First request: claims a short-lived "processing" placeholder in Redis (NX), runs
 *     the handler, then overwrites the placeholder with the real response for 24h.
 *   - A retry with the same key while the original is still in flight gets a 409 rather
 *     than re-executing the side effect (e.g. creating a second booking).
 *   - A retry after the original completed gets the cached response replayed verbatim —
 *     the handler never runs again.
 *
 * Keyed by route + authenticated user + the client's key, so one client can never read
 * or replay another's cached response.
 */
export function idempotency(routeName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.trim() === '') {
      next();
      return;
    }

    const userId = req.user?.userId ?? 'anon';
    const cacheKey = `idempotency:${routeName}:${userId}:${key.trim()}`;

    try {
      const acquired = await redis.set(
        cacheKey,
        JSON.stringify({ status: 'processing' } satisfies CachedEntry),
        'EX',
        PROCESSING_TTL_SECONDS,
        'NX',
      );

      if (!acquired) {
        const existing = await redis.get(cacheKey);
        if (existing) {
          const parsed = JSON.parse(existing) as CachedEntry;
          if (parsed.status === 'processing') {
            res.status(409).json({
              error: { code: 'CONFLICT', message: 'A request with this Idempotency-Key is already being processed' },
            });
            return;
          }
          res.status(parsed.status).json(parsed.body);
          return;
        }
        // Lost the read race (key expired between SET NX and GET) — fall through
        // and let the handler run rather than hang the request.
      }
    } catch (err) {
      // Cache unavailable: fail open (proceed without idempotency) rather than
      // block the request on a Redis outage.
      logger.warn({ err, cacheKey }, 'idempotency: cache unavailable, proceeding without dedupe');
      next();
      return;
    }

    // Wrap res.json so the eventual response replaces the "processing" placeholder.
    // Only 2xx/4xx are cached: those are deterministic for a given request, so replay
    // is correct. A 5xx is transient — caching it for 24h would poison every retry
    // (the client re-sends the same Idempotency-Key precisely because it wants the
    // operation to actually succeed on retry). So on 5xx we DELETE the placeholder,
    // freeing the key for an immediate re-run rather than replaying the failure.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode < 500) {
        const entry: CachedEntry = { status: res.statusCode, body };
        void redis
          .set(cacheKey, JSON.stringify(entry), 'EX', RESPONSE_TTL_SECONDS)
          .catch((err) => logger.warn({ err, cacheKey }, 'idempotency: cache write failed'));
      } else {
        void redis
          .del(cacheKey)
          .catch((err) => logger.warn({ err, cacheKey }, 'idempotency: placeholder cleanup failed'));
      }
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}

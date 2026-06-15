import { Router, Response } from 'express';
import { prisma } from '../../../infrastructure/database/prisma';
import { redis } from '../../../infrastructure/cache/redis';

/**
 * Liveness probe (k8s-style). MUST NOT depend on external services — a
 * dependency outage must not cause the orchestrator to restart the pod
 * (that's what readiness is for). The pod is alive as long as the event
 * loop is responsive.
 */
export const livenessRouter: Router = Router();
livenessRouter.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Single source of truth for the deep dependency check used by both /ready
 * and the legacy /health route. Pings every external dependency the request
 * path needs and writes a 200 (all up) or 503 (any down) response. The
 * top-level `status` reflects the aggregate so a degraded check never reads
 * "ok" while returning 503.
 */
async function writeReadiness(res: Response): Promise<void> {
  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk = db.status === 'fulfilled';
  const redisOk = cache.status === 'fulfilled';
  const healthy = dbOk && redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    redis: redisOk ? 'ok' : 'error',
  });
}

/**
 * Readiness probe. Returns 503 if any dependency is down so the load
 * balancer stops sending traffic until the dependency recovers.
 */
export const readinessRouter: Router = Router();
readinessRouter.get('/', (_req, res) => writeReadiness(res));

/**
 * Legacy `/health` route. Kept for backwards compatibility with existing
 * clients and smoke scripts — same shape as /ready. New code should
 * prefer /ready (and /live for the cheap aliveness signal).
 */
export const healthRouter: Router = Router();
healthRouter.get('/', (_req, res) => writeReadiness(res));

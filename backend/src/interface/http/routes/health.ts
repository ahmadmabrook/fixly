import { Router } from 'express';
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
 * Readiness probe. Pings every external dependency the request path needs.
 * Returns 503 if any of them is down so the load balancer stops sending
 * traffic until the dependency recovers.
 */
export const readinessRouter: Router = Router();
readinessRouter.get('/', async (_req, res) => {
  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const status = {
    status: 'ok',
    db: db.status === 'fulfilled' ? 'ok' : 'error',
    redis: cache.status === 'fulfilled' ? 'ok' : 'error',
  };
  const httpStatus = status.db === 'ok' && status.redis === 'ok' ? 200 : 503;
  res.status(httpStatus).json(status);
});

/**
 * Legacy `/health` route. Kept for backwards compatibility with existing
 * clients and smoke scripts — same shape as /ready. New code should
 * prefer /ready (and /live for the cheap aliveness signal).
 */
export const healthRouter: Router = Router();
healthRouter.get('/', async (_req, res) => {
  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const status = {
    status: 'ok',
    db: db.status === 'fulfilled' ? 'ok' : 'error',
    redis: cache.status === 'fulfilled' ? 'ok' : 'error',
  };

  const httpStatus = status.db === 'ok' && status.redis === 'ok' ? 200 : 503;
  res.status(httpStatus).json(status);
});

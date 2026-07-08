import IORedis from 'ioredis';
import { logger } from '../../shared/logger';

export const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => logger.error(err, 'Redis error'));
redis.on('connect', () => logger.debug('Redis connected'));

// ── Technician live-location GEO (design doc §2.4) ──────────────────────────
// Key names + the staleness threshold are shared between TechnicianService
// (writer, via updateLocation) and DispatchService (reader, via qualifiedTechs),
// so they're centralized here rather than duplicated as magic strings in both.

/** GEO set: member = technicianProfile.id, coordinates = live lat/lng. */
export const TECH_LOCATIONS_KEY = 'tech:locations';
/** Sorted set: member = technicianProfile.id, score = last heartbeat (ms epoch).
 *  Backs the "missing heartbeat >30s is pruned" rule from §2.4. */
export const TECH_HEARTBEAT_KEY = 'tech:heartbeat';
export const HEARTBEAT_STALE_MS = 30_000;

/**
 * Prune technicians whose last heartbeat is older than HEARTBEAT_STALE_MS from
 * both the heartbeat sorted set and the GEO set. GEOADD is backed by a sorted
 * set internally (there is no GEODEL) so ZREM on the same member id removes it
 * from the GEO index too. Call this before every dispatch GEOSEARCH so a
 * crashed/backgrounded technician app doesn't get matched to new jobs.
 */
export async function pruneStaleTechnicians(): Promise<void> {
  const staleBefore = Date.now() - HEARTBEAT_STALE_MS;
  const stale = await redis.zrangebyscore(TECH_HEARTBEAT_KEY, '-inf', staleBefore);
  if (stale.length === 0) return;
  await redis.zrem(TECH_HEARTBEAT_KEY, ...stale);
  await redis.zrem(TECH_LOCATIONS_KEY, ...stale);
}

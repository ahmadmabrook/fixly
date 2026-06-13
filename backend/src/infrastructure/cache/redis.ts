import IORedis from 'ioredis';
import { logger } from '../../shared/logger';

export const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => logger.error(err, 'Redis error'));
redis.on('connect', () => logger.debug('Redis connected'));

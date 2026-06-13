import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
  ],
});

if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    logger.debug({ query: e.query, duration: e.duration }, 'DB query');
  });
}

prisma.$on('error', (e) => {
  logger.error(e, 'DB error');
});

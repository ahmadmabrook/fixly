import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { ReviewService } from '../../../application/review/ReviewService';
import { redis } from '../../../infrastructure/cache/redis';
import { logger } from '../../../shared/logger';

/** Public (unauthenticated) reviews surface for the marketing landing page. */
export const reviewsPublicRouter: Router = Router();

const reviewService = new ReviewService();
const CACHE_KEY = 'reviews:recent';
const CACHE_TTL_SECONDS = 60;

// GET /reviews/recent — a few recent high-rated reviews. This is an anonymous,
// high-traffic landing-page path, so the result is cached in Redis (60s) to keep
// the DB off the hot read path; the response also carries a browser/CDN max-age.
reviewsPublicRouter.get(
  '/recent',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=120');

    const cached = await redis.get(CACHE_KEY).catch((err) => {
      logger.warn({ err }, 'reviews:recent cache read failed');
      return null;
    });
    if (cached) {
      res.type('application/json').send(cached);
      return;
    }

    const items = await reviewService.recentReviews(6);
    const body = JSON.stringify({ data: items });
    // Best-effort cache write — never fail the request on a cache miss/error.
    await redis.set(CACHE_KEY, body, 'EX', CACHE_TTL_SECONDS).catch((err) => {
      logger.warn({ err }, 'reviews:recent cache write failed');
    });
    res.type('application/json').send(body);
  }),
);

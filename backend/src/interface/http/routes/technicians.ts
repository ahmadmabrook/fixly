import { Router } from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { ReviewService } from '../../../application/review/ReviewService';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

/** Public (authenticated) technician info + verified reviews — used by the
 *  customer's "assigned technician" card and the reviews screen. */
export const techniciansRouter: Router = Router();

const reviewService = new ReviewService();

techniciansRouter.use(authenticate);

// GET /technicians/:id — public-safe profile card (no PII beyond display name).
techniciansRouter.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const profile = await prisma.technicianProfile.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        rating: true,
        totalReviews: true,
        vehicle: true,
        isVerified: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });
    if (!profile) throw new NotFoundError('Technician');
    res.json({
      data: {
        id: profile.id,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl,
        rating: profile.rating,
        totalReviews: profile.totalReviews,
        vehicle: profile.vehicle,
        isVerified: profile.isVerified,
      },
    });
  }),
);

// GET /technicians/:id/reviews — verified reviews + rating summary.
techniciansRouter.get(
  '/:id/reviews',
  validate([
    param('id').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 20;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const result = await reviewService.getTechnicianReviews(req.params.id, limit, offset);
    res.json({ data: { summary: result.summary, items: result.items }, meta: { total: result.total, limit, offset } });
  }),
);

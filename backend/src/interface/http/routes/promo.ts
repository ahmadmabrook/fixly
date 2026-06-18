import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { PromoService } from '../../../application/promo/PromoService';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

export const promoRouter: Router = Router();

const promoService = new PromoService();

promoRouter.use(authenticate);

// POST /promo/validate — check a code against a service's price before booking.
// Returns the discount + final amount so the review screen can show the breakdown.
promoRouter.post(
  '/validate',
  validate([
    body('code').isString().trim().isLength({ min: 1, max: 40 }),
    body('serviceId').isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({ where: { id: req.body.serviceId } });
    if (!service || !service.isActive) throw new NotFoundError('Service');
    const quote = await promoService.quote(req.body.code, req.user!.userId, service.priceJod);
    res.json({
      data: {
        code: quote.code,
        discountJod: quote.discountJod.toString(),
        finalJod: quote.finalJod.toString(),
        originalJod: service.priceJod.toString(),
      },
    });
  }),
);

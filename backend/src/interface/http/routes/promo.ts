import { Router } from 'express';
import { body } from 'express-validator';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { PromoService } from '../../../application/promo/PromoService';
import { SubscriptionService } from '../../../application/subscription/SubscriptionService';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

export const promoRouter: Router = Router();

const promoService = new PromoService();
const subscriptionService = new SubscriptionService();

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

    // Quote against the same base BookingService.create.ts actually charges: list
    // price minus any active Protection-plan subscription discount (subscriberPrice),
    // not the raw list price. Otherwise a subscribed customer previewing a promo here
    // sees a discount/final amount that doesn't match what they're actually charged at
    // booking time, where the promo stacks on top of the already member-discounted price.
    const listPrice = new Prisma.Decimal(service.priceJod);
    const subscription = await subscriptionService.activeFor(req.user!.userId);
    const subDiscount = subscription ? listPrice.mul(subscription.discountPercent).div(100) : new Prisma.Decimal(0);
    const subscriberPrice = listPrice.sub(subDiscount);

    const quote = await promoService.quote(req.body.code, req.user!.userId, subscriberPrice);
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

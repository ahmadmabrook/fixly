import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { SubscriptionService } from '../../../application/subscription/SubscriptionService';

/** Customer-facing Protection subscription (§0.3). */
export const subscriptionsRouter: Router = Router();

const subscriptionService = new SubscriptionService();

subscriptionsRouter.use(authenticate, requireActiveUser);

// GET /subscriptions/me — current plan + recent charges.
subscriptionsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await subscriptionService.getMine(req.user!.userId) });
  }),
);

// POST /subscriptions — start the Protection plan (card-on-file for renewals).
subscriptionsRouter.post(
  '/',
  validate([body('paymentToken').optional({ nullable: true }).isString().trim().isLength({ max: 200 })]),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.subscribe(req.user!.userId, req.body.paymentToken ?? undefined);
    res.status(201).json({ data: sub });
  }),
);

// POST /subscriptions/cancel — cancel at period end (benefits stay until then).
subscriptionsRouter.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    res.json({ data: await subscriptionService.cancel(req.user!.userId) });
  }),
);

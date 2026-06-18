import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { prisma } from '../../../infrastructure/database/prisma';

/** Push-notification device-token registration (FCM/APNs token store). */
export const devicesRouter: Router = Router();

devicesRouter.use(authenticate, requireActiveUser);

devicesRouter.post(
  '/',
  validate([
    body('token').isString().trim().isLength({ min: 1, max: 4096 }),
    body('platform').isString().trim().isIn(['ios', 'android', 'web']),
  ]),
  asyncHandler(async (req, res) => {
    // Re-registering the same token (e.g. after reinstall) just re-points it at
    // this user — upsert on the unique token keeps one row per device.
    const device = await prisma.deviceToken.upsert({
      where: { token: req.body.token },
      update: { userId: req.user!.userId, platform: req.body.platform },
      create: { userId: req.user!.userId, token: req.body.token, platform: req.body.platform },
      select: { id: true, platform: true, createdAt: true },
    });
    res.status(201).json({ data: device });
  }),
);

devicesRouter.delete(
  '/:token',
  validate([param('token').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    await prisma.deviceToken.deleteMany({ where: { token: req.params.token, userId: req.user!.userId } });
    res.status(204).end();
  }),
);

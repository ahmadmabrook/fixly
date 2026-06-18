import { Router } from 'express';
import { param, query } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

export const notificationsRouter: Router = Router();

notificationsRouter.use(authenticate, requireActiveUser);

// GET /notifications — inbox (newest first) + unread count in meta.
notificationsRouter.get(
  '/',
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const [items, total, unread] = await prisma.$transaction([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    res.json({ data: items, meta: { total, unread, limit, offset } });
  }),
);

// POST /notifications/:id/read
notificationsRouter.post(
  '/:id/read',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
    if (!existing) throw new NotFoundError('Notification');
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ data: updated });
  }),
);

// POST /notifications/read-all
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.userId, isRead: false }, data: { isRead: true } });
    res.json({ data: { ok: true } });
  }),
);

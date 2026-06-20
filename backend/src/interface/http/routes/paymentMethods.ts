import { Router } from 'express';
import { body, param } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

/**
 * Saved payment methods. The card itself is tokenised by the (mock) PSP — we
 * NEVER store a PAN, only the display brand/last4/expiry + an opaque providerRef.
 */
export const paymentMethodsRouter: Router = Router();

paymentMethodsRouter.use(authenticate, requireActiveUser);

paymentMethodsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.paymentMethod.findMany({
      where: { userId: req.user!.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, brand: true, last4: true, expMonth: true, expYear: true, isDefault: true, createdAt: true },
    });
    res.json({ data: items });
  }),
);

paymentMethodsRouter.post(
  '/',
  validate([
    body('brand').isString().trim().isIn(['visa', 'mastercard', 'amex']),
    body('last4').isString().trim().isLength({ min: 4, max: 4 }).isNumeric(),
    body('expMonth').isInt({ min: 1, max: 12 }).toInt(),
    body('expYear').isInt({ min: 2024, max: 2099 }).toInt(),
    body('isDefault').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.paymentMethod.count({ where: { userId } });
      const makeDefault = req.body.isDefault === true || count === 0;
      if (makeDefault) await tx.paymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.paymentMethod.create({
        data: {
          userId,
          brand: req.body.brand,
          last4: req.body.last4,
          expMonth: req.body.expMonth,
          expYear: req.body.expYear,
          // Mock tokenisation — a real PSP returns this from a client-side tokenize call.
          providerRef: `pm_mock_${uuidv4()}`,
          isDefault: makeDefault,
        },
        select: { id: true, brand: true, last4: true, expMonth: true, expYear: true, isDefault: true, createdAt: true },
      });
    });
    res.status(201).json({ data: created });
  }),
);

paymentMethodsRouter.post(
  '/:id/default',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const existing = await prisma.paymentMethod.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new NotFoundError('PaymentMethod');
    await prisma.$transaction([
      prisma.paymentMethod.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.paymentMethod.update({ where: { id: req.params.id }, data: { isDefault: true } }),
    ]);
    res.json({ data: { ok: true } });
  }),
);

paymentMethodsRouter.delete(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentMethod.findFirst({ where: { id: req.params.id, userId } });
      if (!existing) throw new NotFoundError('PaymentMethod');
      await tx.paymentMethod.delete({ where: { id: req.params.id } });
      // If we removed the default, promote the most-recently-added remaining card so the
      // user always keeps a usable default for 1-tap checkout (F6).
      if (existing.isDefault) {
        const next = await tx.paymentMethod.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.paymentMethod.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.status(204).end();
  }),
);

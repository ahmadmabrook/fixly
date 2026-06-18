import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { prisma } from '../../../infrastructure/database/prisma';
import { NotFoundError } from '../../../shared/errors';

export const addressesRouter: Router = Router();

addressesRouter.use(authenticate, requireActiveUser);

// Fresh chains per call — express-validator chains are stateful middleware, so
// reusing instances (or mutating them with .optional()) would leak across routes.
function addressFields(allOptional: boolean) {
  const req = (name: string) => (allOptional ? body(name).optional() : body(name));
  return [
    req('label').isString().trim().isLength({ min: 1, max: 60 }),
    req('line').isString().trim().isLength({ min: 1, max: 500 }),
    req('lat').isFloat({ min: -90, max: 90 }),
    req('lng').isFloat({ min: -180, max: 180 }),
    body('building').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('apartment').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('isDefault').optional().isBoolean().toBoolean(),
  ];
}

addressesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.address.findMany({
      where: { userId: req.user!.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ data: items });
  }),
);

addressesRouter.post(
  '/',
  validate(addressFields(false)),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const address = await prisma.$transaction(async (tx) => {
      // First address is default automatically; an explicit default clears others.
      const count = await tx.address.count({ where: { userId } });
      const makeDefault = req.body.isDefault === true || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId,
          label: req.body.label,
          line: req.body.line,
          lat: req.body.lat,
          lng: req.body.lng,
          building: req.body.building ?? null,
          apartment: req.body.apartment ?? null,
          notes: req.body.notes ?? null,
          isDefault: makeDefault,
        },
      });
    });
    res.status(201).json({ data: address });
  }),
);

addressesRouter.patch(
  '/:id',
  validate([param('id').isUUID(), ...addressFields(true)]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new NotFoundError('Address');
    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault === true) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({
        where: { id: req.params.id },
        data: {
          label: req.body.label ?? undefined,
          line: req.body.line ?? undefined,
          lat: req.body.lat ?? undefined,
          lng: req.body.lng ?? undefined,
          building: req.body.building ?? undefined,
          apartment: req.body.apartment ?? undefined,
          notes: req.body.notes ?? undefined,
          isDefault: req.body.isDefault ?? undefined,
        },
      });
    });
    res.json({ data: updated });
  }),
);

addressesRouter.delete(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
    if (!existing) throw new NotFoundError('Address');
    await prisma.address.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

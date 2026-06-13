import { Router } from 'express';
import { prisma } from '../../../infrastructure/database/prisma';
import { asyncHandler } from '../asyncHandler';

export const servicesRouter: Router = Router();

servicesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });
    // Catalogue changes rarely and is identical for all clients — cache briefly.
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data: services });
  }),
);

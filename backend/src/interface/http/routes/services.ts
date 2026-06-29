import { Router } from 'express';
import { query } from 'express-validator';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';

export const servicesRouter: Router = Router();

servicesRouter.get(
  '/',
  validate([
    query('category').optional().isString().trim(),
    query('search').optional().isString().trim(),
    query('sort').optional().isIn(['price_asc', 'price_desc', 'duration_asc', 'duration_desc', 'category']),
  ]),
  asyncHandler(async (req, res) => {
    const where: Prisma.ServiceWhereInput = { isActive: true };
    const cat = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    if (cat) where.category = cat;
    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortMap: Record<string, Prisma.ServiceOrderByWithRelationInput> = {
      price_asc: { priceJod: 'asc' },
      price_desc: { priceJod: 'desc' },
      duration_asc: { durationMin: 'asc' },
      duration_desc: { durationMin: 'desc' },
      category: { category: 'asc' },
    };
    const orderBy = sortMap[req.query.sort as string] ?? { category: 'asc' };

    const services = await prisma.service.findMany({ where, orderBy });

    const categories = await prisma.service.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data: services, meta: { categories: categories.map((c) => c.category) } });
  }),
);

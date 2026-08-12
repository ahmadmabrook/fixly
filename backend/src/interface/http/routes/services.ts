import { Router } from 'express';
import { param, query } from 'express-validator';
import { Prisma, MaterialMode, SubstitutionPolicy, MaterialTier } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { MaterialCatalogService } from '../../../application/materials/MaterialCatalogService';

export const servicesRouter: Router = Router();

const catalogService = new MaterialCatalogService();

/** Mirrors ServiceMaterialPolicy's own Prisma @default values — a service
 *  with no policy row behaves exactly as if this were its row. */
const DEFAULT_MATERIAL_POLICY = {
  mode: MaterialMode.LABOUR_ONLY,
  microThresholdFils: 3000,
  allowCustomerSupply: true,
  substitution: SubstitutionPolicy.SAME_OR_HIGHER_TIER,
  quoteRequiredAboveFils: null as number | null,
  quoteValidityHours: 168,
  qualityFloorGrade: MaterialTier.ECONOMY,
  surplusBelongsToCustomer: true,
};

servicesRouter.get(
  '/',
  validate([
    // Length-cap both free-text params: this is a public, unauthenticated route
    // and `search` drives a case-insensitive `contains` (LIKE %…%) over the
    // un-indexed nameAr/nameEn columns — an unbounded string is a slow-query /
    // abuse vector. Caps match the codebase convention (addresses/adminOps).
    query('category').optional().isString().trim().isLength({ max: 60 }),
    query('search').optional().isString().trim().isLength({ max: 80 }),
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

// §17.5.5 — the five materials-policy questions, "shown before booking".
// Public (no auth) like the rest of this router: a prospective customer must
// be able to see this before they've even signed up.
servicesRouter.get(
  '/:id/material-policy',
  // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
  // nibble (0), same reasoning as POST /bookings (bookings.ts).
  validate([param('id').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    const policy = await prisma.serviceMaterialPolicy.findUnique({ where: { serviceId: req.params.id } });
    res.json({ data: policy ?? { serviceId: req.params.id, ...DEFAULT_MATERIAL_POLICY } });
  }),
);

// §17.5.6 rule 2 "the technician selects, never prices" — the price book for
// one service, for the app's material picker (technician BOM drafting,
// itemized-quote assessment). Authenticated (not public): this is the
// operational price book, not marketing content.
servicesRouter.get(
  '/:id/materials',
  authenticate,
  // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
  // nibble (0), same reasoning as POST /bookings (bookings.ts).
  validate([param('id').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    const { items } = await catalogService.list({ serviceId: req.params.id, isActive: true }, 200, 0);
    res.json({ data: items });
  }),
);

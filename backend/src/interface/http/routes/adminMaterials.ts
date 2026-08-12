import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { CatalogSource, RefreshCadence, PriceConfidence, MaterialTier, PriceIndexKind, VerificationStatus, MaterialMode, SubstitutionPolicy } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { asyncHandler } from '../asyncHandler';
import { validate, paginationQuery } from '../validate';
import { requireAdminRole } from '../middleware/auth';
import { MaterialCatalogService } from '../../../application/materials/MaterialCatalogService';
import { SupplierService } from '../../../application/materials/SupplierService';
import { PriceIndexService } from '../../../application/materials/PriceIndexService';
import { CategoryReadinessService } from '../../../application/materials/CategoryReadinessService';
import { BookingMaterialService } from '../../../application/materials/BookingMaterialService';
import { MaterialVerificationService } from '../../../application/materials/MaterialVerificationService';
import { getBookingQuoteService } from '../../../application/quote/BookingQuoteService';

const CATALOG_SOURCES = Object.values(CatalogSource);
const REFRESH_CADENCES = Object.values(RefreshCadence);
const PRICE_CONFIDENCES = Object.values(PriceConfidence);
const MATERIAL_TIERS = Object.values(MaterialTier);
const PRICE_INDEX_KINDS = Object.values(PriceIndexKind);
const VERIFICATION_STATUSES = Object.values(VerificationStatus);
const MATERIAL_MODES = Object.values(MaterialMode);
const SUBSTITUTION_POLICIES = Object.values(SubstitutionPolicy);

/**
 * Admin surface for the §17.5 materials/pricing engine — materials catalog,
 * suppliers, price index, category readiness, itemized quote-line drafting,
 * BOM review, and price-verification disputes. Mounted INSIDE adminRouter
 * (after its single auth guard), same convention as adminOps/adminBusiness.
 * Role split follows FIGMA_MAKE_PROMPT.md's admin-nav role map: materials/
 * suppliers/BOM/verifications/quote-lines = OPS; price index = OPS or FINANCE.
 */
export const adminMaterialsRouter: Router = Router();

const catalogService = new MaterialCatalogService();
const supplierService = new SupplierService();
const priceIndexService = new PriceIndexService();
const readinessService = new CategoryReadinessService();
const bookingMaterialService = new BookingMaterialService();
const verificationService = new MaterialVerificationService();

// ── Materials catalog (OPS) ─────────────────────────────────────────────
adminMaterialsRouter.get(
  '/materials',
  requireAdminRole('OPS'),
  validate([
    // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
    // nibble (0), same reasoning as POST /bookings (bookings.ts).
    query('serviceId').optional().isString().trim().notEmpty(),
    query('isActive').optional().isBoolean().toBoolean(),
    ...paginationQuery(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 100;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await catalogService.list(
      { serviceId: req.query.serviceId as string | undefined, isActive: req.query.isActive as unknown as boolean | undefined },
      limit,
      offset,
    );
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.get(
  '/materials/:id',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await catalogService.get(req.params.id) });
  }),
);

const materialCatalogBodyValidators = [
  // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
  // nibble (0), same reasoning as POST /bookings (bookings.ts).
  body('serviceId').optional({ nullable: true }).isString().trim().notEmpty(),
  body('supplierId').optional({ nullable: true }).isUUID(),
  body('catalogSource').optional().isIn(CATALOG_SOURCES),
  body('refreshCadence').optional().isIn(REFRESH_CADENCES),
  body('priceConfidence').optional().isIn(PRICE_CONFIDENCES),
  body('slug').optional().isString().trim().isLength({ min: 1, max: 60 }),
  body('subcategory').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
  body('allowedForServices').optional().isArray({ max: 50 }),
  body('nameAr').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('nameEn').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('brand').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
  body('tier').optional().isIn(MATERIAL_TIERS),
  body('unit').optional().isString().trim().isLength({ min: 1, max: 20 }),
  body('wholesaleFils').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('unitPriceFils').optional().isInt({ min: 0 }).toInt(),
  body('priceMinFils').optional().isInt({ min: 0 }).toInt(),
  body('priceMaxFils').optional().isInt({ min: 0 }).toInt(),
  body('varianceAlertBps').optional().isInt({ min: 0, max: 10_000 }).toInt(),
  body('coverageNote').optional({ nullable: true }).isString().trim().isLength({ max: 300 }),
  body('isActive').optional().isBoolean().toBoolean(),
];

adminMaterialsRouter.post(
  '/materials',
  requireAdminRole('OPS'),
  validate(materialCatalogBodyValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await catalogService.create(req.body) });
  }),
);

adminMaterialsRouter.patch(
  '/materials/:id',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), ...materialCatalogBodyValidators]),
  asyncHandler(async (req, res) => {
    res.json({ data: await catalogService.update(req.params.id, req.body) });
  }),
);

// §3.4 GET /admin/catalog/staleness — active rows overdue for their refresh
// cadence. Registered before /materials/:id so "staleness" isn't swallowed as
// a UUID param.
adminMaterialsRouter.get(
  '/materials-staleness',
  requireAdminRole('OPS'),
  asyncHandler(async (_req, res) => {
    res.json({ data: await catalogService.listStale() });
  }),
);

// §17.5.6 stage A item 1 — the retail-observation log behind a catalogue row's price.
adminMaterialsRouter.get(
  '/materials/:materialId/observations',
  requireAdminRole('OPS'),
  validate([param('materialId').isUUID(), ...paginationQuery()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await catalogService.listObservations(req.params.materialId, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.post(
  '/materials/:materialId/observations',
  requireAdminRole('OPS'),
  validate([
    param('materialId').isUUID(),
    body('supplierId').optional({ nullable: true }).isUUID(),
    body('shopName').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('area').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('observedFils').isInt({ min: 0 }).toInt(),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const observation = await catalogService.recordObservation({
      materialId: req.params.materialId,
      supplierId: req.body.supplierId ?? undefined,
      shopName: req.body.shopName ?? undefined,
      area: req.body.area ?? undefined,
      observedFils: req.body.observedFils,
      observedById: req.user!.userId,
      note: req.body.note ?? undefined,
    });
    res.status(201).json({ data: observation });
  }),
);

// ── Service materials policy (OPS) — §17.5.5 ──────────────────────────────
adminMaterialsRouter.put(
  '/services/:id/material-policy',
  requireAdminRole('OPS'),
  validate([
    param('id').isUUID(),
    body('mode').optional().isIn(MATERIAL_MODES),
    body('microThresholdFils').optional().isInt({ min: 0 }).toInt(),
    body('allowCustomerSupply').optional().isBoolean().toBoolean(),
    body('substitution').optional().isIn(SUBSTITUTION_POLICIES),
    body('quoteRequiredAboveFils').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('quoteValidityHours').optional().isInt({ min: 1, max: 24 * 30 }).toInt(),
    body('qualityFloorGrade').optional().isIn(MATERIAL_TIERS),
    body('surplusBelongsToCustomer').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { mode, microThresholdFils, allowCustomerSupply, substitution, quoteRequiredAboveFils, quoteValidityHours, qualityFloorGrade, surplusBelongsToCustomer } = req.body;
    const data = { mode, microThresholdFils, allowCustomerSupply, substitution, quoteRequiredAboveFils, quoteValidityHours, qualityFloorGrade, surplusBelongsToCustomer };
    const policy = await prisma.serviceMaterialPolicy.upsert({
      where: { serviceId: req.params.id },
      create: { serviceId: req.params.id, ...data },
      update: data,
    });
    res.json({ data: policy });
  }),
);

// ── Suppliers (OPS) ──────────────────────────────────────────────────────
adminMaterialsRouter.get(
  '/suppliers',
  requireAdminRole('OPS'),
  validate([query('isActive').optional().isBoolean().toBoolean(), query('isPilot').optional().isBoolean().toBoolean(), ...paginationQuery()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 100;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await supplierService.list(
      { isActive: req.query.isActive as unknown as boolean | undefined, isPilot: req.query.isPilot as unknown as boolean | undefined },
      limit,
      offset,
    );
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

const supplierBodyValidators = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 160 }),
  body('contactPhone').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('categories').optional().isArray({ max: 20 }),
  body('contractRef').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body('isPilot').optional().isBoolean().toBoolean(),
  body('referralCommissionBps').optional({ nullable: true }).isInt({ min: 0, max: 10_000 }).toInt(),
  body('agreementKind').optional().isIn(['verbal', 'message', 'written']),
  body('trialStartedAt').optional({ nullable: true }).isISO8601(),
  body('trialEndsAt').optional({ nullable: true }).isISO8601(),
  body('commissionPaidOk').optional({ nullable: true }).isBoolean().toBoolean(),
  body('priceManipulationObserved').optional({ nullable: true }).isBoolean().toBoolean(),
  body('trialNotes').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
  body('isActive').optional().isBoolean().toBoolean(),
];

adminMaterialsRouter.post(
  '/suppliers',
  requireAdminRole('OPS'),
  validate(supplierBodyValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await supplierService.create(req.body) });
  }),
);

adminMaterialsRouter.patch(
  '/suppliers/:id',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), ...supplierBodyValidators]),
  asyncHandler(async (req, res) => {
    res.json({ data: await supplierService.update(req.params.id, req.body) });
  }),
);

// ── Price index (OPS or FINANCE — the monthly-ritual entry page) ─────────
adminMaterialsRouter.get(
  '/price-index',
  requireAdminRole('OPS', 'FINANCE'),
  validate([query('kind').optional().isIn(PRICE_INDEX_KINDS), ...paginationQuery()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await priceIndexService.list(req.query.kind as PriceIndexKind | undefined, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.post(
  '/price-index',
  requireAdminRole('OPS', 'FINANCE'),
  validate([
    body('kind').isIn(PRICE_INDEX_KINDS),
    body('periodMonth').isISO8601(),
    body('valueNumeric').isFloat(),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('sourceUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const reading = await priceIndexService.recordReading({ ...req.body, recordedById: req.user!.userId });
    res.status(201).json({ data: reading });
  }),
);

// ── Category readiness gate (OPS) ─────────────────────────────────────────
adminMaterialsRouter.get(
  '/category-readiness',
  requireAdminRole('OPS'),
  validate(paginationQuery()),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await readinessService.list(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.get(
  '/category-readiness/:serviceId',
  requireAdminRole('OPS'),
  // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
  // nibble (0), same reasoning as POST /bookings (bookings.ts).
  validate([param('serviceId').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await readinessService.get(req.params.serviceId) });
  }),
);

// ── Itemized quote-line drafting (OPS) — §17.5.3/§17.5.12 ─────────────────
adminMaterialsRouter.post(
  '/quotes/:id/lines',
  requireAdminRole('OPS'),
  validate([
    param('id').isUUID(),
    body('kind').isIn(['LABOUR', 'MATERIAL', 'PREP', 'FEE']),
    body('materialId').optional({ nullable: true }).isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 300 }),
    body('qty').optional().isFloat({ gt: 0 }),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('unitPriceFils').isInt({ min: 0 }).toInt(),
    body('source').optional().isIn(['TECHNICIAN_PROCURED', 'CUSTOMER_SUPPLIED', 'PLATFORM_ARRANGED']),
  ]),
  asyncHandler(async (req, res) => {
    const quote = await getBookingQuoteService().addLine(req.params.id, req.body);
    res.status(201).json({ data: quote });
  }),
);

adminMaterialsRouter.patch(
  '/quotes/:id/lines/:lineId',
  requireAdminRole('OPS'),
  validate([
    param('id').isUUID(),
    param('lineId').isUUID(),
    body('kind').optional().isIn(['LABOUR', 'MATERIAL', 'PREP', 'FEE']),
    body('materialId').optional({ nullable: true }).isUUID(),
    body('description').optional().isString().trim().isLength({ min: 1, max: 300 }),
    body('qty').optional().isFloat({ gt: 0 }),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('unitPriceFils').optional().isInt({ min: 0 }).toInt(),
    body('source').optional().isIn(['TECHNICIAN_PROCURED', 'CUSTOMER_SUPPLIED', 'PLATFORM_ARRANGED']),
  ]),
  asyncHandler(async (req, res) => {
    const quote = await getBookingQuoteService().updateLine(req.params.id, req.params.lineId, req.body);
    res.json({ data: quote });
  }),
);

adminMaterialsRouter.delete(
  '/quotes/:id/lines/:lineId',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), param('lineId').isUUID()]),
  asyncHandler(async (req, res) => {
    const quote = await getBookingQuoteService().removeLine(req.params.id, req.params.lineId);
    res.json({ data: quote });
  }),
);

// Ops sign-off gate (§17.5.12 control #5), required before /send for
// over-threshold or off-catalogue quotes.
adminMaterialsRouter.post(
  '/quotes/:id/ops-review',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await getBookingQuoteService().opsReview(req.params.id, req.user!.userId) });
  }),
);

adminMaterialsRouter.post(
  '/quotes/:id/send',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await getBookingQuoteService().sendItemizedQuote(req.params.id, req.user!.userId) });
  }),
);

// ── BOM review queue (OPS) — §17.5.9 pending_review lines ─────────────────
adminMaterialsRouter.get(
  '/materials-review',
  requireAdminRole('OPS'),
  validate(paginationQuery()),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await bookingMaterialService.listPendingReview(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.post(
  '/materials-review/:lineId',
  requireAdminRole('OPS'),
  validate([param('lineId').isUUID(), body('decision').isIn(['APPROVED', 'DECLINED'])]),
  asyncHandler(async (req, res) => {
    res.json({ data: await bookingMaterialService.adminReview(req.params.lineId, req.body.decision, req.user!.userId) });
  }),
);

// ── Price verifications (OPS) — §17.5.14 dispute protocol ────────────────
adminMaterialsRouter.get(
  '/verifications',
  requireAdminRole('OPS'),
  validate([query('status').optional().isIn(VERIFICATION_STATUSES), ...paginationQuery()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await verificationService.listForAdmin(req.query.status as VerificationStatus | undefined, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminMaterialsRouter.post(
  '/verifications/:id/resolve',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('decision').isIn(['UPHELD', 'DEDUCTED', 'WITHDRAWN'])]),
  asyncHandler(async (req, res) => {
    res.json({ data: await verificationService.adminResolve(req.params.id, req.body.decision, req.user!.userId) });
  }),
);

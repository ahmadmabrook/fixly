import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { Prisma, TrustTier, ConductStatus, QuoteStatus } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { requireAdminRole } from '../middleware/auth';
import { TrustService } from '../../../application/technician/TrustService';
import { ConductReportService } from '../../../application/conduct/ConductReportService';
import { SubscriptionService } from '../../../application/subscription/SubscriptionService';
import { BookingQuoteService } from '../../../application/quote/BookingQuoteService';
import { prisma } from '../../../infrastructure/database/prisma';
import { audit } from '../../../application/admin/adminAudit';

/**
 * v1.5 admin surface (quality / trust vetting, conduct-report moderation,
 * subscription growth, video-quote pricing). Mounted on the admin router AFTER
 * its authenticate + requireRole('ADMIN') + requireActiveAdmin guard, so every
 * route here is already admin-gated; role-scoped actions add requireAdminRole.
 */
export const adminBusinessRouter: Router = Router();

const trustService = new TrustService();
const conductService = new ConductReportService();
const subscriptionService = new SubscriptionService();
const quoteService = new BookingQuoteService();

const TRUST_TIERS = Object.values(TrustTier);
const CONDUCT_STATUSES = Object.values(ConductStatus);
const QUOTE_STATUSES = Object.values(QuoteStatus);

// Reusable positive-money validator (≤3 dp, no float coercion).
const moneyBody = (field: string) =>
  body(field).custom((value) => {
    let d: Prisma.Decimal;
    try {
      d = new Prisma.Decimal(String(value));
    } catch {
      throw new Error(`${field} must be a number`);
    }
    if (!d.isFinite() || d.lessThanOrEqualTo(0)) throw new Error(`${field} must be greater than 0`);
    if (d.decimalPlaces() > 3) throw new Error(`${field} supports at most 3 decimal places`);
    return true;
  });

// ── Technician trust & vetting (§0.2 #1) ─────────────────────────────────────

// GET /quality/techs — trust-tier board.
adminBusinessRouter.get(
  '/quality/techs',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 100;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await trustService.qualityBoard(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /technicians/:id/trust-tier — override tier (OPS).
adminBusinessRouter.post(
  '/technicians/:id/trust-tier',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('tier').isIn(TRUST_TIERS)]),
  asyncHandler(async (req, res) => {
    const data = await trustService.setTrustTier(req.params.id, req.body.tier as TrustTier);
    await audit(prisma, req.user!.userId, 'technician.trust_tier', { type: 'TechnicianProfile', id: req.params.id }, { tier: req.body.tier }, req.ip);
    res.json({ data });
  }),
);

// POST /technicians/:id/bg-check — record background-check result (OPS).
adminBusinessRouter.post(
  '/technicians/:id/bg-check',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('result').isIn(['PASSED', 'FAILED'])]),
  asyncHandler(async (req, res) => {
    const data = await trustService.recordBgCheck(req.params.id, req.body.result);
    await audit(prisma, req.user!.userId, 'technician.bg_check', { type: 'TechnicianProfile', id: req.params.id }, { result: req.body.result }, req.ip);
    res.json({ data });
  }),
);

// POST /technicians/:id/skills-test — mark the skills test passed (OPS).
adminBusinessRouter.post(
  '/technicians/:id/skills-test',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const data = await trustService.markSkillsTestPassed(req.params.id);
    await audit(prisma, req.user!.userId, 'technician.skills_test', { type: 'TechnicianProfile', id: req.params.id }, undefined, req.ip);
    res.json({ data });
  }),
);

// ── Conduct reports (§0.2 #2) ────────────────────────────────────────────────

adminBusinessRouter.get(
  '/conduct-reports',
  validate([
    query('status').optional().isIn(CONDUCT_STATUSES),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as ConductStatus | undefined;
    const { items, total } = await conductService.listForAdmin(status, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /conduct-reports/:id/resolve — UPHELD increments the tech's flags (OPS).
adminBusinessRouter.post(
  '/conduct-reports/:id/resolve',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('decision').isIn(['UPHELD', 'DISMISSED'])]),
  asyncHandler(async (req, res) => {
    const data = await conductService.resolve(req.params.id, req.body.decision, req.user!.userId);
    await audit(prisma, req.user!.userId, 'conduct.resolve', { type: 'ConductReport', id: req.params.id }, { decision: req.body.decision }, req.ip);
    res.json({ data });
  }),
);

// ── Protection subscriptions (growth) ────────────────────────────────────────

adminBusinessRouter.get(
  '/subscriptions',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { activeCount, pastDueCount, mrrJod, items, total } = await subscriptionService.adminSummary(limit, offset);
    res.json({ data: items, meta: { total, limit, offset, activeCount, pastDueCount, mrrJod } });
  }),
);

// ── Video pre-check quote pricing (§0.3) ─────────────────────────────────────

adminBusinessRouter.get(
  '/quotes',
  validate([
    query('status').optional().isIn(QUOTE_STATUSES),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as QuoteStatus | undefined;
    const { items, total } = await quoteService.listForAdmin(status, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /quotes/:id/quote — set a firm price on a pending quote (OPS).
adminBusinessRouter.post(
  '/quotes/:id/quote',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), moneyBody('quotedJod')]),
  asyncHandler(async (req, res) => {
    const data = await quoteService.setQuote(req.params.id, req.user!.userId, req.body.quotedJod as string);
    await audit(prisma, req.user!.userId, 'quote.price', { type: 'BookingQuote', id: req.params.id }, { quotedJod: req.body.quotedJod }, req.ip);
    res.json({ data });
  }),
);

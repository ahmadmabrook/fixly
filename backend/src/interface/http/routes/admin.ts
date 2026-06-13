import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { BookingStatus, PayoutStatus } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { authenticate, requireRole } from '../middleware/auth';
import { authLimiter, rateLimitEnabled } from '../middleware/rateLimit';
import { AdminService } from '../../../application/admin/AdminService';
import { prisma } from '../../../infrastructure/database/prisma';
import { UnauthorizedError } from '../../../shared/errors';

/**
 * Re-check the admin still exists and is active on every privileged request.
 * Closes the gap where a disabled/compromised admin's live token kept working
 * until expiry (isActive was only checked at login).
 */
const requireActiveAdmin = asyncHandler(async (req, _res, next) => {
  const admin = await prisma.adminUser.findUnique({
    where: { id: req.user!.userId },
    select: { isActive: true },
  });
  if (!admin || !admin.isActive) throw new UnauthorizedError('Admin account is disabled');
  next();
});

// Derived from the Prisma enums so they can never drift from the schema.
const BOOKING_STATUSES = Object.values(BookingStatus);
const PAYOUT_STATUSES = Object.values(PayoutStatus);

export const adminRouter: Router = Router();

const adminService = new AdminService();

// POST /login — no auth, rate-limited
adminRouter.post(
  '/login',
  (req, res, next) => (rateLimitEnabled() ? authLimiter(req, res, next) : next()),
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isString().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const result = await adminService.login(req.body.email, req.body.password, req.ip);
    res.json({ data: result });
  }),
);

// All routes below require an active ADMIN.
adminRouter.use(authenticate, requireRole('ADMIN'), requireActiveAdmin);

// GET /stats
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await adminService.getStats();
    res.json({ data: stats });
  }),
);

// GET /bookings?status=&limit=&offset=
adminRouter.get(
  '/bookings',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('status').optional().isIn(BOOKING_STATUSES),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as BookingStatus | undefined;
    const { items, total } = await adminService.listBookings(status, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// GET /technicians?limit=&offset=
adminRouter.get(
  '/technicians',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await adminService.listTechnicians(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /technicians/:id/verify
adminRouter.post(
  '/technicians/:id/verify',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const profile = await adminService.verifyTechnician(req.params.id, req.user!.userId, req.ip);
    res.json({ data: profile });
  }),
);

// GET /customers?limit=&offset=
adminRouter.get(
  '/customers',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await adminService.listCustomers(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// GET /payouts?status=&limit=&offset=
adminRouter.get(
  '/payouts',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('status').optional().isIn(PAYOUT_STATUSES),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as PayoutStatus | undefined;
    const { items, total } = await adminService.listPayouts(status, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /payouts/:id/process
adminRouter.post(
  '/payouts/:id/process',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const payout = await adminService.processPayout(req.params.id, req.user!.userId, req.ip);
    res.json({ data: payout });
  }),
);

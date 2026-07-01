import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { Prisma, BookingStatus, PayoutStatus, TechnicianStatus } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { authenticate, requireRole, requireAdminRole } from '../middleware/auth';
import { authLimiter, rateLimitEnabled } from '../middleware/rateLimit';
import { AdminService } from '../../../application/admin/AdminService';
import { adminOpsRouter } from './adminOps';
import { prisma } from '../../../infrastructure/database/prisma';
import { UnauthorizedError } from '../../../shared/errors';
import { ADMIN_REFRESH_COOKIE, setAdminRefreshCookie, clearAdminRefreshCookie } from '../cookies';

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
const TECHNICIAN_STATUSES = Object.values(TechnicianStatus);

export const adminRouter: Router = Router();

const adminService = new AdminService();

// POST /login — no auth, rate-limited. Refresh token → httpOnly cookie.
adminRouter.post(
  '/login',
  (req, res, next) => (rateLimitEnabled() ? authLimiter(req, res, next) : next()),
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isString().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, admin } = await adminService.login(req.body.email, req.body.password, req.ip);
    setAdminRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken, admin } });
  }),
);

// POST /auth/refresh — rotate via the httpOnly cookie (no access token needed).
adminRouter.post(
  '/auth/refresh',
  (req, res, next) => (rateLimitEnabled() ? authLimiter(req, res, next) : next()),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, admin } = await adminService.refresh(req.cookies?.[ADMIN_REFRESH_COOKIE]);
    setAdminRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken, admin } });
  }),
);

// POST /auth/logout — revoke the refresh token + clear the cookie.
adminRouter.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    await adminService.logout(req.cookies?.[ADMIN_REFRESH_COOKIE]);
    clearAdminRefreshCookie(res);
    res.json({ data: { ok: true } });
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

// GET /technicians?status=&limit=&offset=
adminRouter.get(
  '/technicians',
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('status').optional().isIn(TECHNICIAN_STATUSES),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as TechnicianStatus | undefined;
    const { items, total } = await adminService.listTechnicians(status, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// POST /technicians/:id/verify — approving a technician grants job access +
// payout eligibility, so it is OPS-scoped just like reject/suspend.
adminRouter.post(
  '/technicians/:id/verify',
  requireAdminRole('OPS'),
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

// POST /payouts/:id/process — FINANCE-scoped (financial disbursement).
adminRouter.post(
  '/payouts/:id/process',
  requireAdminRole('FINANCE'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const payout = await adminService.processPayout(req.params.id, req.user!.userId, req.ip);
    res.json({ data: payout });
  }),
);

// POST /bookings/:id/refund — admin-initiated partial/full refund of a capture.
// FINANCE-scoped: only finance admins (+ SUPER_ADMIN) may issue refunds.
adminRouter.post(
  '/bookings/:id/refund',
  requireAdminRole('FINANCE'),
  validate([
    param('id').isUUID(),
    // Accept a decimal string or number; validate as a positive ≤3-dp (fils)
    // amount WITHOUT coercing to a float (preserves money precision end-to-end).
    body('amountJod').custom((value) => {
      let d: Prisma.Decimal;
      try {
        d = new Prisma.Decimal(String(value));
      } catch {
        throw new Error('amountJod must be a number');
      }
      if (!d.isFinite() || d.lessThanOrEqualTo(0)) throw new Error('amountJod must be greater than 0');
      if (d.decimalPlaces() > 3) throw new Error('amountJod supports at most 3 decimal places');
      return true;
    }),
  ]),
  asyncHandler(async (req, res) => {
    const payment = await adminService.refundBookingPayment(
      req.params.id,
      req.body.amountJod as number | string,
      req.user!.userId,
      req.ip,
    );
    res.json({ data: payment });
  }),
);

// Extended admin routes (guarantee, support, broadcast, finance, moderation,
// withdrawals, admin-user mgmt). Mounted here, AFTER the guard above, so the
// authenticate + requireActiveAdmin chain runs exactly once per request.
adminRouter.use(adminOpsRouter);

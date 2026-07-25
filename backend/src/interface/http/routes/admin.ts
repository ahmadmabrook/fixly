import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { Prisma, BookingStatus, PayoutStatus, TechnicianStatus } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { validate, paginationQuery } from '../validate';
import { authenticate, requireRole, requireAdminRole } from '../middleware/auth';
import { authLimiter, rateLimitEnabled } from '../middleware/rateLimit';
import { AdminService } from '../../../application/admin/AdminService';
import { adminOpsRouter } from './adminOps';
import { adminBusinessRouter } from './adminBusiness';
import { adminMaterialsRouter } from './adminMaterials';
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

// Hard cap for the bookings CSV export — bounds memory regardless of filters
// (unlike the paginated list endpoint, this isn't capped at a "page size").
const BOOKINGS_CSV_MAX_ROWS = 5000;

/** Serialise a CSV field safely. Two concerns for free-text columns (names,
 *  phones) that the numeric-only financial.csv report doesn't have:
 *   1. CSV quoting — quote if the value contains a comma, quote, or newline and
 *      double any embedded quotes (RFC 4180).
 *   2. Formula-injection neutralisation — a cell beginning with =, +, -, @ or a
 *      leading control char (tab/CR) is interpreted as a formula by Excel/Sheets
 *      and can exfiltrate data or run commands when the export is opened. Prefix
 *      such values with a single quote so they render as literal text. (A phone
 *      like "+9627..." is exactly this vector and is correctly neutralised.) */
export function csvField(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
    ...paginationQuery(),
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

// GET /bookings.csv?status= — server-side CSV export (OPS), same filter as the
// list endpoint above but capped at BOOKINGS_CSV_MAX_ROWS instead of 200.
adminRouter.get(
  '/bookings.csv',
  requireAdminRole('OPS'),
  validate([query('status').optional().isIn(BOOKING_STATUSES)]),
  asyncHandler(async (req, res) => {
    const status = req.query.status as BookingStatus | undefined;
    const rows = await adminService.listBookingsForExport(status, BOOKINGS_CSV_MAX_ROWS);
    const header = 'id,status,customer_name,customer_phone,technician_name,service,total_jod,discount_jod,scheduled_at,completed_at,cancelled_at,created_at';
    const lines = rows.map((b) =>
      [
        b.id,
        b.status,
        csvField(b.customer.name ?? ''),
        csvField(b.customer.phone),
        csvField(b.technician?.user.name ?? ''),
        csvField(b.service.nameAr),
        b.totalJod,
        b.discountJod,
        b.scheduledAt?.toISOString() ?? '',
        b.completedAt?.toISOString() ?? '',
        b.cancelledAt?.toISOString() ?? '',
        b.createdAt.toISOString(),
      ].join(','),
    );
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="bookings-${status ?? 'all'}.csv"`);
    res.send([header, ...lines].join('\n'));
  }),
);

// GET /bookings/:id — full booking detail for the admin drawer (status history,
// additional work, payment).
adminRouter.get(
  '/bookings/:id',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const detail = await adminService.getBookingDetail(req.params.id, req.user!.userId, req.ip);
    res.json({ data: detail });
  }),
);

// GET /technicians?status=&search=&limit=&offset= — search matches phone (contains) or name (case-insensitive contains).
adminRouter.get(
  '/technicians',
  validate([
    ...paginationQuery(),
    query('status').optional().isIn(TECHNICIAN_STATUSES),
    query('search').optional().isString().trim().isLength({ min: 1, max: 100 }),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const status = req.query.status as TechnicianStatus | undefined;
    const search = req.query.search as string | undefined;
    const { items, total } = await adminService.listTechnicians(status, limit, offset, search);
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

// GET /customers?search=&limit=&offset= — search matches phone (contains) or name (case-insensitive contains).
adminRouter.get(
  '/customers',
  validate([
    ...paginationQuery(),
    query('search').optional().isString().trim().isLength({ min: 1, max: 100 }),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const search = req.query.search as string | undefined;
    const { items, total } = await adminService.listCustomers(limit, offset, search);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// GET /payouts?status=&limit=&offset=
adminRouter.get(
  '/payouts',
  validate([
    ...paginationQuery(),
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
adminRouter.use(adminBusinessRouter);
adminRouter.use(adminMaterialsRouter);

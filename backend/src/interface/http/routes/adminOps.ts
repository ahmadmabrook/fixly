import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { GuaranteeStatus, SupportStatus, WithdrawalStatus } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { requireAdminRole } from '../middleware/auth';
import { AdminService } from '../../../application/admin/AdminService';
import { AdminOpsService } from '../../../application/admin/AdminOpsService';
import { GuaranteeService } from '../../../application/guarantee/GuaranteeService';
import { SupportService } from '../../../application/support/SupportService';

const GUARANTEE_STATUSES = Object.values(GuaranteeStatus);
const SUPPORT_STATUSES = Object.values(SupportStatus);
const WITHDRAWAL_STATUSES = Object.values(WithdrawalStatus);

/**
 * Extended admin surface (guarantee, support, broadcast, financial reports,
 * technician/customer moderation, withdrawals). Mounted INSIDE adminRouter
 * (after its single auth guard) so the guard runs once per request; every route
 * is RBAC-scoped by adminRole (SUPER_ADMIN always passes).
 */
export const adminOpsRouter: Router = Router();

const adminService = new AdminService();
const adminOpsService = new AdminOpsService();
const guaranteeService = new GuaranteeService();
const supportService = new SupportService();

// ── Technician moderation (OPS) ───────────────────────────
adminOpsRouter.get(
  '/technicians/:id',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminService.getTechnicianDetail(req.params.id, req.user!.userId, req.ip) });
  }),
);

adminOpsRouter.post(
  '/technicians/:id/reject',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('reason').isString().trim().isLength({ min: 1, max: 500 })]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminService.rejectTechnician(req.params.id, req.body.reason, req.user!.userId, req.ip) });
  }),
);

adminOpsRouter.post(
  '/technicians/:id/suspend',
  requireAdminRole('OPS'),
  validate([param('id').isUUID(), body('reason').isString().trim().isLength({ min: 1, max: 500 })]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminService.suspendTechnician(req.params.id, req.body.reason, req.user!.userId, req.ip) });
  }),
);

// ── Customer moderation (OPS) ─────────────────────────────
adminOpsRouter.get(
  '/customers/:id/bookings',
  requireAdminRole('OPS', 'SUPPORT'),
  validate([param('id').isUUID(), query('limit').optional().isInt({ min: 1, max: 200 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await adminService.listCustomerBookings(req.params.id, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminOpsRouter.post(
  '/customers/:id/block',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminService.setCustomerBlocked(req.params.id, true, req.user!.userId, req.ip) });
  }),
);

adminOpsRouter.post(
  '/customers/:id/unblock',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminService.setCustomerBlocked(req.params.id, false, req.user!.userId, req.ip) });
  }),
);

// ── Guarantee tickets (OPS) ───────────────────────────────
adminOpsRouter.get(
  '/guarantee',
  requireAdminRole('OPS'),
  validate([query('status').optional().isIn(GUARANTEE_STATUSES), query('limit').optional().isInt({ min: 1, max: 200 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await guaranteeService.listForAdmin(req.query.status as GuaranteeStatus | undefined, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminOpsRouter.post(
  '/guarantee/:id/in-review',
  requireAdminRole('OPS'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await guaranteeService.markInReview(req.params.id) });
  }),
);

adminOpsRouter.post(
  '/guarantee/:id/review',
  requireAdminRole('OPS'),
  validate([
    param('id').isUUID(),
    body('decision').isIn(['APPROVED', 'REJECTED']),
    body('adminNote').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('scheduledVisitAt').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const ticket = await guaranteeService.review(req.params.id, req.body.decision, req.body.adminNote ?? undefined, req.body.scheduledVisitAt ?? undefined);
    res.json({ data: ticket });
  }),
);

// ── Support tickets (SUPPORT) ─────────────────────────────
adminOpsRouter.get(
  '/support',
  requireAdminRole('SUPPORT'),
  validate([query('status').optional().isIn(SUPPORT_STATUSES), query('limit').optional().isInt({ min: 1, max: 200 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await supportService.listForAdmin(req.query.status as SupportStatus | undefined, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminOpsRouter.get(
  '/support/:id',
  requireAdminRole('SUPPORT'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await supportService.getForAdmin(req.params.id) });
  }),
);

adminOpsRouter.post(
  '/support/:id/messages',
  requireAdminRole('SUPPORT'),
  validate([param('id').isUUID(), body('body').isString().trim().isLength({ min: 1, max: 2000 })]),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await supportService.addAdminMessage(req.params.id, req.body.body) });
  }),
);

adminOpsRouter.post(
  '/support/:id/status',
  requireAdminRole('SUPPORT'),
  validate([param('id').isUUID(), body('status').isIn(SUPPORT_STATUSES)]),
  asyncHandler(async (req, res) => {
    res.json({ data: await supportService.setStatus(req.params.id, req.body.status as SupportStatus) });
  }),
);

// ── Broadcast notifications (OPS) ─────────────────────────
adminOpsRouter.post(
  '/broadcasts',
  requireAdminRole('OPS'),
  validate([
    body('titleAr').isString().trim().isLength({ min: 1, max: 140 }),
    body('bodyAr').isString().trim().isLength({ min: 1, max: 1000 }),
    body('segment').isIn(['ALL', 'CUSTOMERS', 'TECHNICIANS']),
  ]),
  asyncHandler(async (req, res) => {
    const bc = await adminOpsService.sendBroadcast(req.user!.userId, req.body.titleAr, req.body.bodyAr, req.body.segment, req.ip);
    res.status(201).json({ data: bc });
  }),
);

adminOpsRouter.get(
  '/broadcasts',
  requireAdminRole('OPS'),
  validate([query('limit').optional().isInt({ min: 1, max: 200 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await adminOpsService.listBroadcasts(limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// ── Admin user management (SUPER_ADMIN only) ──────────────
const ADMIN_ROLES = ['SUPER_ADMIN', 'OPS', 'FINANCE', 'SUPPORT'];

adminOpsRouter.get(
  '/admins',
  requireAdminRole(), // empty → only SUPER_ADMIN passes
  asyncHandler(async (_req, res) => {
    res.json({ data: await adminOpsService.listAdmins() });
  }),
);

adminOpsRouter.post(
  '/admins',
  requireAdminRole(),
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 12, max: 200 }),
    body('name').isString().trim().isLength({ min: 1, max: 80 }),
    body('role').isIn(ADMIN_ROLES),
  ]),
  asyncHandler(async (req, res) => {
    const admin = await adminOpsService.createAdmin(req.body.email, req.body.password, req.body.name, req.body.role, req.user!.userId, req.ip);
    res.status(201).json({ data: admin });
  }),
);

adminOpsRouter.post(
  '/admins/:id/role',
  requireAdminRole(),
  validate([param('id').isUUID(), body('role').isIn(ADMIN_ROLES)]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminOpsService.setAdminRole(req.params.id, req.body.role, req.user!.userId, req.ip) });
  }),
);

adminOpsRouter.post(
  '/admins/:id/active',
  requireAdminRole(),
  validate([param('id').isUUID(), body('isActive').isBoolean().toBoolean()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminOpsService.setAdminActive(req.params.id, req.body.isActive, req.user!.userId, req.ip) });
  }),
);

// ── Financial reports (FINANCE) ───────────────────────────
const reportValidators = [
  query('from').isISO8601(),
  query('to').isISO8601(),
  query('granularity').optional().isIn(['day', 'month']),
];

adminOpsRouter.get(
  '/reports/financial',
  requireAdminRole('FINANCE'),
  validate(reportValidators),
  asyncHandler(async (req, res) => {
    const granularity = (req.query.granularity as 'day' | 'month' | undefined) ?? 'day';
    const report = await adminOpsService.getFinancialReport(new Date(req.query.from as string), new Date(req.query.to as string), granularity);
    res.json({ data: report });
  }),
);

adminOpsRouter.get(
  '/reports/financial.csv',
  requireAdminRole('FINANCE'),
  validate(reportValidators),
  asyncHandler(async (req, res) => {
    const granularity = (req.query.granularity as 'day' | 'month' | undefined) ?? 'day';
    const { series } = await adminOpsService.getFinancialReport(new Date(req.query.from as string), new Date(req.query.to as string), granularity);
    const header = 'period,bookings,gross_jod,platform_fee_jod,technician_net_jod';
    const lines = series.map((r) => [r.period.toISOString().slice(0, 10), r.bookings, r.grossJod, r.platformFeeJod, r.technicianNetJod].join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="financial-${granularity}.csv"`);
    res.send([header, ...lines].join('\n'));
  }),
);

// ── Technician withdrawals (FINANCE) ──────────────────────
adminOpsRouter.get(
  '/withdrawals',
  requireAdminRole('FINANCE'),
  validate([query('status').optional().isIn(WITHDRAWAL_STATUSES), query('limit').optional().isInt({ min: 1, max: 200 }).toInt(), query('offset').optional().isInt({ min: 0 }).toInt()]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await adminOpsService.listWithdrawals(req.query.status as WithdrawalStatus | undefined, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

adminOpsRouter.post(
  '/withdrawals/:id/process',
  requireAdminRole('FINANCE'),
  validate([param('id').isUUID(), body('decision').isIn(['PAID', 'REJECTED'])]),
  asyncHandler(async (req, res) => {
    res.json({ data: await adminOpsService.processWithdrawal(req.params.id, req.body.decision, req.user!.userId, req.ip) });
  }),
);

import bcrypt from 'bcryptjs';
import {
  Prisma,
  AdminRole,
  BookingStatus,
  BroadcastSegment,
  WithdrawalStatus,
  DispatchOfferStatus,
  UserRole,
  ConductStatus,
} from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { audit } from './adminAudit';
import { broadcastsSentTotal, withdrawalsProcessedTotal } from '../../shared/metrics';

// A booking with no technician assigned this long past creation is flagged
// "high-risk" on the at-risk panel (Figma admin Dashboard).
const HIGH_RISK_UNASSIGNED_MINUTES = 15;
// Activity-feed lookback window — bounded so the query never scans the full
// history (mirrors the getOperationalStats windowing convention).
const ACTIVITY_FEED_WINDOW_HOURS = 48;

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

const BOOKING_ACTIVITY_MESSAGE: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: 'تم قبول الحجز',
  EN_ROUTE: 'الفني في الطريق',
  ARRIVED: 'وصل الفني إلى الموقع',
  IN_PROGRESS: 'بدأت الخدمة',
  COMPLETED: 'تم إكمال الخدمة',
  CANCELLED: 'تم إلغاء الحجز',
  DISPUTED: 'تم فتح نزاع على الحجز',
  NO_SHOW: 'الفني سجّل عدم تواجد العميل',
};

interface ActivityEvent {
  type: 'booking_status' | 'payment_captured' | 'guarantee_opened' | 'new_customer';
  message: string;
  at: Date;
}

/** Show only the last 4 of an IBAN in list views; full value stays on the
 *  detail/process path where it's operationally needed. */
function maskIban(iban: string | null): string | null {
  if (!iban) return iban;
  return iban.length <= 4 ? iban : `${'•'.repeat(Math.max(0, iban.length - 4))}${iban.slice(-4)}`;
}

/**
 * Extended admin operations: financial reporting, broadcasts, technician
 * withdrawals, and admin-user management. Split out of AdminService to keep each
 * unit cohesive and under the file-size budget.
 */
export class AdminOpsService {
  // ── Admin user management (SUPER_ADMIN) ────────────────

  async listAdmins() {
    return prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  async createAdmin(email: string, password: string, name: string, role: AdminRole, actorId: string, ip?: string) {
    if (password.length < 12) throw new ConflictError('Password must be at least 12 characters');
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) throw new ConflictError('An admin with this email already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    return prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.create({
        data: { email, passwordHash, name, role },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      });
      await audit(tx, actorId, 'admin.create', { type: 'AdminUser', id: admin.id }, { role }, ip);
      return admin;
    });
  }

  async setAdminRole(id: string, role: AdminRole, actorId: string, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.findUnique({ where: { id } });
      if (!admin) throw new NotFoundError('AdminUser');
      // Never demote the last active SUPER_ADMIN — that would permanently lock
      // out all admin-user management (the /admins surface is SUPER_ADMIN-only).
      if (admin.role === AdminRole.SUPER_ADMIN && role !== AdminRole.SUPER_ADMIN) {
        const otherSupers = await tx.adminUser.count({ where: { role: AdminRole.SUPER_ADMIN, isActive: true, id: { not: id } } });
        if (otherSupers === 0) throw new ConflictError('Cannot demote the last super admin');
      }
      const updated = await tx.adminUser.update({
        where: { id },
        data: { role },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      });
      await audit(tx, actorId, 'admin.role', { type: 'AdminUser', id }, { role }, ip);
      return updated;
    });
  }

  async setAdminActive(id: string, isActive: boolean, actorId: string, ip?: string) {
    // Never let an admin disable their own account (lockout footgun).
    if (id === actorId && !isActive) throw new ConflictError('You cannot disable your own account');
    return prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.findUnique({ where: { id } });
      if (!admin) throw new NotFoundError('AdminUser');
      const updated = await tx.adminUser.update({
        where: { id },
        data: { isActive },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      });
      await audit(tx, actorId, isActive ? 'admin.enable' : 'admin.disable', { type: 'AdminUser', id }, undefined, ip);
      return updated;
    });
  }

  // ── Financial reporting ────────────────────────────────

  /**
   * Revenue time-series from captured payments (the authoritative money record),
   * grouped by day or month. Platform fee is the SUM of the per-payment feeJod
   * actually withheld — not a hardcoded %, so it always matches the ledger.
   */
  async getFinancialReport(from: Date, to: Date, granularity: 'day' | 'month') {
    const trunc = granularity === 'month' ? 'month' : 'day';
    const rows = await prisma.$queryRaw<Array<{ period: Date; bookings: bigint; gross: string | null; fee: string | null }>>(Prisma.sql`
      SELECT date_trunc(${trunc}, p."capturedAt") AS period,
             COUNT(*)::bigint AS bookings,
             COALESCE(SUM(p."capturedAmountJod"), 0)::text AS gross,
             COALESCE(SUM(p."feeJod"), 0)::text AS fee
      FROM payments p
      WHERE p."capturedAt" IS NOT NULL AND p."capturedAt" >= ${from} AND p."capturedAt" < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    // Derive every row the same way the totals below are derived — as exact
    // decimals, surfaced as numbers only at the boundary. Doing the net subtraction
    // in float here (and rounding it back with toFixed) meant the series and the
    // totals used two different arithmetics for the same quantity, so a row's
    // technicianNet could disagree with the total it contributes to.
    const series = rows.map((r) => {
      const gross = new Prisma.Decimal(r.gross ?? 0);
      const fee = new Prisma.Decimal(r.fee ?? 0);
      return {
        period: r.period,
        bookings: Number(r.bookings),
        grossJod: Number(gross),
        platformFeeJod: Number(fee),
        technicianNetJod: Number(gross.minus(fee)),
      };
    });
    // Accumulate totals as exact decimals (not floats) to avoid drift across
    // many rows, then surface as numbers for display.
    const acc = rows.reduce(
      (a, r) => {
        const gross = new Prisma.Decimal(r.gross ?? 0);
        const fee = new Prisma.Decimal(r.fee ?? 0);
        return {
          bookings: a.bookings + Number(r.bookings),
          grossJod: a.grossJod.plus(gross),
          platformFeeJod: a.platformFeeJod.plus(fee),
          technicianNetJod: a.technicianNetJod.plus(gross.minus(fee)),
        };
      },
      { bookings: 0, grossJod: new Prisma.Decimal(0), platformFeeJod: new Prisma.Decimal(0), technicianNetJod: new Prisma.Decimal(0) },
    );
    const totals = {
      bookings: acc.bookings,
      grossJod: Number(acc.grossJod),
      platformFeeJod: Number(acc.platformFeeJod),
      technicianNetJod: Number(acc.technicianNetJod),
    };
    return { series, totals };
  }

  // ── Operational KPIs ────────────────────────────────────

  /**
   * Platform-wide operational health over a trailing window (default 30 days,
   * capped at 90) — bounded scope so this never becomes an unbounded full-table
   * scan (mirrors the from/to windowing convention already used by
   * getFinancialReport). All rates are computed on read, never stored.
   */
  async getOperationalStats(windowDays = 30) {
    const days = Math.min(Math.max(windowDays, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      offersTotal,
      offersAccepted,
      timeToAssignRows,
      arrivalDelayRows,
      bookingsTotal,
      bookingsCancelled,
      completedTotal,
      upheldComplaints,
      repeatCustomerRows,
    ] = await Promise.all([
      prisma.dispatchOffer.count({ where: { offeredAt: { gte: since } } }),
      prisma.dispatchOffer.count({ where: { offeredAt: { gte: since }, status: DispatchOfferStatus.ACCEPTED } }),
      // Avg time from booking creation to first CONFIRMED (dispatch acceptance).
      // Booking has no separate "confirmedAt" column, so we use the accepted
      // DispatchOffer's respondedAt as the assignment moment.
      prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (o."respondedAt" - b."createdAt")))::float AS avg_seconds
        FROM bookings b
        JOIN dispatch_offers o ON o."bookingId" = b.id AND o.status = ${DispatchOfferStatus.ACCEPTED}
        WHERE b."createdAt" >= ${since}
      `,
      prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM ("arrivedAt" - "slaArriveBy")))::float AS avg_seconds
        FROM bookings
        WHERE "createdAt" >= ${since}
          AND "arrivedAt" IS NOT NULL AND "slaArriveBy" IS NOT NULL
          AND "arrivedAt" > "slaArriveBy"
      `,
      prisma.booking.count({ where: { createdAt: { gte: since } } }),
      prisma.booking.count({ where: { createdAt: { gte: since }, status: BookingStatus.CANCELLED } }),
      prisma.booking.count({ where: { createdAt: { gte: since }, status: BookingStatus.COMPLETED } }),
      prisma.conductReport.count({ where: { status: ConductStatus.UPHELD, createdAt: { gte: since } } }),
      // Repeat-booking rate: % of customers (among those with >=1 completed booking
      // in the window) who have more than one completed booking in the window.
      prisma.$queryRaw<Array<{ total: bigint; repeat: bigint }>>`
        SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE cnt > 1)::bigint AS repeat
        FROM (
          SELECT "customerId", COUNT(*) AS cnt
          FROM bookings
          WHERE status = ${BookingStatus.COMPLETED} AND "completedAt" >= ${since}
          GROUP BY "customerId"
        ) per_customer
      `,
    ]);

    const rate = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);
    const repeatTotal = Number(repeatCustomerRows[0]?.total ?? 0);
    const repeatCount = Number(repeatCustomerRows[0]?.repeat ?? 0);

    return {
      windowDays: days,
      acceptanceRate: rate(offersAccepted, offersTotal),
      avgTimeToAssignSeconds: timeToAssignRows[0]?.avg_seconds != null ? Math.round(timeToAssignRows[0].avg_seconds) : null,
      avgArrivalDelaySeconds: arrivalDelayRows[0]?.avg_seconds != null ? Math.round(arrivalDelayRows[0].avg_seconds) : null,
      cancellationRate: rate(bookingsCancelled, bookingsTotal),
      complaintRate: rate(upheldComplaints, completedTotal),
      repeatBookingRate: rate(repeatCount, repeatTotal),
      sampleSizes: {
        bookings: bookingsTotal,
        dispatchOffers: offersTotal,
        completedBookings: completedTotal,
      },
    };
  }

  // ── Broadcast notifications ────────────────────────────

  async sendBroadcast(adminId: string, titleAr: string, bodyAr: string, segment: BroadcastSegment, ip?: string) {
    const roleFilter: Prisma.UserWhereInput =
      segment === BroadcastSegment.CUSTOMERS
        ? { role: UserRole.CUSTOMER }
        : segment === BroadcastSegment.TECHNICIANS
          ? { role: UserRole.TECHNICIAN }
          : { role: { in: [UserRole.CUSTOMER, UserRole.TECHNICIAN] } };
    // SQL predicate mirror of roleFilter (segment is a validated enum, no injection).
    const roleCond =
      segment === BroadcastSegment.CUSTOMERS
        ? Prisma.sql`"role" = ${UserRole.CUSTOMER}`
        : segment === BroadcastSegment.TECHNICIANS
          ? Prisma.sql`"role" = ${UserRole.TECHNICIAN}`
          : Prisma.sql`"role" IN (${UserRole.CUSTOMER}, ${UserRole.TECHNICIAN})`;

    const broadcast = await prisma.$transaction(async (tx) => {
      const recipientCount = await tx.user.count({ where: { ...roleFilter, isActive: true } });
      const created = await tx.broadcast.create({
        data: { titleAr, bodyAr, segment, recipientCount, sentById: adminId },
      });
      // Set-based fan-out: rows are inserted entirely in the DB — none transit
      // Node — so the memory + insert cost stays flat regardless of audience size.
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO notifications ("userId", "titleAr", "bodyAr", "sentAt", "createdAt")
        SELECT id, ${titleAr}, ${bodyAr}, now(), now()
        FROM users
        WHERE "isActive" = true AND ${roleCond}
      `);
      await audit(tx, adminId, 'broadcast.send', { type: 'Broadcast', id: created.id }, { segment, recipientCount }, ip);
      return created;
    });
    broadcastsSentTotal.inc({ segment }, 1);
    return broadcast;
  }

  async listBroadcasts(limit = 50, offset = 0) {
    const [items, total] = await prisma.$transaction([
      prisma.broadcast.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { sentBy: { select: { name: true } } },
      }),
      prisma.broadcast.count(),
    ]);
    return { items, total };
  }

  // ── Technician withdrawals ─────────────────────────────

  async listWithdrawals(status?: WithdrawalStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.withdrawalRequest.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { technician: { include: { user: { select: { name: true, phone: true } } } } },
      }),
      prisma.withdrawalRequest.count({ where }),
    ]);
    // Mask the IBAN in the list (PII minimisation); the full value is available
    // on the process action which already has the row.
    return { items: items.map((w) => ({ ...w, iban: maskIban(w.iban) })), total };
  }

  /** Mark a withdrawal PAID (disbursed) or REJECTED. */
  async processWithdrawal(id: string, decision: 'PAID' | 'REJECTED', actorId: string, ip?: string) {
    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!w) throw new NotFoundError('WithdrawalRequest');
      if (w.status === WithdrawalStatus.PAID || w.status === WithdrawalStatus.REJECTED) throw new ConflictError('Withdrawal already finalised');
      const result = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: decision, processedAt: new Date() },
      });
      await audit(tx, actorId, `withdrawal.${decision.toLowerCase()}`, { type: 'WithdrawalRequest', id }, { amountJod: String(w.amountJod) }, ip);
      return result;
    });
    withdrawalsProcessedTotal.inc({ decision }, 1);
    return updated;
  }

  // ── At-risk orders & activity feed (OPS dashboard) ────────

  /**
   * Open bookings needing admin attention: "late" (technician assigned, past
   * the arrival SLA, not yet arrived) and "unassigned" (still PENDING with no
   * technician past a short grace period). A bounded, pragmatic multi-query —
   * no new event-sourcing system, matching this codebase's existing style
   * (see getOperationalStats).
   */
  async getAtRiskOrders(limit = 50) {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const now = new Date();
    const unassignedCutoff = new Date(now.getTime() - HIGH_RISK_UNASSIGNED_MINUTES * 60 * 1000);

    const bookingSelect = {
      id: true,
      status: true,
      addressLine: true,
      totalJod: true,
      createdAt: true,
      slaArriveBy: true,
      customer: { select: { id: true, name: true, phone: true } },
      technician: { select: { id: true, user: { select: { name: true, phone: true } } } },
    } satisfies Prisma.BookingSelect;

    const [late, unassigned] = await Promise.all([
      prisma.booking.findMany({
        where: {
          status: { in: ACTIVE_BOOKING_STATUSES },
          technicianId: { not: null },
          slaArriveBy: { lt: now },
          arrivedAt: null,
        },
        orderBy: { slaArriveBy: 'asc' },
        take: boundedLimit,
        select: bookingSelect,
      }),
      prisma.booking.findMany({
        where: { status: BookingStatus.PENDING, technicianId: null, createdAt: { lt: unassignedCutoff } },
        orderBy: { createdAt: 'asc' },
        take: boundedLimit,
        select: bookingSelect,
      }),
    ]);

    const items = [
      ...late.map((b) => ({ ...b, riskType: 'late' as const })),
      ...unassigned.map((b) => ({ ...b, riskType: 'unassigned' as const })),
    ];
    return { items, total: items.length };
  }

  /**
   * Recent notable platform events for the admin live-activity feed. Bounded
   * multi-table query (booking status changes, payment captures, guarantee
   * tickets opened, new customers) within a trailing window — deliberately NOT
   * a dedicated event-sourcing table, matching this codebase's pragmatic style.
   */
  async getActivityFeed(limit = 20): Promise<ActivityEvent[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const since = new Date(Date.now() - ACTIVITY_FEED_WINDOW_HOURS * 60 * 60 * 1000);

    const [bookings, payments, guarantees, customers] = await Promise.all([
      prisma.booking.findMany({
        where: { updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: boundedLimit,
        select: { id: true, status: true, updatedAt: true },
      }),
      prisma.payment.findMany({
        where: { capturedAt: { gte: since } },
        orderBy: { capturedAt: 'desc' },
        take: boundedLimit,
        select: { id: true, bookingId: true, capturedAt: true },
      }),
      prisma.guaranteeTicket.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: boundedLimit,
        select: { id: true, createdAt: true },
      }),
      prisma.user.findMany({
        where: { role: UserRole.CUSTOMER, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: boundedLimit,
        select: { id: true, name: true, createdAt: true },
      }),
    ]);

    const events: ActivityEvent[] = [
      ...bookings
        .filter((b) => BOOKING_ACTIVITY_MESSAGE[b.status])
        .map((b) => ({
          type: 'booking_status' as const,
          message: `${BOOKING_ACTIVITY_MESSAGE[b.status]} — #${b.id.slice(0, 8)}`,
          at: b.updatedAt,
        })),
      ...payments.map((p) => ({
        type: 'payment_captured' as const,
        message: `تم استلام الدفع — #${p.bookingId.slice(0, 8)}`,
        at: p.capturedAt!,
      })),
      ...guarantees.map((g) => ({
        type: 'guarantee_opened' as const,
        message: `تم فتح طلب ضمان — #${g.id.slice(0, 8)}`,
        at: g.createdAt,
      })),
      ...customers.map((c) => ({
        type: 'new_customer' as const,
        message: `عميل جديد${c.name ? `: ${c.name}` : ''}`,
        at: c.createdAt,
      })),
    ];

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events.slice(0, boundedLimit);
  }
}

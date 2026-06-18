import bcrypt from 'bcryptjs';
import { Prisma, AdminRole, BroadcastSegment, WithdrawalStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { audit } from './adminAudit';
import { broadcastsSentTotal, withdrawalsProcessedTotal } from '../../shared/metrics';

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
      if (admin.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const otherSupers = await tx.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
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
    const series = rows.map((r) => {
      const gross = Number(r.gross ?? 0);
      const fee = Number(r.fee ?? 0);
      return {
        period: r.period,
        bookings: Number(r.bookings),
        grossJod: gross,
        platformFeeJod: fee,
        technicianNetJod: Number((gross - fee).toFixed(3)),
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

  // ── Broadcast notifications ────────────────────────────

  async sendBroadcast(adminId: string, titleAr: string, bodyAr: string, segment: BroadcastSegment, ip?: string) {
    const roleFilter: Prisma.UserWhereInput =
      segment === 'CUSTOMERS'
        ? { role: 'CUSTOMER' }
        : segment === 'TECHNICIANS'
          ? { role: 'TECHNICIAN' }
          : { role: { in: ['CUSTOMER', 'TECHNICIAN'] } };
    // SQL predicate mirror of roleFilter (segment is a validated enum, no injection).
    const roleCond =
      segment === 'CUSTOMERS'
        ? Prisma.sql`"role" = 'CUSTOMER'`
        : segment === 'TECHNICIANS'
          ? Prisma.sql`"role" = 'TECHNICIAN'`
          : Prisma.sql`"role" IN ('CUSTOMER', 'TECHNICIAN')`;

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
      if (w.status === 'PAID' || w.status === 'REJECTED') throw new ConflictError('Withdrawal already finalised');
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
}

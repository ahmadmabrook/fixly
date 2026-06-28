import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Prisma, BookingStatus, PayoutStatus, TechnicianStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { hashToken } from '../auth/AuthService';
import { audit } from './adminAudit';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../shared/errors';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { payoutReconciledTotal, payoutStuckGauge } from '../../shared/metrics';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';
import { PayoutProviderFactory } from '../../infrastructure/providers/PayoutProviderFactory';
import { PaymentService } from '../payment/PaymentService';
import { PaymentProviderFactory } from '../../infrastructure/providers/PaymentProviderFactory';

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Short fingerprint of an email for log correlation. Same email → same fp;
 *  different emails → different fp; the email itself cannot be recovered. */
function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

const PAYOUT_INCLUDE = { technician: { include: { user: true } } } as const;
const ADMIN_REFRESH_EXPIRES_DAYS = 30;

export class AdminService {
  constructor(
    private readonly payoutProvider: IPayoutProvider = PayoutProviderFactory.create(),
    private readonly paymentService: PaymentService = new PaymentService(PaymentProviderFactory.create(), env().PAYMENT_PROVIDER),
  ) {}

  /**
   * Admin-initiated (partial or full) refund of a booking's captured payment,
   * with an audit trail. Delegates the money mechanics + guards to
   * PaymentService.refundBooking.
   */
  async refundBookingPayment(bookingId: string, amountJod: number | string, actorId: string, ip?: string) {
    const payment = await this.paymentService.refundBooking(bookingId, amountJod);
    await audit(prisma, actorId, 'payment.refund', { type: 'Booking', id: bookingId }, { amountJod: String(amountJod) }, ip);
    return payment;
  }

  async login(email: string, password: string, ip?: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });

    // Run bcrypt even when the user doesn't exist, to keep timing roughly
    // constant between the "no such user" and "wrong password" paths —
    // otherwise an attacker can enumerate admin emails.
    const dummyHash = '$2a$12$0000000000000000000000.0000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, admin?.passwordHash ?? dummyHash);

    if (!admin || !admin.isActive || !valid) {
      // Audit-shape record via structured log. We can't write to
      // admin_audit_logs here because the actor is not a real AdminUser
      // (failed login may be a wrong email, an attacker probe, or a
      // disabled account). Pino's redact config strips the password before
      // it ever hits the log sink — see shared/logger.ts.
      logger.warn(
        { event: 'admin.login.fail', emailFp: emailFingerprint(email), ip, reason: !admin ? 'no_user' : !admin.isActive ? 'disabled' : 'bad_password' },
        'Admin login failed',
      );
      throw new UnauthorizedError('Invalid credentials');
    }

    await audit(prisma, admin.id, 'admin.login', undefined, undefined, ip);

    const { accessToken, refreshToken } = await this.issueAdminTokens(admin.id, admin.role);
    return {
      accessToken,
      refreshToken,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    };
  }

  /**
   * Rotate an admin refresh token (presented via httpOnly cookie). Mirrors the
   * customer flow: atomic revoke-old + issue-new, with reuse detection that
   * revokes the whole family if an already-revoked token is replayed.
   */
  async refresh(refreshToken?: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedError('Missing refresh token');
    }
    const tokenHash = hashToken(refreshToken);

    return prisma.$transaction(async (tx) => {
      const record = await tx.adminRefreshToken.findUnique({ where: { tokenHash }, include: { admin: true } });
      if (!record || record.expiresAt < new Date()) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      if (record.revokedAt) {
        await tx.adminRefreshToken.updateMany({
          where: { adminId: record.adminId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedError('Token reuse detected — all sessions revoked');
      }
      if (!record.admin.isActive) throw new UnauthorizedError('Account is disabled');

      await tx.adminRefreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
      const tokens = await this.issueAdminTokens(record.adminId, record.admin.role, tx);
      return { ...tokens, admin: { id: record.admin.id, name: record.admin.name, email: record.admin.email, role: record.admin.role } };
    });
  }

  /** Revoke the presented admin refresh token (logout). Silent no-op if absent. */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await prisma.adminRefreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueAdminTokens(adminId: string, adminRole: string, tx: DbClient = prisma) {
    const accessToken = jwt.sign(
      { userId: adminId, role: 'ADMIN', adminRole, typ: 'admin' },
      env().JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: env().JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
        issuer: 'fixly',
        audience: 'fixly-admin',
      },
    );
    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ADMIN_REFRESH_EXPIRES_DAYS);
    await tx.adminRefreshToken.create({ data: { adminId, tokenHash: hashToken(refreshToken), expiresAt } });
    return { accessToken, refreshToken };
  }

  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalBookings,
      pendingBookings,
      completedBookings,
      totalTechnicians,
      verifiedTechnicians,
      activeTechnicians,
      revenueResult,
      todayRevenueResult,
      ratingResult,
      openGuarantees,
      pendingPayouts,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.technicianProfile.count(),
      prisma.technicianProfile.count({ where: { isVerified: true } }),
      prisma.technicianProfile.count({ where: { isAvailable: true, status: 'APPROVED' } }),
      prisma.booking.aggregate({ _sum: { totalJod: true }, where: { status: 'COMPLETED' } }),
      prisma.booking.aggregate({
        _sum: { totalJod: true },
        where: { status: 'COMPLETED', completedAt: { gte: startOfToday } },
      }),
      prisma.technicianProfile.aggregate({ _avg: { rating: true }, where: { totalReviews: { gt: 0 } } }),
      prisma.guaranteeTicket.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      prisma.payout.count({ where: { status: 'PENDING' } }),
    ]);

    const bookingsByService = await prisma.booking.groupBy({
      by: ['serviceId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const serviceNames = await prisma.service.findMany({
      where: { id: { in: bookingsByService.map((b) => b.serviceId) } },
      select: { id: true, nameAr: true },
    });
    const nameMap = new Map(serviceNames.map((s) => [s.id, s.nameAr]));

    return {
      totalBookings,
      pendingBookings,
      completedBookings,
      totalTechnicians,
      verifiedTechnicians,
      activeTechnicians,
      totalRevenueJod: Number(revenueResult._sum.totalJod ?? 0),
      todayRevenueJod: Number(todayRevenueResult._sum.totalJod ?? 0),
      avgRating: Number(ratingResult._avg.rating ?? 0),
      openGuarantees,
      pendingPayouts,
      bookingsByService: bookingsByService.map((b) => ({
        serviceId: b.serviceId,
        nameAr: nameMap.get(b.serviceId) ?? b.serviceId,
        count: b._count.id,
      })),
    };
  }

  async listBookings(status?: BookingStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    // Project only the fields the admin UI renders — avoids shipping full PII
    // rows (avatarUrl, internal flags) and shrinks the payload at limit=200.
    const [items, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          totalJod: true,
          createdAt: true,
          addressLat: true,
          addressLng: true,
          customer: { select: { id: true, name: true, phone: true } },
          service: { select: { id: true, nameAr: true, nameEn: true, priceJod: true } },
          technician: { select: { id: true, rating: true, user: { select: { id: true, name: true } } } },
        },
      }),
      prisma.booking.count({ where }),
    ]);
    return { items, total };
  }

  async listTechnicians(status?: TechnicianStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.technicianProfile.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, isVerified: true, isAvailable: true, rating: true, totalReviews: true,
          hourlyRateJod: true, createdAt: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.technicianProfile.count({ where }),
    ]);
    return { items, total };
  }

  /** Full technician detail for the admin drawer — documents, services, recent
   *  reviews. Reading exposes PII (phone, document URLs), so the access is audited. */
  async getTechnicianDetail(id: string, actorId: string, ip?: string) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, createdAt: true } },
        services: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    const reviews = await prisma.review.findMany({
      where: { revieweeId: profile.userId },
      include: { reviewer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    await audit(prisma, actorId, 'technician.view_detail', { type: 'TechnicianProfile', id }, undefined, ip);
    return { ...profile, recentReviews: reviews };
  }

  /** Approve a pending technician (sets status + back-compat isVerified flag). */
  async verifyTechnician(id: string, actorId: string, ip?: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.technicianProfile.findUnique({ where: { id }, include: { user: true } });
        if (!existing) throw new NotFoundError('TechnicianProfile');
        if (existing.isVerified && existing.status === 'APPROVED') return existing;

        const profile = await tx.technicianProfile.update({
          where: { id },
          data: { isVerified: true, status: 'APPROVED', approvedAt: new Date(), rejectionReason: null },
          include: { user: true },
        });
        await audit(tx, actorId, 'technician.approve', { type: 'TechnicianProfile', id }, undefined, ip);
        return profile;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('TechnicianProfile');
      }
      throw err;
    }
  }

  /** Reject a technician application with a reason. */
  async rejectTechnician(id: string, reason: string, actorId: string, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.technicianProfile.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('TechnicianProfile');
      const profile = await tx.technicianProfile.update({
        where: { id },
        data: { status: 'REJECTED', isVerified: false, isAvailable: false, rejectionReason: reason },
        include: { user: true },
      });
      await audit(tx, actorId, 'technician.reject', { type: 'TechnicianProfile', id }, { reason }, ip);
      return profile;
    });
  }

  /** Suspend (block) an approved technician — they go offline and can't take jobs. */
  async suspendTechnician(id: string, reason: string, actorId: string, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.technicianProfile.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('TechnicianProfile');
      const profile = await tx.technicianProfile.update({
        where: { id },
        data: { status: 'SUSPENDED', isVerified: false, isAvailable: false, rejectionReason: reason },
        include: { user: true },
      });
      await audit(tx, actorId, 'technician.suspend', { type: 'TechnicianProfile', id }, { reason }, ip);
      return profile;
    });
  }

  async listCustomerBookings(customerId: string, limit = 50, offset = 0) {
    const where = { customerId };
    const [items, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, totalJod: true, createdAt: true, service: { select: { nameAr: true } } },
      }),
      prisma.booking.count({ where }),
    ]);
    return { items, total };
  }

  /** Block or unblock a customer account (isActive toggle). */
  async setCustomerBlocked(id: string, blocked: boolean, actorId: string, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, role: 'CUSTOMER' } });
      if (!user) throw new NotFoundError('Customer');
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: !blocked },
        select: { id: true, name: true, phone: true, isActive: true },
      });
      await audit(tx, actorId, blocked ? 'customer.block' : 'customer.unblock', { type: 'User', id }, undefined, ip);
      return updated;
    });
  }

  async listCustomers(limit = 50, offset = 0) {
    const where = { role: 'CUSTOMER' as const };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, phone: true, isActive: true, createdAt: true },
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async listPayouts(status?: PayoutStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.payout.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PAYOUT_INCLUDE,
      }),
      prisma.payout.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Disburse a payout to a technician. Three phases so the external transfer
   * never runs inside a DB transaction:
   *  1. atomically claim PENDING → PROCESSING (idempotent: a COMPLETED payout
   *     short-circuits, a re-entrant claim is a no-op),
   *  2. call the payout provider OUTSIDE any tx (FAILED on error),
   *  3. finalize COMPLETED + PAYOUT ledger entry + audit in one tx.
   */
  async processPayout(id: string, actorId: string, ip?: string) {
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: { technician: { select: { user: { select: { isActive: true } } } } },
    });
    if (!payout) throw new NotFoundError('Payout');
    if (payout.status === 'COMPLETED') {
      return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
    }
    // N-6: never disburse to a deactivated technician — funds stay PENDING until
    // the account is restored (or the payout is handled manually).
    if (!payout.technician.user.isActive) {
      throw new ConflictError('Technician account is inactive — payout blocked');
    }

    // Phase 1 — atomic claim.
    const claimed = await prisma.payout.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      const current = await prisma.payout.findUnique({ where: { id } });
      if (current?.status === 'COMPLETED') {
        return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
      }
      throw new ConflictError(`Payout is ${current?.status ?? 'unknown'}`);
    }

    // Phase 2 — external disbursement (outside any transaction).
    let providerRef: string;
    try {
      ({ providerRef } = await this.payoutProvider.disburse(id, Number(payout.amountJod)));
    } catch {
      // Provider rejected outright → no money moved → safe to mark FAILED.
      await prisma.payout.updateMany({ where: { id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
      throw new ConflictError('Payout disbursement failed');
    }

    // Phase 3 — finalize (transition-guarded; idempotent vs. reconciliation).
    await this.finalizePayout(id, Number(payout.amountJod), providerRef, actorId, ip);
    return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
  }

  /**
   * Flip a PROCESSING payout → COMPLETED + write the PAYOUT ledger entry, under
   * a transition guard so a request finalize and a concurrent reconciliation
   * can never both apply it (no duplicate ledger / double accounting). The
   * ledger + audit are written ONLY by whichever caller wins the transition.
   * `actorId` is omitted for system reconciliation (no real admin actor).
   */
  private async finalizePayout(
    id: string,
    amountJod: number,
    providerRef: string,
    actorId?: string,
    ip?: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claim = await tx.payout.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
      if (claim.count === 0) return false; // someone else already finalized it
      await tx.ledgerEntry.create({
        data: { payoutId: id, type: 'PAYOUT', direction: 'DEBIT', currency: env().CURRENCY, amountJod, description: `Payout ${id} (${providerRef})` },
      });
      if (actorId) {
        await audit(tx, actorId, 'payout.process', { type: 'Payout', id }, { amountJod, providerRef }, ip);
      }
      return true;
    });
  }

  /**
   * Reconcile payouts stuck in PROCESSING — the crash window between an external
   * disbursement and the finalize commit. For each, ask the provider for the
   * authoritative state (keyed by payoutId) and:
   *   COMPLETED → finalize (money was sent; complete + ledger),
   *   FAILED    → mark FAILED (safe to retry; no money moved),
   *   PENDING/UNKNOWN → leave for the next cycle (never auto-fail an unknown).
   * Runs on a timer from main.ts. Returns the number resolved.
   */
  async reconcileStuckPayouts(): Promise<number> {
    const stuck = await prisma.payout.findMany({ where: { status: 'PROCESSING' }, select: { id: true, amountJod: true } });
    payoutStuckGauge.set(stuck.length);
    let resolved = 0;

    for (const payout of stuck) {
      let state: 'COMPLETED' | 'FAILED' | 'PENDING' | 'UNKNOWN';
      let providerRef: string | undefined;
      try {
        ({ state, providerRef } = await this.payoutProvider.getStatus(payout.id));
      } catch (err) {
        logger.warn({ err, payoutId: payout.id }, 'reconcile: provider status query failed, leaving PROCESSING');
        continue;
      }

      if (state === 'COMPLETED') {
        const applied = await this.finalizePayout(payout.id, Number(payout.amountJod), providerRef ?? `reconciled_${payout.id}`);
        if (applied) {
          resolved++;
          payoutReconciledTotal.inc({ outcome: 'completed' });
          logger.warn({ payoutId: payout.id }, 'reconcile: finalized a stuck payout (provider COMPLETED)');
        }
      } else if (state === 'FAILED') {
        const failed = await prisma.payout.updateMany({ where: { id: payout.id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
        if (failed.count > 0) {
          resolved++;
          payoutReconciledTotal.inc({ outcome: 'failed' });
          logger.warn({ payoutId: payout.id }, 'reconcile: marked a stuck payout FAILED (provider FAILED)');
        }
      } else {
        payoutReconciledTotal.inc({ outcome: 'unresolved' });
        logger.warn({ payoutId: payout.id, state }, 'reconcile: payout state still unresolved, will retry');
      }
    }

    payoutStuckGauge.set(stuck.length - resolved);
    return resolved;
  }

}

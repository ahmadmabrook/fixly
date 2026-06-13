import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma, BookingStatus, PayoutStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../shared/errors';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';
import { PayoutProviderFactory } from '../../infrastructure/providers/PayoutProviderFactory';

type DbClient = Prisma.TransactionClient | typeof prisma;

const PAYOUT_INCLUDE = { technician: { include: { user: true } } } as const;

export class AdminService {
  constructor(private readonly payoutProvider: IPayoutProvider = PayoutProviderFactory.create()) {}

  /** Append an immutable audit record. Pass the tx client to keep it atomic with the mutation. */
  private async audit(
    client: DbClient,
    actorId: string,
    action: string,
    target?: { type: string; id: string },
    metadata?: Prisma.InputJsonValue,
    ip?: string,
  ) {
    await client.adminAuditLog.create({
      data: { actorId, action, targetType: target?.type, targetId: target?.id, metadata, ip },
    });
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
        { event: 'admin.login.fail', email, ip, reason: !admin ? 'no_user' : !admin.isActive ? 'disabled' : 'bad_password' },
        'Admin login failed',
      );
      throw new UnauthorizedError('Invalid credentials');
    }

    await this.audit(prisma, admin.id, 'admin.login', undefined, undefined, ip);

    const accessToken = jwt.sign(
      { userId: admin.id, role: 'ADMIN', typ: 'admin' },
      env().JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: env().JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
        issuer: 'fixly',
        audience: 'fixly-admin',
      },
    );

    return {
      accessToken,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }

  async getStats() {
    const [
      totalBookings,
      pendingBookings,
      completedBookings,
      totalTechnicians,
      verifiedTechnicians,
      revenueResult,
      pendingPayouts,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.technicianProfile.count(),
      prisma.technicianProfile.count({ where: { isVerified: true } }),
      prisma.booking.aggregate({
        _sum: { totalJod: true },
        where: { status: 'COMPLETED' },
      }),
      prisma.payout.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      totalBookings,
      pendingBookings,
      completedBookings,
      totalTechnicians,
      verifiedTechnicians,
      totalRevenueJod: Number(revenueResult._sum.totalJod ?? 0),
      pendingPayouts,
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
          customer: { select: { id: true, name: true, phone: true } },
          service: { select: { id: true, nameAr: true, nameEn: true, priceJod: true } },
          technician: { select: { id: true, rating: true, user: { select: { id: true, name: true } } } },
        },
      }),
      prisma.booking.count({ where }),
    ]);
    return { items, total };
  }

  async listTechnicians(limit = 50, offset = 0) {
    const [items, total] = await prisma.$transaction([
      prisma.technicianProfile.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, isVerified: true, isAvailable: true, rating: true, totalReviews: true, createdAt: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.technicianProfile.count(),
    ]);
    return { items, total };
  }

  async verifyTechnician(id: string, actorId: string, ip?: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Idempotent: a re-verify on an already-verified tech is a no-op (no
        // duplicate audit row, no spurious update write). The first call
        // wins; subsequent calls just return the current state.
        const existing = await tx.technicianProfile.findUnique({
          where: { id },
          include: { user: true },
        });
        if (!existing) throw new NotFoundError('TechnicianProfile');
        if (existing.isVerified) return existing;

        const profile = await tx.technicianProfile.update({
          where: { id },
          data: { isVerified: true },
          include: { user: true },
        });
        await this.audit(tx, actorId, 'technician.verify', { type: 'TechnicianProfile', id }, undefined, ip);
        return profile;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('TechnicianProfile');
      }
      throw err;
    }
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
    const payout = await prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundError('Payout');
    if (payout.status === 'COMPLETED') {
      return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
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
    } catch (err) {
      await prisma.payout.update({ where: { id }, data: { status: 'FAILED' } });
      throw new ConflictError('Payout disbursement failed');
    }

    // Phase 3 — finalize.
    return prisma.$transaction(async (tx) => {
      const updated = await tx.payout.update({
        where: { id },
        data: { status: 'COMPLETED', processedAt: new Date() },
        include: PAYOUT_INCLUDE,
      });
      await tx.ledgerEntry.create({
        data: { payoutId: id, type: 'PAYOUT', amountJod: payout.amountJod, description: `Payout ${id} (${providerRef})` },
      });
      await this.audit(tx, actorId, 'payout.process', { type: 'Payout', id }, { amountJod: Number(payout.amountJod), providerRef }, ip);
      return updated;
    });
  }
}

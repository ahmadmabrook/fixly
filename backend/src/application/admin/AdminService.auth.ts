import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { hashToken } from '../auth/AuthService';
import { audit } from './adminAudit';
import { UnauthorizedError } from '../../shared/errors';
import { env } from '../../shared/env';
import { signJwt } from '../../shared/jwt';
import { logger } from '../../shared/logger';

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Short fingerprint of an email for log correlation. Same email → same fp;
 *  different emails → different fp; the email itself cannot be recovered. */
function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

const ADMIN_REFRESH_EXPIRES_DAYS = 30;

/**
 * Admin auth/session flow (login, refresh-token rotation, logout), extracted
 * from AdminService (see that file for the full class overview). Stateless —
 * no injected dependencies.
 */
export class AdminAuthFlow {
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
    const accessToken = signJwt(
      { userId: adminId, role: 'ADMIN', adminRole, typ: 'admin' },
      {
        expiresIn: env().JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
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
}

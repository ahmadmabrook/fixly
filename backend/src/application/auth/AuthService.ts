import { randomInt, createHash } from 'crypto';
import { constantTimeEquals } from '../../shared/crypto';
import type { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../shared/errors';
import { env } from '../../shared/env';
import { signJwt } from '../../shared/jwt';
import { logger } from '../../shared/logger';
import type { IOtpProvider } from '../../domain/providers/IOtpProvider';
import { ReferralService } from '../referral/ReferralService';
import { normalizePhone } from '../../shared/phone';

const REFRESH_EXPIRES_DAYS = 30;
const OTP_TTL_SECONDS = 300;
const JWT_ISSUER = 'fixly';
const JWT_AUDIENCE_USER = 'fixly-app';

// Brute-force protection: cap verify attempts per phone within the OTP window.
const MAX_VERIFY_ATTEMPTS = 5;
// Rate-limit OTP issuance to stop SMS-bombing a victim's number.
const REQUEST_COOLDOWN_SECONDS = 60;

/** SHA-256 of an opaque refresh token — only the hash is persisted. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export class AuthService {
  constructor(
    private readonly otpProvider: IOtpProvider,
    private readonly referralService: ReferralService = new ReferralService(),
  ) {}

  async requestOtp(rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const cooldownKey = `otp_cooldown:${phone}`;
    const onCooldown = await redis.set(cooldownKey, '1', 'EX', REQUEST_COOLDOWN_SECONDS, 'NX');
    if (onCooldown === null) {
      throw new ValidationError('Please wait before requesting another code');
    }

    const code = env().OTP_PROVIDER === 'mock' ? '000000' : this.generateCode();
    await redis.setex(`otp:${phone}`, OTP_TTL_SECONDS, code);
    await redis.del(`otp_attempts:${phone}`);

    try {
      await this.otpProvider.send(phone, code);
    } catch (err) {
      // Don't strand the victim on cooldown if delivery failed — clear it.
      await redis.del(cooldownKey);
      throw err;
    }
  }

  async verifyOtp(rawPhone: string, code: string, referralCode?: string) {
    const phone = normalizePhone(rawPhone);
    const attemptsKey = `otp_attempts:${phone}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await redis.del(`otp:${phone}`);
      throw new UnauthorizedError('Too many attempts — request a new code');
    }

    const stored = await redis.get(`otp:${phone}`);
    // Constant-time compare: a byte-wise early-exit would leak the correct prefix
    // through response timing. The attempt cap above already bounds guessing, but
    // that caps GUESSES, not the timing oracle — they are different defences.
    if (!stored || !constantTimeEquals(stored, code)) throw new UnauthorizedError('Invalid or expired OTP');

    await redis.del(`otp:${phone}`);
    await redis.del(attemptsKey);

    // Distinguish first-time signup from a returning user so a referral code
    // is only ever captured once, at account creation.
    const existing = await prisma.user.findUnique({ where: { phone } });
    const user = existing ?? await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { phone } });
      if (referralCode) {
        await this.referralService.captureAtSignup(tx, created.id, referralCode);
      }
      return created;
    });
    if (!user.isActive) throw new UnauthorizedError('Account is disabled');

    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedError('Missing refresh token');
    }
    const tokenHash = hashToken(refreshToken);

    // Rotate atomically: revoke old + issue new in one transaction so a
    // replayed token can never mint two valid sessions.
    return prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!record || record.expiresAt < new Date()) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Reuse detection: presenting an already-revoked token means it was
      // stolen + already rotated. Revoke the whole family and refuse.
      if (record.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedError('Token reuse detected — all sessions revoked');
      }

      if (!record.user.isActive) throw new UnauthorizedError('Account is disabled');

      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });

      return this.issueTokens(record.user.id, record.user.role, tx);
    });
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /** Update the caller's editable profile fields (name, avatar). */
  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');
    return prisma.user.update({
      where: { id: userId },
      data: { name: data.name ?? undefined, avatarUrl: data.avatarUrl ?? undefined },
    });
  }

  /**
   * Account deletion (customer-initiated). Soft-delete: deactivate the account
   * and revoke all refresh tokens so every session dies immediately. A hard
   * delete is intentionally avoided — booking/payment history must be retained
   * for financial/audit integrity (and FKs would block it anyway).
   */
  async deleteAccount(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    // Audit-shaped record of this sensitive self-action (no user-audit table; the
    // user id is fingerprinted so the log can correlate without storing raw PII).
    logger.info({ event: 'account.delete', userIdFp: createHash('sha256').update(userId).digest('hex').slice(0, 12) }, 'Account soft-deleted (self-initiated)');
  }

  /** Revoke the presented refresh token (logout). Idempotent + silent: an
   *  unknown/absent token is a no-op so logout never leaks token validity. */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    role: string,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const accessToken = signJwt(
      { userId, role, typ: 'user' },
      {
        expiresIn: env().JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE_USER,
      },
    );

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

    await tx.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private generateCode(): string {
    // crypto-secure 6-digit code (not Math.random)
    return randomInt(100000, 1000000).toString();
  }
}

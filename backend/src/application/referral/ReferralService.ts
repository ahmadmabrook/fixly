import { randomInt } from 'crypto';
import { Prisma, CreditReason, BookingStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, PrismaErrorCode } from '../../shared/errors';
import type { ServiceCreditService } from '../credit/ServiceCreditService';

/** Credit granted to the referrer on the referred user's first COMPLETED booking. */
export const REFERRAL_CREDIT_JOD = 5;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids look-alikes
const CODE_LENGTH = 6;
const MAX_GENERATION_ATTEMPTS = 5;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION;
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
}

/**
 * Referral invite codes (§ referrals). Structurally mirrors PromoCode/
 * PromoRedemption: `User.referralCode` is the shareable code; `ReferralRedemption`
 * is the one-time redemption row created at the referred user's signup. The
 * actual credit grant happens later, on the referred user's first completed
 * booking (see BookingService.complete()).
 */
export class ReferralService {
  /**
   * Return the caller's own referral code, generating + persisting one on
   * first access (collision-retried; existing users predate this column).
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (!user) throw new NotFoundError('User');
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = randomCode();
      try {
        const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
        return updated.referralCode!;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // Collision — retry with a fresh code.
      }
    }
    throw new Error('Failed to generate a unique referral code');
  }

  /** Caller's referral code + lifetime stats (total referred, total credit earned). */
  async getMyStats(userId: string) {
    const [referralCode, totalReferred, creditAgg] = await Promise.all([
      this.getOrCreateCode(userId),
      prisma.referralRedemption.count({ where: { referrerId: userId } }),
      prisma.serviceCredit.aggregate({
        where: { customerId: userId, reason: CreditReason.REFERRAL },
        _sum: { amountJod: true },
      }),
    ]);
    return {
      referralCode,
      totalReferred,
      totalCreditEarnedJod: Number(creditAgg._sum.amountJod ?? 0),
    };
  }

  /**
   * Capture a referral at signup, inside the caller's transaction. No-ops
   * silently (never blocks signup) when the code is unknown, self-referral,
   * or the referred user was already captured by another code (race).
   */
  async captureAtSignup(tx: Prisma.TransactionClient, referredUserId: string, referralCode: string): Promise<void> {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;

    const referrer = await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer || referrer.id === referredUserId) return;

    try {
      await tx.referralRedemption.create({
        data: { referrerId: referrer.id, referredUserId },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Already captured (unique referredUserId) — ignore.
    }
  }

  /**
   * Grant the referrer's credit when `customerId` has just completed their
   * FIRST booking and was referred in. Called from BookingService.complete()
   * inside its own transaction. Exactly-once via ReferralRedemption.creditGrantedAt
   * (guarded by the WHERE clause, so a concurrent double-call can't double-grant)
   * plus the ServiceCredit refKey belt-and-suspenders.
   */
  async grantCreditIfEligible(
    tx: Prisma.TransactionClient,
    customerId: string,
    bookingId: string,
    creditService: ServiceCreditService,
  ): Promise<void> {
    const redemption = await tx.referralRedemption.findUnique({ where: { referredUserId: customerId } });
    if (!redemption || redemption.creditGrantedAt) return;

    // "First completed booking" — this booking just became COMPLETED by the
    // caller, so a count of exactly 1 means it's the customer's first.
    const completedCount = await tx.booking.count({ where: { customerId, status: BookingStatus.COMPLETED } });
    if (completedCount !== 1) return;

    const { count } = await tx.referralRedemption.updateMany({
      where: { id: redemption.id, creditGrantedAt: null },
      data: { creditGrantedAt: new Date() },
    });
    if (count === 0) return; // lost the race to another concurrent completion

    await creditService.grant(tx, {
      customerId: redemption.referrerId,
      amountJod: REFERRAL_CREDIT_JOD,
      reason: CreditReason.REFERRAL,
      bookingId,
      refKey: `referral:${redemption.id}`,
    });
  }
}

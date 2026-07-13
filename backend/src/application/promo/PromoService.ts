import { Prisma, PromoType } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError, ValidationError, NotFoundError } from '../../shared/errors';

const FILS_PER_JOD = 1000;

/** 422 with a machine-readable promo code so the client can map to Arabic copy. */
function promoError(message: string, code: string): AppError {
  return new AppError(message, 422, code);
}

export interface PromoQuote {
  promoCodeId: string;
  code: string;
  discountJod: Prisma.Decimal;
  finalJod: Prisma.Decimal;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Promo / discount-code business logic. Validation is exact-decimal (fils) and
 * enforces the lifecycle (active window), spend floor, and both global and
 * per-user redemption caps. `quote()` is pure-read (used by the validate
 * endpoint); `redeem()` records usage inside the booking transaction.
 */
export class PromoService {
  /**
   * Validate a code against an order amount for a user and return the discount.
   * Throws ValidationError with an Arabic-friendly code on any failure so the
   * client can surface the exact reason.
   */
  async quote(code: string, userId: string, orderJod: Prisma.Decimal | number | string): Promise<PromoQuote> {
    const normalized = String(code).trim().toUpperCase();
    if (!normalized) throw new ValidationError('Promo code is required');

    const promo = await prisma.promoCode.findUnique({ where: { code: normalized } });
    if (!promo || !promo.isActive) throw promoError('رمز الخصم غير صالح', 'PROMO_INVALID');

    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) throw promoError('رمز الخصم غير مفعّل بعد', 'PROMO_NOT_STARTED');
    if (promo.expiresAt && promo.expiresAt < now) throw promoError('انتهت صلاحية رمز الخصم', 'PROMO_EXPIRED');

    const order = new Prisma.Decimal(orderJod);
    if (promo.minOrderJod && order.lessThan(promo.minOrderJod)) {
      throw promoError(`الحد الأدنى للطلب ${promo.minOrderJod.toString()} دينار`, 'PROMO_MIN_ORDER');
    }

    if (promo.maxRedemptions !== null && promo.timesRedeemed >= promo.maxRedemptions) {
      throw promoError('استُنفد رمز الخصم', 'PROMO_EXHAUSTED');
    }

    const usedByUser = await prisma.promoRedemption.count({ where: { promoCodeId: promo.id, userId } });
    if (usedByUser >= promo.perUserLimit) {
      throw promoError('استخدمت هذا الرمز سابقاً', 'PROMO_USER_LIMIT');
    }

    const discount = this.computeDiscount(promo.type, promo.value, order);
    const final = order.minus(discount);
    return { promoCodeId: promo.id, code: promo.code, discountJod: discount, finalJod: final };
  }

  /**
   * Atomically record a redemption (bump global counter + write the per-user
   * row). MUST run inside the booking-creation transaction so the cap can't be
   * raced. Re-validates the global cap under the row lock.
   */
  async redeem(tx: DbClient, promoCodeId: string, userId: string, bookingId: string, discountJod: Prisma.Decimal): Promise<void> {
    // Serialize all redemptions of THIS code: a row lock makes the cap checks
    // below atomic, so concurrent bookings can't both slip past the global or
    // per-user limit (perUserLimit can be >1, so a plain unique constraint won't do).
    await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${promoCodeId}::uuid FOR UPDATE`;

    const promo = await tx.promoCode.findUnique({ where: { id: promoCodeId } });
    if (!promo) throw new NotFoundError('PromoCode');
    if (promo.maxRedemptions !== null && promo.timesRedeemed >= promo.maxRedemptions) {
      throw promoError('استُنفد رمز الخصم', 'PROMO_EXHAUSTED');
    }
    // Per-user cap — now race-free under the FOR UPDATE lock above.
    const usedByUser = await tx.promoRedemption.count({ where: { promoCodeId, userId } });
    if (usedByUser >= promo.perUserLimit) {
      throw promoError('استخدمت هذا الرمز سابقاً', 'PROMO_USER_LIMIT');
    }
    await tx.promoCode.update({ where: { id: promoCodeId }, data: { timesRedeemed: { increment: 1 } } });
    await tx.promoRedemption.create({
      data: { promoCodeId, userId, bookingId, amountJod: discountJod },
    });
  }

  /** PERCENT → order × value%, FIXED → value JOD off. Discount is fils-exact,
   *  rounds DOWN, and never exceeds the order total. */
  private computeDiscount(type: PromoType, value: Prisma.Decimal, order: Prisma.Decimal): Prisma.Decimal {
    let raw: Prisma.Decimal;
    if (type === PromoType.PERCENT) {
      const fils = order.times(FILS_PER_JOD).times(value).dividedBy(100).floor();
      raw = fils.dividedBy(FILS_PER_JOD);
    } else {
      raw = value;
    }
    return Prisma.Decimal.min(raw, order);
  }
}

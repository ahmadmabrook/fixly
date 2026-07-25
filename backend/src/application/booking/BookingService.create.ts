import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { ConflictError } from '../../shared/errors';
import { paymentRequiresHostedCheckout } from '../../shared/env';
import { toMinorUnits } from '../../shared/money';
import { PromoService } from '../promo/PromoService';
import { SubscriptionService } from '../subscription/SubscriptionService';
import { ServiceCreditService } from '../credit/ServiceCreditService';
import { withDeadlockRetry } from '../../shared/dbRetry';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { recordBookingStatusHistory } from './bookingStatusHistory';
import { OutboxEventType } from '../../shared/outboxEvents';

export interface CreateBookingInput {
  customerId: string;
  serviceId: string;
  addressLine: string;
  addressLat: number;
  addressLng: number;
  /** Free-text instructions for the technician (gate code, floor, etc.). */
  notes?: string;
  scheduledAt?: string;
  /** Optional promo/discount code applied to the fixed service price. */
  promoCode?: string;
  /** Firm price from an accepted video pre-check quote (§0.3); overrides the
   *  service list price for this booking. */
  priceOverrideJod?: number | string | Prisma.Decimal;
  /**
   * v1.7 labour/materials split (§17.5), from an accepted quote_first
   * BookingQuote's itemized line totals — see BookingQuoteService.accept.
   * Optional and additive: existing fixed_scope/video-quote callers omit
   * these and get the default below, unchanged.
   */
  labourFils?: number;
  materialsFils?: number;
}

/**
 * Booking-creation flow, extracted from BookingService (see that file for the
 * full class overview). Depends on the same promo/subscription/credit
 * services BookingService is constructed with.
 */
export class BookingCreateFlow {
  constructor(
    private readonly promoService: PromoService,
    private readonly subscriptionService: SubscriptionService,
    private readonly creditService: ServiceCreditService,
  ) {}

  async createBooking(input: CreateBookingInput) {
    // Account standing (blocked/deleted) is enforced once by `requireActiveUser`
    // on the bookings router (POST) — no duplicate isActive lookup here.
    const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundError('Service');
    if (!service.isActive) throw new ValidationError('Service is not available');

    // List price = service price, unless this booking came from an accepted firm
    // video quote (§0.3), which fixes its own price. Wrap in Decimal so arithmetic
    // is exact and tolerant of numeric inputs.
    const listPrice = new Prisma.Decimal(input.priceOverrideJod ?? service.priceJod);

    // Protection subscription (§0.3): members get priority dispatch + a % discount.
    const subscription = await this.subscriptionService.activeFor(input.customerId);
    const isPriority = subscription?.priorityDispatch ?? false;
    const subDiscount = subscription
      ? listPrice.mul(subscription.discountPercent).div(100)
      : new Prisma.Decimal(0);
    const subscriberPrice = listPrice.sub(subDiscount);

    // Resolve any promo BEFORE opening the transaction so an invalid code fails
    // fast with its specific reason. Promo stacks on the subscriber price.
    const quote = input.promoCode
      ? await this.promoService.quote(input.promoCode, input.customerId, subscriberPrice)
      : null;
    const postPromo = quote ? quote.finalJod : subscriberPrice;
    // discountJod records list→charged reductions (subscription + promo). Wallet
    // credit is a separate REDEMPTION row, not a discount.
    const discountJod = listPrice.sub(postPromo);

    // Hosted-checkout (real PSP): the booking starts in AWAITING_PAYMENT and is NOT yet
    // visible to technicians; it is promoted to PENDING (and booking.created is emitted)
    // only once the customer authorizes payment. Instant (mock) providers authorize on
    // booking.created, so the booking starts live at PENDING — unchanged behaviour.
    const hosted = paymentRequiresHostedCheckout();

    // Concurrent bookings racing the SAME promo code deadlock in Postgres:
    // each transaction takes `SELECT ... FOR UPDATE` on the promo row plus an
    // FK-driven lock on the shared customer/promo parent rows, and with 3+
    // contenders those can queue into a genuine lock cycle (40P01) rather than
    // a clean serialize. Rather than lean on DB-level retries for something
    // this frequent, serialize redemption attempts for a given promo code at
    // the application layer first — same SETNX-lock convention as accept()'s
    // per-booking lock above — so at most one createBooking with this promo
    // is ever inside the transaction at a time. The transaction-level retry
    // stays as a backstop for any deadlock this doesn't fully rule out.
    const promoLockKey = quote ? `promo_lock:${quote.promoCodeId}` : null;
    if (promoLockKey) await this.acquirePromoLock(promoLockKey);

    try {
      return await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            customerId: input.customerId,
            serviceId: input.serviceId,
            addressLine: input.addressLine,
            addressLat: input.addressLat,
            addressLng: input.addressLng,
            notes: input.notes?.trim() || undefined,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
            discountJod,
            promoCodeId: quote?.promoCodeId,
            totalJod: postPromo,
            isPriority,
            status: hosted ? 'AWAITING_PAYMENT' : 'PENDING',
            // v1.7 labour/materials split (§17.5): an accepted quote_first quote
            // passes its own line-derived split; a fixed_scope/video-quote
            // booking has no materials concept, so its full charged price is
            // labour and materials is 0 — matches the three-line invoice rule.
            labourFils: input.labourFils ?? toMinorUnits(postPromo),
            materialsFils: input.materialsFils ?? 0,
          },
        });
        await recordBookingStatusHistory(tx, booking.id, null, booking.status, input.customerId);

        if (quote) {
          await this.promoService.redeem(tx, quote.promoCodeId, input.customerId, booking.id, quote.discountJod);
        }

        // Apply wallet credit against the amount due (capped, race-safe). The
        // authorized hold then covers only the net payable.
        const redeemed = await this.creditService.redeem(tx, input.customerId, postPromo, booking.id);
        if (redeemed.gt(0)) {
          await tx.booking.update({ where: { id: booking.id }, data: { totalJod: postPromo.sub(redeemed) } });
        }

        if (!hosted) {
          await tx.outboxEvent.create({
            data: {
              bookingId: booking.id,
              eventType: OutboxEventType.BOOKING_CREATED,
              payload: { bookingId: booking.id, customerId: input.customerId },
            },
          });
        }

        return redeemed.gt(0) ? { ...booking, totalJod: postPromo.sub(redeemed) } : booking;
      }));
    } finally {
      if (promoLockKey) await redis.del(promoLockKey);
    }
  }

  /** Short-lived SETNX lock serializing redemption attempts for one promo
   *  code. Waits (briefly, with jitter) rather than failing immediately —
   *  losing this race is normal contention, not an error the customer caused. */
  private async acquirePromoLock(key: string, maxAttempts = 40): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const acquired = await redis.set(key, '1', 'EX', 10, 'NX');
      if (acquired) return;
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 25));
    }
    throw new ConflictError('عذراً، حاول مرة أخرى بعد قليل');
  }
}

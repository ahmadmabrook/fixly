import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  IPaymentProvider,
  PreAuthResult,
  CaptureResult,
  VoidResult,
  RefundResult,
  PaymentStatusResult,
  PrepareCheckoutInput,
  PrepareCheckoutResult,
  CheckoutResult,
  PspWebhookEvent,
  WebhookHeaders,
} from '../../domain/providers/IPaymentProvider';
import { logger } from '../../shared/logger';

/**
 * Deterministic in-memory PSP for dev/test. Mirrors the real adapter contract exactly
 * (idempotency keys, partial amounts, status query, signed webhooks) so swapping in a real
 * PSP is a drop-in.
 *
 * `mode = 'instant'`: the booking flow authorizes synchronously via `preAuthorize()` on
 * `booking.created` (no customer-facing hosted checkout). The hosted-checkout methods are
 * still implemented (deterministically "authorized") so the hosted code path can be
 * exercised in tests without a real PSP.
 */
export class MockPaymentProvider implements IPaymentProvider {
  readonly mode = 'instant' as const;

  constructor(private readonly webhookSecret = '') {}

  async preAuthorize(bookingId: string, amountJod: number | string, idempotencyKey?: string): Promise<PreAuthResult> {
    logger.info({ bookingId, amountJod, idempotencyKey }, '[MOCK PAYMENT] Pre-authorizing');
    return { providerRef: `mock_${uuidv4()}`, status: 'PRE_AUTHORIZED' };
  }

  async prepareCheckout(input: PrepareCheckoutInput): Promise<PrepareCheckoutResult> {
    logger.info({ ...input }, '[MOCK PAYMENT] Prepare checkout');
    return { checkoutId: `mockco_${uuidv4()}`, scriptUrl: 'about:blank', brands: ['VISA', 'MASTER'] };
  }

  async getCheckoutResult(checkoutId: string): Promise<CheckoutResult> {
    logger.info({ checkoutId }, '[MOCK PAYMENT] Checkout result → authorized');
    return {
      state: 'authorized',
      providerRef: `mock_${uuidv4()}`,
      cardBrand: 'VISA',
      cardLast4: '0001',
      resultCode: '000.100.110',
      resultDescription: 'Request successfully processed (mock)',
    };
  }

  async capture(providerRef: string, amountJod: number | string, idempotencyKey?: string): Promise<CaptureResult> {
    logger.info({ providerRef, amountJod, idempotencyKey }, '[MOCK PAYMENT] Capturing');
    return { providerRef, status: 'CAPTURED', capturedAmountJod: Number(amountJod) };
  }

  async void(providerRef: string, idempotencyKey?: string): Promise<VoidResult> {
    logger.info({ providerRef, idempotencyKey }, '[MOCK PAYMENT] Voiding hold');
    return { providerRef, status: 'VOIDED' };
  }

  async refund(providerRef: string, amountJod: number | string, idempotencyKey?: string): Promise<RefundResult> {
    logger.info({ providerRef, amountJod, idempotencyKey }, '[MOCK PAYMENT] Refunding');
    return { providerRef, status: 'REFUNDED', refundedAmountJod: Number(amountJod) };
  }

  async getStatus(providerRef: string): Promise<PaymentStatusResult> {
    logger.info({ providerRef }, '[MOCK PAYMENT] Status query → CAPTURED');
    return { state: 'CAPTURED' };
  }

  decodeWebhook(rawBody: Buffer, headers: WebhookHeaders): PspWebhookEvent | null {
    const body = rawBody.toString('utf8');
    // Dev convenience: with no secret configured, accept (env enforces a secret in
    // production for non-mock providers; the mock can't run in production at all).
    if (this.webhookSecret) {
      const signature = headers['x-psp-signature'];
      if (!signature) return null;
      const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    }
    try {
      return JSON.parse(body) as PspWebhookEvent;
    } catch {
      return null;
    }
  }
}

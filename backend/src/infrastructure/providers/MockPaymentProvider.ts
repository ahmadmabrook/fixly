import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  IPaymentProvider,
  PreAuthResult,
  CaptureResult,
  VoidResult,
  RefundResult,
  PaymentStatusResult,
  PspWebhookEvent,
} from '../../domain/providers/IPaymentProvider';
import { logger } from '../../shared/logger';

/**
 * Deterministic in-memory PSP for dev/test. Mirrors the real adapter contract
 * exactly (idempotency keys, partial amounts, status query, signed webhooks) so
 * swapping in a real PSP is a drop-in.
 */
export class MockPaymentProvider implements IPaymentProvider {
  constructor(private readonly webhookSecret = '') {}

  async preAuthorize(bookingId: string, amountJod: number, idempotencyKey?: string): Promise<PreAuthResult> {
    logger.info({ bookingId, amountJod, idempotencyKey }, '[MOCK PAYMENT] Pre-authorizing');
    return { providerRef: `mock_${uuidv4()}`, status: 'PRE_AUTHORIZED' };
  }

  async capture(providerRef: string, amountJod: number, idempotencyKey?: string): Promise<CaptureResult> {
    logger.info({ providerRef, amountJod, idempotencyKey }, '[MOCK PAYMENT] Capturing');
    return { providerRef, status: 'CAPTURED', capturedAmountJod: amountJod };
  }

  async void(providerRef: string, idempotencyKey?: string): Promise<VoidResult> {
    logger.info({ providerRef, idempotencyKey }, '[MOCK PAYMENT] Voiding hold');
    return { providerRef, status: 'VOIDED' };
  }

  async refund(providerRef: string, amountJod: number, idempotencyKey?: string): Promise<RefundResult> {
    logger.info({ providerRef, amountJod, idempotencyKey }, '[MOCK PAYMENT] Refunding');
    return { providerRef, status: 'REFUNDED', refundedAmountJod: amountJod };
  }

  async getStatus(providerRef: string): Promise<PaymentStatusResult> {
    logger.info({ providerRef }, '[MOCK PAYMENT] Status query → CAPTURED');
    return { state: 'CAPTURED' };
  }

  verifyWebhook(rawBody: string, signature: string | undefined): boolean {
    // Dev convenience: with no secret configured, accept (env enforces a secret
    // in production for non-mock providers).
    if (!this.webhookSecret) return true;
    if (!signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): PspWebhookEvent {
    return JSON.parse(rawBody) as PspWebhookEvent;
  }
}

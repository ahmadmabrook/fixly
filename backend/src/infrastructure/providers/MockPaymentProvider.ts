import { v4 as uuidv4 } from 'uuid';
import type {
  IPaymentProvider,
  PreAuthResult,
  CaptureResult,
  VoidResult,
  RefundResult,
} from '../../domain/providers/IPaymentProvider';
import { logger } from '../../shared/logger';

export class MockPaymentProvider implements IPaymentProvider {
  async preAuthorize(bookingId: string, amountJod: number, idempotencyKey?: string): Promise<PreAuthResult> {
    logger.info({ bookingId, amountJod, idempotencyKey }, '[MOCK PAYMENT] Pre-authorizing');
    return { providerRef: `mock_${uuidv4()}`, status: 'PRE_AUTHORIZED' };
  }

  async capture(providerRef: string, idempotencyKey?: string): Promise<CaptureResult> {
    logger.info({ providerRef, idempotencyKey }, '[MOCK PAYMENT] Capturing');
    return { providerRef, status: 'CAPTURED' };
  }

  async void(providerRef: string, idempotencyKey?: string): Promise<VoidResult> {
    logger.info({ providerRef, idempotencyKey }, '[MOCK PAYMENT] Voiding hold');
    return { providerRef, status: 'VOIDED' };
  }

  async refund(providerRef: string, idempotencyKey?: string): Promise<RefundResult> {
    logger.info({ providerRef, idempotencyKey }, '[MOCK PAYMENT] Refunding');
    return { providerRef, status: 'REFUNDED' };
  }
}

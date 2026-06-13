import { v4 as uuidv4 } from 'uuid';
import type { IPaymentProvider, PreAuthResult, CaptureResult } from '../../domain/providers/IPaymentProvider';
import { logger } from '../../shared/logger';

export class MockPaymentProvider implements IPaymentProvider {
  async preAuthorize(bookingId: string, amountJod: number): Promise<PreAuthResult> {
    logger.info({ bookingId, amountJod }, '[MOCK PAYMENT] Pre-authorizing');
    return { providerRef: `mock_${uuidv4()}`, status: 'PRE_AUTHORIZED' };
  }

  async capture(providerRef: string): Promise<CaptureResult> {
    logger.info({ providerRef }, '[MOCK PAYMENT] Capturing');
    return { providerRef, status: 'CAPTURED' };
  }

  async refund(providerRef: string): Promise<void> {
    logger.info({ providerRef }, '[MOCK PAYMENT] Refunding');
  }
}

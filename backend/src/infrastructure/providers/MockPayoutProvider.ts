import { v4 as uuidv4 } from 'uuid';
import type { IPayoutProvider, DisburseResult, PayoutStatusResult } from '../../domain/providers/IPayoutProvider';
import { logger } from '../../shared/logger';

export class MockPayoutProvider implements IPayoutProvider {
  async disburse(payoutId: string, amountJod: number): Promise<DisburseResult> {
    logger.info({ payoutId, amountJod }, '[MOCK PAYOUT] Disbursing to technician');
    return { providerRef: `mock_payout_${uuidv4()}`, status: 'DISBURSED' };
  }

  async getStatus(payoutId: string): Promise<PayoutStatusResult> {
    // Mock assumes a disbursement that was issued went through.
    logger.info({ payoutId }, '[MOCK PAYOUT] Status query → COMPLETED');
    return { state: 'COMPLETED', providerRef: `mock_payout_${payoutId}` };
  }
}

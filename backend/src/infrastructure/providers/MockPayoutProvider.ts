import { v4 as uuidv4 } from 'uuid';
import type { IPayoutProvider, DisburseResult } from '../../domain/providers/IPayoutProvider';
import { logger } from '../../shared/logger';

export class MockPayoutProvider implements IPayoutProvider {
  async disburse(payoutId: string, amountJod: number): Promise<DisburseResult> {
    logger.info({ payoutId, amountJod }, '[MOCK PAYOUT] Disbursing to technician');
    return { providerRef: `mock_payout_${uuidv4()}`, status: 'DISBURSED' };
  }
}

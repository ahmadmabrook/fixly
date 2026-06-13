import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';
import { env } from '../../shared/env';
import { MockPayoutProvider } from './MockPayoutProvider';

export class PayoutProviderFactory {
  static create(): IPayoutProvider {
    // Payouts use the same PSP configuration as payments.
    const provider = env().PAYMENT_PROVIDER;
    if (provider === 'mock') return new MockPayoutProvider();
    throw new Error(`Unknown payout provider: ${provider}`);
  }
}

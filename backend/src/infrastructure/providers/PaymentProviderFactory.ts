import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';
import { env } from '../../shared/env';
import { MockPaymentProvider } from './MockPaymentProvider';

export class PaymentProviderFactory {
  static create(): IPaymentProvider {
    const e = env();
    if (e.PAYMENT_PROVIDER === 'mock') return new MockPaymentProvider(e.PSP_WEBHOOK_SECRET);
    throw new Error(`Unknown payment provider: ${e.PAYMENT_PROVIDER}`);
  }
}

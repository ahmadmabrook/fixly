import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';
import { env } from '../../shared/env';
import { MockPaymentProvider } from './MockPaymentProvider';

export class PaymentProviderFactory {
  static create(): IPaymentProvider {
    const provider = env().PAYMENT_PROVIDER;
    if (provider === 'mock') return new MockPaymentProvider();
    throw new Error(`Unknown payment provider: ${provider}`);
  }
}

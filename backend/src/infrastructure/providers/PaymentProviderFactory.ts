import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';
import { env, paymentRequiresHostedCheckout } from '../../shared/env';
import { MockPaymentProvider } from './MockPaymentProvider';
import { HyperPayProvider } from './HyperPayProvider';

export class PaymentProviderFactory {
  static create(): IPaymentProvider {
    const e = env();
    switch (e.PAYMENT_PROVIDER) {
      case 'mock':
        return new MockPaymentProvider(e.PSP_WEBHOOK_SECRET);
      case 'hyperpay':
        return new HyperPayProvider({
          entityId: e.HYPERPAY_ENTITY_ID,
          accessToken: e.HYPERPAY_ACCESS_TOKEN,
          baseUrl: e.HYPERPAY_BASE_URL,
          webhookDecryptKey: e.HYPERPAY_WEBHOOK_DECRYPT_KEY,
        });
      default:
        throw new Error(`Unknown payment provider: ${e.PAYMENT_PROVIDER}`);
    }
  }

  /**
   * Whether the configured provider authorizes via customer-driven hosted checkout
   * (vs. instant server-side pre-auth). Lets the booking flow choose the initial
   * status without constructing a provider. Mirrors `IPaymentProvider.mode`.
   */
  static requiresHostedCheckout(): boolean {
    return paymentRequiresHostedCheckout();
  }
}

import type { IMaskedCallProvider } from '../../domain/providers/IMaskedCallProvider';
import { env } from '../../shared/env';
import { MockMaskedCallProvider } from './MockMaskedCallProvider';
import { TwilioMaskedCallProvider } from './TwilioMaskedCallProvider';

export class MaskedCallProviderFactory {
  static create(): IMaskedCallProvider {
    const e = env();
    switch (e.MASKED_CALL_PROVIDER) {
      case 'mock':
        return new MockMaskedCallProvider();
      case 'twilio':
        return new TwilioMaskedCallProvider({
          accountSid: e.TWILIO_ACCOUNT_SID,
          authToken: e.TWILIO_AUTH_TOKEN,
          proxyServiceSid: e.TWILIO_PROXY_SERVICE_SID,
          baseUrl: e.TWILIO_API_BASE_URL,
        });
      default:
        throw new Error(`Unknown masked-call provider: ${e.MASKED_CALL_PROVIDER}`);
    }
  }
}

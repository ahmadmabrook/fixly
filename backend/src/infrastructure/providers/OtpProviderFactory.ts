import type { IOtpProvider } from '../../domain/providers/IOtpProvider';
import { env } from '../../shared/env';
import { MockOtpProvider } from './MockOtpProvider';
import { WhatsAppOtpProvider } from './WhatsAppOtpProvider';

export class OtpProviderFactory {
  static create(): IOtpProvider {
    const e = env();
    switch (e.OTP_PROVIDER) {
      case 'mock':
        return new MockOtpProvider();
      case 'whatsapp':
        return new WhatsAppOtpProvider({
          accessToken: e.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
          templateName: e.WHATSAPP_OTP_TEMPLATE_NAME,
          baseUrl: e.WHATSAPP_API_BASE_URL,
        });
      default:
        throw new Error(`Unknown OTP provider: ${e.OTP_PROVIDER}`);
    }
  }
}

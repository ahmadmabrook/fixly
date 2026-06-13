import type { IOtpProvider } from '../../domain/providers/IOtpProvider';
import { env } from '../../shared/env';
import { MockOtpProvider } from './MockOtpProvider';

export class OtpProviderFactory {
  static create(): IOtpProvider {
    const provider = env().OTP_PROVIDER;
    if (provider === 'mock') return new MockOtpProvider();
    throw new Error(`Unknown OTP provider: ${provider}`);
  }
}

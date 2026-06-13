import type { IOtpProvider } from '../../domain/providers/IOtpProvider';
import { logger } from '../../shared/logger';

export class MockOtpProvider implements IOtpProvider {
  async send(phone: string, _code: string): Promise<void> {
    // Never log the code (a live credential). Mock code is the constant 000000.
    logger.info({ phone }, '[MOCK OTP] Would send OTP (dev code: 000000)');
  }
}

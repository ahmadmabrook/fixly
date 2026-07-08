import { createHash } from 'crypto';
import type {
  IMaskedCallProvider,
  CreateMaskedCallSessionInput,
  MaskedCallSessionResult,
} from '../../domain/providers/IMaskedCallProvider';
import { logger } from '../../shared/logger';

/**
 * Deterministic in-memory masked-call provider for dev/test. Never calls out to a
 * real telephony API — derives a stable, fake Jordan-format proxy number from the
 * booking id so repeated calls for the same booking return the same number.
 */
export class MockMaskedCallProvider implements IMaskedCallProvider {
  async createOrReuseSession(input: CreateMaskedCallSessionInput): Promise<MaskedCallSessionResult> {
    const digest = createHash('sha256').update(input.bookingId).digest('hex');
    // Deterministic 7-digit local number, formatted like a Jordan mobile line.
    const local = digest.replace(/[a-f]/g, '').padEnd(7, '5').slice(0, 7);
    const proxyNumber = `+9627${local}`;
    logger.info({ bookingId: input.bookingId, proxyNumber }, '[MOCK MASKED CALL] Session ready (dev)');
    return { proxyNumber };
  }
}

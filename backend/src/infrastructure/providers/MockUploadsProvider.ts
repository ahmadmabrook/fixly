import type { IUploadsProvider, PresignUploadInput, PresignUploadResult } from '../../domain/providers/IUploadsProvider';
import { logger } from '../../shared/logger';

export interface MockUploadsConfig {
  publicBaseUrl?: string;
}

const DEFAULT_MOCK_BASE_URL = 'https://mock-uploads.fixly.local';

/**
 * Dev/test uploads provider — issues a well-formed but fake presigned URL with no
 * real storage backend behind it. Never actually accepts a PUT; exists so the
 * presign endpoint and every media-upload flow that consumes it (onboarding docs,
 * checklist photos, guarantee evidence, intro video) are testable without real R2
 * credentials, same "can't live-test without real creds" pattern as this repo's
 * other mock providers (payment, OTP, masked calling).
 */
export class MockUploadsProvider implements IUploadsProvider {
  constructor(private readonly config: MockUploadsConfig = {}) {}

  async presignPut(input: PresignUploadInput): Promise<PresignUploadResult> {
    const base = this.config.publicBaseUrl && this.config.publicBaseUrl !== '' ? this.config.publicBaseUrl : DEFAULT_MOCK_BASE_URL;
    const publicUrl = `${base.replace(/\/$/, '')}/${input.key}`;
    const uploadUrl = `${publicUrl}?mock=1&contentType=${encodeURIComponent(input.contentType)}&expires=${input.expirySeconds}`;
    logger.info({ key: input.key, contentType: input.contentType }, '[MOCK UPLOADS] Presigned PUT issued (dev)');
    return { uploadUrl, publicUrl };
  }
}

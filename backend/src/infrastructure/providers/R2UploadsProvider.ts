import { Client } from 'minio';
import type { IUploadsProvider, PresignUploadInput, PresignUploadResult } from '../../domain/providers/IUploadsProvider';

export interface R2UploadsConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** Public/CDN URL prefix clients read the uploaded object back from after PUT. */
  publicBaseUrl: string;
}

/**
 * Cloudflare R2 uploads provider. R2 exposes an S3-compatible API, so a standard
 * S3 client library can issue real presigned PUT URLs without hand-rolling AWS
 * SigV4 signing — `minio` (already a dependency) speaks that protocol and is used
 * purely as an S3-compatible signing client here, not against a MinIO server.
 *
 * Cannot be exercised end-to-end without real R2 credentials; unit-tested against
 * a mocked client (same "can't live-test without real creds" situation as this
 * repo's HyperPay/WhatsApp/Twilio integrations).
 */
export class R2UploadsProvider implements IUploadsProvider {
  private readonly client: Client;

  constructor(private readonly config: R2UploadsConfig) {
    this.client = new Client({
      endPoint: `${config.accountId}.r2.cloudflarestorage.com`,
      useSSL: true,
      accessKey: config.accessKeyId,
      secretKey: config.secretAccessKey,
      region: 'auto',
    });
  }

  async presignPut(input: PresignUploadInput): Promise<PresignUploadResult> {
    const uploadUrl = await this.client.presignedPutObject(this.config.bucketName, input.key, input.expirySeconds);
    const publicUrl = `${this.config.publicBaseUrl.replace(/\/$/, '')}/${input.key}`;
    return { uploadUrl, publicUrl };
  }
}

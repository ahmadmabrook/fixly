import type { IUploadsProvider } from '../../domain/providers/IUploadsProvider';
import { env } from '../../shared/env';
import { MockUploadsProvider } from './MockUploadsProvider';
import { R2UploadsProvider } from './R2UploadsProvider';

export class UploadsProviderFactory {
  static create(): IUploadsProvider {
    const e = env();
    switch (e.UPLOADS_PROVIDER) {
      case 'mock':
        return new MockUploadsProvider({ publicBaseUrl: e.R2_PUBLIC_BASE_URL });
      case 'r2':
        return new R2UploadsProvider({
          accountId: e.R2_ACCOUNT_ID,
          accessKeyId: e.R2_ACCESS_KEY_ID,
          secretAccessKey: e.R2_SECRET_ACCESS_KEY,
          bucketName: e.R2_BUCKET_NAME,
          publicBaseUrl: e.R2_PUBLIC_BASE_URL,
        });
      default:
        throw new Error(`Unknown uploads provider: ${e.UPLOADS_PROVIDER}`);
    }
  }
}

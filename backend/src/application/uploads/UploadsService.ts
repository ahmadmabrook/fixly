import { v4 as uuidv4 } from 'uuid';
import type { IUploadsProvider } from '../../domain/providers/IUploadsProvider';
import { ValidationError } from '../../shared/errors';

export type UploadPurpose =
  | 'kyc_doc'
  | 'selfie'
  | 'certificate'
  | 'intro_video'
  | 'checklist_photo'
  | 'guarantee_evidence';

export interface PresignRequest {
  contentType: string;
  purpose: UploadPurpose;
}

export interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: string;
}

/** Presigned URL TTL — short-lived by design (§ system design: media uploads). */
const PRESIGN_TTL_SECONDS = 10 * 60;

const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Which MIME types each upload purpose accepts — enforced server-side so a
 *  presign can never be issued for e.g. an executable disguised as a KYC doc. */
const ALLOWED_CONTENT_TYPES: Record<UploadPurpose, readonly string[]> = {
  kyc_doc: IMAGE_CONTENT_TYPES,
  selfie: IMAGE_CONTENT_TYPES,
  certificate: IMAGE_CONTENT_TYPES,
  checklist_photo: IMAGE_CONTENT_TYPES,
  guarantee_evidence: IMAGE_CONTENT_TYPES,
  intro_video: VIDEO_CONTENT_TYPES,
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export class UploadsService {
  constructor(private readonly provider: IUploadsProvider) {}

  /** Issues a short-lived presigned PUT URL for a media upload. The object key is
   *  derived server-side from {purpose}/{userId}/{uuid}.{ext} — never from a
   *  client-supplied filename — so it can't be used for path traversal or to
   *  overwrite another user's object. */
  async presign(userId: string, input: PresignRequest): Promise<PresignResponse> {
    const allowed = ALLOWED_CONTENT_TYPES[input.purpose];
    if (!allowed) throw new ValidationError(`Invalid purpose: ${input.purpose}`);
    if (!allowed.includes(input.contentType)) {
      throw new ValidationError(`contentType "${input.contentType}" is not allowed for purpose "${input.purpose}"`);
    }

    const ext = EXTENSION_BY_CONTENT_TYPE[input.contentType];
    const key = `${input.purpose}/${userId}/${uuidv4()}.${ext}`;

    const { uploadUrl, publicUrl } = await this.provider.presignPut({
      key,
      contentType: input.contentType,
      expirySeconds: PRESIGN_TTL_SECONDS,
    });

    return {
      uploadUrl,
      publicUrl,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString(),
    };
  }
}

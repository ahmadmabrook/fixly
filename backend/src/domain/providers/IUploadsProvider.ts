export interface PresignUploadInput {
  /** Object key/path within the bucket, e.g. "kyc_doc/<userId>/<uuid>.jpg". */
  key: string;
  contentType: string;
  /** How long the presigned PUT URL stays valid, in seconds. */
  expirySeconds: number;
}

export interface PresignUploadResult {
  /** Short-lived presigned URL the client PUTs the file bytes to directly. */
  uploadUrl: string;
  /** Stable URL to read the object back from once the PUT succeeds; this is what
   *  gets submitted/stored as the field value elsewhere in the app (e.g. idDocUrl). */
  publicUrl: string;
}

export interface IUploadsProvider {
  presignPut(input: PresignUploadInput): Promise<PresignUploadResult>;
}

import { api } from './api';

/** Mirrors the backend `UploadPurpose` union (backend/src/application/uploads/UploadsService.ts). */
export type UploadPurpose = 'kyc_doc' | 'selfie' | 'certificate' | 'intro_video' | 'checklist_photo' | 'guarantee_evidence' | 'supplier_invoice';

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: string;
}

/**
 * Presign-then-PUT media upload (§ media uploads). Requests a short-lived
 * presigned URL for `file`'s own contentType, PUTs the bytes directly to
 * storage (never through the JSON API client), and returns the public URL to
 * submit to whatever endpoint consumes it (guarantee mediaUrls, checklist
 * photos, etc). The dev/test `mock` provider issues a well-formed but
 * unreachable URL flagged with `mock=1` — skipped rather than PUT to it.
 */
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const presign = await api.post<PresignResponse>('/uploads/presign', { contentType: file.type, purpose });
  const isMock = presign.uploadUrl.includes('mock=1');
  if (!isMock) {
    const res = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error('تعذّر رفع الملف');
  }
  return presign.publicUrl;
}

import { UploadsService } from './UploadsService';
import { ValidationError } from '../../shared/errors';
import type { IUploadsProvider } from '../../domain/providers/IUploadsProvider';

function makeService(presignPut = jest.fn()) {
  const provider: IUploadsProvider = { presignPut };
  return { service: new UploadsService(provider), presignPut };
}

describe('UploadsService.presign', () => {
  it('rejects an unknown purpose', async () => {
    const { service } = makeService();
    // @ts-expect-error deliberately invalid purpose to exercise the guard
    await expect(service.presign('u1', { contentType: 'image/jpeg', purpose: 'not_a_purpose' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a contentType not allowed for an image-only purpose', async () => {
    const { service, presignPut } = makeService();
    await expect(service.presign('u1', { contentType: 'video/mp4', purpose: 'selfie' })).rejects.toBeInstanceOf(ValidationError);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it('rejects an image contentType for the video-only intro_video purpose', async () => {
    const { service, presignPut } = makeService();
    await expect(service.presign('u1', { contentType: 'image/png', purpose: 'intro_video' })).rejects.toBeInstanceOf(ValidationError);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it.each([
    ['kyc_doc', 'image/jpeg'],
    ['selfie', 'image/png'],
    ['certificate', 'image/webp'],
    ['checklist_photo', 'image/heic'],
    ['guarantee_evidence', 'image/jpeg'],
    ['intro_video', 'video/mp4'],
  ] as const)('accepts %s / %s and derives a scoped, uuid-based key', async (purpose, contentType) => {
    const { service, presignPut } = makeService();
    presignPut.mockResolvedValue({ uploadUrl: 'https://provider/put', publicUrl: 'https://provider/public' });

    const result = await service.presign('user-42', { contentType, purpose });

    expect(presignPut).toHaveBeenCalledTimes(1);
    const call = presignPut.mock.calls[0][0];
    expect(call.contentType).toBe(contentType);
    expect(call.expirySeconds).toBe(10 * 60);
    // Key is derived server-side (purpose/userId/uuid.ext) — never from client input.
    expect(call.key).toMatch(new RegExp(`^${purpose}/user-42/[0-9a-f-]{36}\\.[a-z0-9]+$`));

    expect(result.uploadUrl).toBe('https://provider/put');
    expect(result.publicUrl).toBe('https://provider/public');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('propagates a provider failure', async () => {
    const { service, presignPut } = makeService();
    presignPut.mockRejectedValue(new Error('provider unreachable'));
    await expect(service.presign('u1', { contentType: 'image/jpeg', purpose: 'selfie' })).rejects.toThrow('provider unreachable');
  });
});

import { MockUploadsProvider } from './MockUploadsProvider';

describe('MockUploadsProvider', () => {
  it('returns a well-formed uploadUrl/publicUrl pair derived from the key, using the default host when no base URL is configured', async () => {
    const provider = new MockUploadsProvider();
    const result = await provider.presignPut({ key: 'selfie/u1/abc.jpg', contentType: 'image/jpeg', expirySeconds: 600 });

    expect(result.publicUrl).toBe('https://mock-uploads.fixly.local/selfie/u1/abc.jpg');
    expect(result.uploadUrl.startsWith(result.publicUrl)).toBe(true);
    expect(result.uploadUrl).toContain('mock=1');
    expect(result.uploadUrl).toContain(encodeURIComponent('image/jpeg'));
  });

  it('uses a configured publicBaseUrl (e.g. R2_PUBLIC_BASE_URL) when provided', async () => {
    const provider = new MockUploadsProvider({ publicBaseUrl: 'https://cdn.example.com/' });
    const result = await provider.presignPut({ key: 'kyc_doc/u1/xyz.png', contentType: 'image/png', expirySeconds: 300 });

    expect(result.publicUrl).toBe('https://cdn.example.com/kyc_doc/u1/xyz.png');
  });
});

import { randomBytes } from 'crypto';
import { encryptField, decryptField } from './crypto';

/** A valid 32-byte (64 hex char) AES-256 key. */
const KEY = randomBytes(32).toString('hex');

describe('crypto (AES-256-GCM field encryption)', () => {
  it('round-trips a plaintext value', () => {
    const plaintext = '9891012345'; // Jordanian national ID shape
    const enc = encryptField(plaintext, KEY);
    expect(decryptField(enc, KEY)).toBe(plaintext);
  });

  it('never stores the plaintext inside the ciphertext buffer', () => {
    const plaintext = '9891012345';
    const enc = encryptField(plaintext, KEY);
    // The plaintext bytes must not appear anywhere in the encrypted buffer.
    expect(enc.includes(Buffer.from(plaintext, 'utf8'))).toBe(false);
    expect(enc.toString('utf8')).not.toContain(plaintext);
  });

  it('uses a fresh random IV per call (no IV reuse for the same input)', () => {
    const plaintext = '9891012345';
    const a = encryptField(plaintext, KEY);
    const b = encryptField(plaintext, KEY);
    // Same input, same key -> different ciphertext (distinct 12-byte IV prefix).
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
    expect(a.equals(b)).toBe(false);
  });

  it('rejects a tampered ciphertext (GCM auth tag failure)', () => {
    const enc = encryptField('9891012345', KEY);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptField(tampered, KEY)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const enc = encryptField('9891012345', KEY);
    const tampered = Buffer.from(enc);
    tampered[12] ^= 0xff; // first auth-tag byte (IV is bytes 0-11)
    expect(() => decryptField(tampered, KEY)).toThrow();
  });

  it('fails to decrypt with a different key', () => {
    const enc = encryptField('9891012345', KEY);
    const otherKey = randomBytes(32).toString('hex');
    expect(() => decryptField(enc, otherKey)).toThrow();
  });

  it('throws on a malformed (wrong-length) key', () => {
    expect(() => encryptField('x', 'abcd')).toThrow(/Encryption key must be/);
  });

  it('throws when the buffer is too short to contain IV + auth tag', () => {
    expect(() => decryptField(Buffer.alloc(4), KEY)).toThrow(/too short/);
  });

  it('round-trips unicode/arabic content', () => {
    const plaintext = 'عمر ٩٨٩';
    const enc = encryptField(plaintext, KEY);
    expect(decryptField(enc, KEY)).toBe(plaintext);
  });
});

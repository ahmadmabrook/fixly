import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM helpers for encrypting sensitive at-rest fields (currently the
 * technician KYC national ID — see TechnicianProfile.nationalIdEnc). Never used
 * for anything that needs to be decrypted back out over the API; this is a
 * write-mostly, admin/DB-tool-readable-only field by design (no decrypt route).
 *
 * Ciphertext layout (single Buffer, so a single BYTEA column holds everything
 * needed to decrypt): [12-byte IV][16-byte auth tag][ciphertext].
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit GCM nonce (NIST-recommended size).
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

/** Parse + validate the hex-encoded 32-byte key from env. Throws on a malformed key
 *  so a misconfigured deploy fails fast at the call site rather than corrupting data. */
function parseKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${key.length}`);
  }
  return key;
}

/** Encrypt a UTF-8 string with AES-256-GCM. `hexKey` is a 64-char hex string (32 bytes). */
export function encryptField(plaintext: string, hexKey: string): Buffer {
  const key = parseKey(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Decrypt a Buffer produced by `encryptField`. Not called from any HTTP-facing code
 *  path today (KYC data never round-trips to a client) — intended for offline/admin
 *  tooling only. Throws if the key is wrong or the data was tampered with. */
export function decryptField(encrypted: Buffer, hexKey: string): string {
  const key = parseKey(hexKey);
  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted buffer too short to contain IV + auth tag');
  }
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

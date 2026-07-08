import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

/**
 * env.ts caches its result in a module-level singleton, so each test needs a
 * fresh module instance (`jest.resetModules`) plus a snapshot/restore of
 * `process.env` to avoid bleeding into other test files that share the real
 * environment via `dotenv/config` (see jest.config.js).
 */

const ORIGINAL_ENV = { ...process.env };

function freshEnv(overrides: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- must re-require after resetModules
  return require('./env') as typeof import('./env');
}

function genPem() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env — JWT_KEYS (RS256 signing keys + rotation)', () => {
  it('generates an ephemeral RSA keypair for local dev/test when unset', () => {
    const { loadEnv } = freshEnv({
      JWT_PRIVATE_KEY: undefined,
      JWT_PUBLIC_KEY: undefined,
      JWT_KID: undefined,
      NODE_ENV: 'test',
    });
    const e = loadEnv();
    expect(e.JWT_KEYS.current.kid).toBe('dev-ephemeral');
    expect(e.JWT_KEYS.current.privateKey).toContain('BEGIN RSA PRIVATE KEY');
    expect(e.JWT_KEYS.current.publicKey).toContain('BEGIN RSA PUBLIC KEY');
    expect(e.JWT_KEYS.previous).toBeUndefined();
  });

  it('fails fast in production when no keys are configured', () => {
    const { loadEnv } = freshEnv({
      JWT_PRIVATE_KEY: undefined,
      JWT_PUBLIC_KEY: undefined,
      JWT_KID: undefined,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://fixly.jo',
      NATIONAL_ID_ENCRYPTION_KEY: 'a'.repeat(64),
    });
    expect(() => loadEnv()).toThrow(/JWT_PRIVATE_KEY.*JWT_PUBLIC_KEY.*JWT_KID/);
  });

  it('uses the configured inline PEM keys and kid when provided', () => {
    const { privateKey, publicKey } = genPem();
    const { loadEnv } = freshEnv({
      JWT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
      JWT_PUBLIC_KEY: publicKey.replace(/\n/g, '\\n'),
      JWT_KID: '2026-07',
      NODE_ENV: 'test',
    });
    const e = loadEnv();
    expect(e.JWT_KEYS.current).toEqual({ kid: '2026-07', privateKey, publicKey });
  });

  it('reads PEM keys from _PATH file variants', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fixly-jwt-test-'));
    try {
      const { privateKey, publicKey } = genPem();
      const privPath = path.join(dir, 'priv.pem');
      const pubPath = path.join(dir, 'pub.pem');
      writeFileSync(privPath, privateKey);
      writeFileSync(pubPath, publicKey);

      const { loadEnv } = freshEnv({
        JWT_PRIVATE_KEY: undefined,
        JWT_PUBLIC_KEY: undefined,
        JWT_PRIVATE_KEY_PATH: privPath,
        JWT_PUBLIC_KEY_PATH: pubPath,
        JWT_KID: 'from-file',
        NODE_ENV: 'test',
      });
      const e = loadEnv();
      expect(e.JWT_KEYS.current).toEqual({ kid: 'from-file', privateKey, publicKey });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wires up the previous key for rotation when both are configured', () => {
    const { privateKey, publicKey } = genPem();
    const previous = genPem();
    const { loadEnv } = freshEnv({
      JWT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
      JWT_PUBLIC_KEY: publicKey.replace(/\n/g, '\\n'),
      JWT_KID: 'current-2026-07',
      JWT_PREVIOUS_PUBLIC_KEY: previous.publicKey.replace(/\n/g, '\\n'),
      JWT_PREVIOUS_KID: 'previous-2026-06',
      NODE_ENV: 'test',
    });
    const e = loadEnv();
    expect(e.JWT_KEYS.previous).toEqual({ kid: 'previous-2026-06', publicKey: previous.publicKey });
  });
});

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

describe('env — numeric knob validation (positiveIntEnv)', () => {
  // Every numeric env var is a timeout, interval, radius, batch size or port.
  // A bare parseInt would turn a typo into NaN, and NaN never throws — it just
  // makes the feature it configures quietly stop working (`x > NaN` === false).
  it.each([
    ['AUTH_HOLD_EXPIRY_DAYS', 'AUTH_HOLD_EXPIRY_DAYS'],
    ['OUTBOX_POLL_MS', 'OUTBOX_POLL_MS'],
    ['OUTBOX_BATCH_SIZE', 'OUTBOX_BATCH_SIZE'],
    ['OUTBOX_MAX_BATCHES_PER_TICK', 'OUTBOX_MAX_BATCHES_PER_TICK'],
    ['PORT', 'PORT'],
    ['CHECKOUT_TTL_MINUTES', 'CHECKOUT_TTL_MINUTES'],
    ['DISPATCH_ACCEPT_TIMEOUT_MS', 'DISPATCH_ACCEPT_TIMEOUT_MS'],
    ['DISPATCH_SWEEP_INTERVAL_MS', 'DISPATCH_SWEEP_INTERVAL_MS'],
  ])('rejects a non-numeric %s instead of silently yielding NaN', (name) => {
    const { loadEnv } = freshEnv({ [name]: 'not-a-number', NODE_ENV: 'test' });
    expect(() => loadEnv()).toThrow(new RegExp(`${name} must be a positive integer`));
  });

  it.each([['AUTH_HOLD_EXPIRY_DAYS', '0'], ['OUTBOX_POLL_MS', '-1'], ['PORT', '1.5']])(
    'rejects a non-positive/non-integer %s = %s',
    (name, value) => {
      const { loadEnv } = freshEnv({ [name]: value, NODE_ENV: 'test' });
      expect(() => loadEnv()).toThrow(new RegExp(`${name} must be a positive integer`));
    },
  );

  it('falls back to the documented default when a knob is unset', () => {
    const { loadEnv } = freshEnv({
      AUTH_HOLD_EXPIRY_DAYS: undefined,
      OUTBOX_POLL_MS: undefined,
      PORT: undefined,
      NODE_ENV: 'test',
    });
    const e = loadEnv();
    expect(e.AUTH_HOLD_EXPIRY_DAYS).toBe(6);
    expect(e.OUTBOX_POLL_MS).toBe(2000);
    expect(e.PORT).toBe(4000);
  });

  it('accepts a valid override', () => {
    const { loadEnv } = freshEnv({ AUTH_HOLD_EXPIRY_DAYS: '9', NODE_ENV: 'test' });
    expect(loadEnv().AUTH_HOLD_EXPIRY_DAYS).toBe(9);
  });

  it('rejects an initial dispatch radius above the hard cap (ladder could never climb)', () => {
    const { loadEnv } = freshEnv({
      DISPATCH_INITIAL_RADIUS_KM: '60',
      DISPATCH_MAX_RADIUS_KM: '50',
      NODE_ENV: 'test',
    });
    expect(() => loadEnv()).toThrow('DISPATCH_INITIAL_RADIUS_KM must be <= DISPATCH_MAX_RADIUS_KM');
  });

  it('PLATFORM_COMMISSION_PCT default matches its documented 20%', () => {
    const { loadEnv } = freshEnv({ PLATFORM_COMMISSION_PCT: undefined, NODE_ENV: 'test' });
    expect(loadEnv().PLATFORM_COMMISSION_PCT).toBe(20);
  });
});

/**
 * RS256 sign/verify with kid-based key rotation (FIXLY_SYSTEM_DESIGN.md §5.1).
 * The algorithm-confusion test is the security-critical one: a token must
 * never be accepted unless it was actually signed with our RSA private key
 * using RS256 — never HS256 (using the public key as an HMAC secret), never
 * `alg: none`, regardless of what the token's own header claims.
 */
import jwt from 'jsonwebtoken';
import * as envModule from './env';

jest.mock('./env', () => {
  const { generateKeyPairSync } = require('crypto');
  const gen = () =>
    generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
  const current = gen();
  const previous = gen();
  const unrelated = gen();
  const keys = {
    current: { kid: 'current-kid', privateKey: current.privateKey, publicKey: current.publicKey },
    previous: { kid: 'previous-kid', publicKey: previous.publicKey },
  };
  return {
    env: () => ({ JWT_KEYS: keys }),
    __testKeys: { current, previous, unrelated },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only escape hatch to the mock's key material
const testKeys = (envModule as any).__testKeys as {
  current: { privateKey: string; publicKey: string };
  previous: { privateKey: string; publicKey: string };
  unrelated: { privateKey: string; publicKey: string };
};

// Imported after the mock so `env()` inside jwt.ts resolves to the mocked keys.
import { signJwt, verifyJwt } from './jwt';

const OPTS = { issuer: 'fixly', audience: 'fixly-app' };

describe('jwt (RS256 sign/verify with kid rotation)', () => {
  it('signs with RS256 and stamps the current kid into the header', () => {
    const token = signJwt({ userId: 'u1' }, { ...OPTS, expiresIn: '5m' });
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe('RS256');
    expect(decoded?.header.kid).toBe('current-kid');
  });

  it('round-trips a signed token through verify', () => {
    const token = signJwt({ userId: 'u1', role: 'CUSTOMER' }, { ...OPTS, expiresIn: '5m' });
    const payload = verifyJwt<{ userId: string; role: string }>(token, OPTS);
    expect(payload.userId).toBe('u1');
    expect(payload.role).toBe('CUSTOMER');
  });

  it('still verifies a token signed with the previous kid during a rotation window', () => {
    const oldToken = jwt.sign({ userId: 'u2' }, testKeys.previous.privateKey, {
      algorithm: 'RS256',
      keyid: 'previous-kid',
      expiresIn: '5m',
      ...OPTS,
    });
    const payload = verifyJwt<{ userId: string }>(oldToken, OPTS);
    expect(payload.userId).toBe('u2');
  });

  it('rejects a token whose kid is unknown (neither current nor previous)', () => {
    const token = jwt.sign({ userId: 'u3' }, testKeys.unrelated.privateKey, {
      algorithm: 'RS256',
      keyid: 'some-other-kid',
      expiresIn: '5m',
      ...OPTS,
    });
    expect(() => verifyJwt(token, OPTS)).toThrow();
  });

  it('rejects a token with a missing kid header', () => {
    const token = jwt.sign({ userId: 'u4' }, testKeys.current.privateKey, {
      algorithm: 'RS256',
      expiresIn: '5m',
      ...OPTS,
    });
    expect(() => verifyJwt(token, OPTS)).toThrow(/kid/i);
  });

  it('rejects a garbage/malformed token without crashing', () => {
    expect(() => verifyJwt('not-a-jwt', OPTS)).toThrow();
    expect(() => verifyJwt('', OPTS)).toThrow();
  });

  it('SECURITY: rejects algorithm confusion — an HS256 token forged using the public key as the HMAC secret', () => {
    // The RSA public key is not secret (it's handed out for verification), so
    // if verify ever trusted the token's own `alg` header, an attacker could
    // sign an HS256 token using our public key as the HMAC key and impersonate
    // the current kid. Pinning `algorithms: ['RS256']` on every verify call is
    // exactly what defeats this.
    const forged = jwt.sign({ userId: 'attacker', role: 'ADMIN' }, testKeys.current.publicKey, {
      algorithm: 'HS256',
      keyid: 'current-kid',
      expiresIn: '5m',
      ...OPTS,
    });
    expect(() => verifyJwt(forged, OPTS)).toThrow();
  });

  it('SECURITY: rejects a token with alg=none', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: 'current-kid' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({ userId: 'attacker', iss: 'fixly', aud: 'fixly-app' }),
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    expect(() => verifyJwt(noneToken, OPTS)).toThrow();
  });

  it('rejects a token signed with an unrelated key while claiming the current kid', () => {
    const forged = jwt.sign({ userId: 'attacker' }, testKeys.unrelated.privateKey, {
      algorithm: 'RS256',
      keyid: 'current-kid',
      expiresIn: '5m',
      ...OPTS,
    });
    expect(() => verifyJwt(forged, OPTS)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ userId: 'u5' }, testKeys.current.privateKey, {
      algorithm: 'RS256',
      keyid: 'current-kid',
      expiresIn: '-1s',
      ...OPTS,
    });
    expect(() => verifyJwt(token, OPTS)).toThrow();
  });

  it('rejects a token with the wrong audience', () => {
    const token = signJwt({ userId: 'u6' }, { issuer: 'fixly', audience: 'fixly-admin', expiresIn: '5m' });
    expect(() => verifyJwt(token, OPTS)).toThrow();
  });

  it('rejects a token with the wrong issuer', () => {
    const token = jwt.sign({ userId: 'u7' }, testKeys.current.privateKey, {
      algorithm: 'RS256',
      keyid: 'current-kid',
      expiresIn: '5m',
      issuer: 'not-fixly',
      audience: 'fixly-app',
    });
    expect(() => verifyJwt(token, OPTS)).toThrow();
  });
});

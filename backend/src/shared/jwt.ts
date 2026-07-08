import jwt, { type SignOptions, type VerifyOptions, type JwtPayload } from 'jsonwebtoken';
import { env } from './env';

/**
 * Shared RS256 sign/verify helpers with kid-based key rotation
 * (FIXLY_SYSTEM_DESIGN.md §5.1). Every JWT sign/verify call site in the app
 * goes through here so algorithm pinning and key-selection logic live in
 * exactly one place, rather than being duplicated across HTTP middleware,
 * the socket server, and each service that issues tokens.
 */

type SignParams = Omit<SignOptions, 'algorithm' | 'keyid'>;

/** Signs a token with the current RS256 key, stamping its kid into the header. */
export function signJwt(payload: string | object | Buffer, options: SignParams): string {
  const { current } = env().JWT_KEYS;
  return jwt.sign(payload, current.privateKey, {
    ...options,
    algorithm: 'RS256',
    keyid: current.kid,
  });
}

type VerifyParams = Omit<VerifyOptions, 'algorithms'>;

/**
 * Verifies a token, selecting the current-or-previous public key by the
 * token's `kid` header (enabling zero-downtime key rotation). Explicitly
 * pins `algorithms: ['RS256']` on every verify call — the algorithm is never
 * taken from the token itself, which is what prevents the classic JWT
 * algorithm-confusion attack (e.g. a forged token claiming `alg: HS256`
 * signed with the public key as an HMAC secret, or `alg: none`).
 */
export function verifyJwt<T extends object = JwtPayload>(token: string, options: VerifyParams): T {
  const { current, previous } = env().JWT_KEYS;

  const decoded = jwt.decode(token, { complete: true });
  const kid =
    decoded && typeof decoded === 'object' && decoded.header
      ? (decoded.header as { kid?: unknown }).kid
      : undefined;
  if (typeof kid !== 'string' || kid.length === 0) {
    throw new Error('Token is missing a valid kid header');
  }

  let publicKey: string;
  if (kid === current.kid) {
    publicKey = current.publicKey;
  } else if (previous && kid === previous.kid) {
    publicKey = previous.publicKey;
  } else {
    throw new Error('Unknown key id');
  }

  return jwt.verify(token, publicKey, { ...options, algorithms: ['RS256'] }) as T;
}

/**
 * Types for RS256 signing/verification key material with kid-based rotation.
 * Resolution (env vars → PEM, or an ephemeral dev/test keypair) lives in
 * `env.ts` alongside every other environment-derived value; the sign/verify
 * logic that consumes this shape lives in `jwt.ts`.
 */

export interface JwtKeyPair {
  /** Key id, embedded in the `kid` header of every token this pair signs. */
  kid: string;
  privateKey: string;
  publicKey: string;
}

export interface JwtKeyConfig {
  /** Used to sign new tokens, and checked first on verify. */
  current: JwtKeyPair;
  /** Optional previous key, still accepted on verify by `kid` during a
   *  rotation window so in-flight sessions aren't invalidated the instant
   *  the active signing key changes. */
  previous?: { kid: string; publicKey: string };
}

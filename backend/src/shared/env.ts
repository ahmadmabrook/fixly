import { readFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { logger } from './logger';
import type { JwtKeyConfig } from './jwtKeys';

/**
 * Fail-fast environment validation.
 *
 * Called once at startup. Missing or unsafe values crash the process
 * immediately rather than surfacing as confusing runtime errors (e.g.
 * jwt.sign with an undefined secret, or a weak secret in production).
 */

/** OTP delivery provider selector (OTP_PROVIDER) — closed to what the OTP
 *  provider factory actually implements. */
export type OtpProviderName = 'mock' | 'whatsapp';
/** Payment provider selector (PAYMENT_PROVIDER) — closed to what
 *  PaymentProviderFactory/PayoutProviderFactory actually implement. */
export type PaymentProviderName = 'mock' | 'hyperpay';
/** Masked-calling provider selector (MASKED_CALL_PROVIDER) — closed to what
 *  MaskedCallProviderFactory actually implements. */
export type MaskedCallProviderName = 'mock' | 'twilio';
/** Media-upload provider selector (UPLOADS_PROVIDER) — closed to what the
 *  uploads provider factory actually implements. */
export type UploadsProviderName = 'mock' | 'r2';

interface Env {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  /** Legacy HS256 shared secret. No longer used to sign/verify access tokens
   *  (see JWT_KEYS) — retained only so old deploys don't fail required() until
   *  every environment has migrated its config. */
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  /** RS256 signing/verification keys with kid-based rotation (FIXLY_SYSTEM_DESIGN.md §5.1).
   *  Resolved once at startup: real keys from JWT_PRIVATE_KEY/JWT_PUBLIC_KEY/JWT_KID
   *  (or their _PATH file-path variants) in production, or an ephemeral in-memory
   *  keypair generated for local dev/test when unset. */
  JWT_KEYS: JwtKeyConfig;
  CORS_ORIGIN: string[] | '*';
  OTP_PROVIDER: OtpProviderName;
  PAYMENT_PROVIDER: PaymentProviderName;
  OUTBOX_POLL_MS: number;
  OUTBOX_BATCH_SIZE: number;
  OUTBOX_MAX_BATCHES_PER_TICK: number;
  /** Bearer token guarding GET /metrics. Empty = open (dev only; hidden in prod). */
  METRICS_TOKEN: string;
  /** Platform commission (%) withheld from a technician's payout. Default 20%
   *  (see PLATFORM_COMMISSION_PCT in loadEnv — keep this doc and that default
   *  in step; they are the contract every payout split is computed from). */
  PLATFORM_COMMISSION_PCT: number;
  /** Days a pre-authorization hold is assumed valid before capture needs a re-auth. */
  AUTH_HOLD_EXPIRY_DAYS: number;
  /** ISO-4217 currency for all money. Single-currency today; column-backed for later. */
  CURRENCY: string;
  /** Shared secret to verify mock PSP webhook signatures (HMAC). Required in prod for the mock. */
  PSP_WEBHOOK_SECRET: string;
  // ── HyperPay (hosted checkout). Only consulted when PAYMENT_PROVIDER=hyperpay. ──
  /** HyperPay/OPPWA merchant entity id (per channel). */
  HYPERPAY_ENTITY_ID: string;
  /** Bearer access token for HyperPay/OPPWA API calls. */
  HYPERPAY_ACCESS_TOKEN: string;
  /** OPPWA API base URL. Test: https://eu-test.oppwa.com · Live: https://eu-prod.oppwa.com */
  HYPERPAY_BASE_URL: string;
  /** Hex AES-256-GCM key for decrypting HyperPay webhook notifications. Required in prod. */
  HYPERPAY_WEBHOOK_DECRYPT_KEY: string;
  /** Minutes a booking may sit in AWAITING_PAYMENT before the reconciler cancels it. */
  CHECKOUT_TTL_MINUTES: number;
  // ── Dispatch (broadcast-and-accept). ──
  /** ms a technician has to accept before the round expires. Default 5 min. */
  DISPATCH_ACCEPT_TIMEOUT_MS: number;
  /** Initial broadcast radius in km. */
  DISPATCH_INITIAL_RADIUS_KM: number;
  /** Radius increment per round in km. */
  DISPATCH_RADIUS_STEP_KM: number;
  /** Maximum broadcast radius in km (hard cap). */
  DISPATCH_MAX_RADIUS_KM: number;
  /** ms between dispatch sweep ticks (expire rounds + bootstrap). */
  DISPATCH_SWEEP_INTERVAL_MS: number;
  /** Hex AES-256-GCM key (32 bytes / 64 hex chars) for encrypting technician_profiles.nationalIdEnc. Required in prod. */
  NATIONAL_ID_ENCRYPTION_KEY: string;
  // ── WhatsApp Cloud API (OTP delivery). Only consulted when OTP_PROVIDER=whatsapp. ──
  /** Meta Graph API access token for the WhatsApp Business account. */
  WHATSAPP_ACCESS_TOKEN: string;
  /** WhatsApp Business phone number id the OTP template is sent from. */
  WHATSAPP_PHONE_NUMBER_ID: string;
  /** Pre-approved WhatsApp template name used to deliver the OTP code. */
  WHATSAPP_OTP_TEMPLATE_NAME: string;
  /** Graph API base URL (versioned). */
  WHATSAPP_API_BASE_URL: string;
  // ── Masked calling (Twilio Proxy). Only consulted when MASKED_CALL_PROVIDER=twilio. ──
  MASKED_CALL_PROVIDER: MaskedCallProviderName;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PROXY_SERVICE_SID: string;
  /** Twilio Proxy API base URL. */
  TWILIO_API_BASE_URL: string;
  // ── Media uploads (Cloudflare R2, S3-compatible). Only consulted when UPLOADS_PROVIDER=r2. ──
  UPLOADS_PROVIDER: UploadsProviderName;
  /** Cloudflare account id — used to build the R2 S3-compatible endpoint. */
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  /** Public/CDN URL prefix clients read the uploaded object back from after PUT. */
  R2_PUBLIC_BASE_URL: string;
}

const MIN_SECRET_LENGTH = 32;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reads a positive-integer env var, falling back to `fallback` when unset.
 * Fails fast on a non-numeric or non-positive value rather than letting a bare
 * `parseInt` yield NaN — NaN silently poisons every downstream comparison
 * (`age > NaN` is always false, `setInterval(fn, NaN)` fires continuously), so
 * a typo'd value would otherwise disable a timeout or a sweep with no error at
 * all. Centralised so every numeric knob is validated the same way instead of
 * some being checked ad-hoc and others not at all.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer (got "${raw}")`);
  }
  return parsed;
}

/**
 * Reads a possibly multi-line PEM secret. Checks `<name>` first — a literal
 * "\n" sequence is unescaped, the standard way to fit a PEM into a single-line
 * env var — falling back to `<name>_PATH` (a file path) for setups that mount
 * credentials as files (e.g. Docker/K8s secrets). Returns '' if neither is set.
 */
function readPemSecret(name: string): string {
  const inline = process.env[name];
  if (inline && inline.trim() !== '') return inline.replace(/\\n/g, '\n');
  const path = process.env[`${name}_PATH`];
  if (path && path.trim() !== '') return readFileSync(path, 'utf8');
  return '';
}

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const NODE_ENV = process.env.NODE_ENV ?? 'development';
  const isProd = NODE_ENV === 'production';

  const JWT_SECRET = required('JWT_SECRET');
  if (isProd && JWT_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }
  if (!isProd && JWT_SECRET.length < MIN_SECRET_LENGTH) {
    logger.warn(
      `JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} chars — acceptable for local dev only`,
    );
  }

  // RS256 signing keys + rotation (FIXLY_SYSTEM_DESIGN.md §5.1). Production must
  // provision real keys; local dev/test falls back to an ephemeral in-memory
  // keypair generated once per process — the same "just works locally"
  // convenience as OTP_PROVIDER=mock / PAYMENT_PROVIDER=mock.
  const jwtPrivateKey = readPemSecret('JWT_PRIVATE_KEY');
  const jwtPublicKey = readPemSecret('JWT_PUBLIC_KEY');
  const jwtKid = (process.env.JWT_KID ?? '').trim();
  const jwtPreviousPublicKey = readPemSecret('JWT_PREVIOUS_PUBLIC_KEY');
  const jwtPreviousKid = (process.env.JWT_PREVIOUS_KID ?? '').trim();

  let JWT_KEYS: JwtKeyConfig;
  if (jwtPrivateKey && jwtPublicKey && jwtKid) {
    JWT_KEYS = {
      current: { kid: jwtKid, privateKey: jwtPrivateKey, publicKey: jwtPublicKey },
      previous:
        jwtPreviousPublicKey && jwtPreviousKid
          ? { kid: jwtPreviousKid, publicKey: jwtPreviousPublicKey }
          : undefined,
    };
  } else if (isProd) {
    throw new Error(
      'JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_KID (or their _PATH variants) are required in production',
    );
  } else {
    logger.warn(
      'JWT_PRIVATE_KEY/JWT_PUBLIC_KEY not set — generating an ephemeral RSA keypair (local dev/test only)',
    );
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    JWT_KEYS = { current: { kid: 'dev-ephemeral', privateKey, publicKey } };
  }

  const corsRaw = process.env.CORS_ORIGIN;
  const CORS_ORIGIN = corsRaw && corsRaw.trim() !== '' ? corsRaw.split(',').map((s) => s.trim()) : '*';
  if (isProd && CORS_ORIGIN === '*') {
    throw new Error('CORS_ORIGIN must be an explicit allowlist in production');
  }

  // Cast: value is validated against its closed provider set at the call sites
  // that switch on it (PaymentProviderFactory et al. throw on an unknown name);
  // the type here just gives every comparison site the same closed vocabulary
  // instead of a bare `string`.
  const OTP_PROVIDER = (process.env.OTP_PROVIDER ?? 'mock') as OtpProviderName;
  // The mock provider issues a constant, predictable code — never allow it in prod.
  if (isProd && OTP_PROVIDER === 'mock') {
    throw new Error('OTP_PROVIDER=mock is not allowed in production (predictable OTP)');
  }
  const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER ?? 'mock') as PaymentProviderName;
  if (isProd && PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
  }

  // WhatsApp Cloud API configuration. Required only when it is the selected OTP
  // provider — a mock/dev deploy needs none of it.
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  const WHATSAPP_OTP_TEMPLATE_NAME = process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? 'otp_verification';
  const WHATSAPP_API_BASE_URL = process.env.WHATSAPP_API_BASE_URL ?? 'https://graph.facebook.com/v19.0';
  if (OTP_PROVIDER === 'whatsapp') {
    if (WHATSAPP_ACCESS_TOKEN === '') throw new Error('WHATSAPP_ACCESS_TOKEN is required when OTP_PROVIDER=whatsapp');
    if (WHATSAPP_PHONE_NUMBER_ID === '') throw new Error('WHATSAPP_PHONE_NUMBER_ID is required when OTP_PROVIDER=whatsapp');
  }

  // Twilio Proxy (masked calling) configuration. Required only when selected.
  const MASKED_CALL_PROVIDER = (process.env.MASKED_CALL_PROVIDER ?? 'mock') as MaskedCallProviderName;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
  const TWILIO_PROXY_SERVICE_SID = process.env.TWILIO_PROXY_SERVICE_SID ?? '';
  const TWILIO_API_BASE_URL = process.env.TWILIO_API_BASE_URL ?? 'https://proxy.twilio.com/v1';
  if (MASKED_CALL_PROVIDER === 'twilio') {
    if (TWILIO_ACCOUNT_SID === '') throw new Error('TWILIO_ACCOUNT_SID is required when MASKED_CALL_PROVIDER=twilio');
    if (TWILIO_AUTH_TOKEN === '') throw new Error('TWILIO_AUTH_TOKEN is required when MASKED_CALL_PROVIDER=twilio');
    if (TWILIO_PROXY_SERVICE_SID === '') throw new Error('TWILIO_PROXY_SERVICE_SID is required when MASKED_CALL_PROVIDER=twilio');
  }

  // National-ID KYC field encryption key. Required in production (fail-fast, like
  // JWT_SECRET) so a deploy can never silently write unencrypted/undecryptable data.
  // Optional in dev/test so a bare checkout still boots without provisioning one.
  const NATIONAL_ID_ENCRYPTION_KEY = process.env.NATIONAL_ID_ENCRYPTION_KEY ?? '';
  if (isProd && NATIONAL_ID_ENCRYPTION_KEY === '') {
    throw new Error('NATIONAL_ID_ENCRYPTION_KEY is required in production');
  }
  if (NATIONAL_ID_ENCRYPTION_KEY !== '' && Buffer.from(NATIONAL_ID_ENCRYPTION_KEY, 'hex').length !== 32) {
    throw new Error('NATIONAL_ID_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex characters)');
  }

  const PLATFORM_COMMISSION_PCT = Number(process.env.PLATFORM_COMMISSION_PCT ?? '20');
  if (!Number.isFinite(PLATFORM_COMMISSION_PCT) || PLATFORM_COMMISSION_PCT < 0 || PLATFORM_COMMISSION_PCT > 100) {
    throw new Error('PLATFORM_COMMISSION_PCT must be a number between 0 and 100');
  }

  // Mock provider's HMAC webhook secret. No prod requirement: the mock is already
  // rejected in production above, and each real provider validates its own secret
  // (HyperPay → HYPERPAY_WEBHOOK_DECRYPT_KEY below).
  const PSP_WEBHOOK_SECRET = process.env.PSP_WEBHOOK_SECRET ?? '';

  // HyperPay configuration. Required only when it is the selected provider so a
  // mock/dev deploy needs none of it; a hyperpay deploy fails fast if incomplete.
  const HYPERPAY_ENTITY_ID = process.env.HYPERPAY_ENTITY_ID ?? '';
  const HYPERPAY_ACCESS_TOKEN = process.env.HYPERPAY_ACCESS_TOKEN ?? '';
  const HYPERPAY_BASE_URL = process.env.HYPERPAY_BASE_URL ?? 'https://eu-test.oppwa.com';
  const HYPERPAY_WEBHOOK_DECRYPT_KEY = process.env.HYPERPAY_WEBHOOK_DECRYPT_KEY ?? '';
  if (PAYMENT_PROVIDER === 'hyperpay') {
    if (HYPERPAY_ENTITY_ID === '') throw new Error('HYPERPAY_ENTITY_ID is required when PAYMENT_PROVIDER=hyperpay');
    if (HYPERPAY_ACCESS_TOKEN === '') throw new Error('HYPERPAY_ACCESS_TOKEN is required when PAYMENT_PROVIDER=hyperpay');
    // The decrypt key verifies inbound webhooks (the source of truth for async
    // outcomes). Optional in non-prod so a sandbox without webhooks still boots.
    if (isProd && HYPERPAY_WEBHOOK_DECRYPT_KEY === '') {
      throw new Error('HYPERPAY_WEBHOOK_DECRYPT_KEY is required in production to verify HyperPay webhooks');
    }
  }

  const CHECKOUT_TTL_MINUTES = positiveIntEnv('CHECKOUT_TTL_MINUTES', 30);

  const DISPATCH_ACCEPT_TIMEOUT_MS = positiveIntEnv('DISPATCH_ACCEPT_TIMEOUT_MS', 300_000);
  const DISPATCH_INITIAL_RADIUS_KM = positiveIntEnv('DISPATCH_INITIAL_RADIUS_KM', 10);
  const DISPATCH_RADIUS_STEP_KM = positiveIntEnv('DISPATCH_RADIUS_STEP_KM', 5);
  const DISPATCH_MAX_RADIUS_KM = positiveIntEnv('DISPATCH_MAX_RADIUS_KM', 50);
  const DISPATCH_SWEEP_INTERVAL_MS = positiveIntEnv('DISPATCH_SWEEP_INTERVAL_MS', 15_000);
  // The radius ladder must actually be able to climb: an initial radius already
  // at/over the cap makes every escalation round a no-op, silently narrowing
  // dispatch to the first ring forever. Cheaper to catch at boot than in prod.
  if (DISPATCH_INITIAL_RADIUS_KM > DISPATCH_MAX_RADIUS_KM) {
    throw new Error('DISPATCH_INITIAL_RADIUS_KM must be <= DISPATCH_MAX_RADIUS_KM');
  }

  // Cloudflare R2 (S3-compatible) media uploads. Required only when selected —
  // a mock/dev deploy needs none of it, same mock/real split as the other providers.
  const UPLOADS_PROVIDER = (process.env.UPLOADS_PROVIDER ?? 'mock') as UploadsProviderName;
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';
  const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL ?? '';
  if (UPLOADS_PROVIDER === 'r2') {
    if (R2_ACCOUNT_ID === '') throw new Error('R2_ACCOUNT_ID is required when UPLOADS_PROVIDER=r2');
    if (R2_ACCESS_KEY_ID === '') throw new Error('R2_ACCESS_KEY_ID is required when UPLOADS_PROVIDER=r2');
    if (R2_SECRET_ACCESS_KEY === '') throw new Error('R2_SECRET_ACCESS_KEY is required when UPLOADS_PROVIDER=r2');
    if (R2_BUCKET_NAME === '') throw new Error('R2_BUCKET_NAME is required when UPLOADS_PROVIDER=r2');
    if (R2_PUBLIC_BASE_URL === '') throw new Error('R2_PUBLIC_BASE_URL is required when UPLOADS_PROVIDER=r2');
  }

  cached = {
    NODE_ENV,
    PORT: positiveIntEnv('PORT', 4000),
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    JWT_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    JWT_KEYS,
    CORS_ORIGIN,
    OTP_PROVIDER,
    PAYMENT_PROVIDER,
    OUTBOX_POLL_MS: positiveIntEnv('OUTBOX_POLL_MS', 2000),
    OUTBOX_BATCH_SIZE: positiveIntEnv('OUTBOX_BATCH_SIZE', 200),
    OUTBOX_MAX_BATCHES_PER_TICK: positiveIntEnv('OUTBOX_MAX_BATCHES_PER_TICK', 50),
    METRICS_TOKEN: process.env.METRICS_TOKEN ?? '',
    PLATFORM_COMMISSION_PCT,
    // Feeds the capture path's expired-hold check. A NaN here would make
    // `holdAgeMs > expiryMs` always false → expired holds silently captured
    // without re-authorization → declines at the PSP. Validated, not bare-parsed.
    AUTH_HOLD_EXPIRY_DAYS: positiveIntEnv('AUTH_HOLD_EXPIRY_DAYS', 6),
    CURRENCY: process.env.CURRENCY ?? 'JOD',
    PSP_WEBHOOK_SECRET,
    HYPERPAY_ENTITY_ID,
    HYPERPAY_ACCESS_TOKEN,
    HYPERPAY_BASE_URL,
    HYPERPAY_WEBHOOK_DECRYPT_KEY,
    CHECKOUT_TTL_MINUTES,
    DISPATCH_ACCEPT_TIMEOUT_MS,
    DISPATCH_INITIAL_RADIUS_KM,
    DISPATCH_RADIUS_STEP_KM,
    DISPATCH_MAX_RADIUS_KM,
    DISPATCH_SWEEP_INTERVAL_MS,
    NATIONAL_ID_ENCRYPTION_KEY,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_OTP_TEMPLATE_NAME,
    WHATSAPP_API_BASE_URL,
    MASKED_CALL_PROVIDER,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PROXY_SERVICE_SID,
    TWILIO_API_BASE_URL,
    UPLOADS_PROVIDER,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_BASE_URL,
  };

  return cached;
}

export const env = (): Env => cached ?? loadEnv();

/**
 * Whether the configured PSP authorizes via customer-driven hosted checkout (vs. instant
 * server-side pre-auth). Lets the booking flow pick the initial status without importing
 * any infrastructure (keeps the application→infrastructure dependency from inverting).
 */
export function paymentRequiresHostedCheckout(): boolean {
  return env().PAYMENT_PROVIDER === 'hyperpay';
}

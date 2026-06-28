import { logger } from './logger';

/**
 * Fail-fast environment validation.
 *
 * Called once at startup. Missing or unsafe values crash the process
 * immediately rather than surfacing as confusing runtime errors (e.g.
 * jwt.sign with an undefined secret, or a weak secret in production).
 */

interface Env {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  CORS_ORIGIN: string[] | '*';
  OTP_PROVIDER: string;
  PAYMENT_PROVIDER: string;
  OUTBOX_POLL_MS: number;
  OUTBOX_BATCH_SIZE: number;
  OUTBOX_MAX_BATCHES_PER_TICK: number;
  /** Bearer token guarding GET /metrics. Empty = open (dev only; hidden in prod). */
  METRICS_TOKEN: string;
  /** Platform commission (%) withheld from a technician's payout. Default 15%. */
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
}

const MIN_SECRET_LENGTH = 32;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

  const corsRaw = process.env.CORS_ORIGIN;
  const CORS_ORIGIN = corsRaw && corsRaw.trim() !== '' ? corsRaw.split(',').map((s) => s.trim()) : '*';
  if (isProd && CORS_ORIGIN === '*') {
    throw new Error('CORS_ORIGIN must be an explicit allowlist in production');
  }

  const OTP_PROVIDER = process.env.OTP_PROVIDER ?? 'mock';
  // The mock provider issues a constant, predictable code — never allow it in prod.
  if (isProd && OTP_PROVIDER === 'mock') {
    throw new Error('OTP_PROVIDER=mock is not allowed in production (predictable OTP)');
  }
  const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (isProd && PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
  }

  const PLATFORM_COMMISSION_PCT = Number(process.env.PLATFORM_COMMISSION_PCT ?? '15');
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

  const CHECKOUT_TTL_MINUTES = parseInt(process.env.CHECKOUT_TTL_MINUTES ?? '30', 10);
  if (!Number.isFinite(CHECKOUT_TTL_MINUTES) || CHECKOUT_TTL_MINUTES <= 0) {
    throw new Error('CHECKOUT_TTL_MINUTES must be a positive integer');
  }

  const DISPATCH_ACCEPT_TIMEOUT_MS = parseInt(process.env.DISPATCH_ACCEPT_TIMEOUT_MS ?? '300000', 10);
  if (!Number.isFinite(DISPATCH_ACCEPT_TIMEOUT_MS) || DISPATCH_ACCEPT_TIMEOUT_MS <= 0) {
    throw new Error('DISPATCH_ACCEPT_TIMEOUT_MS must be a positive integer');
  }
  const DISPATCH_INITIAL_RADIUS_KM = parseInt(process.env.DISPATCH_INITIAL_RADIUS_KM ?? '10', 10);
  if (!Number.isFinite(DISPATCH_INITIAL_RADIUS_KM) || DISPATCH_INITIAL_RADIUS_KM <= 0) {
    throw new Error('DISPATCH_INITIAL_RADIUS_KM must be a positive integer');
  }
  const DISPATCH_RADIUS_STEP_KM = parseInt(process.env.DISPATCH_RADIUS_STEP_KM ?? '5', 10);
  if (!Number.isFinite(DISPATCH_RADIUS_STEP_KM) || DISPATCH_RADIUS_STEP_KM <= 0) {
    throw new Error('DISPATCH_RADIUS_STEP_KM must be a positive integer');
  }
  const DISPATCH_MAX_RADIUS_KM = parseInt(process.env.DISPATCH_MAX_RADIUS_KM ?? '50', 10);
  if (!Number.isFinite(DISPATCH_MAX_RADIUS_KM) || DISPATCH_MAX_RADIUS_KM <= 0) {
    throw new Error('DISPATCH_MAX_RADIUS_KM must be a positive integer');
  }
  const DISPATCH_SWEEP_INTERVAL_MS = parseInt(process.env.DISPATCH_SWEEP_INTERVAL_MS ?? '15000', 10);
  if (!Number.isFinite(DISPATCH_SWEEP_INTERVAL_MS) || DISPATCH_SWEEP_INTERVAL_MS <= 0) {
    throw new Error('DISPATCH_SWEEP_INTERVAL_MS must be a positive integer');
  }

  cached = {
    NODE_ENV,
    PORT: parseInt(process.env.PORT ?? '4000', 10),
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    JWT_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    CORS_ORIGIN,
    OTP_PROVIDER,
    PAYMENT_PROVIDER,
    OUTBOX_POLL_MS: parseInt(process.env.OUTBOX_POLL_MS ?? '2000', 10),
    OUTBOX_BATCH_SIZE: parseInt(process.env.OUTBOX_BATCH_SIZE ?? '200', 10),
    OUTBOX_MAX_BATCHES_PER_TICK: parseInt(process.env.OUTBOX_MAX_BATCHES_PER_TICK ?? '50', 10),
    METRICS_TOKEN: process.env.METRICS_TOKEN ?? '',
    PLATFORM_COMMISSION_PCT,
    AUTH_HOLD_EXPIRY_DAYS: parseInt(process.env.AUTH_HOLD_EXPIRY_DAYS ?? '6', 10),
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

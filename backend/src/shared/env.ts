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
  /** Shared secret to verify PSP webhook signatures. Required in prod for webhooks. */
  PSP_WEBHOOK_SECRET: string;
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

  const PSP_WEBHOOK_SECRET = process.env.PSP_WEBHOOK_SECRET ?? '';
  if (isProd && PAYMENT_PROVIDER !== 'mock' && PSP_WEBHOOK_SECRET === '') {
    throw new Error('PSP_WEBHOOK_SECRET is required in production to verify payment webhooks');
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
  };

  return cached;
}

export const env = (): Env => cached ?? loadEnv();

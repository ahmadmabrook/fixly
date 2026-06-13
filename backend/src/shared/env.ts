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
    OUTBOX_POLL_MS: parseInt(process.env.OUTBOX_POLL_MS ?? '5000', 10),
  };

  return cached;
}

export const env = (): Env => cached ?? loadEnv();

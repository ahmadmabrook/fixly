import pino from 'pino';

// Exported so logger.test.ts asserts against the real, live config instead of
// a hand-copied duplicate — a duplicate is exactly how the authorization/cookie
// header gap (below) went unnoticed by the test suite despite a full redaction
// review claiming it as covered.
export const REDACT_PATHS = [
  'phone', '*.phone', 'email', '*.email', 'code', '*.code', 'password', '*.password',
  'token', '*.token', 'refreshToken', '*.refreshToken', 'accessToken', '*.accessToken',
  // pino-http logs the raw Express req/res on every request — its headers carry the
  // live bearer JWT and the httpOnly refresh-token cookie, neither of which the
  // field-name redactions above touch (the field is named "authorization"/"cookie",
  // not "token"/"password"). Without this, `flyctl logs` (or any log aggregator)
  // hands out a valid, usable session to whoever can read it.
  'req.headers.authorization', 'res.headers.authorization',
  'req.headers.cookie', 'res.headers["set-cookie"]',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Keep PII / credentials out of logs.
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Keep PII / credentials out of logs.
  redact: {
    paths: ['phone', '*.phone', 'code', '*.code', 'password', '*.password', 'token', '*.token'],
    censor: '[redacted]',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

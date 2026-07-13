import pino from 'pino';
import { REDACT_PATHS } from './logger';

describe('logger PII redaction', () => {
  // Build an isolated logger against the REAL exported REDACT_PATHS (not a
  // hand-copied duplicate) to a memory stream so we can inspect the serialised
  // JSON exactly as it would be written. Asserting against the live config is
  // what makes this catch drift — a duplicate is exactly how the
  // authorization/cookie header gap went unnoticed despite a full redaction
  // review claiming it as covered.
  function logAndCapture(fields: Record<string, unknown>): Record<string, unknown> {
    const lines: string[] = [];
    const stream = {
      write(s: string) {
        lines.push(s);
        return true;
      },
    };
    const log = pino(
      { redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
      stream as unknown as pino.DestinationStream,
    );
    log.info(fields, 'should-redact');
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]!) as Record<string, unknown>;
  }

  it('redacts phone, email, code, password, token, refreshToken, accessToken at any depth', () => {
    const record = logAndCapture({
      phone: '+962799000000',
      email: 'admin@fixly.jo',
      code: '000000',
      password: 'hunter2',
      token: 'tok-abc',
      refreshToken: 'refresh-xyz',
      accessToken: 'eyJabc.def.ghi',
      nested: { email: 'inner@x.y', phone: '+1' },
    });

    expect(record.phone).toBe('[redacted]');
    expect(record.email).toBe('[redacted]');
    expect(record.code).toBe('[redacted]');
    expect(record.password).toBe('[redacted]');
    expect(record.token).toBe('[redacted]');
    expect(record.refreshToken).toBe('[redacted]');
    expect(record.accessToken).toBe('[redacted]');
    const nested = record.nested as Record<string, unknown>;
    expect(nested.email).toBe('[redacted]');
    expect(nested.phone).toBe('[redacted]');
  });

  it('redacts the raw Authorization bearer token and cookie header on pino-http request/response log lines', () => {
    const record = logAndCapture({
      req: { headers: { authorization: 'Bearer eyJhbGciOiJSUzI1NiIs.livejwt.sig', cookie: 'refreshToken=deadbeef' } },
      res: { headers: { 'set-cookie': 'refreshToken=deadbeef; HttpOnly' } },
    });

    const req = record.req as Record<string, unknown>;
    const reqHeaders = req.headers as Record<string, unknown>;
    expect(reqHeaders.authorization).toBe('[redacted]');
    expect(reqHeaders.cookie).toBe('[redacted]');
    const res = record.res as Record<string, unknown>;
    const resHeaders = res.headers as Record<string, unknown>;
    expect(resHeaders['set-cookie']).toBe('[redacted]');
  });
});

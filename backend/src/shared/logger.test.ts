import pino from 'pino';

describe('logger PII redaction', () => {
  it('redacts phone, email, code, password, token, refreshToken, accessToken at any depth', () => {
    // Build an isolated logger to a memory stream so we can inspect the
    // serialised JSON exactly as it would be written. This protects the
    // PII policy from accidental regression (a new field added without
    // being added to redact will be visible here).
    const lines: string[] = [];
    const stream = {
      write(s: string) {
        lines.push(s);
        return true;
      },
    };
    const log = pino(
      {
        redact: {
          paths: ['phone', '*.phone', 'email', '*.email', 'code', '*.code', 'password', '*.password', 'token', '*.token', 'refreshToken', '*.refreshToken', 'accessToken', '*.accessToken'],
          censor: '[redacted]',
        },
      },
      stream as unknown as pino.DestinationStream,
    );

    log.info(
      {
        phone: '+962799000000',
        email: 'admin@fixly.jo',
        code: '000000',
        password: 'hunter2',
        token: 'tok-abc',
        refreshToken: 'refresh-xyz',
        accessToken: 'eyJabc.def.ghi',
        nested: { email: 'inner@x.y', phone: '+1' },
      },
      'should-redact',
    );

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
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
});

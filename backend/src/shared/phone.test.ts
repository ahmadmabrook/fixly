import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('leaves an already-canonical E.164 number unchanged', () => {
    expect(normalizePhone('+962799000001')).toBe('+962799000001');
  });

  it('normalizes local format (leading 0) to E.164', () => {
    expect(normalizePhone('0799000001')).toBe('+962799000001');
  });

  it('normalizes bare local format (no leading 0) to E.164', () => {
    expect(normalizePhone('799000001')).toBe('+962799000001');
  });

  it('normalizes international dialing prefix (00962) to E.164', () => {
    expect(normalizePhone('00962799000001')).toBe('+962799000001');
  });

  it('normalizes a bare country code (no +) to E.164', () => {
    expect(normalizePhone('962799000001')).toBe('+962799000001');
  });

  it('strips spaces and dashes before normalizing', () => {
    expect(normalizePhone('07 990-000-01')).toBe('+962799000001');
  });

  it('returns non-Jordanian-looking input unchanged (minus whitespace/dashes), leaving isMobilePhone validation to reject it', () => {
    expect(normalizePhone('not a phone')).toBe('notaphone');
  });
});

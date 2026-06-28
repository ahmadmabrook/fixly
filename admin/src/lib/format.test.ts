import { describe, it, expect } from 'vitest';
import { maskIban, fmtJod } from './format';

describe('maskIban', () => {
  it('reveals only the prefix and last 4 of a full IBAN', () => {
    expect(maskIban('JO94CBJO0010000000000131000302')).toBe('JO94 •••• 0302');
  });
  it('tolerates spaces in the input', () => {
    expect(maskIban('JO94 CBJO 0010 0000 0000 0131 0003 02')).toBe('JO94 •••• 0302');
  });
  it('returns an em dash for missing values', () => {
    expect(maskIban(null)).toBe('—');
    expect(maskIban(undefined)).toBe('—');
    expect(maskIban('')).toBe('—');
  });
  it('does not over-mask very short values', () => {
    expect(maskIban('JO9412')).toBe('JO9412');
  });
});

describe('fmtJod', () => {
  it('formats string and number money to 2 decimals', () => {
    expect(fmtJod(50)).toBe('50.00');
    expect(fmtJod('120.5')).toBe('120.50');
    expect(fmtJod(0)).toBe('0.00');
  });
});

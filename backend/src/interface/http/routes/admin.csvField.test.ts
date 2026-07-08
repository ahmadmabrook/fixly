import { csvField } from './admin';

describe('csvField (bookings CSV export sanitisation)', () => {
  it('passes plain values through unchanged', () => {
    expect(csvField('Ahmad')).toBe('Ahmad');
    expect(csvField('0791234567')).toBe('0791234567');
  });

  it('serialises null/undefined as an empty string', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes and escapes values containing comma, quote, or newline (RFC 4180)', () => {
    expect(csvField('Doe, John')).toBe('"Doe, John"');
    expect(csvField('a "quoted" name')).toBe('"a ""quoted"" name"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formula injection by prefixing a single quote', () => {
    // A cell beginning with =, +, -, @ (or a control char) is executed as a
    // formula by Excel/Sheets — must be rendered as literal text instead.
    expect(csvField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvField('+962790000000')).toBe("'+962790000000");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@cmd')).toBe("'@cmd");
  });

  it('both neutralises a formula AND quotes when the value also has a comma', () => {
    // Prefix runs first, then quoting wraps the whole thing.
    expect(csvField('=HYPERLINK("x"),y')).toBe('"\'=HYPERLINK(""x""),y"');
  });
});

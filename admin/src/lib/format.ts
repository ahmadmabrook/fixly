/**
 * Shared formatting + sensitive-data masking helpers for the admin panel.
 *
 * Admins should never see full financial identifiers (IBAN) at rest in the UI —
 * masking limits shoulder-surfing / screenshot leakage of technician bank data.
 * Server-side authorization still governs who can read these fields at all.
 */

/**
 * Mask an IBAN, revealing only the country/check prefix and the last 4 digits,
 * e.g. "JO94CBJO0010000000000131000302" → "JO94 •••• 0302".
 * Returns an em dash for missing values.
 */
export function maskIban(iban: string | null | undefined): string {
  if (!iban) return '—';
  const clean = iban.replace(/\s+/g, '');
  if (clean.length <= 8) return clean;
  const head = clean.slice(0, 4);
  const tail = clean.slice(-4);
  return `${head} •••• ${tail}`;
}

/** Format a JOD amount to 2 decimals (accepts the API's string | number money). */
export function fmtJod(amount: string | number): string {
  return Number(amount).toFixed(2);
}

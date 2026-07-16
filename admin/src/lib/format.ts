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

/** Scheme every attachment/media URL rendered by the admin panel must use. */
const SAFE_URL_SCHEME = 'https://';

/**
 * Gate a backend-supplied URL before it reaches an `href`.
 *
 * Attachment URLs (technician ID docs, certificates, selfies, intro videos,
 * guarantee media, quote videos) originate from user/technician uploads, so
 * they are untrusted input. React does not sanitize `href`, which means a
 * stored `javascript:` URL would execute in the admin origin the moment an
 * admin clicked the link — the highest-privilege context in the product.
 * Returning `undefined` for anything that isn't plain https renders an inert
 * link instead of a script sink.
 *
 * Callers should treat `undefined` as "no usable attachment" and hide the link.
 */
export function safeHttpsUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith(SAFE_URL_SCHEME) ? url : undefined;
}

/** Format a JOD amount to 2 decimals (accepts the API's string | number money). */
export function fmtJod(amount: string | number): string {
  return Number(amount).toFixed(2);
}

const MS_PER_DAY = 86_400_000;

/** ISO date (YYYY-MM-DD) for "N days ago", e.g. isoDaysAgo(30) → 30 days
 *  before today. Used to build default from/to ranges for report queries. */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Length of the truncated id shown as a short human-readable reference
 *  (e.g. booking/payout/guarantee ids in tables) — full ids are too long
 *  to scan in a table row. */
const SHORT_ID_LENGTH = 8;

/** Truncate an id to its short display form, e.g. "abcd1234-...-..." → "abcd1234". */
export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

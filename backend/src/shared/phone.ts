/** Canonicalize a Jordanian mobile number to E.164 (+9627XXXXXXXX) before it's
 *  ever used as a User.phone lookup/creation key. Without this, the same
 *  real-world number typed as "0799000001", "00962799000001", or
 *  "+962799000001" each hashes to a different DB row — silently splitting one
 *  person's account into disconnected duplicates (no error, no warning, and
 *  the person's booking/wallet/address history is just gone on whichever
 *  variant they didn't use before). isMobilePhone('any') at the route layer
 *  only checks the string looks like *some* phone number — it doesn't
 *  canonicalize, so normalization has to happen here before any Redis or
 *  Prisma call touches `phone`.
 *
 *  Only Jordanian mobile numbers are in scope (the whole product is
 *  Amman-only) — anything that doesn't resemble one is returned unchanged so
 *  the existing isMobilePhone validation is left to reject it. */
export function normalizePhone(raw: string): string {
  const digits = raw.trim().replace(/[\s\-()]/g, '');

  if (/^\+9627\d{8}$/.test(digits)) return digits;
  if (/^009627\d{8}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^9627\d{8}$/.test(digits)) return `+${digits}`;
  if (/^07\d{8}$/.test(digits)) return `+962${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `+962${digits}`;

  return digits;
}

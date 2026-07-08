/**
 * Strip one or more fields from an object before it goes out over the API. Used
 * to keep encrypted-at-rest columns (e.g. TechnicianProfile.nationalIdEnc) out of
 * every response — even the ciphertext should never leave the server via an API
 * response; it's readable only via direct DB/admin-tool access.
 */
export function omitFields<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) delete clone[key];
  return clone;
}

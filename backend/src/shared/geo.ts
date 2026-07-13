/** Valid WGS-84 latitude/longitude ranges, shared by every route validator
 *  that accepts a lat/lng pair (addresses, bookings, quotes, technician
 *  location/search) so the bound can't drift between call sites. */
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

/** Earth's mean radius (km), used by the haversine formula below. */
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance (km) between two lat/lng points. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

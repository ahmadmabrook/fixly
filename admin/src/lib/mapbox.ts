/**
 * Mapbox config for the admin panel. Public token (pk.*), URL-restricted, safe
 * to ship in the bundle. Maps degrade gracefully when the token is absent.
 */
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? '';
export const hasMapbox = MAPBOX_TOKEN.startsWith('pk.');

/** Default map center — Amman, Jordan ([lng, lat]). */
export const AMMAN: { lng: number; lat: number } = { lng: 35.9106, lat: 31.9539 };

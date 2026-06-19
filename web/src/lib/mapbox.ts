/**
 * Mapbox config + geocoding helpers. The token is a PUBLIC token (pk.*) injected
 * at build time via Vite env and URL-restricted in the Mapbox dashboard, so it's
 * safe to ship in the browser bundle. All map code degrades gracefully when the
 * token is absent (build/test/no-config) — `hasMapbox` gates every map render.
 */
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? '';
export const hasMapbox = MAPBOX_TOKEN.startsWith('pk.');

/** Default map center — Amman, Jordan. Mapbox order is [lng, lat]. */
export const AMMAN: { lng: number; lat: number } = { lng: 35.9106, lat: 31.9539 };

export interface GeocodeResult {
  address: string;
  lng: number;
  lat: number;
}

const GEOCODE_BASE = 'https://api.mapbox.com/search/geocode/v6';

/** Forward geocode (address autocomplete), biased to Jordan + a proximity point. */
export async function forwardGeocode(query: string, near = AMMAN): Promise<GeocodeResult[]> {
  if (!hasMapbox || query.trim().length < 2) return [];
  const url = `${GEOCODE_BASE}/forward?q=${encodeURIComponent(query.trim())}` +
    `&access_token=${MAPBOX_TOKEN}&country=jo&language=ar&limit=5&proximity=${near.lng},${near.lat}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as { features?: Array<{ properties?: { full_address?: string; name?: string }; geometry?: { coordinates?: [number, number] } }> };
    return (body.features ?? [])
      .filter((f) => f.geometry?.coordinates)
      .map((f) => ({
        address: f.properties?.full_address ?? f.properties?.name ?? '',
        lng: f.geometry!.coordinates![0],
        lat: f.geometry!.coordinates![1],
      }));
  } catch {
    return [];
  }
}

/** Reverse geocode a pin → human address (Arabic). Returns null on failure. */
export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!hasMapbox) return null;
  const url = `${GEOCODE_BASE}/reverse?longitude=${lng}&latitude=${lat}` +
    `&access_token=${MAPBOX_TOKEN}&language=ar&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: Array<{ properties?: { full_address?: string; name?: string } }> };
    const f = body.features?.[0];
    return f?.properties?.full_address ?? f?.properties?.name ?? null;
  } catch {
    return null;
  }
}

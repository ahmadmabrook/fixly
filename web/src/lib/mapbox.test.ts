import { describe, it, expect, afterEach, vi } from 'vitest';
import { forwardGeocode, reverseGeocode, hasMapbox, fetchDrivingRoute, haversineMeters } from './mapbox';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function stubFetch(impl: (url: string) => { ok?: boolean; json: () => unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const r = impl(url);
    return { ok: r.ok ?? true, json: async () => r.json() } as Response;
  }) as unknown as typeof fetch);
}

describe('forwardGeocode', () => {
  it('maps features to {address,lng,lat} and biases to Jordan', async () => {
    expect(hasMapbox).toBe(true);
    let calledUrl = '';
    stubFetch((url) => {
      calledUrl = url;
      return { json: () => ({ features: [{ properties: { full_address: 'عبدون، عمّان' }, geometry: { coordinates: [35.88, 31.95] } }] }) };
    });
    const out = await forwardGeocode('عبدون');
    expect(out).toEqual([{ address: 'عبدون، عمّان', lng: 35.88, lat: 31.95 }]);
    expect(calledUrl).toContain('/forward?q=');
    expect(calledUrl).toContain('country=jo');
    expect(calledUrl).toContain('proximity=');
  });

  it('skips the network for queries under 2 chars', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f as unknown as typeof fetch);
    expect(await forwardGeocode('a')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('drops features without coordinates', async () => {
    stubFetch(() => ({ json: () => ({ features: [{ properties: { name: 'x' } }] }) }));
    expect(await forwardGeocode('xy')).toEqual([]);
  });

  it('returns [] on a non-ok response', async () => {
    stubFetch(() => ({ ok: false, json: () => ({}) }));
    expect(await forwardGeocode('xy')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('returns the full address of the first feature', async () => {
    stubFetch((url) => {
      expect(url).toContain('/reverse?longitude=35.9&latitude=31.95');
      return { json: () => ({ features: [{ properties: { full_address: 'خلدا، عمّان' } }] }) };
    });
    expect(await reverseGeocode(35.9, 31.95)).toBe('خلدا، عمّان');
  });

  it('returns null when there are no features', async () => {
    stubFetch(() => ({ json: () => ({ features: [] }) }));
    expect(await reverseGeocode(35.9, 31.95)).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch);
    expect(await reverseGeocode(35.9, 31.95)).toBeNull();
  });
});

describe('fetchDrivingRoute', () => {
  const from = { lng: 35.93, lat: 31.95 };
  const to = { lng: 35.9106, lat: 31.9539 };

  it('returns the road-snapped coordinates, distance, and duration of the first route', async () => {
    let calledUrl = '';
    stubFetch((url) => {
      calledUrl = url;
      return {
        json: () => ({
          routes: [{ geometry: { coordinates: [[35.93, 31.95], [35.92, 31.952], [35.9106, 31.9539]] }, distance: 2400, duration: 310 }],
        }),
      };
    });
    const route = await fetchDrivingRoute(from, to);
    expect(route).toEqual({
      coordinates: [[35.93, 31.95], [35.92, 31.952], [35.9106, 31.9539]],
      distanceMeters: 2400,
      durationSeconds: 310,
    });
    expect(calledUrl).toContain('/directions/v5/mapbox/driving/35.93,31.95;35.9106,31.9539');
    expect(calledUrl).toContain('geometries=geojson');
  });

  it('returns null when the API reports no route', async () => {
    stubFetch(() => ({ json: () => ({ routes: [] }) }));
    expect(await fetchDrivingRoute(from, to)).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(() => ({ ok: false, json: () => ({}) }));
    expect(await fetchDrivingRoute(from, to)).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch);
    expect(await fetchDrivingRoute(from, to)).toBeNull();
  });
});

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters({ lng: 35.93, lat: 31.95 }, { lng: 35.93, lat: 31.95 })).toBe(0);
  });

  it('matches a known real-world distance within a small tolerance', () => {
    // Amman city center to Queen Alia International Airport is ~30km.
    const amman = { lng: 35.9106, lat: 31.9539 };
    const qaia = { lng: 35.9931, lat: 31.7226 };
    const meters = haversineMeters(amman, qaia);
    expect(meters).toBeGreaterThan(25_000);
    expect(meters).toBeLessThan(35_000);
  });
});

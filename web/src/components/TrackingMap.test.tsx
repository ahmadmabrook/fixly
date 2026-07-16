import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

// mapbox-gl is a WebGL library that jsdom cannot run, and the Directions API is
// billed per request — both are faked here so the component's own logic (how
// often it fetches, when it draws, when it clears) is what's under test.
const fetchDrivingRoute = vi.fn();
vi.mock('../lib/mapbox', () => ({
  hasMapbox: true,
  MAPBOX_TOKEN: 'pk.test',
  fetchDrivingRoute: (...args: unknown[]) => fetchDrivingRoute(...args),
}));

const setData = vi.fn();
class FakeMap {
  addSource = vi.fn();
  addLayer = vi.fn();
  fitBounds = vi.fn();
  remove = vi.fn();
  getSource = () => ({ setData });
  getBounds = () => ({ contains: () => true });
  on(event: string, cb: () => void) {
    // The real map fires `load` once the style is ready; fire it straight away.
    if (event === 'load') cb();
  }
}
class FakeMarker {
  setLngLat() { return this; }
  addTo() { return this; }
  remove() { return this; }
}
class FakeLngLatBounds {
  extend() { return this; }
}
vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: FakeMap,
    Marker: FakeMarker,
    LngLatBounds: FakeLngLatBounds,
  },
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

import TrackingMap from './TrackingMap';

const CUSTOMER = { lat: 31.9539, lng: 35.9106 };
// A short, straight two-vertex route standing in for a road-snapped path.
const ROUTE = {
  coordinates: [[35.9200, 31.9600], [35.9106, 31.9539]] as [number, number][],
  distanceMeters: 1_200,
  durationSeconds: 300,
};

/** Render, then flush the dynamic `import('mapbox-gl')` and map construction. */
async function renderMap(props: Partial<Parameters<typeof TrackingMap>[0]> = {}) {
  const view = render(<TrackingMap customer={CUSTOMER} tech={null} {...props} />);
  await act(async () => { await Promise.resolve(); });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrackingMap Directions usage', () => {
  it('fetches a route once for a burst of pings while the first request is still in flight', async () => {
    // Directions never resolves — the state the previous code mishandled: with no
    // route yet, every 2s ping re-entered the fetch branch and fired another
    // *billed* request, because the cooldown was skipped whenever there was no
    // existing route.
    fetchDrivingRoute.mockReturnValue(new Promise(() => {}));
    const { rerender } = await renderMap({ tech: { lat: 31.96, lng: 35.92 }, status: 'EN_ROUTE' });

    for (let i = 1; i <= 5; i++) {
      rerender(<TrackingMap customer={CUSTOMER} tech={{ lat: 31.96 + i / 10_000, lng: 35.92 }} status="EN_ROUTE" />);
      await act(async () => { vi.advanceTimersByTime(2_000); });
    }

    expect(fetchDrivingRoute).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh route only after the cooldown once the technician goes off-route', async () => {
    fetchDrivingRoute.mockResolvedValue(ROUTE);
    const { rerender } = await renderMap({ tech: { lat: 31.9600, lng: 35.9200 }, status: 'EN_ROUTE' });
    await act(async () => { await Promise.resolve(); });
    expect(fetchDrivingRoute).toHaveBeenCalledTimes(1);

    // Ping from far off the drawn route (a wrong turn), still inside the cooldown.
    rerender(<TrackingMap customer={CUSTOMER} tech={{ lat: 31.9900, lng: 35.9500 }} status="EN_ROUTE" />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchDrivingRoute).toHaveBeenCalledTimes(1);

    // Same situation once the cooldown has elapsed → one more request, not a storm.
    await act(async () => { vi.advanceTimersByTime(9_000); });
    rerender(<TrackingMap customer={CUSTOMER} tech={{ lat: 31.9901, lng: 35.9500 }} status="EN_ROUTE" />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchDrivingRoute).toHaveBeenCalledTimes(2);
  });

  it('does not fetch a route at all once the booking reaches a terminal status', async () => {
    fetchDrivingRoute.mockResolvedValue(ROUTE);
    await renderMap({ tech: { lat: 31.96, lng: 35.92 }, status: 'COMPLETED' });
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });
});

describe('TrackingMap ETA reporting', () => {
  it("reports the route's driving duration when the route resolves", async () => {
    fetchDrivingRoute.mockResolvedValue(ROUTE);
    const onEtaSeconds = vi.fn();
    await renderMap({ tech: { lat: 31.9600, lng: 35.9200 }, status: 'EN_ROUTE', onEtaSeconds });
    await act(async () => { await Promise.resolve(); });
    expect(onEtaSeconds).toHaveBeenCalledWith(ROUTE.durationSeconds);
  });

  it('clears the ETA and the route line on arrival', async () => {
    fetchDrivingRoute.mockResolvedValue(ROUTE);
    const onEtaSeconds = vi.fn();
    const { rerender } = await renderMap({ tech: { lat: 31.9600, lng: 35.9200 }, status: 'EN_ROUTE', onEtaSeconds });
    await act(async () => { await Promise.resolve(); });

    setData.mockClear();
    onEtaSeconds.mockClear();
    rerender(<TrackingMap customer={CUSTOMER} tech={{ lat: 31.9600, lng: 35.9200 }} status="ARRIVED" onEtaSeconds={onEtaSeconds} />);
    await act(async () => { await Promise.resolve(); });

    expect(onEtaSeconds).toHaveBeenCalledWith(null);
    // An empty LineString — the drawn journey is gone.
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({
      geometry: expect.objectContaining({ coordinates: [] }),
    }));
  });

  it('ignores a Directions response that lands after the journey has ended', async () => {
    // The response was requested while EN_ROUTE but resolves after ARRIVED.
    let resolveRoute: (r: typeof ROUTE) => void = () => {};
    fetchDrivingRoute.mockReturnValue(new Promise((res) => { resolveRoute = res; }));
    const onEtaSeconds = vi.fn();
    const { rerender } = await renderMap({ tech: { lat: 31.96, lng: 35.92 }, status: 'EN_ROUTE', onEtaSeconds });

    rerender(<TrackingMap customer={CUSTOMER} tech={{ lat: 31.96, lng: 35.92 }} status="ARRIVED" onEtaSeconds={onEtaSeconds} />);
    await act(async () => { await Promise.resolve(); });
    onEtaSeconds.mockClear();
    setData.mockClear();

    await act(async () => { resolveRoute(ROUTE); await Promise.resolve(); });

    // Must not redraw a route or resurrect an ETA for a job that is over.
    expect(onEtaSeconds).not.toHaveBeenCalledWith(ROUTE.durationSeconds);
    expect(setData).not.toHaveBeenCalledWith(expect.objectContaining({
      geometry: expect.objectContaining({ coordinates: expect.arrayContaining([ROUTE.coordinates[0]]) }),
    }));
  });
});

import { useEffect, useRef, useState } from 'react';
import type { Map as MbMap, Marker as MbMarker, GeoJSONSource } from 'mapbox-gl';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox, fetchDrivingRoute } from '../lib/mapbox';
import { RoutePath, bearing, type LngLat } from '../lib/routeGeometry';
import { LOCATION_PING_INTERVAL_MS } from '../lib/constants';
import { COLOR_BG_MAP_PLACEHOLDER, COLOR_BRAND_ACCENT_TEAL, COLOR_BRAND_PRIMARY, COLOR_TEXT_MUTED, COLOR_WHITE, SHADOW_MAP_MARKER } from '../lib/theme';

interface Point { lat: number; lng: number }

const TECH_ROUTE_SOURCE_ID = 'tech-route';
const TECH_ROUTE_CASING_LAYER_ID = 'tech-route-casing';
const TECH_ROUTE_LAYER_ID = 'tech-route-line';

// The glide finishes just *under* the technician ping cadence, so the car
// arrives at one ping as the next lands — continuous motion instead of
// move-then-pause. Derived from the shared cadence constant rather than
// restating it, so the two can't silently drift apart.
const GLIDE_LEAD_MS = 100;
const GLIDE_MS = LOCATION_PING_INTERVAL_MS - GLIDE_LEAD_MS;
// A ping this far off the drawn route means the technician took a different road
// (wrong turn / reroute) — fetch a fresh route rather than snapping them onto a
// road they aren't on.
const OFFROUTE_THRESHOLD_M = 55;
// Don't re-hit the paid Directions API more than this often even while off-route.
const ROUTE_REFETCH_COOLDOWN_MS = 8_000;
// Within this of the route end, treat the technician as arrived: drop the line.
const ARRIVE_EPS_M = 18;
// A route shorter than this has no meaningful geometry left to ride (the
// technician is effectively on the doorstep) — park the car on the customer pin.
const DEGENERATE_ROUTE_M = 1;

// Route line styling. The white casing is drawn wider, underneath the brand
// line, so the route reads clearly over any street color.
const ROUTE_CASING_WIDTH_PX = 8;
const ROUTE_CASING_OPACITY = 0.95;
const ROUTE_LINE_WIDTH_PX = 5;
const MAP_INITIAL_ZOOM = 14;
const MAP_FIT_PADDING_PX = 70;
const MAP_FIT_MAX_ZOOM = 16;
const CAR_MARKER_SIZE_PX = 30;
const CAR_ICON_SIZE_PX = 16;

// Booking states where there is no live journey to draw: the route line is
// cleared (technician has arrived / the job is over / it was cancelled).
const TERMINAL_STATUSES = new Set(['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

// Same path data as the app's lucide-react "car-front" icon (see lucide-react/icons/car-front),
// reproduced as a static SVG string because mapbox-gl markers take a raw DOM element, not a
// React node — mounting a full React root into a detached marker element just to render one
// icon isn't worth the extra machinery here.
const CAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CAR_ICON_SIZE_PX}" height="${CAR_ICON_SIZE_PX}" viewBox="0 0 24 24" fill="none" stroke="${COLOR_WHITE}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>`;

function createCarMarkerElement(): { root: HTMLDivElement; rotor: HTMLDivElement } {
  const root = document.createElement('div');
  root.style.width = `${CAR_MARKER_SIZE_PX}px`;
  root.style.height = `${CAR_MARKER_SIZE_PX}px`;
  root.style.borderRadius = '50%';
  root.style.background = COLOR_BRAND_ACCENT_TEAL;
  root.style.border = `2px solid ${COLOR_WHITE}`;
  root.style.boxShadow = SHADOW_MAP_MARKER;
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';

  const rotor = document.createElement('div');
  rotor.style.width = `${CAR_ICON_SIZE_PX}px`;
  rotor.style.height = `${CAR_ICON_SIZE_PX}px`;
  rotor.style.transition = 'transform 0.4s ease';
  rotor.innerHTML = CAR_ICON_SVG;
  root.appendChild(rotor);

  return { root, rotor };
}

/**
 * Uber-style live tracking map: a fixed customer pin + a technician car marker
 * that rides an actual road-snapped driving route (Mapbox Directions API) to
 * the customer's door. On each location ping the car glides *along the route*
 * (through its road vertices, facing the direction of travel), the stretch of
 * road it has already covered is dropped behind it, and when it arrives the
 * whole line clears. mapbox-gl is dynamically imported (own chunk) and the whole
 * thing degrades to a notice when the token/WebGL is unavailable.
 */
export default function TrackingMap({
  customer, tech, status, onEtaSeconds, height = 300,
}: { customer: Point; tech: Point | null; status?: string; onEtaSeconds?: (seconds: number | null) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const gl = useRef<typeof mapboxgl | null>(null);
  const carMarker = useRef<MbMarker | null>(null);
  const carRotor = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);
  // The map is built asynchronously (dynamic import), so readiness has to be
  // reactive state, not just `mapRef.current`: a ref can't re-run the ping
  // effect. Without this, a location ping that arrived before the import
  // resolved was dropped on the floor — the effect bailed on the null map and
  // nothing re-triggered it until the *next* ping changed the coordinates.
  const [mapReady, setMapReady] = useState(false);

  // Journey state: the drawn route, how far along it the car currently sits, its
  // full driving duration (for a live ETA), and the last Directions fetch time.
  const routePath = useRef<RoutePath | null>(null);
  const routeDurationSec = useRef(0);
  const progress = useRef(0);
  const lastFetchAt = useRef(0);
  const fetchInFlight = useRef(false);
  const onEtaRef = useRef(onEtaSeconds);
  onEtaRef.current = onEtaSeconds;
  // Read inside the async Directions callback to reject a response that resolved
  // after the journey ended (see the guard in the fetch handler).
  const statusRef = useRef(status);
  statusRef.current = status;
  // Fallback path when there is no route (Directions failed): remember the raw
  // point so we can still glide the pin straight between pings.
  const lastRawTech = useRef<LngLat | null>(null);

  const customerRef = useRef(customer);
  customerRef.current = customer;

  // ── init once ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasMapbox || !el.current) return;
    let cancelled = false;
    let map: MbMap | undefined;
    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        gl.current = mapboxgl;
        if (cancelled || !el.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const c = customerRef.current;
        map = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/streets-v12', center: [c.lng, c.lat], zoom: MAP_INITIAL_ZOOM });
        mapRef.current = map;
        setMapReady(true);
        new mapboxgl.Marker({ color: COLOR_BRAND_PRIMARY }).setLngLat([c.lng, c.lat]).addTo(map);
        map.on('load', () => {
          if (cancelled || !map) return;
          map.addSource(TECH_ROUTE_SOURCE_ID, { type: 'geojson', data: emptyLine() });
          // White casing under a solid brand-colored line — the layering
          // turn-by-turn UIs use so the route reads clearly over any street.
          map.addLayer({
            id: TECH_ROUTE_CASING_LAYER_ID, type: 'line', source: TECH_ROUTE_SOURCE_ID,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': COLOR_WHITE, 'line-width': ROUTE_CASING_WIDTH_PX, 'line-opacity': ROUTE_CASING_OPACITY },
          });
          map.addLayer({
            id: TECH_ROUTE_LAYER_ID, type: 'line', source: TECH_ROUTE_SOURCE_ID,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': COLOR_BRAND_ACCENT_TEAL, 'line-width': ROUTE_LINE_WIDTH_PX },
          });
        });
      } catch {
        // WebGL/jsdom/load failure → notice stays.
      }
    })();
    return () => {
      cancelled = true;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      map?.remove();
      setMapReady(false);
      mapRef.current = null;
      carMarker.current = null;
      carRotor.current = null;
      routePath.current = null;
      lastRawTech.current = null;
    };
  }, []);

  // ── react to each technician location / status change ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = gl.current;
    if (!map || !mapboxgl) return;

    const setRouteData = (coords: LngLat[]) => {
      const source = map.getSource(TECH_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(coords.length >= 2
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
        : emptyLine());
    };
    const placeCar = (at: LngLat, heading?: number) => {
      if (!carMarker.current) {
        const { root, rotor } = createCarMarkerElement();
        carMarker.current = new mapboxgl.Marker({ element: root }).setLngLat(at).addTo(map);
        carRotor.current = rotor;
      } else {
        carMarker.current.setLngLat(at);
      }
      if (heading !== undefined && carRotor.current) carRotor.current.style.transform = `rotate(${heading}deg)`;
    };
    const fitTo = (coords: LngLat[]) => {
      if (coords.length === 0) return;
      const b = new mapboxgl.LngLatBounds();
      for (const c of coords) b.extend(c);
      map.fitBounds(b, { padding: MAP_FIT_PADDING_PX, maxZoom: MAP_FIT_MAX_ZOOM, duration: GLIDE_MS });
    };
    // Keep a STEADY view (like Uber) — only recenter if the car is about to leave
    // the viewport, rather than re-animating the camera on every 2s ping (which
    // both looks jittery and never lets the map settle).
    const keepInView = (car: LngLat, remaining: LngLat[]) => {
      const bounds = map.getBounds();
      if (bounds && bounds.contains(car)) return;
      fitTo(remaining.length >= 2 ? remaining : [car, [customerRef.current.lng, customerRef.current.lat]]);
    };
    const stopAnim = () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } };

    // Glide the car straight between raw pings — only used when there is no road
    // route to ride (Directions API unavailable), so the pin still moves.
    const glideStraight = (to: LngLat) => {
      const origin = lastRawTech.current ?? to;
      lastRawTech.current = to;
      if (carRotor.current && (origin[0] !== to[0] || origin[1] !== to[1])) {
        carRotor.current.style.transform = `rotate(${bearing(origin, to)}deg)`;
      }
      stopAnim();
      const s = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - s) / GLIDE_MS, 1);
        placeCar([origin[0] + (to[0] - origin[0]) * t, origin[1] + (to[1] - origin[1]) * t]);
        raf.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      raf.current = requestAnimationFrame(step);
      fitTo([to, [customerRef.current.lng, customerRef.current.lat]]);
    };

    // Terminal states (arrived / job underway / done / cancelled): no journey to
    // draw. Drop the line entirely; leave the car where it last was.
    if (status && TERMINAL_STATUSES.has(status)) {
      stopAnim();
      setRouteData([]);
      routePath.current = null;
      onEtaRef.current?.(null);
      return;
    }

    if (!tech) return;
    const techLngLat: LngLat = [tech.lng, tech.lat];

    // Fetch a (fresh) road route when we have none, or when the technician has
    // strayed too far from the one we drew (wrong turn / reroute). While a fetch
    // is in flight we keep riding whatever route we already have.
    const existing = routePath.current;
    const offset = existing ? existing.project(techLngLat, progress.current).offset : Infinity;
    const needRoute = !existing || offset > OFFROUTE_THRESHOLD_M;
    // The cooldown must apply to *every* fetch, including the first. Exempting
    // the no-route case (`!existing ||`) meant that while the opening Directions
    // request was still in flight, `routePath` stayed null, so each 2s ping
    // re-entered this branch and fired another billed request — the exact case
    // the cooldown exists to bound. The in-flight latch closes the same hole for
    // reroute fetches that outlive the cooldown window.
    const mayFetch = !fetchInFlight.current && Date.now() - lastFetchAt.current > ROUTE_REFETCH_COOLDOWN_MS;
    if (needRoute && mayFetch) {
      lastFetchAt.current = Date.now();
      fetchInFlight.current = true;
      if (!existing) placeCar(techLngLat); // honest pin until the route resolves
      void fetchDrivingRoute(tech, customerRef.current).finally(() => {
        fetchInFlight.current = false;
      }).then((route) => {
        // Drop a response that outlived what it was for: the map was torn down,
        // or the journey reached a terminal status while we waited — applying it
        // then would redraw a route line over a job that has already ended.
        if (mapRef.current !== map) return;
        if (statusRef.current && TERMINAL_STATUSES.has(statusRef.current)) return;
        if (!route || route.coordinates.length < 2) return;
        const path = new RoutePath(route.coordinates);
        routePath.current = path;
        routeDurationSec.current = route.durationSeconds;
        progress.current = 0;
        lastRawTech.current = techLngLat;
        stopAnim();
        setRouteData(path.slice(0, path.length));
        placeCar(path.pointAt(0), path.bearingAt(0));
        fitTo(path.coords);
        onEtaRef.current?.(route.durationSeconds);
      });
    }

    // No usable route yet (first fetch still in flight, or it failed) → straight
    // fallback for this ping.
    const path = routePath.current;
    if (!path) { glideStraight(techLngLat); onEtaRef.current?.(null); return; }
    if (path.length < DEGENERATE_ROUTE_M) { setRouteData([]); placeCar([customerRef.current.lng, customerRef.current.lat]); onEtaRef.current?.(null); return; }

    // ── ride the route ────────────────────────────────────────────────────────
    // Project the ping onto the route; never let the car slide backward on a
    // jittery / out-of-order fix.
    const along = Math.min(path.project(techLngLat, progress.current).along, path.length);
    const target = Math.max(progress.current, along);
    const from = progress.current;

    // Live ETA: remaining fraction of the route's real driving duration.
    onEtaRef.current?.(path.length > 0 ? routeDurationSec.current * (1 - target / path.length) : 0);

    stopAnim();
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min((now - start) / GLIDE_MS, 1);
      const d = from + (target - from) * t;
      progress.current = d;
      placeCar(path.pointAt(d), path.bearingAt(d));
      // Drop the road already covered; keep only what's still ahead. Clears
      // entirely once the car is essentially at the destination.
      setRouteData(path.length - d < ARRIVE_EPS_M ? [] : path.slice(d, path.length));
      raf.current = t < 1 ? requestAnimationFrame(frame) : null;
    };
    raf.current = requestAnimationFrame(frame);
    keepInView(path.pointAt(target), path.slice(target, path.length));
  }, [tech?.lat, tech?.lng, status, mapReady]);

  if (!hasMapbox) {
    return (
      <div role="status" className="flex items-center justify-center rounded-xl" style={{ height, background: COLOR_BG_MAP_PLACEHOLDER, color: COLOR_TEXT_MUTED, fontSize: 13 }}>
        الخريطة غير متاحة
      </div>
    );
  }
  // `role` is required for the label to reach assistive tech at all — aria-label
  // on a bare <div> (no role) is ignored by every major screen reader.
  return <div ref={el} role="region" className="rounded-xl overflow-hidden" style={{ height, width: '100%' }} aria-label="خريطة التتبّع" />;
}

function emptyLine() {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [] as LngLat[] } };
}

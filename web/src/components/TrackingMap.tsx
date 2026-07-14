import { useEffect, useRef } from 'react';
import type { Map as MbMap, Marker as MbMarker, GeoJSONSource } from 'mapbox-gl';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox, fetchDrivingRoute, haversineMeters } from '../lib/mapbox';
import { COLOR_BG_MAP_PLACEHOLDER, COLOR_BRAND_ACCENT_TEAL, COLOR_BRAND_PRIMARY, COLOR_TEXT_MUTED, COLOR_WHITE } from '../lib/theme';

interface Point { lat: number; lng: number }

const TECH_ROUTE_SOURCE_ID = 'tech-route';
const TECH_ROUTE_CASING_LAYER_ID = 'tech-route-casing';
const TECH_ROUTE_LAYER_ID = 'tech-route-line';
// Matches the fitBounds camera duration so the pin arrives as the viewport
// finishes re-centering, instead of visibly lagging or leading it.
const MARKER_ANIMATION_MS = 800;
// Re-fetch the driving route once the technician has moved far enough that
// the previously-drawn road path would visibly disagree with reality, but
// no more often than the min interval below — the Directions API is a paid,
// rate-limited call, and a route barely changes between two 2-second pings.
const ROUTE_REFETCH_MIN_DISTANCE_M = 80;
const ROUTE_REFETCH_MIN_INTERVAL_MS = 10_000;

// Same path data as the app's lucide-react "car-front" icon (see lucide-react/icons/car-front),
// reproduced as a static SVG string because mapbox-gl markers take a raw DOM element, not a
// React node — mounting a full React root into a detached marker element just to render one
// icon isn't worth the extra machinery here.
const CAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${COLOR_WHITE}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>`;

function createCarMarkerElement(): { root: HTMLDivElement; rotor: HTMLDivElement } {
  const root = document.createElement('div');
  root.style.width = '30px';
  root.style.height = '30px';
  root.style.borderRadius = '50%';
  root.style.background = COLOR_BRAND_ACCENT_TEAL;
  root.style.border = `2px solid ${COLOR_WHITE}`;
  root.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';

  const rotor = document.createElement('div');
  rotor.style.width = '16px';
  rotor.style.height = '16px';
  rotor.style.transition = 'transform 0.3s ease';
  rotor.innerHTML = CAR_ICON_SVG;
  root.appendChild(rotor);

  return { root, rotor };
}

/** Initial bearing (degrees, 0 = north) from point `a` to point `b`. */
function bearingDeg(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const emptyRoute = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [] as [number, number][] } };

/**
 * Read-only tracking map: a fixed customer pin + a live technician car marker
 * that glides (not jumps) toward each new `tech` update, rotated to face the
 * direction of travel, following an actual road-snapped driving route to the
 * customer's address (Mapbox Directions API) — not a straight line between
 * raw GPS pings. Recenters to keep both in view. mapbox-gl is dynamically
 * imported (own chunk) and the whole thing degrades to a notice when the
 * token/WebGL is unavailable.
 */
export default function TrackingMap({ customer, tech, height = 300 }: { customer: Point; tech: Point | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const gl = useRef<typeof mapboxgl | null>(null);
  const techMarker = useRef<MbMarker | null>(null);
  const techRotor = useRef<HTMLDivElement | null>(null);
  const routeOrigin = useRef<Point | null>(null);
  const lastRouteAttemptAt = useRef(0);
  const lastTechPoint = useRef<Point | null>(null);
  const animationFrame = useRef<number | null>(null);
  const customerRef = useRef(customer);
  customerRef.current = customer;

  // Init once.
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
        map = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/streets-v12', center: [c.lng, c.lat], zoom: 14 });
        mapRef.current = map;
        new mapboxgl.Marker({ color: COLOR_BRAND_PRIMARY }).setLngLat([c.lng, c.lat]).addTo(map);
        map.on('load', () => {
          if (cancelled || !map) return;
          map.addSource(TECH_ROUTE_SOURCE_ID, { type: 'geojson', data: emptyRoute });
          // White casing underneath + solid brand-colored line on top — same
          // layering technique turn-by-turn map UIs use for a route that
          // reads clearly against streets of any color.
          map.addLayer({
            id: TECH_ROUTE_CASING_LAYER_ID,
            type: 'line',
            source: TECH_ROUTE_SOURCE_ID,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': COLOR_WHITE, 'line-width': 7, 'line-opacity': 0.9 },
          });
          map.addLayer({
            id: TECH_ROUTE_LAYER_ID,
            type: 'line',
            source: TECH_ROUTE_SOURCE_ID,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': COLOR_BRAND_ACCENT_TEAL, 'line-width': 4.5 },
          });
        });
      } catch {
        // WebGL/jsdom/load failure → notice stays.
      }
    })();
    return () => {
      cancelled = true;
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      map?.remove();
      mapRef.current = null;
      techMarker.current = null;
      techRotor.current = null;
      routeOrigin.current = null;
      lastTechPoint.current = null;
    };
  }, []);

  // Glide the technician car toward each new location as it arrives, keep the
  // road-snapped route to the customer up to date, and keep both pins in view.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = gl.current;
    if (!map || !mapboxgl || !tech) return;

    if (!techMarker.current) {
      const { root, rotor } = createCarMarkerElement();
      techMarker.current = new mapboxgl.Marker({ element: root }).setLngLat([tech.lng, tech.lat]).addTo(map);
      techRotor.current = rotor;
    } else {
      const from = lastTechPoint.current ?? tech;
      const marker = techMarker.current;
      const rotor = techRotor.current;

      if (rotor && (from.lat !== tech.lat || from.lng !== tech.lng)) {
        rotor.style.transform = `rotate(${bearingDeg(from, tech)}deg)`;
      }

      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      const start = performance.now();
      const animate = (now: number) => {
        const t = Math.min((now - start) / MARKER_ANIMATION_MS, 1);
        marker.setLngLat([from.lng + (tech.lng - from.lng) * t, from.lat + (tech.lat - from.lat) * t]);
        if (t < 1) {
          animationFrame.current = requestAnimationFrame(animate);
        } else {
          animationFrame.current = null;
        }
      };
      animationFrame.current = requestAnimationFrame(animate);
    }
    lastTechPoint.current = tech;

    const movedFarEnough = !routeOrigin.current || haversineMeters(routeOrigin.current, tech) > ROUTE_REFETCH_MIN_DISTANCE_M;
    const cooledDown = Date.now() - lastRouteAttemptAt.current > ROUTE_REFETCH_MIN_INTERVAL_MS;
    if (movedFarEnough && cooledDown) {
      lastRouteAttemptAt.current = Date.now();
      const requestedFor = tech;
      void fetchDrivingRoute(tech, customerRef.current).then((route) => {
        if (!route || mapRef.current !== map) return;
        const source = map.getSource(TECH_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } });
        routeOrigin.current = requestedFor;
        // Real streets rarely run in a straight line between the two
        // endpoints — a route can bulge well outside a box fitted to just
        // the customer + technician points (one-way streets, a loop around
        // a block, a highway on/off-ramp). Re-fit to the actual drawn path
        // once it arrives so it's never rendered partly off-screen.
        const routeBounds = new mapboxgl.LngLatBounds();
        for (const [lng, lat] of route.coordinates) routeBounds.extend([lng, lat]);
        map.fitBounds(routeBounds, { padding: 64, maxZoom: 15, duration: MARKER_ANIMATION_MS });
      });
    }

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([customerRef.current.lng, customerRef.current.lat]);
    bounds.extend([tech.lng, tech.lat]);
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: MARKER_ANIMATION_MS });
  }, [tech?.lat, tech?.lng]);

  if (!hasMapbox) {
    return (
      <div className="flex items-center justify-center rounded-xl" style={{ height, background: COLOR_BG_MAP_PLACEHOLDER, color: COLOR_TEXT_MUTED, fontSize: 13 }}>
        الخريطة غير متاحة
      </div>
    );
  }
  return <div ref={el} className="rounded-xl overflow-hidden" style={{ height, width: '100%' }} aria-label="خريطة التتبّع" />;
}

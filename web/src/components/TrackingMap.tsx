import { useEffect, useRef } from 'react';
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox } from '../lib/mapbox';

interface Point { lat: number; lng: number }

/**
 * Read-only tracking map: a fixed customer pin + a live technician pin that
 * moves as `tech` updates (driven by the booking socket). Recenters to keep both
 * in view. mapbox-gl is dynamically imported (own chunk) and the whole thing
 * degrades to a notice when the token/WebGL is unavailable.
 */
export default function TrackingMap({ customer, tech, height = 300 }: { customer: Point; tech: Point | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const gl = useRef<typeof mapboxgl | null>(null);
  const techMarker = useRef<MbMarker | null>(null);
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
        new mapboxgl.Marker({ color: '#1366D6' }).setLngLat([c.lng, c.lat]).addTo(map);
      } catch {
        // WebGL/jsdom/load failure → notice stays.
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      techMarker.current = null;
    };
  }, []);

  // Move the technician pin + keep both in view as live location arrives.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = gl.current;
    if (!map || !mapboxgl || !tech) return;
    if (!techMarker.current) {
      techMarker.current = new mapboxgl.Marker({ color: '#0FB5A6' }).setLngLat([tech.lng, tech.lat]).addTo(map);
    } else {
      techMarker.current.setLngLat([tech.lng, tech.lat]);
    }
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([customerRef.current.lng, customerRef.current.lat]);
    bounds.extend([tech.lng, tech.lat]);
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 800 });
  }, [tech?.lat, tech?.lng]);

  if (!hasMapbox) {
    return (
      <div className="flex items-center justify-center rounded-xl" style={{ height, background: '#EEF2F7', color: '#94A3B8', fontSize: 13 }}>
        الخريطة غير متاحة
      </div>
    );
  }
  return <div ref={el} className="rounded-xl overflow-hidden" style={{ height, width: '100%' }} aria-label="خريطة التتبّع" />;
}

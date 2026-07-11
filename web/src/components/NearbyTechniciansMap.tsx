import { useEffect, useRef } from 'react';
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox } from '../lib/mapbox';
import type { NearbyTechnician } from '../lib/api';

interface Point { lat: number; lng: number }

/**
 * Real (non-mock) map centered on the customer, with a pin per currently
 * available nearby technician. Purely informational — no route/ETA claims,
 * just "these are real technicians near you right now". Degrades to a
 * static notice when Mapbox/WebGL is unavailable, same as TrackingMap.
 */
export default function NearbyTechniciansMap({ center, technicians, height = 420 }: { center: Point; technicians: NearbyTechnician[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const markers = useRef<MbMarker[]>([]);
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    if (!hasMapbox || !el.current) return;
    let cancelled = false;
    let map: MbMap | undefined;
    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !el.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const c = centerRef.current;
        map = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/streets-v12', center: [c.lng, c.lat], zoom: 12 });
        mapRef.current = map;
        new mapboxgl.Marker({ color: '#1366D6' }).setLngLat([c.lng, c.lat]).addTo(map);
      } catch {
        // WebGL/jsdom/load failure — the "unavailable" notice stays.
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw technician pins whenever the list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled) return;
      for (const m of markers.current) m.remove();
      markers.current = technicians.map((t) =>
        new mapboxgl.Marker({ color: '#0FB5A6' })
          .setLngLat([t.lng, t.lat])
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(t.name ?? 'فني'))
          .addTo(map),
      );
    })();
    return () => { cancelled = true; };
  }, [technicians]);

  if (!hasMapbox) {
    return (
      <div className="flex items-center justify-center rounded-xl" style={{ height, background: '#EEF2F7', color: '#94A3B8', fontSize: 13 }}>
        الخريطة غير متاحة
      </div>
    );
  }
  return <div ref={el} className="rounded-xl overflow-hidden" style={{ height, width: '100%' }} aria-label="الفنيون القريبون منك" />;
}

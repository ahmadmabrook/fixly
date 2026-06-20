import { useEffect, useRef } from 'react';
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox, AMMAN } from '../lib/mapbox';

export interface MapBooking {
  id: string;
  status: string;
  addressLat?: number | null;
  addressLng?: number | null;
  customer?: { name?: string } | null;
  service?: { nameAr?: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: '#1366D6', EN_ROUTE: '#0F766E', ARRIVED: '#0F766E', IN_PROGRESS: '#B45309',
  PENDING: '#64748B', COMPLETED: '#15803D', CANCELLED: '#B91C1C', DISPUTED: '#B91C1C',
};

/** Escape user-controlled text before it goes into Popup.setHTML (raw HTML sink).
 *  Customer name is user-supplied → without this it's a stored-XSS vector. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * Read-only live map of bookings with valid coordinates. Re-renders markers when
 * the booking set changes and fits the viewport to them. mapbox-gl is
 * dynamically imported; degrades to a notice without a token/WebGL.
 */
export default function BookingsMap({ bookings, height = 360 }: { bookings: MapBooking[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const gl = useRef<typeof mapboxgl | null>(null);
  const markers = useRef<MbMarker[]>([]);
  const readyRef = useRef(false);
  const bookingsRef = useRef(bookings);
  bookingsRef.current = bookings;

  function render() {
    const map = mapRef.current;
    const mapboxgl = gl.current;
    if (!map || !mapboxgl) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const pts = bookingsRef.current.filter((b) => b.addressLat != null && b.addressLng != null);
    const bounds = new mapboxgl.LngLatBounds();
    pts.forEach((b) => {
      const lng = b.addressLng as number;
      const lat = b.addressLat as number;
      const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
        `<div style="font-size:12px"><b>${esc(b.service?.nameAr ?? '')}</b><br/>${esc(b.customer?.name ?? '')}<br/>${esc(b.status)}</div>`,
      );
      const marker = new mapboxgl.Marker({ color: STATUS_COLOR[b.status] ?? '#64748B' })
        .setLngLat([lng, lat]).setPopup(popup).addTo(map);
      markers.current.push(marker);
      bounds.extend([lng, lat]);
    });
    if (pts.length === 1) map.flyTo({ center: [pts[0].addressLng as number, pts[0].addressLat as number], zoom: 13 });
    else if (pts.length > 1) map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
  }

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
        map = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/streets-v12', center: [AMMAN.lng, AMMAN.lat], zoom: 11 });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
        map.on('load', () => { readyRef.current = true; if (!cancelled) render(); });
      } catch {
        // WebGL/jsdom/load failure → notice stays.
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-render markers when the booking set changes (after the map is ready).
  useEffect(() => {
    if (readyRef.current) render();
  }, [bookings]);

  if (!hasMapbox) {
    return (
      <div className="flex items-center justify-center rounded-2xl" style={{ height, background: '#F1F5F9', color: '#94A3B8', fontSize: 13 }}>
        الخريطة غير متاحة — أضف رمز Mapbox.
      </div>
    );
  }
  return <div ref={el} className="rounded-2xl overflow-hidden" style={{ height, width: '100%' }} aria-label="خريطة الحجوزات" />;
}

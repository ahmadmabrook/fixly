import { useEffect, useRef } from 'react';
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, hasMapbox, AMMAN } from '../lib/mapbox';
import {
  COLOR_BRAND_PRIMARY,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_TEAL,
  COLOR_STATUS_WARNING,
  COLOR_SURFACE_MUTED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_SUBTLE,
} from '../lib/theme';

export interface MapBooking {
  id: string;
  status: string;
  addressLat?: number | null;
  addressLng?: number | null;
  customer?: { name?: string } | null;
  service?: { nameAr?: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: COLOR_BRAND_PRIMARY, EN_ROUTE: COLOR_STATUS_TEAL, ARRIVED: COLOR_STATUS_TEAL, IN_PROGRESS: COLOR_STATUS_WARNING,
  PENDING: COLOR_TEXT_MUTED, COMPLETED: COLOR_STATUS_SUCCESS, CANCELLED: COLOR_STATUS_DANGER, DISPUTED: COLOR_STATUS_DANGER,
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
  const mapboxglRef = useRef<typeof mapboxgl | null>(null);
  const markers = useRef<MbMarker[]>([]);
  const readyRef = useRef(false);
  const bookingsRef = useRef(bookings);
  bookingsRef.current = bookings;

  function render() {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
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
      const marker = new mapboxgl.Marker({ color: STATUS_COLOR[b.status] ?? COLOR_TEXT_MUTED })
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
        mapboxglRef.current = mapboxgl;
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
      <div className="flex items-center justify-center rounded-2xl" style={{ height, background: COLOR_SURFACE_MUTED, color: COLOR_TEXT_SUBTLE, fontSize: 13 }}>
        الخريطة غير متاحة — أضف رمز Mapbox.
      </div>
    );
  }
  return <div ref={el} className="rounded-2xl overflow-hidden" style={{ height, width: '100%' }} aria-label="خريطة الحجوزات" />;
}

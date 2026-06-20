import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Search, LocateFixed } from 'lucide-react';
import { MAPBOX_TOKEN, hasMapbox, AMMAN, forwardGeocode, reverseGeocode, type GeocodeResult } from '../lib/mapbox';

export interface AddressValue {
  address: string;
  lat: number;
  lng: number;
}

/**
 * Interactive address picker: draggable pin on a real Mapbox map + address
 * search (autocomplete) + "use my location". The pin is the source of truth for
 * lat/lng; the text field is auto-filled by reverse-geocoding and stays editable.
 * mapbox-gl is dynamically imported so it ships as its own chunk (not in the main
 * bundle), and the whole thing degrades to a plain address field when the token
 * is absent or WebGL is unavailable (SSR/tests).
 */
export default function MapAddressPicker({ value, onChange, height = 280 }: { value: AddressValue; onChange: (v: AddressValue) => void; height?: number }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const markerRef = useRef<MbMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);

  // Refs so the init effect can read the latest props without re-initialising.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  /** Move pin + map to a point and reverse-geocode it into the address field. */
  const applyPoint = useCallback(async (lng: number, lat: number, knownAddress?: string) => {
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
    const address = knownAddress ?? (await reverseGeocode(lng, lat)) ?? valueRef.current.address;
    onChangeRef.current({ address, lat, lng });
  }, []);

  // Initialise the map exactly once (dynamic import → separate chunk).
  useEffect(() => {
    if (!hasMapbox || !mapEl.current) return;
    let cancelled = false;
    let map: MbMap | undefined;
    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !mapEl.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const start = { lng: valueRef.current.lng || AMMAN.lng, lat: valueRef.current.lat || AMMAN.lat };
        map = new mapboxgl.Map({
          container: mapEl.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [start.lng, start.lat],
          zoom: 13,
          attributionControl: true,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
        const marker = new mapboxgl.Marker({ draggable: true, color: '#1366D6' }).setLngLat([start.lng, start.lat]).addTo(map);
        markerRef.current = marker;
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          void applyPoint(ll.lng, ll.lat);
        });
        map.on('click', (e) => void applyPoint(e.lngLat.lng, e.lngLat.lat));
        map.on('load', () => { if (!cancelled) setReady(true); });
      } catch {
        // WebGL/jsdom/load failure → leave the graceful fallback in place.
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Debounced address autocomplete (guarded against late resolves after unmount
  // or a newer keystroke).
  useEffect(() => {
    if (!hasMapbox || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const results = await forwardGeocode(query);
      if (active) setSuggestions(results);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => void applyPoint(pos.coords.longitude, pos.coords.latitude),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div>
      {/* Search + locate */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', insetInlineStart: 12, top: 13 }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن عنوان..."
              aria-label="ابحث عن عنوان"
              className="w-full h-11 rounded-xl border border-slate-200 outline-none"
              style={{ fontSize: 14, paddingInlineStart: 38, paddingInlineEnd: 12 }}
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            className="px-3 h-11 rounded-xl flex items-center gap-1 shrink-0"
            style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 13 }}
            aria-label="استخدم موقعي الحالي"
          >
            <LocateFixed size={16} /> موقعي
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden" role="listbox">
            {suggestions.map((s, i) => (
              <li key={`${s.lng},${s.lat},${i}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => { setQuery(''); setSuggestions([]); void applyPoint(s.lng, s.lat, s.address); }}
                  className="w-full text-start px-3 py-2 hover:bg-slate-50"
                  style={{ fontSize: 13 }}
                >
                  {s.address}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map (or graceful fallback note) */}
      {hasMapbox ? (
        <div className="mt-3 rounded-xl overflow-hidden relative" style={{ height }}>
          <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} aria-label="خريطة لتحديد الموقع" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#EEF2F7', color: '#94A3B8', fontSize: 13 }}>
              جارٍ تحميل الخريطة…
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 p-3 rounded-xl" style={{ background: '#FEF3C7', color: '#B45309', fontSize: 13 }}>
          الخريطة غير متاحة — أدخل عنوانك يدوياً أدناه.
        </p>
      )}

      {/* Always-present, editable address line (source for addressLine). */}
      <label htmlFor="addr-line" className="block mt-3" style={{ fontSize: 12, color: '#475569' }}>العنوان</label>
      <input
        id="addr-line"
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="اكتب عنوانك بالتفصيل (مبنى، شقة، علامة مميزة)"
        className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none"
        style={{ fontSize: 14 }}
      />
    </div>
  );
}

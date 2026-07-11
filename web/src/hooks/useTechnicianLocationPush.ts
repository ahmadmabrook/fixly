import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, BookingListItem } from '../lib/api';
import { getSharedSocket } from '../lib/socket';

// Same order-of-magnitude as the backend's write-through cooldown
// (LOCATION_WRITETHROUGH_COOLDOWN_SECONDS) — no point pinging more often
// than the server would persist it.
const PUSH_THROTTLE_MS = 10_000;
const TRACKABLE_STATUSES = ['EN_ROUTE', 'ARRIVED'];

/**
 * While a technician is marked available, periodically push their real
 * position via `POST /technician/location` (feeds dispatch matching + the
 * customer-facing "nearby technicians" map on Landing). If they currently
 * have a booking en route/arrived, the same position is also broadcast over
 * the booking's socket room so the customer's live TrackingMap moves.
 *
 * No-ops (and releases the geolocation watch) the moment `available` goes
 * false — never tracks an offline technician.
 */
export function useTechnicianLocationPush(available: boolean) {
  const lastPush = useRef(0);

  const { data: jobs } = useQuery({
    queryKey: ['tech-active'],
    queryFn: () => api.get<BookingListItem[]>('/bookings'),
    refetchInterval: 30_000,
    enabled: available,
  });
  const trackedBookingId = (jobs ?? []).find((b) => TRACKABLE_STATUSES.includes(b.status))?.id ?? null;

  useEffect(() => {
    if (!available || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPush.current < PUSH_THROTTLE_MS) return;
        lastPush.current = now;
        const { latitude: lat, longitude: lng } = pos.coords;
        void api.post('/technician/location', { lat, lng }).catch(() => undefined);
        if (trackedBookingId) {
          getSharedSocket()?.emit('location:update', { bookingId: trackedBookingId, lat, lng });
        }
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [available, trackedBookingId]);
}

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, BookingListItem, BookingStatus } from '../lib/api';
import { getSharedSocket } from '../lib/socket';
import { REALTIME_POLL_INTERVAL_MS } from '../lib/constants';

// Same order-of-magnitude as the backend's write-through cooldown
// (LOCATION_WRITETHROUGH_COOLDOWN_SECONDS) — no point pinging more often
// than the server would persist it.
const PUSH_THROTTLE_MS = 10_000;
const TRACKABLE_STATUSES: BookingStatus[] = ['EN_ROUTE', 'ARRIVED'];

// Must stay comfortably under the backend's HEARTBEAT_STALE_MS (30s —
// see backend/src/infrastructure/cache/redis.ts). `watchPosition` only
// fires its callback when the device reports a *new* GPS fix, which on a
// stationary technician (the common case while waiting for a job) can be
// minutes apart or never — so relying on it alone as the heartbeat let a
// technician's Redis GEO entry (and therefore every dispatch match) go
// silently stale seconds after they toggled "available", with no error or
// warning shown anywhere. This independent timer re-sends the last known
// fix on a fixed cadence regardless of whether the device reported a new
// one, so staying "available" always keeps the heartbeat alive.
const HEARTBEAT_PUSH_INTERVAL_MS = 15_000;

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
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ['tech-active'],
    queryFn: () => api.get<BookingListItem[]>('/bookings'),
    refetchInterval: REALTIME_POLL_INTERVAL_MS,
    enabled: available,
  });
  const trackedBookingId = (jobs ?? []).find((b) => TRACKABLE_STATUSES.includes(b.status))?.id ?? null;

  useEffect(() => {
    if (!available || !('geolocation' in navigator)) return;

    function push(lat: number, lng: number) {
      lastPush.current = Date.now();
      lastCoords.current = { lat, lng };
      void api.post('/technician/location', { lat, lng }).catch(() => undefined);
      if (trackedBookingId) {
        getSharedSocket()?.emit('location:update', { bookingId: trackedBookingId, lat, lng });
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastPush.current < PUSH_THROTTLE_MS) return;
        push(pos.coords.latitude, pos.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 },
    );

    // Heartbeat fallback: re-push the last known fix even without a new one,
    // so a stationary technician's Redis entry never goes stale on its own.
    const heartbeatId = setInterval(() => {
      if (lastCoords.current) push(lastCoords.current.lat, lastCoords.current.lng);
    }, HEARTBEAT_PUSH_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeatId);
    };
  }, [available, trackedBookingId]);
}

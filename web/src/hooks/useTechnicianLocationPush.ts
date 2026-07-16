import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, BookingListItem, BookingStatus } from '../lib/api';
import { getSharedSocket } from '../lib/socket';
import { LOCATION_PING_INTERVAL_MS, REALTIME_POLL_INTERVAL_MS } from '../lib/constants';

// The customer-facing live tracking map (TrackingMap) needs the technician's
// pin to visibly move on a steady cadence while EN_ROUTE, not just whenever a
// fresh GPS fix happens to arrive. The backend's write-through cooldown
// (LOCATION_WRITETHROUGH_COOLDOWN_SECONDS, 10s) only throttles the Postgres
// snapshot write — the Redis GEO write and the socket emit happen on every
// call regardless, so pushing this often is cheap server-side.
//
// The same cadence serves as the heartbeat. `watchPosition` only fires its
// callback when the device reports a *new* GPS fix, which on a stationary
// technician (the common case while waiting for a job) can be minutes apart or
// never — so relying on it alone as the heartbeat let a technician's Redis GEO
// entry (and therefore every dispatch match) go silently stale seconds after
// they toggled "available", with no error or warning shown anywhere. The
// interval below re-sends the last known fix regardless of whether the device
// reported a new one, so staying "available" always keeps the heartbeat alive.
const TRACKABLE_STATUSES: BookingStatus[] = ['EN_ROUTE', 'ARRIVED'];

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
        const { latitude, longitude } = pos.coords;
        // Record the freshest fix even when we're about to throttle this push.
        // Previously a throttled fix was dropped outright, so the heartbeat
        // firing moments later re-sent the *previous* position — a moving
        // technician's pin lagged reality by up to a full ping for no reason.
        lastCoords.current = { lat: latitude, lng: longitude };
        if (Date.now() - lastPush.current < LOCATION_PING_INTERVAL_MS) return;
        push(latitude, longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 },
    );

    // Heartbeat fallback: re-push the last known fix even without a new one,
    // so a stationary technician's Redis entry never goes stale on its own.
    const heartbeatId = setInterval(() => {
      if (lastCoords.current) push(lastCoords.current.lat, lastCoords.current.lng);
    }, LOCATION_PING_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeatId);
    };
  }, [available, trackedBookingId]);
}

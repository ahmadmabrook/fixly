import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// Cloudflare Pages proxies /api/* to the Fly backend (see web/functions/api/[[path]].ts)
// but has no equivalent route for /socket.io/* — an unmatched path there just falls
// through to the SPA's own index.html (Pages' client-side-routing fallback), so a
// same-origin socket connection silently "succeeds" against a 200 HTML response and
// never actually reaches the backend. Connect directly to the Fly origin instead.
// Unset in local dev, where vite.config.ts's dev-server proxy already forwards
// /socket.io to the backend same-origin.
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) || undefined;

interface BookingStatusEvent {
  bookingId: string;
  status: string;
  titleAr?: string;
  at: number;
}

let sharedSocket: Socket | null = null;
const statusListeners = new Map<string, Set<(s: string) => void>>();
// Notification listeners are kept in a module-level set so they survive socket
// re-creation (login/user-switch). The actual `notification:new` handler is
// (re)bound once per socket in getOrCreateSocket — this avoids the race where a
// consumer (e.g. the unread badge) subscribes *before* the socket exists or
// against a socket that is about to be torn down.
const notificationListeners = new Set<() => void>();
// Location listeners follow the same module-level pattern as notifications, and
// for the same reason: the customer's tracking page subscribes from a child
// effect, which React runs *before* BookingSocketProvider's own effect creates
// the socket. A listener bound to `getSharedSocket()` at subscribe time would
// therefore bind to `null` on a cold load of /tracking/:id (and to a dead
// instance after a user switch), silently never delivering a single ping.
const locationListeners = new Set<(e: LocationUpdateEvent) => void>();

interface LocationUpdateEvent {
  bookingId: string;
  lat: number;
  lng: number;
  at?: number;
}

/** Every booking room a live subscriber currently cares about. */
function subscribedBookingIds(): string[] {
  return [...statusListeners.keys()];
}

/** Lazily open a single socket for the whole app. We tear it down on logout. */
export function getOrCreateSocket(token: string): Socket {
  if (sharedSocket && sharedSocket.connected) return sharedSocket;
  if (sharedSocket) {
    sharedSocket.auth = { token };
    sharedSocket.connect();
    return sharedSocket;
  }
  sharedSocket = io(SOCKET_URL, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  // (Re)join every room a subscriber currently holds, on every `connect`. This
  // covers three cases with one rule: a subscription made before the handshake
  // completed, a subscription made before this socket even existed, and — the
  // one a queue of pending joins silently misses — a socket.io auto-reconnect
  // after a network drop, where the server has forgotten our room membership
  // but our subscribers are all still mounted and expecting events.
  sharedSocket.on('connect', () => {
    if (!sharedSocket) return;
    for (const bookingId of subscribedBookingIds()) sharedSocket.emit('booking:join', bookingId);
  });
  // Bind the notification fan-out once per socket. Consumers register via
  // subscribeToNotifications and are notified regardless of when they
  // subscribed relative to the socket's creation.
  sharedSocket.on('notification:new', () => {
    for (const cb of notificationListeners) cb();
  });
  // Same fan-out for technician location pings (see `locationListeners`).
  sharedSocket.on('location:update', (e: LocationUpdateEvent) => {
    for (const cb of locationListeners) cb(e);
  });
  return sharedSocket;
}

/**
 * Subscribe to `notification:new` events. Survives socket re-creation because
 * the listener lives in a module-level set, not on a specific Socket instance.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(cb: () => void): () => void {
  notificationListeners.add(cb);
  return () => {
    notificationListeners.delete(cb);
  };
}

export function disconnectSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
}

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

export function subscribeToStatus(bookingId: string, cb: (s: string) => void): () => void {
  let bucket = statusListeners.get(bookingId);
  if (!bucket) {
    bucket = new Set();
    statusListeners.set(bookingId, bucket);
  }
  bucket.add(cb);
  // Tell the server we're interested in this booking. If the socket isn't
  // connected yet (still handshaking, or not even created — see the `connect`
  // handler in getOrCreateSocket), membership is registered purely by this
  // entry in `statusListeners`, and the next `connect` joins the room for us.
  if (sharedSocket?.connected) {
    sharedSocket.emit('booking:join', bookingId);
  }
  const holder = bucket;
  return () => {
    holder.delete(cb);
    if (holder.size > 0) return;
    // Last subscriber for this booking left. Drop the entry unconditionally —
    // gating this on `connected` (as before) leaked an empty bucket forever
    // whenever the socket happened to be down at unmount, and, worse, left the
    // room in `subscribedBookingIds()` so the next reconnect re-joined a room
    // nobody was listening to.
    statusListeners.delete(bookingId);
    if (sharedSocket?.connected) sharedSocket.emit('booking:leave', bookingId);
  };
}

export function dispatchStatus(event: BookingStatusEvent) {
  const bucket = statusListeners.get(event.bookingId);
  if (!bucket) return;
  for (const cb of bucket) cb(event.status);
}

/**
 * Subscribe to a single booking's live status. Returns the most recent status
 * string (e.g. "EN_ROUTE") or null if no update has been received.
 *
 * Safe to call with a null bookingId — does nothing.
 */
export function useBookingSocket(bookingId: string | null): string | null {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!bookingId) {
      setStatus(null);
      return;
    }
    setStatus(null);
    const off = subscribeToStatus(bookingId, setStatus);
    return off;
  }, [bookingId]);
  return status;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  at: number;
}

/**
 * Subscribe to one booking's technician location pings. Survives socket
 * re-creation and pre-socket subscription for the same reason
 * subscribeToNotifications does (see `locationListeners`). Returns an
 * unsubscribe function.
 */
export function subscribeToLocation(bookingId: string, cb: (loc: LiveLocation) => void): () => void {
  const onLocation = (e: LocationUpdateEvent) => {
    // Pings for other bookings share the same fan-out — ignore them here.
    if (e.bookingId === bookingId) cb({ lat: e.lat, lng: e.lng, at: e.at ?? Date.now() });
  };
  locationListeners.add(onLocation);
  return () => {
    locationListeners.delete(onLocation);
  };
}

/**
 * Subscribe to the assigned technician's live location for a booking. Returns
 * the latest point, or null until the first ping.
 *
 * Room membership (booking:join / booking:leave) is owned by the ref-counted
 * status subscription (subscribeToStatus) — we reuse it here so that:
 *   - the room is reliably (re)joined, including across reconnects and when the
 *     socket is still handshaking on mount, and
 *   - we never emit a bare `booking:leave` that would yank the room out from
 *     under a still-active status listener (a race when both hooks unmount).
 */
export function useBookingLocation(bookingId: string | null): LiveLocation | null {
  const [loc, setLoc] = useState<LiveLocation | null>(null);
  useEffect(() => {
    if (!bookingId) {
      setLoc(null);
      return;
    }
    setLoc(null);
    // Hold the room open for the lifetime of this hook (no-op callback — we only
    // need the join/leave bookkeeping, not status updates).
    const releaseRoom = subscribeToStatus(bookingId, () => {});
    const unsubscribe = subscribeToLocation(bookingId, setLoc);
    return () => {
      unsubscribe();
      releaseRoom();
    };
  }, [bookingId]);
  return loc;
}

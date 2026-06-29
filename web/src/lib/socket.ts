import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

interface BookingStatusEvent {
  bookingId: string;
  status: string;
  titleAr?: string;
  at: number;
}

let sharedSocket: Socket | null = null;
const statusListeners = new Map<string, Set<(s: string) => void>>();
// Joins queued before the socket is connected — flushed on `connect`.
const pendingJoins: string[] = [];
// Notification listeners are kept in a module-level set so they survive socket
// re-creation (login/user-switch). The actual `notification:new` handler is
// (re)bound once per socket in getOrCreateSocket — this avoids the race where a
// consumer (e.g. the unread badge) subscribes *before* the socket exists or
// against a socket that is about to be torn down.
const notificationListeners = new Set<() => void>();

/** Lazily open a single socket for the whole app. We tear it down on logout. */
export function getOrCreateSocket(token: string): Socket {
  if (sharedSocket && sharedSocket.connected) return sharedSocket;
  if (sharedSocket) {
    sharedSocket.auth = { token };
    sharedSocket.connect();
    return sharedSocket;
  }
  sharedSocket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  // Flush any joins that arrived before the handshake completed. Without
  // this, a route that subscribed synchronously on mount would silently miss
  // every status event until the next re-render.
  sharedSocket.on('connect', () => {
    if (!sharedSocket) return;
    for (const bookingId of pendingJoins.splice(0)) {
      sharedSocket.emit('booking:join', bookingId);
    }
  });
  // Bind the notification fan-out once per socket. Consumers register via
  // subscribeToNotifications and are notified regardless of when they
  // subscribed relative to the socket's creation.
  sharedSocket.on('notification:new', () => {
    for (const cb of notificationListeners) cb();
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
  // Tell the server we're interested in this booking. If the socket is
  // still handshaking, queue the join and flush on `connect` (see
  // getOrCreateSocket) so a late-arriving component doesn't miss events.
  if (sharedSocket?.connected) {
    sharedSocket.emit('booking:join', bookingId);
  } else if (sharedSocket) {
    pendingJoins.push(bookingId);
  }
  return () => {
    bucket?.delete(cb);
    if (sharedSocket?.connected && bucket?.size === 0) {
      sharedSocket.emit('booking:leave', bookingId);
      statusListeners.delete(bookingId);
    }
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
 * Subscribe to the assigned technician's live location for a booking. Returns
 * the latest point, or null until the first ping.
 *
 * Room membership (booking:join / booking:leave) is owned by the ref-counted
 * status subscription (subscribeToStatus) — we reuse it here so that:
 *   - the room is reliably (re)joined, including across reconnects and when the
 *     socket is still handshaking on mount, and
 *   - we never emit a bare `booking:leave` that would yank the room out from
 *     under a still-active status listener (a race when both hooks unmount).
 * The location listener itself is keyed by bookingId so stale pings are ignored.
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
    const sock = getSharedSocket();
    const onLoc = (e: { bookingId: string; lat: number; lng: number; at?: number }) => {
      if (e.bookingId === bookingId) setLoc({ lat: e.lat, lng: e.lng, at: e.at ?? Date.now() });
    };
    sock?.on('location:update', onLoc);
    return () => {
      sock?.off('location:update', onLoc);
      releaseRoom();
    };
  }, [bookingId]);
  return loc;
}

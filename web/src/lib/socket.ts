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
  return sharedSocket;
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

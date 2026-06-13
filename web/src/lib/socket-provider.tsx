import { useEffect, type ReactNode } from 'react';
import { useAuth } from './store';
import { getOrCreateSocket, disconnectSocket, dispatchStatus } from './socket';

/**
 * Mounts the global socket for the lifetime of an authenticated session.
 * Disconnects on logout, and reconnects (with the new token) when the
 * user switches — otherwise a stale socket would still hold the previous
 * user's auth and could leak their `booking:status` events.
 */
export function BookingSocketProvider({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }
    // Always tear down the previous socket so the new token is picked up
    // by the handshake — never reuse a connection authenticated as a
    // different user.
    disconnectSocket();
    const sock = getOrCreateSocket(token);
    const onStatus = (e: { bookingId: string; status: string; at?: number; titleAr?: string }) => dispatchStatus({ ...e, at: e.at ?? Date.now() });
    sock.on('booking:status', onStatus);
    return () => {
      sock.off('booking:status', onStatus);
    };
  }, [token]);
  return <>{children}</>;
}

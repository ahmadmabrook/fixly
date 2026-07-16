import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the socket.io-client module BEFORE importing the hook.
const listeners: Record<string, Array<(e: unknown) => void>> = {};
const mockSocket = {
  connected: true,
  auth: {} as Record<string, unknown>,
  on: vi.fn((event: string, cb: (e: unknown) => void) => {
    (listeners[event] ??= []).push(cb);
  }),
  off: vi.fn((event: string, cb: (e: unknown) => void) => {
    listeners[event] = (listeners[event] ?? []).filter((c) => c !== cb);
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

import { useBookingSocket, useBookingLocation, getOrCreateSocket, disconnectSocket, getSharedSocket, dispatchStatus, subscribeToNotifications, subscribeToStatus } from './socket';
import { useAuth } from './store';

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  useAuth.getState().logout();
  disconnectSocket();
});

afterEach(() => {
  disconnectSocket();
});

describe('useBookingSocket', () => {
  it('returns null when bookingId is null', () => {
    const { result } = renderHook(() => useBookingSocket(null));
    expect(result.current).toBeNull();
  });

  it('joins the booking on mount and leaves on unmount', () => {
    // Seed the shared socket (the hook itself uses the cached one).
    getOrCreateSocket('seed');
    mockSocket.emit.mockClear();
    const { unmount } = renderHook(() => useBookingSocket('b-1'));
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:join', 'b-1');
    unmount();
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:leave', 'b-1');
  });

  it('updates the status when booking:status is dispatched', () => {
    getOrCreateSocket('seed');
    const { result } = renderHook(() => useBookingSocket('b-2'));
    expect(result.current).toBeNull();
    act(() => {
      dispatchStatus({ bookingId: 'b-2', status: 'EN_ROUTE', at: 1 });
    });
    expect(result.current).toBe('EN_ROUTE');
  });

  it('resets the status when bookingId becomes null', () => {
    getOrCreateSocket('seed');
    let id: string | null = 'b-3';
    const { result, rerender } = renderHook(() => useBookingSocket(id));
    act(() => dispatchStatus({ bookingId: 'b-3', status: 'CONFIRMED', at: 1 }));
    expect(result.current).toBe('CONFIRMED');
    id = null;
    rerender();
    expect(result.current).toBeNull();
  });
});

describe('booking room membership', () => {
  function fireConnect() {
    for (const cb of listeners['connect'] ?? []) cb(undefined);
  }

  it('joins the room on connect for a subscription made before the socket existed', () => {
    // The real cold-load ordering on /tracking/:id: React runs the page's own
    // effects (which subscribe) *before* BookingSocketProvider's effect, which is
    // what actually creates the socket. Nothing may be lost in that window.
    expect(getSharedSocket()).toBeNull();
    const unsub = subscribeToStatus('b-cold', () => {});
    getOrCreateSocket('tok');
    fireConnect();
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:join', 'b-cold');
    unsub();
  });

  it('re-joins every subscribed room on a later connect (auto-reconnect)', () => {
    getOrCreateSocket('tok');
    const unsub = subscribeToStatus('b-live', () => {});
    mockSocket.emit.mockClear();
    // socket.io reconnects after a network drop; the server has forgotten our
    // rooms, but our subscribers are all still mounted.
    fireConnect();
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:join', 'b-live');
    unsub();
  });

  it('stops re-joining a room once its last subscriber has left', () => {
    getOrCreateSocket('tok');
    subscribeToStatus('b-gone', () => {})();
    mockSocket.emit.mockClear();
    fireConnect();
    expect(mockSocket.emit).not.toHaveBeenCalledWith('booking:join', 'b-gone');
  });

  it('keeps the room while a second subscriber is still listening', () => {
    getOrCreateSocket('tok');
    const first = subscribeToStatus('b-shared', () => {});
    const second = subscribeToStatus('b-shared', () => {});
    first();
    expect(mockSocket.emit).not.toHaveBeenCalledWith('booking:leave', 'b-shared');
    mockSocket.emit.mockClear();
    fireConnect();
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:join', 'b-shared');
    second();
    expect(mockSocket.emit).toHaveBeenCalledWith('booking:leave', 'b-shared');
  });
});

describe('useBookingLocation', () => {
  function fireLocation(e: { bookingId: string; lat: number; lng: number; at?: number }) {
    for (const cb of listeners['location:update'] ?? []) cb(e);
  }

  it('delivers pings to a hook mounted before the socket existed', () => {
    // Same cold-load race as above. Binding to getSharedSocket() at mount time
    // (the previous implementation) bound to null here and the customer's car
    // never moved for the whole journey.
    const { result } = renderHook(() => useBookingLocation('b-1'));
    expect(result.current).toBeNull();
    getOrCreateSocket('tok');
    act(() => fireLocation({ bookingId: 'b-1', lat: 31.95, lng: 35.91, at: 42 }));
    expect(result.current).toEqual({ lat: 31.95, lng: 35.91, at: 42 });
  });

  it('ignores pings for a different booking', () => {
    getOrCreateSocket('tok');
    const { result } = renderHook(() => useBookingLocation('b-1'));
    act(() => fireLocation({ bookingId: 'b-other', lat: 1, lng: 2, at: 1 }));
    expect(result.current).toBeNull();
  });

  it('keeps delivering after the socket is re-created (user switch)', () => {
    getOrCreateSocket('user-A');
    const { result } = renderHook(() => useBookingLocation('b-1'));
    disconnectSocket();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    getOrCreateSocket('user-B');
    act(() => fireLocation({ bookingId: 'b-1', lat: 31.9, lng: 35.9, at: 7 }));
    expect(result.current).toEqual({ lat: 31.9, lng: 35.9, at: 7 });
  });

  it('stops listening on unmount', () => {
    getOrCreateSocket('tok');
    const { result, unmount } = renderHook(() => useBookingLocation('b-1'));
    unmount();
    act(() => fireLocation({ bookingId: 'b-1', lat: 9, lng: 9, at: 9 }));
    expect(result.current).toBeNull();
  });

  it('returns null and does not subscribe for a null bookingId', () => {
    getOrCreateSocket('tok');
    const { result } = renderHook(() => useBookingLocation(null));
    act(() => fireLocation({ bookingId: 'b-1', lat: 9, lng: 9, at: 9 }));
    expect(result.current).toBeNull();
  });
});

describe('subscribeToNotifications', () => {
  function fireNotification() {
    for (const cb of listeners['notification:new'] ?? []) cb(undefined);
  }

  it('notifies subscribers regardless of when they subscribe vs socket creation', () => {
    const fn = vi.fn();
    // Subscribe BEFORE the socket exists (the real-world race we are fixing).
    const unsub = subscribeToNotifications(fn);
    getOrCreateSocket('seed');
    fireNotification();
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    getOrCreateSocket('seed');
    const fn = vi.fn();
    const unsub = subscribeToNotifications(fn);
    fireNotification();
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    fireNotification();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-binds the handler when the socket is re-created (user switch)', () => {
    const fn = vi.fn();
    subscribeToNotifications(fn);
    getOrCreateSocket('user-A');
    fireNotification();
    expect(fn).toHaveBeenCalledTimes(1);
    // Simulate logout + new login → fresh socket, listener must still fire.
    disconnectSocket();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    getOrCreateSocket('user-B');
    fireNotification();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('socket connection URL', () => {
  // Cloudflare Pages has no proxy route for /socket.io/* (unlike /api/*), so a
  // same-origin connection silently hits the SPA's own index.html instead of the
  // backend. VITE_SOCKET_URL must be passed as the explicit connection target
  // when set; regression test for that wiring, not just relying on manual review.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('connects directly to VITE_SOCKET_URL when set, instead of same-origin', async () => {
    vi.stubEnv('VITE_SOCKET_URL', 'https://fixly.fly.dev');
    vi.resetModules();
    const { io: ioMock } = await import('socket.io-client');
    const fresh = await import('./socket');
    fresh.getOrCreateSocket('tok');
    expect(ioMock).toHaveBeenCalledWith('https://fixly.fly.dev', expect.objectContaining({ path: '/socket.io' }));
  });

  it('falls back to same-origin (no explicit URL) when VITE_SOCKET_URL is unset', async () => {
    vi.stubEnv('VITE_SOCKET_URL', '');
    vi.resetModules();
    const { io: ioMock } = await import('socket.io-client');
    const fresh = await import('./socket');
    fresh.getOrCreateSocket('tok');
    expect(ioMock).toHaveBeenCalledWith(undefined, expect.objectContaining({ path: '/socket.io' }));
  });
});

describe('getOrCreateSocket / disconnectSocket', () => {
  it('returns the same shared instance across calls while connected', () => {
    const a = getOrCreateSocket('tok-a');
    const b = getOrCreateSocket('tok-a');
    expect(a).toBe(b);
  });

  it('nulls out the shared socket on disconnect', () => {
    getOrCreateSocket('tok-b');
    expect(getSharedSocket()).toBe(mockSocket);
    disconnectSocket();
    expect(getSharedSocket()).toBeNull();
  });

  it('forces a new socket after disconnect so a new auth token is picked up', async () => {
    // First user
    const sock1 = getOrCreateSocket('user-A');
    expect(getSharedSocket()).toBe(sock1);
    // Logout → disconnect
    disconnectSocket();
    expect(getSharedSocket()).toBeNull();
    // Second user logs in: must NOT reuse the old connection. The io()
    // call must fire (proves a fresh handshake) — the token itself is
    // asserted at the provider level in BookingSocketProvider.test.tsx.
    const { io: ioMock } = await import('socket.io-client');
    const callsBefore = (ioMock as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    getOrCreateSocket('user-B');
    expect((ioMock as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(callsBefore + 1);
  });
});

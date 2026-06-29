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

import { useBookingSocket, getOrCreateSocket, disconnectSocket, getSharedSocket, dispatchStatus, subscribeToNotifications } from './socket';
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

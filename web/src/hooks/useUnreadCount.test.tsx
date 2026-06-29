import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock socket.io-client so getOrCreateSocket builds against a controllable fake.
const listeners: Record<string, Array<(e: unknown) => void>> = {};
const mockSocket = {
  connected: true,
  auth: {} as Record<string, unknown>,
  on: vi.fn((event: string, cb: (e: unknown) => void) => {
    (listeners[event] ??= []).push(cb);
  }),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: vi.fn(() => mockSocket) }));

import { useUnreadCount } from './useUnreadCount';
import { getOrCreateSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from '../lib/store';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function fireNotification() {
  for (const cb of listeners['notification:new'] ?? []) cb(undefined);
}

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  vi.clearAllMocks();
  localStorage.clear();
  useAuth.getState().logout();
  disconnectSocket();
});

afterEach(() => {
  vi.unstubAllGlobals();
  disconnectSocket();
});

describe('useUnreadCount', () => {
  it('returns 0 and does not fetch when unauthenticated', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper(qc) });
    expect(result.current).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the unread count from the { data: { meta } } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [], meta: { total: 5, unread: 3 } } }),
      })) as unknown as typeof fetch,
    );
    useAuth.getState().setTokens('tok', 'CUSTOMER');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('supports the flat { meta: { unread } } envelope shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ meta: { unread: 7 } }) })) as unknown as typeof fetch,
    );
    useAuth.getState().setTokens('tok', 'CUSTOMER');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(7));
  });

  it('returns 0 when the request fails (non-ok response)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch,
    );
    useAuth.getState().setTokens('tok', 'CUSTOMER');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('increments optimistically on a notification:new socket event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { items: [], meta: { total: 1, unread: 1 } } }),
      })) as unknown as typeof fetch,
    );
    useAuth.getState().setTokens('tok', 'CUSTOMER');
    getOrCreateSocket('tok'); // socket must exist so the handler is bound
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(1));
    act(() => fireNotification());
    await waitFor(() => expect(result.current).toBe(2));
  });
});

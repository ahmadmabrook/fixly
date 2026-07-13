import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTechnicianLocationPush } from './useTechnicianLocationPush';

vi.mock('../lib/socket', () => ({ getSharedSocket: () => null }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useTechnicianLocationPush', () => {
  let watchCallback: ((pos: { coords: { latitude: number; longitude: number } }) => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    watchCallback = null;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }) as unknown as Response));
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: vi.fn((success: typeof watchCallback) => {
          watchCallback = success;
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
  });

  afterEach(() => {
    // Unmount (which reads the still-stubbed navigator in its effect cleanup)
    // before tearing the stubs down, not after.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('re-pushes the last known position on a fixed heartbeat, even with no new GPS fix', async () => {
    renderHook(() => useTechnicianLocationPush(true), { wrapper });

    // Real GPS fix arrives once — no further watchPosition callbacks after this
    // (the stationary-technician case this test guards against).
    watchCallback!({ coords: { latitude: 31.95, longitude: 35.93 } });
    await vi.advanceTimersByTimeAsync(0);

    const postCallsAfterFix = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === '/api/v1/technician/location',
    ).length;
    expect(postCallsAfterFix).toBe(1);

    // No new watchPosition callback fires, but the heartbeat interval should
    // still re-send the last known coordinates so the backend's 30s Redis
    // staleness window (HEARTBEAT_STALE_MS) never lapses.
    await vi.advanceTimersByTimeAsync(15_000);
    const postCallsAfterHeartbeat = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === '/api/v1/technician/location',
    ).length;
    expect(postCallsAfterHeartbeat).toBe(2);

    await vi.advanceTimersByTimeAsync(15_000);
    const postCallsAfterSecondHeartbeat = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === '/api/v1/technician/location',
    ).length;
    expect(postCallsAfterSecondHeartbeat).toBe(3);
  });

  it('does not push anything before any GPS fix has ever arrived', async () => {
    renderHook(() => useTechnicianLocationPush(true), { wrapper });
    await vi.advanceTimersByTimeAsync(30_000);
    const postCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === '/api/v1/technician/location',
    ).length;
    expect(postCalls).toBe(0);
  });

  it('clears both the geolocation watch and the heartbeat interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useTechnicianLocationPush(true), { wrapper });
    unmount();
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

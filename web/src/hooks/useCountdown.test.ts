import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('returns null when no expiry is given', () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBeNull();
  });

  it('returns the initial remaining seconds and ticks down', () => {
    const expiresAt = new Date('2026-06-29T12:00:10.000Z').toISOString(); // +10s
    const { result } = renderHook(() => useCountdown(expiresAt));
    expect(result.current).toBe(10);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(7);
  });

  it('clamps to 0 once expired and stops ticking into negatives', () => {
    const expiresAt = new Date('2026-06-29T12:00:02.000Z').toISOString(); // +2s
    const { result } = renderHook(() => useCountdown(expiresAt));
    expect(result.current).toBe(2);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('handles an already-expired timestamp as 0', () => {
    const expiresAt = new Date('2026-06-29T11:59:50.000Z').toISOString(); // -10s
    const { result } = renderHook(() => useCountdown(expiresAt));
    expect(result.current).toBe(0);
  });

  it('clears the interval on unmount (no setState-after-unmount)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const expiresAt = new Date('2026-06-29T12:01:00.000Z').toISOString();
    const { unmount } = renderHook(() => useCountdown(expiresAt));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('recomputes when expiresAt changes', () => {
    const first = new Date('2026-06-29T12:00:05.000Z').toISOString(); // +5s
    const second = new Date('2026-06-29T12:00:30.000Z').toISOString(); // +30s
    const { result, rerender } = renderHook(({ exp }) => useCountdown(exp), {
      initialProps: { exp: first },
    });
    expect(result.current).toBe(5);
    act(() => {
      rerender({ exp: second });
    });
    expect(result.current).toBe(30);
  });
});

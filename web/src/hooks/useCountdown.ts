import { useState, useEffect } from 'react';

/**
 * Countdown hook that returns remaining seconds until `expiresAt`.
 * Ticks every second. Returns 0 once expired, or null if no expiry given.
 */
export function useCountdown(expiresAt: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!expiresAt) return null;
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }

    const target = new Date(expiresAt).getTime();

    const tick = () => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(left);
      return left;
    };

    tick();
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

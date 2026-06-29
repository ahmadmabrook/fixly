import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToNotifications } from '../lib/socket';
import { useAuth } from '../lib/store';

interface NotificationsEnvelope {
  items: unknown[];
  meta: { total: number; unread: number };
}

/**
 * Encapsulates the unread-notification count: fetches on mount via
 * GET /notifications and subscribes to the `notification:new` socket event
 * so the count updates in real-time without polling.
 *
 * Returns 0 when not authenticated.
 */
export function useUnreadCount(): number {
  const accessToken = useAuth((s) => s.accessToken);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await fetch('/api/v1/notifications', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) return 0;
      const body = (await res.json()) as { data?: NotificationsEnvelope; meta?: { unread: number } };
      // Support both envelope shapes: { data: { meta: { unread } } } and { meta: { unread } }
      return body.data?.meta?.unread ?? body.meta?.unread ?? 0;
    },
    enabled: !!accessToken,
    refetchInterval: 60_000,
  });

  // Subscribe to real-time notification events. Uses the module-level
  // subscription (not getSharedSocket().on) so it works regardless of whether
  // the socket exists yet — avoiding the child-before-parent effect-ordering
  // race where the socket is created after this component mounts.
  useEffect(() => {
    if (!accessToken) return;
    return subscribeToNotifications(() => {
      qc.setQueryData<number>(['notifications-unread'], (old) => (old ?? 0) + 1);
    });
  }, [accessToken, qc]);

  return data ?? 0;
}

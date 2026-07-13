import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToNotifications } from '../lib/socket';
import { useAuth } from '../lib/store';
import { api } from '../lib/api';

interface NotificationsEnvelope {
  items: unknown[];
  meta: { total: number; unread: number };
}

/** Safety-net refresh in case the `notification:new` socket event is missed
 *  (e.g. a brief disconnect) — the socket subscription below is the primary
 *  update path, so this can be slow. */
const UNREAD_COUNT_FALLBACK_POLL_MS = 60_000;

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
      const res = await api.get<NotificationsEnvelope>('/notifications?limit=0');
      return res?.meta?.unread ?? 0;
    },
    enabled: !!accessToken,
    refetchInterval: UNREAD_COUNT_FALLBACK_POLL_MS,
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

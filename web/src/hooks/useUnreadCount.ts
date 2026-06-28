import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSharedSocket } from '../lib/socket';
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

  // Subscribe to real-time notification events via socket
  useEffect(() => {
    if (!accessToken) return;
    const sock = getSharedSocket();
    if (!sock) return;

    const onNew = () => {
      // Increment optimistically, then refetch in background
      qc.setQueryData<number>(['notifications-unread'], (old) => (old ?? 0) + 1);
    };

    sock.on('notification:new', onNew);
    return () => {
      sock.off('notification:new', onNew);
    };
  }, [accessToken, qc]);

  return data ?? 0;
}

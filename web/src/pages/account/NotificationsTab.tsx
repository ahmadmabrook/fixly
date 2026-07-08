import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Notification } from '../../lib/api';
import { Card, notify, SkeletonList } from '../../components/shared';

export function NotificationsTab() {
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Notification[]>('/notifications') });
  async function readAll() {
    try {
      await api.post('/notifications/read-all', {});
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر تحديث الإشعارات', 'error'); }
  }
  if (isLoading) return <SkeletonList count={4} rowHeight={64} />;
  return (
    <div className="space-y-3">
      {(items ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد إشعارات.</p>}
      {(items ?? []).some((n) => !n.isRead) && (
        <button onClick={() => void readAll()} style={{ color: '#1366D6', fontSize: 13, fontWeight: 600 }}>تعليم الكل كمقروء</button>
      )}
      {(items ?? []).map((n) => (
        <Card key={n.id} className="p-4" style={{ background: n.isRead ? '#FFF' : '#F0F7FF' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{n.titleAr}</div>
          <div style={{ color: '#475569', fontSize: 13, marginTop: 2 }}>{n.bodyAr}</div>
          <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('ar-JO')}</div>
        </Card>
      ))}
    </div>
  );
}

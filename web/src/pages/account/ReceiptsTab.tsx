import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, AdditionalWorkItem } from '../../lib/api';
import { Card, notify, SkeletonList, StatusBadge } from '../../components/shared';
import { useBookings } from '../../hooks/useBookings';
import { downloadReceipt, type FullBooking } from '../BookingDetail';

export function ReceiptsTab() {
  const { data: bookings, isLoading } = useBookings();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const completed = (bookings ?? []).filter((b) => b.status === 'COMPLETED');

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const [full, extra] = await Promise.all([
        api.get<FullBooking>(`/bookings/${id}`),
        api.get<AdditionalWorkItem[]>(`/bookings/${id}/additional-work`),
      ]);
      const approvedExtras = extra.filter((e) => e.status === 'APPROVED');
      downloadReceipt(full, approvedExtras);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر تحميل الإيصال', 'error');
    } finally {
      setDownloadingId(null);
    }
  }

  if (isLoading) return <SkeletonList count={4} rowHeight={72} />;
  return (
    <div className="space-y-3">
      {completed.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد فواتير بعد.</p>}
      {completed.map((b) => (
        <Card key={b.id} className="p-4 flex items-center gap-3">
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{b.service?.nameAr}</div>
            <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('ar-JO') : '—'}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13, color: '#0E4FA8' }}>{Number(b.totalJod)} دينار</span>
              <StatusBadge status={b.status} />
            </div>
          </div>
          <button
            onClick={() => void handleDownload(b.id)}
            disabled={downloadingId === b.id}
            aria-label="تنزيل الإيصال"
            className="flex items-center gap-1.5 px-4 h-10 rounded-xl shrink-0 disabled:opacity-50"
            style={{ background: '#F1F5F9', color: '#1366D6', fontWeight: 700, fontSize: 13 }}
          >
            <Download size={16} /> تنزيل
          </button>
        </Card>
      ))}
    </div>
  );
}

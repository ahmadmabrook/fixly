import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlayCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, notify, Pagination, Pill } from '../components/shared';

interface QuoteItem {
  id: string;
  status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  videoUrl: string;
  description: string | null;
  quotedJod: string | number | null;
  createdAt: string;
  service?: { nameAr?: string | null };
  customer?: { name?: string | null; phone?: string | null };
}

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['PENDING', 'بانتظار التسعير'], ['QUOTED', 'مُسعّر'], ['ACCEPTED', 'مقبول'],
];
const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  PENDING: { ar: 'بانتظار التسعير', bg: '#FEF3C7', fg: '#B45309' },
  QUOTED: { ar: 'مُسعّر', bg: '#DCFCE7', fg: '#15803D' },
  ACCEPTED: { ar: 'مقبول', bg: '#DBEAFE', fg: '#1366D6' },
  DECLINED: { ar: 'مرفوض', bg: '#FEE2E2', fg: '#B91C1C' },
  EXPIRED: { ar: 'منتهٍ', bg: '#E2E8F0', fg: '#475569' },
};

export default function Quotes() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-quotes', status, page],
    queryFn: () => api.list<QuoteItem>(`/quotes?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const setQuote = useMutation({
    mutationFn: ({ id, quotedJod }: { id: string; quotedJod: string }) => api.post(`/quotes/${id}/quote`, { quotedJod }),
    onSuccess: () => { notify('تم تسعير الطلب', 'success'); void qc.invalidateQueries({ queryKey: ['admin-quotes'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>طلبات الفحص المرئي</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>راجع فيديو المشكلة وحدّد سعراً ثابتاً — يصبح سعر الحجز عند القبول.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? '#1366D6' : '#FFF', color: status === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0' }}>{label}</button>
        ))}
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {!isLoading && items.length === 0 && <Card><EmptyState message="لا توجد طلبات" /></Card>}
      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((q) => (
            <Card key={q.id} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontFamily: 'Inter', fontWeight: 700 }}>{q.id.slice(0, 8)}</div>
                  <div style={{ color: '#64748B', fontSize: 12 }}>{q.customer?.name ?? '—'}</div>
                </div>
                <Pill label={STATUS_PILL[q.status]?.ar ?? q.status} bg={STATUS_PILL[q.status]?.bg ?? '#E2E8F0'} fg={STATUS_PILL[q.status]?.fg ?? '#475569'} />
              </div>
              <div className="mt-3" style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{q.service?.nameAr ?? '—'}</span>
                {q.description && <span style={{ color: '#64748B' }}> — {q.description}</span>}
              </div>
              {q.videoUrl.startsWith('https://') ? (
                <a href={q.videoUrl} target="_blank" rel="noreferrer" className="mt-3 w-full aspect-video rounded-lg flex items-center justify-center" style={{ background: '#0F172A' }}>
                  <PlayCircle size={40} color="#FFF" />
                </a>
              ) : (
                <div className="mt-3 w-full aspect-video rounded-lg flex items-center justify-center" style={{ background: '#F1F5F9', color: '#94A3B8', fontSize: 13 }}>لا يوجد فيديو</div>
              )}
              {q.status === 'PENDING' ? (
                <div className="mt-3 flex gap-2 items-center">
                  <input
                    value={prices[q.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [q.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                    placeholder="دينار"
                    className="h-9 flex-1 rounded-lg border border-slate-200 px-2"
                    style={{ fontSize: 13, direction: 'ltr' }}
                  />
                  <ActionBtn
                    onClick={() => { const v = prices[q.id]; if (v && Number(v) > 0) setQuote.mutate({ id: q.id, quotedJod: v }); }}
                    disabled={setQuote.isPending || !(Number(prices[q.id]) > 0)}
                  >تسعير</ActionBtn>
                </div>
              ) : (
                <div className="mt-3" style={{ fontSize: 14, fontWeight: 700, color: '#15803D' }}>
                  {q.quotedJod != null ? `السعر الثابت: ${Number(q.quotedJod)} دينار` : '—'}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
    </div>
  );
}

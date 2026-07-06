import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, notify, Pagination } from '../components/shared';

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
const STATUS_LABEL: Record<string, string> = { PENDING: 'بانتظار التسعير', QUOTED: 'مُسعّر', ACCEPTED: 'مقبول', DECLINED: 'مرفوض', EXPIRED: 'منتهٍ' };

export default function Quotes() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-quotes', status, page],
    queryFn: () => api.list<QuoteItem>(`/admin/quotes?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const setQuote = useMutation({
    mutationFn: ({ id, quotedJod }: { id: string; quotedJod: string }) => api.post(`/admin/quotes/${id}/quote`, { quotedJod }),
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

      <Card>
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && <EmptyState message="لا توجد طلبات" />}
        {!isLoading && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>العميل</Th><Th>الخدمة</Th><Th>الوصف</Th><Th>الفيديو</Th><Th>الحالة</Th><Th>التسعير</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <Td>{q.customer?.name ?? '—'}</Td>
                  <Td>{q.service?.nameAr ?? '—'}</Td>
                  <Td><span style={{ color: '#64748B' }}>{(q.description ?? '').slice(0, 40)}</span></Td>
                  <Td>{q.videoUrl.startsWith('https://') ? <a href={q.videoUrl} target="_blank" rel="noreferrer" style={{ color: '#1366D6', fontSize: 13 }}>مشاهدة</a> : '—'}</Td>
                  <Td><span style={{ fontSize: 12, fontWeight: 600 }}>{STATUS_LABEL[q.status]}</span></Td>
                  <Td>
                    {q.status === 'PENDING' ? (
                      <div className="flex gap-2 items-center">
                        <input
                          value={prices[q.id] ?? ''}
                          onChange={(e) => setPrices((p) => ({ ...p, [q.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                          placeholder="دينار"
                          className="h-9 w-24 rounded-lg border border-slate-200 px-2"
                          style={{ fontSize: 13, direction: 'ltr' }}
                        />
                        <ActionBtn
                          onClick={() => { const v = prices[q.id]; if (v && Number(v) > 0) setQuote.mutate({ id: q.id, quotedJod: v }); }}
                          disabled={setQuote.isPending || !(Number(prices[q.id]) > 0)}
                        >تسعير</ActionBtn>
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'Inter', fontWeight: 700, color: '#0E4FA8' }}>{q.quotedJod != null ? `${Number(q.quotedJod)} JD` : '—'}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>
    </div>
  );
}

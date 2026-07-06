import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination } from '../components/shared';

interface ConductItem {
  id: string;
  kind: string;
  details: string | null;
  status: 'OPEN' | 'REVIEWING' | 'UPHELD' | 'DISMISSED';
  createdAt: string;
  reporter?: { name?: string | null; phone?: string | null };
  subjectTech?: { id: string; user?: { name?: string | null } } | null;
}

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['UPHELD', 'مؤكد'], ['DISMISSED', 'مرفوض'],
];
const KIND_LABEL: Record<string, string> = {
  OFF_PLATFORM_SOLICIT: 'محاولة خارج المنصة', NO_SHOW: 'عدم حضور', QUALITY: 'جودة', SAFETY: 'سلامة', OTHER: 'أخرى',
};

export default function ConductReports() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ id: string; decision: 'UPHELD' | 'DISMISSED' } | null>(null);
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-conduct', status, page],
    queryFn: () => api.list<ConductItem>(`/admin/conduct-reports?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const resolve = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'UPHELD' | 'DISMISSED' }) => api.post(`/admin/conduct-reports/${id}/resolve`, { decision }),
    onSuccess: () => { notify('تم حسم البلاغ', 'success'); void qc.invalidateQueries({ queryKey: ['admin-conduct'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>بلاغات السلوك</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>تأكيد البلاغ يزيد عدّاد مخالفات الفني وقد يخفّض فئته.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? '#1366D6' : '#FFF', color: status === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0' }}>{label}</button>
        ))}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && <EmptyState message="لا توجد بلاغات" />}
        {!isLoading && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>النوع</Th><Th>المُبلِّغ</Th><Th>الفني</Th><Th>التفاصيل</Th><Th>الحالة</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><span style={{ fontWeight: 600 }}>{KIND_LABEL[r.kind] ?? r.kind}</span></Td>
                  <Td>{r.reporter?.name ?? '—'}</Td>
                  <Td>{r.subjectTech?.user?.name ?? '—'}</Td>
                  <Td><span style={{ color: '#64748B' }}>{(r.details ?? '').slice(0, 50)}</span></Td>
                  <Td>{r.status}</Td>
                  <Td>
                    {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                      <div className="flex gap-2">
                        <ActionBtn onClick={() => setConfirm({ id: r.id, decision: 'UPHELD' })} disabled={resolve.isPending}>تأكيد</ActionBtn>
                        <button onClick={() => setConfirm({ id: r.id, decision: 'DISMISSED' })} disabled={resolve.isPending} className="px-3 rounded-lg" style={{ background: '#F1F5F9', color: '#475569', fontSize: 12, fontWeight: 600 }}>رفض</button>
                      </div>
                    ) : <span style={{ color: '#94A3B8', fontSize: 12 }}>محسوم</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.decision === 'UPHELD' ? 'تأكيد البلاغ' : 'رفض البلاغ'}
        body={confirm?.decision === 'UPHELD' ? 'سيُحتسب على الفني مخالفة قد تؤدي لتخفيض فئته أو إيقافه.' : 'سيُغلق البلاغ دون أثر على الفني.'}
        confirmLabel={confirm?.decision === 'UPHELD' ? 'تأكيد' : 'رفض'}
        cancelLabel="إلغاء"
        confirmVariant={confirm?.decision === 'UPHELD' ? 'danger' : 'primary'}
        onConfirm={() => { if (confirm) resolve.mutate(confirm); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

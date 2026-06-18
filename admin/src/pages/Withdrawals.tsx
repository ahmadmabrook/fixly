import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WithdrawalItem } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, StatusBadge, notify, Pagination } from '../components/shared';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['REQUESTED', 'مطلوب'], ['PROCESSING', 'قيد المعالجة'], ['PAID', 'مدفوع'], ['REJECTED', 'مرفوض'],
];

export default function Withdrawals() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals', status, page],
    queryFn: () => api.list<WithdrawalItem>(`/withdrawals?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const process = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'PAID' | 'REJECTED' }) => api.post(`/withdrawals/${id}/process`, { decision }),
    onSuccess: () => { notify('تم التحديث', 'success'); void qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>طلبات سحب الفنيين</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>معالجة طلبات سحب أرصدة الفنيين.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? '#1366D6' : '#FFF', color: status === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0' }}>{label}</button>
        ))}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && <EmptyState message="لا توجد طلبات" />}
        {!isLoading && items.length > 0 && (
          <TableWrapper>
            <thead><tr style={{ background: '#F8FAFC' }}><Th>الفني</Th><Th>المبلغ</Th><Th>IBAN</Th><Th>الحالة</Th><Th>إجراء</Th></tr></thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <Td>{w.technician?.user?.name ?? '—'}</Td>
                  <Td><span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{Number(w.amountJod)} د</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 12, direction: 'ltr', display: 'inline-block' }}>{w.iban ?? '—'}</span></Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td>
                    {(w.status === 'REQUESTED' || w.status === 'PROCESSING') && (
                      <div className="flex gap-2">
                        <ActionBtn onClick={() => process.mutate({ id: w.id, decision: 'PAID' })} disabled={process.isPending}>دفع</ActionBtn>
                        <button onClick={() => process.mutate({ id: w.id, decision: 'REJECTED' })} disabled={process.isPending} className="px-3 rounded-lg" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>رفض</button>
                      </div>
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

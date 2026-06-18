import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PayoutItem } from '../lib/api';
import { Card, StatusBadge, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination } from '../components/shared';

const STATUSES = ['', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const STATUS_LABELS: Record<string, string> = { '': 'الكل', PENDING: 'معلّق', PROCESSING: 'قيد المعالجة', COMPLETED: 'مكتمل', FAILED: 'فشل' };

export default function Payouts() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;
  const [confirmPayout, setConfirmPayout] = useState<PayoutItem | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-payouts', status, page],
    queryFn: () => {
      // Always send limit/offset: the API caps unpaginated lists at 50, so
      // without this the admin can never see/process payouts beyond the first
      // page (a real operational gap when the PENDING queue is long).
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (status) params.set('status', status);
      return api.list<PayoutItem>(`/payouts?${params}`);
    },
  });

  const process = useMutation({
    mutationFn: (id: string) => api.post<PayoutItem>(`/payouts/${id}/process`),
    onSuccess: () => {
      notify('تمت معالجة الدفعة بنجاح', 'success');
      void qc.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: () => notify('فشلت معالجة الدفعة', 'error'),
  });

  const payouts = data?.items ?? [];
  const total = data?.total ?? 0;

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>المدفوعات</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            إدارة مدفوعات الفنيين {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(0); }}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: status === s ? '#1366D6' : '#E2E8F0',
                color: status === s ? '#FFF' : '#475569',
                transition: 'all .15s',
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل المدفوعات" />}
        {!isLoading && !isError && payouts.length === 0 && <EmptyState message="لا توجد مدفوعات" />}
        {!isLoading && !isError && payouts.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>المعرف</Th>
                <Th>الفني</Th>
                <Th>المبلغ</Th>
                <Th>تاريخ الإنشاء</Th>
                <Th>تاريخ المعالجة</Th>
                <Th>الحالة</Th>
                <Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 12, color: '#94A3B8' }}>{p.id.slice(0, 8)}…</span></Td>
                  <Td>{p.technician?.user?.name ?? '—'}</Td>
                  <Td>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700, color: '#0E4FA8' }}>
                      {Number(p.amountJod).toFixed(2)} JD
                    </span>
                  </Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(p.createdAt)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{p.processedAt ? fmt(p.processedAt) : '—'}</span></Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td>
                    {p.status === 'PENDING' && (
                      <ActionBtn
                        onClick={() => setConfirmPayout(p)}
                        disabled={process.isPending}
                        data-testid={`process-btn-${p.id}`}
                      >
                        معالجة
                      </ActionBtn>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        <Pagination page={page} total={total} limit={limit} onPage={setPage} />
      </Card>

      <ConfirmDialog
        open={confirmPayout !== null}
        title="تأكيد معالجة الدفعة"
        body={
          confirmPayout
            ? `سيتم تحويل ${Number(confirmPayout.amountJod).toFixed(2)} JD إلى ${confirmPayout.technician?.user?.name ?? 'الفني'}. لا يمكن التراجع عن هذا الإجراء.`
            : undefined
        }
        confirmLabel="معالجة وتحويل"
        cancelLabel="إلغاء"
        confirmVariant="primary"
        onConfirm={() => {
          if (confirmPayout) process.mutate(confirmPayout.id);
          setConfirmPayout(null);
        }}
        onCancel={() => setConfirmPayout(null)}
      />
    </div>
  );
}

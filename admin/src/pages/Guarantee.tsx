import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, GuaranteeAdminItem } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination } from '../components/shared';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['IN_REVIEW', 'قيد المراجعة'], ['RESOLVED', 'موافق'], ['REJECTED', 'مرفوض'],
];

function slaLabel(expiresAt: string): { text: string; color: string } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'تجاوز SLA', color: '#B91C1C' };
  const mins = Math.round(ms / 60000);
  return { text: `${mins} دقيقة متبقية`, color: mins < 30 ? '#B45309' : '#15803D' };
}

export default function Guarantee() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<GuaranteeAdminItem | null>(null);
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-guarantee', status, page],
    queryFn: () => api.list<GuaranteeAdminItem>(`/guarantee?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>تذاكر الضمان</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>مراجعة طلبات الضمان خلال مهلة الساعتين.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? '#1366D6' : '#FFF', color: status === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0' }}>{label}</button>
        ))}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && <EmptyState message="لا توجد تذاكر" />}
        {!isLoading && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>العميل</Th><Th>الخدمة</Th><Th>الوصف</Th><Th>الحالة</Th><Th>SLA</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const sla = slaLabel(t.expiresAt);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td>{t.booking?.customer?.name ?? '—'}</Td>
                    <Td>{t.booking?.service?.nameAr ?? '—'}</Td>
                    <Td><span style={{ color: '#64748B' }}>{(t.description ?? '').slice(0, 40)}</span></Td>
                    <Td>{t.status}</Td>
                    <Td><span style={{ color: sla.color, fontSize: 12, fontWeight: 600 }}>{(t.status === 'OPEN' || t.status === 'IN_REVIEW') ? sla.text : '—'}</span></Td>
                    <Td><ActionBtn onClick={() => setActive(t)}>مراجعة</ActionBtn></Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>

      {active && <ReviewDrawer ticket={active} onClose={() => setActive(null)} onDone={() => { setActive(null); void qc.invalidateQueries({ queryKey: ['admin-guarantee'] }); }} />}
    </div>
  );
}

function ReviewDrawer({ ticket, onClose, onDone }: { ticket: GuaranteeAdminItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [visit, setVisit] = useState('');
  // Pending confirmation for the customer-facing review decision.
  const [confirmDecision, setConfirmDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const review = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      api.post(`/guarantee/${ticket.id}/review`, { decision, adminNote: note.trim() || undefined, scheduledVisitAt: decision === 'APPROVED' && visit ? new Date(visit).toISOString() : undefined }),
    onSuccess: () => { notify('تم تحديث التذكرة', 'success'); onDone(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="h-full bg-white overflow-auto" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="p-6">
          <h2 style={{ fontWeight: 800, fontSize: 18 }}>مراجعة تذكرة الضمان</h2>
          <div className="mt-4 space-y-1" style={{ fontSize: 14 }}>
            <div><span style={{ color: '#64748B' }}>العميل:</span> {ticket.booking?.customer?.name}</div>
            <div><span style={{ color: '#64748B' }}>الخدمة:</span> {ticket.booking?.service?.nameAr}</div>
          </div>
          <p className="mt-4 p-3 rounded-lg" style={{ background: '#F8FAFC', fontSize: 14 }}>{ticket.description}</p>
          {ticket.mediaUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ticket.mediaUrls.filter((u) => u.startsWith('https://')).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: '#1366D6', fontSize: 13 }}>مرفق {i + 1}</a>)}
            </div>
          )}
          <label className="block mt-5" style={{ fontSize: 13, color: '#64748B' }}>ملاحظة للعميل</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
          <label className="block mt-4" style={{ fontSize: 13, color: '#64748B' }}>موعد زيارة مجانية (عند الموافقة)</label>
          <input type="datetime-local" value={visit} onChange={(e) => setVisit(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <div className="mt-6 flex gap-2">
            <ActionBtn onClick={() => setConfirmDecision('APPROVED')} disabled={review.isPending} data-testid="approve-guarantee-btn">موافقة + زيارة</ActionBtn>
            <button onClick={() => setConfirmDecision('REJECTED')} disabled={review.isPending} data-testid="reject-guarantee-btn" className="px-4 rounded-lg disabled:opacity-50" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>رفض</button>
            <button onClick={onClose} className="px-4 rounded-lg" style={{ color: '#64748B', fontSize: 12 }}>إغلاق</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDecision !== null}
        title={confirmDecision === 'APPROVED' ? 'تأكيد الموافقة على الضمان' : 'تأكيد رفض الضمان'}
        body={
          confirmDecision === 'APPROVED'
            ? `سيتم إبلاغ العميل بالموافقة${visit ? ' وجدولة زيارة مجانية' : ''}.`
            : 'سيتم إبلاغ العميل برفض طلب الضمان. تأكد من إضافة ملاحظة توضيحية.'
        }
        confirmLabel={confirmDecision === 'APPROVED' ? 'موافقة' : 'رفض'}
        cancelLabel="إلغاء"
        confirmVariant={confirmDecision === 'REJECTED' ? 'danger' : 'primary'}
        onConfirm={() => {
          if (confirmDecision) review.mutate(confirmDecision);
          setConfirmDecision(null);
        }}
        onCancel={() => setConfirmDecision(null)}
      />
    </div>
  );
}

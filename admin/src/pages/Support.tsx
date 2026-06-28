import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, SupportAdminItem } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination } from '../components/shared';
import { fmtJod } from '../lib/format';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['IN_PROGRESS', 'قيد المعالجة'], ['CLOSED', 'مغلق'],
];

export default function Support() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-support', status, page],
    queryFn: () => api.list<SupportAdminItem>(`/support?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>تذاكر الدعم</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>الرد على استفسارات العملاء.</p>
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
              <tr style={{ background: '#F8FAFC' }}><Th>العميل</Th><Th>الموضوع</Th><Th>رسائل</Th><Th>الحالة</Th><Th>إجراء</Th></tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>{t.user?.name ?? '—'}</Td>
                  <Td>{t.subject}</Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{t._count?.messages ?? 0}</span></Td>
                  <Td>{t.status}</Td>
                  <Td><ActionBtn onClick={() => setOpenId(t.id)}>فتح</ActionBtn></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>

      {openId && <ConversationDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ConversationDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: ticket } = useQuery({ queryKey: ['admin-support', id], queryFn: () => api.get<SupportAdminItem>(`/support/${id}`) });
  const [msg, setMsg] = useState('');
  const reply = useMutation({
    mutationFn: () => api.post(`/support/${id}/messages`, { body: msg.trim() }),
    onSuccess: () => { setMsg(''); void qc.invalidateQueries({ queryKey: ['admin-support', id] }); void qc.invalidateQueries({ queryKey: ['admin-support'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.post(`/support/${id}/status`, { status }),
    onSuccess: () => { notify('تم التحديث', 'success'); void qc.invalidateQueries({ queryKey: ['admin-support'] }); },
  });
  const [refundOpen, setRefundOpen] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [amount, setAmount] = useState('');
  const [refundConfirm, setRefundConfirm] = useState(false);
  const amountNum = Number(amount);
  const refundValid = bookingId.trim().length > 0 && amount !== '' && amountNum > 0;
  const refund = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId.trim()}/refund`, { amountJod: amount }),
    onSuccess: () => { notify('تم إصدار المبلغ المسترد', 'success'); setRefundOpen(false); setBookingId(''); setAmount(''); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر الاسترداد', 'error'),
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="h-full bg-white overflow-auto flex flex-col" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="p-5 border-b" style={{ borderColor: '#F1F5F9' }}>
          <h2 style={{ fontWeight: 800, fontSize: 17 }}>{ticket?.subject}</h2>
          <p style={{ color: '#64748B', fontSize: 13 }}>{ticket?.user?.name} • {ticket?.user?.phone}</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {(ticket?.messages ?? []).map((m) => (
            <div key={m.id} className={`max-w-[80%] p-3 rounded-2xl ${m.senderRole === 'ADMIN' ? 'ms-auto' : ''}`} style={{ background: m.senderRole === 'ADMIN' ? '#1366D6' : '#F1F5F9', color: m.senderRole === 'ADMIN' ? '#FFF' : '#0F172A', fontSize: 14 }}>{m.body}</div>
          ))}
        </div>
        <div className="p-4 border-t" style={{ borderColor: '#F1F5F9' }}>
          <div className="flex gap-2">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="اكتب رداً..." className="flex-1 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
            <ActionBtn onClick={() => reply.mutate()} disabled={!msg.trim() || reply.isPending}>إرسال</ActionBtn>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setStatus.mutate('CLOSED')} className="px-3 h-8 rounded-lg" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 12, fontWeight: 600 }}>إغلاق التذكرة</button>
            <button onClick={() => setRefundOpen((o) => !o)} className="px-3 h-8 rounded-lg" style={{ background: '#FEF3C7', color: '#B45309', fontSize: 12, fontWeight: 600 }}>استرداد</button>
            <button onClick={onClose} className="px-3 h-8 rounded-lg" style={{ color: '#64748B', fontSize: 12 }}>رجوع</button>
          </div>
          {refundOpen && (
            <div className="mt-2 p-3 rounded-xl" style={{ background: '#FFFBEB' }}>
              <input value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder="معرّف الحجز" className="w-full h-9 rounded-lg border border-slate-200 px-2 mb-2" style={{ fontSize: 12, direction: 'ltr' }} />
              <div className="flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="المبلغ (دينار)" className="flex-1 h-9 rounded-lg border border-slate-200 px-2" style={{ fontSize: 12, direction: 'ltr' }} />
                <button onClick={() => setRefundConfirm(true)} disabled={!refundValid || refund.isPending} data-testid="refund-confirm-btn" className="px-3 h-9 rounded-lg disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontSize: 12, fontWeight: 600 }}>تأكيد</button>
              </div>
              {amount !== '' && amountNum <= 0 && (
                <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>أدخل مبلغاً أكبر من صفر.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={refundConfirm}
        title="تأكيد إصدار مبلغ مسترد"
        body={`سيتم استرداد ${refundValid ? fmtJod(amountNum) : '—'} د للحجز ${bookingId.trim()}. حركة مالية لا يمكن التراجع عنها.`}
        confirmLabel="استرداد"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        onConfirm={() => {
          if (refundValid) refund.mutate();
          setRefundConfirm(false);
        }}
        onCancel={() => setRefundConfirm(false)}
      />
    </div>
  );
}

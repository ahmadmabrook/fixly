import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Wrench } from 'lucide-react';
import { api, BroadcastItem } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify } from '../components/shared';

const SEGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['ALL', 'الجميع'], ['CUSTOMERS', 'العملاء'], ['TECHNICIANS', 'الفنيون'],
];

export default function Broadcast() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('ALL');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: () => api.list<BroadcastItem>('/broadcasts?limit=50'),
  });

  // Real audience sizes for the estimated-reach panel (limit=1 — only the
  // paginated `meta.total` is needed, not the rows). No delivery-rate
  // tracking exists on the backend, so unlike the spec's fake "~92%
  // delivery" figure, only the real recipient count is shown.
  const { data: customersMeta } = useQuery({
    queryKey: ['admin-customers-count'],
    queryFn: () => api.list<{ id: string }>('/customers?limit=1'),
  });
  const { data: techniciansMeta } = useQuery({
    queryKey: ['admin-technicians-count'],
    queryFn: () => api.list<{ id: string }>('/technicians?limit=1'),
  });
  const audienceCount =
    segment === 'CUSTOMERS' ? customersMeta?.total
    : segment === 'TECHNICIANS' ? techniciansMeta?.total
    : (customersMeta?.total ?? 0) + (techniciansMeta?.total ?? 0);

  const send = useMutation({
    mutationFn: () => api.post('/broadcasts', { titleAr: title.trim(), bodyAr: body.trim(), segment }),
    onSuccess: () => {
      notify('تم إرسال الإشعار', 'success');
      setTitle(''); setBody('');
      void qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
    },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر الإرسال', 'error'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>إشعارات جماعية</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>أرسل إشعاراً لشريحة من المستخدمين.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>الرسالة</h3>
          <div>
            <label className="block" style={{ fontSize: 13, color: '#64748B' }}>الشريحة</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SEGMENTS.map(([k, label]) => (
                <button key={k} onClick={() => setSegment(k)} className="p-3 rounded-lg text-center" style={{ border: `2px solid ${segment === k ? '#1366D6' : '#E2E8F0'}`, background: segment === k ? '#E8F1FE' : '#FFF', color: '#0F172A', fontSize: 13, fontWeight: 600 }}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="broadcast-title" className="block" style={{ fontSize: 13, color: '#64748B' }}>العنوان</label>
            <input id="broadcast-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          </div>
          <div>
            <label htmlFor="broadcast-body" className="block" style={{ fontSize: 13, color: '#64748B' }}>النص</label>
            <textarea id="broadcast-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
          </div>
          <ActionBtn onClick={() => setConfirmOpen(true)} disabled={!title.trim() || !body.trim() || send.isPending} className="w-full justify-center">
            <span className="inline-flex items-center gap-1"><Send size={14} /> إرسال إلى {audienceCount != null ? audienceCount.toLocaleString('ar-JO') : '—'}</span>
          </ActionBtn>
        </Card>

        <Card className="p-5">
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>معاينة</h3>
          <div className="mt-4 mx-auto" style={{ width: 280 }}>
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#1366D6 0%,#0E4FA8 100%)', color: '#FFF' }}>
              <div className="flex items-center gap-2" style={{ fontSize: 12, opacity: 0.8 }}>
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><Wrench size={12} /></div>
                Fixly · الآن
              </div>
              <div className="mt-2" style={{ fontWeight: 700, fontSize: 14 }}>{title || '—'}</div>
              <div className="mt-1" style={{ fontSize: 12, opacity: 0.9 }}>{body || '—'}</div>
            </div>
            <div className="mt-3 p-3 rounded-lg" style={{ background: '#F1F5F9', fontSize: 12, color: '#64748B' }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4 }}>الوصول المتوقع</div>
              <div>{audienceCount != null ? `${audienceCount.toLocaleString('ar-JO')} مستخدم` : '—'}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#F1F5F9', fontWeight: 700, fontSize: 14 }}>السجل</div>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل سجل الإشعارات" />}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && <EmptyState message="لا توجد إشعارات مرسلة" />}
        {!isLoading && !isError && (data?.items.length ?? 0) > 0 && (
          <TableWrapper>
            <thead><tr style={{ background: '#F8FAFC' }}><Th>العنوان</Th><Th>الشريحة</Th><Th>المستلمون</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {(data?.items ?? []).map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td>{b.titleAr}</Td>
                  <Td>{SEGMENTS.find(([k]) => k === b.segment)?.[1] ?? b.segment}</Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{b.recipientCount}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 12, color: '#64748B' }}>{new Date(b.createdAt).toLocaleDateString('ar-JO')}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="إرسال الإشعار؟"
        body={`لا يمكن التراجع عن هذا الإجراء. سيتم إرسال "${title.trim()}" إلى شريحة ${SEGMENTS.find(([k]) => k === segment)?.[1] ?? segment}.`}
        confirmLabel="إرسال"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        onConfirm={() => {
          send.mutate();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

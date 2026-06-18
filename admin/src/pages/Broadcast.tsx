import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api, BroadcastItem } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, notify } from '../components/shared';

const SEGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['ALL', 'الجميع'], ['CUSTOMERS', 'العملاء'], ['TECHNICIANS', 'الفنيون'],
];

export default function Broadcast() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: () => api.list<BroadcastItem>('/broadcasts?limit=50'),
  });

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

      <Card className="p-6 max-w-xl space-y-3">
        <div>
          <label className="block" style={{ fontSize: 13, color: '#64748B' }}>الشريحة</label>
          <div className="mt-1 flex gap-2">
            {SEGMENTS.map(([k, label]) => (
              <button key={k} onClick={() => setSegment(k)} className="px-4 h-10 rounded-xl" style={{ background: segment === k ? '#1366D6' : '#F1F5F9', color: segment === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600 }}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block" style={{ fontSize: 13, color: '#64748B' }}>العنوان</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 13, color: '#64748B' }}>النص</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
        </div>
        {/* Preview */}
        {(title || body) && (
          <div className="p-3 rounded-xl" style={{ background: '#F0F7FF' }} dir="rtl">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{title || 'العنوان'}</div>
            <div style={{ color: '#475569', fontSize: 13 }}>{body || 'النص'}</div>
          </div>
        )}
        <ActionBtn onClick={() => send.mutate()} disabled={!title.trim() || !body.trim() || send.isPending}>
          <span className="inline-flex items-center gap-1"><Send size={14} /> إرسال</span>
        </ActionBtn>
      </Card>

      <Card>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#F1F5F9', fontWeight: 700, fontSize: 14 }}>السجل</div>
        {isLoading && <Spinner />}
        {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState message="لا توجد إشعارات مرسلة" />}
        {!isLoading && (data?.items.length ?? 0) > 0 && (
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
    </div>
  );
}

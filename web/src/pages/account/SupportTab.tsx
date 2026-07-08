import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, SupportTicketItem } from '../../lib/api';
import { Card, notify, FaqAccordion } from '../../components/shared';

const FAQ_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['كيف يتم الدفع؟', 'الدفع إلكتروني بالكامل عبر البطاقة عند تأكيد الحجز. يتم حجز المبلغ فور التأكيد ولا يُخصم فعلياً إلا بعد إتمام الخدمة.'],
  ['ما هو الضمان المشمول؟', 'كل خدمة مضمونة لمدة 30 يوماً من تاريخ إتمامها. إذا واجهت أي مشكلة متعلقة بالإصلاح خلال هذه المدة، افتح تذكرة ضمان وسنعيد الفني دون أي تكلفة إضافية.'],
  ['هل يمكنني إلغاء الحجز؟', 'يمكنك إلغاء الحجز قبل بدء الفني بالعمل، وسيتم إصدار المبلغ المسترد وفق سياسة الاسترجاع. بعد وصول الفني قد تُطبّق رسوم كشف.'],
  ['ماذا لو تأخر الفني؟', 'نراقب مواعيد الوصول عن كثب. إذا تأخر الفني بشكل ملحوظ عن الوقت المتوقع، قد تحصل على تعويض كرصيد خدمة تلقائياً.'],
];

export function SupportTab() {
  const qc = useQueryClient();
  const { data: tickets } = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportTicketItem[]>('/support') });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '' });
  async function create() {
    try {
      const t = await api.post<SupportTicketItem>('/support', { subject: form.subject.trim(), body: form.body.trim() });
      notify('تم إرسال طلب الدعم — الرد خلال 5 دقائق', 'success'); setCreating(false); setForm({ subject: '', body: '' });
      void qc.invalidateQueries({ queryKey: ['support'] }); setOpenId(t.id);
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  if (openId) return <SupportThread id={openId} onBack={() => setOpenId(null)} />;
  return (
    <div className="space-y-3">
      <p style={{ color: '#475569', fontSize: 13 }}>نحن هنا لمساعدتك 24/7 — الرد خلال 5 دقائق.</p>

      <div>
        <h2 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>الأسئلة الشائعة</h2>
        <FaqAccordion items={FAQ_ITEMS} />
      </div>

      {(tickets ?? []).map((t) => (
        <Card key={t.id} className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setOpenId(t.id)}>
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.subject}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{t.status === 'OPEN' ? 'مفتوح' : t.status === 'IN_PROGRESS' ? 'قيد المعالجة' : 'مغلق'}</div>
          </div>
        </Card>
      ))}
      {creating ? (
        <Card className="p-4 space-y-2">
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="الموضوع" aria-label="موضوع تذكرة الدعم" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="كيف يمكننا مساعدتك؟" aria-label="وصف مشكلة الدعم" rows={3} className="w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
          <div className="flex gap-2">
            <button onClick={() => void create()} disabled={!form.subject.trim() || !form.body.trim()} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
            <button onClick={() => setCreating(false)} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> تذكرة دعم جديدة
        </button>
      )}
    </div>
  );
}

function SupportThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: ticket } = useQuery({ queryKey: ['support', id], queryFn: () => api.get<SupportTicketItem>(`/support/${id}`) });
  const [msg, setMsg] = useState('');
  async function send() {
    if (!msg.trim()) return;
    try {
      await api.post(`/support/${id}/messages`, { body: msg.trim() });
      setMsg('');
      void qc.invalidateQueries({ queryKey: ['support', id] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر إرسال الرسالة', 'error'); }
  }
  return (
    <div>
      <button onClick={onBack} style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>← رجوع</button>
      <h2 className="mt-2" style={{ fontWeight: 700, fontSize: 16 }}>{ticket?.subject}</h2>
      <div className="mt-3 space-y-2">
        {(ticket?.messages ?? []).map((m) => (
          <div key={m.id} className={`max-w-[80%] p-3 rounded-2xl ${m.senderRole === 'CUSTOMER' ? 'ms-auto' : ''}`}
            style={{ background: m.senderRole === 'CUSTOMER' ? '#1366D6' : '#F1F5F9', color: m.senderRole === 'CUSTOMER' ? '#FFF' : '#0F172A', fontSize: 14 }}>
            {m.body}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="اكتب رسالتك..." aria-label="رسالة الدعم" className="flex-1 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
        <button onClick={() => void send()} className="px-4 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
      </div>
    </div>
  );
}

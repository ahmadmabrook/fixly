import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { api, SupportAdminItem } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, ActionBtn, ConfirmDialog, notify, Pill } from '../components/shared';
import { fmtJod } from '../lib/format';
import { extractBookingId } from '../lib/extractBookingId';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_BRAND_PRIMARY_TINT,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_INFO_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WARNING_SOFT_BG,
  COLOR_WHITE,
} from '../lib/theme';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['IN_PROGRESS', 'قيد المعالجة'], ['CLOSED', 'مغلق'],
];
const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  OPEN: { ar: 'مفتوح', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  IN_PROGRESS: { ar: 'قيد المعالجة', bg: COLOR_STATUS_INFO_BG, fg: COLOR_BRAND_PRIMARY },
  CLOSED: { ar: 'مغلق', bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
};
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['QUALITY', 'جودة'], ['DELAY', 'تأخير'], ['PRICING', 'تسعير'], ['BEHAVIOR', 'سلوك'], ['SAFETY', 'سلامة'], ['OTHER', 'أخرى'],
];
const MACROS = [
  'مرحباً، شكراً لتواصلك. كيف يمكنني مساعدتك؟',
  'الفني في الطريق ويمكنك تتبّعه من صفحة الحجز.',
  'تم إصدار المبلغ المسترد، وسيصل خلال 3–5 أيام عمل.',
  'نعتذر عن الإزعاج، سنعالج الأمر فوراً.',
];

export default function Support() {
  const [status, setStatus] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-support', status],
    queryFn: () => api.list<SupportAdminItem>(`/support?${status ? `status=${status}&` : ''}limit=100`),
  });
  const items = data?.items ?? [];
  const active = activeId ?? items[0]?.id ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>تذاكر الدعم</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>الرد على استفسارات العملاء.</p>
        </div>
        <div className="flex gap-2">
          {STATUS_TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setStatus(k); setActiveId(null); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? COLOR_BRAND_PRIMARY : COLOR_WHITE, color: status === k ? COLOR_WHITE : COLOR_TEXT_SECONDARY, fontSize: 13, fontWeight: 600, border: `1px solid ${COLOR_BORDER_LIGHT}` }}>{label}</button>
          ))}
        </div>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل تذاكر الدعم" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد تذاكر" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-3 gap-4" style={{ height: 600 }}>
          <Card className="overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b" style={{ borderColor: COLOR_SURFACE_MUTED }}>
              <h3 style={{ fontWeight: 700, fontSize: 14 }}>صندوق الوارد · {items.length}</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className="w-full px-4 py-3 flex items-center gap-2 border-b text-start"
                  style={{ borderColor: COLOR_SURFACE_MUTED, background: t.id === active ? COLOR_BRAND_PRIMARY_TINT : COLOR_WHITE }}
                >
                  <Avatar name={t.user?.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontWeight: 700, fontSize: 13 }} className="truncate">{t.user?.name ?? t.user?.phone ?? '—'}</span>
                      {t.escalatedAt && <Flag size={12} color={COLOR_STATUS_DANGER} aria-label="مصعّدة" />}
                    </div>
                    <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }} className="truncate mt-0.5">{t.subject}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
          <div className="col-span-2">
            {active && <ConversationPanel key={active} id={active} onChanged={() => void qc.invalidateQueries({ queryKey: ['admin-support'] })} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data: ticket, isError: ticketError } = useQuery({ queryKey: ['admin-support', id], queryFn: () => api.get<SupportAdminItem>(`/support/${id}`) });
  const [msg, setMsg] = useState('');
  const [showMacros, setShowMacros] = useState(false);

  const reply = useMutation({
    mutationFn: () => api.post(`/support/${id}/messages`, { body: msg.trim() }),
    onSuccess: () => { setMsg(''); void qc.invalidateQueries({ queryKey: ['admin-support', id] }); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.post(`/support/${id}/status`, { status }),
    onSuccess: () => { notify('تم التحديث', 'success'); void qc.invalidateQueries({ queryKey: ['admin-support', id] }); onChanged(); },
  });
  const setCategory = useMutation({
    mutationFn: (category: string) => api.post(`/support/${id}/category`, { category }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-support', id] }); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const escalate = useMutation({
    mutationFn: () => api.post(`/support/${id}/escalate`),
    onSuccess: () => { notify('تم التصعيد لمسؤول العمليات', 'success'); void qc.invalidateQueries({ queryKey: ['admin-support', id] }); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const [refundOpen, setRefundOpen] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [amount, setAmount] = useState('');
  // True while the bookingId field still holds the auto-extracted value
  // untouched by the admin. Drives a "verify this" warning on a money action.
  const [bookingIdAutofilled, setBookingIdAutofilled] = useState(false);

  // Auto-fill bookingId from ticket messages if a UUID pattern is found.
  // NOTE: this is only a *convenience hint* (see extractBookingId). A
  // mis-extracted ID must never silently drive a refund — the admin still
  // edits the field and must pass the confirm dialog, which surfaces an
  // auto-fill warning.
  const inferredBookingId = useMemo(() => extractBookingId(ticket?.messages), [ticket?.messages]);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const amountNum = Number(amount);
  const refundValid = bookingId.trim().length > 0 && amount !== '' && amountNum > 0;
  const refund = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId.trim()}/refund`, { amountJod: amount }),
    onSuccess: () => { notify('تم إصدار المبلغ المسترد', 'success'); setRefundOpen(false); setBookingId(''); setAmount(''); setBookingIdAutofilled(false); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر الاسترداد', 'error'),
  });

  if (ticketError) return <Card className="h-full flex items-center justify-center"><EmptyState message="تعذّر تحميل المحادثة" /></Card>;
  if (!ticket) return <Card className="h-full flex items-center justify-center"><Spinner /></Card>;

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: COLOR_SURFACE_MUTED }}>
        <Avatar name={ticket.user?.name} size={32} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{ticket.user?.name ?? ticket.user?.phone ?? '—'}</div>
          <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>{ticket.subject}</div>
        </div>
        <div className="flex-1" />
        <select
          value={ticket.category ?? ''}
          onChange={(e) => e.target.value && setCategory.mutate(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-200 outline-none"
          style={{ fontSize: 12 }}
        >
          <option value="">تصنيف الشكوى</option>
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {ticket.escalatedAt ? (
          <Pill label="مصعّدة" bg={COLOR_STATUS_DANGER_BG} fg={COLOR_STATUS_DANGER} />
        ) : (
          <button onClick={() => escalate.mutate()} disabled={escalate.isPending} className="px-3 h-8 rounded-lg" style={{ background: COLOR_WHITE, border: `1px solid ${COLOR_BORDER_LIGHT}`, color: COLOR_TEXT_SECONDARY, fontSize: 12, fontWeight: 600 }}>تصعيد</button>
        )}
        <button onClick={() => { setRefundOpen((o) => !o); if (!refundOpen && inferredBookingId && !bookingId) { setBookingId(inferredBookingId); setBookingIdAutofilled(true); } }} className="px-3 h-8 rounded-lg" style={{ background: COLOR_STATUS_WARNING_BG, color: COLOR_STATUS_WARNING, fontSize: 12, fontWeight: 600 }}>استرداد</button>
        {ticket.status !== 'CLOSED' && (
          <button onClick={() => setStatus.mutate('CLOSED')} disabled={setStatus.isPending} className="px-3 h-8 rounded-lg" style={{ background: COLOR_STATUS_SUCCESS_BG, color: COLOR_STATUS_SUCCESS, fontSize: 12, fontWeight: 600 }}>حل</button>
        )}
        <Pill label={STATUS_PILL[ticket.status]?.ar ?? ticket.status} bg={STATUS_PILL[ticket.status]?.bg ?? COLOR_BORDER_LIGHT} fg={STATUS_PILL[ticket.status]?.fg ?? COLOR_TEXT_SECONDARY} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: COLOR_SURFACE_SUBTLE }}>
        {(ticket.messages ?? []).map((m) => (
          <div key={m.id} className={`max-w-[80%] p-3 rounded-2xl ${m.senderRole === 'ADMIN' ? 'ms-auto' : ''}`} style={{ background: m.senderRole === 'ADMIN' ? COLOR_BRAND_PRIMARY : COLOR_WHITE, color: m.senderRole === 'ADMIN' ? COLOR_WHITE : COLOR_TEXT_PRIMARY, fontSize: 14, border: m.senderRole === 'ADMIN' ? 'none' : `1px solid ${COLOR_SURFACE_MUTED}` }}>
            {m.body}
          </div>
        ))}
      </div>

      {refundOpen && (
        <div className="mx-4 mb-2 p-3 rounded-xl" style={{ background: COLOR_WARNING_SOFT_BG }}>
          <input value={bookingId} onChange={(e) => { setBookingId(e.target.value); setBookingIdAutofilled(false); }} placeholder="معرّف الحجز" className="w-full h-9 rounded-lg border border-slate-200 px-2 mb-2" style={{ fontSize: 12, direction: 'ltr' }} />
          {bookingIdAutofilled && bookingId.trim().length > 0 && (
            <p style={{ color: COLOR_STATUS_WARNING, fontSize: 11, marginBottom: 6 }} data-testid="refund-autofill-warning">
              ⚠ تم استخراج معرّف الحجز تلقائياً من الرسائل — تحقّق منه قبل الاسترداد.
            </p>
          )}
          <div className="flex gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="المبلغ (دينار)" className="flex-1 h-9 rounded-lg border border-slate-200 px-2" style={{ fontSize: 12, direction: 'ltr' }} />
            <button onClick={() => setRefundConfirm(true)} disabled={!refundValid || refund.isPending} data-testid="refund-confirm-btn" className="px-3 h-9 rounded-lg disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontSize: 12, fontWeight: 600 }}>تأكيد</button>
          </div>
          {amount !== '' && amountNum <= 0 && (
            <p style={{ color: COLOR_STATUS_DANGER, fontSize: 11, marginTop: 4 }}>أدخل مبلغاً أكبر من صفر.</p>
          )}
        </div>
      )}

      <div className="border-t relative" style={{ borderColor: COLOR_SURFACE_MUTED }}>
        {showMacros && (
          <div className="absolute bottom-14 right-3 left-3 bg-white rounded-xl shadow-xl border py-1 z-10" style={{ borderColor: COLOR_SURFACE_MUTED }}>
            {MACROS.map((m) => (
              <button key={m} onClick={() => { setMsg(m); setShowMacros(false); }} className="w-full px-3 py-2 text-xs text-start hover:bg-slate-50 truncate">{m}</button>
            ))}
          </div>
        )}
        <div className="p-3 flex gap-2">
          <button onClick={() => setShowMacros((s) => !s)} className="px-3 rounded-lg" style={{ border: `1px solid ${COLOR_BORDER_LIGHT}`, color: COLOR_TEXT_SECONDARY, fontSize: 13, fontWeight: 600 }}>ردود جاهزة</button>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim()) reply.mutate(); }} placeholder="اكتب رداً..." className="flex-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <ActionBtn onClick={() => reply.mutate()} disabled={!msg.trim() || reply.isPending}>إرسال</ActionBtn>
        </div>
      </div>

      <ConfirmDialog
        open={refundConfirm}
        title="تأكيد إصدار مبلغ مسترد"
        body={`سيتم استرداد ${refundValid ? fmtJod(amountNum) : '—'} د للحجز ${bookingId.trim()}. حركة مالية لا يمكن التراجع عنها.${bookingIdAutofilled ? ' ⚠ معرّف الحجز مُستخرَج تلقائياً — تأكّد أنه الحجز الصحيح.' : ''}`}
        confirmLabel="استرداد"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        onConfirm={() => {
          if (refundValid) refund.mutate();
          setRefundConfirm(false);
        }}
        onCancel={() => setRefundConfirm(false)}
      />
    </Card>
  );
}

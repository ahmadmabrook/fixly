import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type BookingMaterialAdminItem, type AdminQuoteItem, type TechnicianItem, type GuaranteeAdminItem } from '../lib/api';
import { Card, Spinner, EmptyState, notify } from '../components/shared';
import { fmtFils } from '../lib/format';
import { COLOR_STATUS_DANGER, COLOR_STATUS_SUCCESS, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

/** Card-type visual language mirrors AdminPanel.tsx FounderApprovals() exactly. */
const TYPE_META: Record<string, { ar: string; bg: string; fg: string }> = {
  bom: { ar: 'بند مواد', bg: '#DBEAFE', fg: '#1366D6' },
  quote: { ar: 'عرض سعر', fg: '#7C3AED', bg: '#F3E8FF' },
  tech_docs: { ar: 'مستندات فني', bg: '#DCFCE7', fg: '#15803D' },
  guarantee: { ar: 'ضمان', bg: '#FEE2E2', fg: '#B91C1C' },
};

// VA-hire trigger threshold (§17.11) — once the combined pending queue holds
// this many items, the mockup's banner tells the founder it's time to hire
// help rather than keep clearing the backlog solo.
const VA_HIRE_TRIGGER_COUNT = 3;

interface ApprovalCard {
  id: string;
  type: 'bom' | 'quote' | 'tech_docs' | 'guarantee';
  title: string;
  body: string;
  amount?: string;
  createdAt: string;
}

/**
 * §19 (AdminPanel.tsx FounderApprovals) — a single mobile-first feed
 * aggregating the four existing review queues (materials/BOM, quote
 * ops-review, technician KYC, guarantee tickets) so a solo founder can clear
 * approvals from one screen instead of four. Each card's action calls the
 * SAME endpoint its full desktop page already uses — this is a view, not a
 * new authorization surface. Quote review isn't a binary approve/reject in
 * this codebase (ops-review just marks a quote reviewed before the itemized
 * builder sends it), so its card links to the full Quotes page rather than
 * faking a reject action the backend doesn't have.
 */
export default function FounderApprovals() {
  const qc = useQueryClient();
  const [techReject, setTechReject] = useState<{ id: string; reason: string } | null>(null);

  const bom = useQuery({
    queryKey: ['admin-materials-review'],
    queryFn: () => api.list<BookingMaterialAdminItem>('/materials-review?limit=100'),
  });
  const quotes = useQuery({
    queryKey: ['admin-quotes', 'PENDING', 0],
    queryFn: () => api.list<AdminQuoteItem>('/quotes?status=PENDING&limit=100'),
  });
  const techs = useQuery({
    queryKey: ['admin-technicians', 'PENDING', 0, ''],
    queryFn: () => api.list<TechnicianItem>('/technicians?status=PENDING&limit=100'),
  });
  const guarantees = useQuery({
    queryKey: ['admin-guarantee', 'OPEN', 0],
    queryFn: () => api.list<GuaranteeAdminItem>('/guarantee?status=OPEN&limit=100'),
  });

  const isLoading = bom.isLoading || quotes.isLoading || techs.isLoading || guarantees.isLoading;
  const isError = bom.isError || quotes.isError || techs.isError || guarantees.isError;

  const cards: ApprovalCard[] = useMemo(() => {
    const bomCards: ApprovalCard[] = (bom.data?.items ?? [])
      .filter((m) => m.status === 'PENDING_REVIEW')
      .map((m) => ({ id: m.id, type: 'bom', title: m.description, body: `الفرق عن السعر المرجعي: ${m.varianceBps != null ? `${(m.varianceBps / 100).toFixed(1)}%` : '—'}`, amount: `${fmtFils(m.totalFils)} JD`, createdAt: m.bookingId }));
    const quoteCards: ApprovalCard[] = (quotes.data?.items ?? [])
      .filter((q) => !q.opsReviewedAt)
      .map((q) => ({ id: q.id, type: 'quote', title: q.description ?? 'طلب تسعير', body: 'بانتظار مراجعة العمليات قبل بناء العرض المفصّل', createdAt: q.id }));
    const techCards: ApprovalCard[] = (techs.data?.items ?? [])
      .map((t) => ({ id: t.id, type: 'tech_docs', title: t.user.name ?? 'فني جديد', body: 'مستندات KYC بانتظار التحقق', createdAt: t.id }));
    const guaranteeCards: ApprovalCard[] = (guarantees.data?.items ?? [])
      .map((g) => ({ id: g.id, type: 'guarantee', title: g.booking?.service?.nameAr ?? 'تذكرة ضمان', body: g.description ?? '—', createdAt: g.createdAt }));
    return [...bomCards, ...quoteCards, ...techCards, ...guaranteeCards];
  }, [bom.data, quotes.data, techs.data, guarantees.data]);

  const bomDecision = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'DECLINED' }) => api.post(`/materials-review/${id}`, { decision }),
    onSuccess: () => { notify('تم تحديث البند', 'success'); void qc.invalidateQueries({ queryKey: ['admin-materials-review'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const techVerify = useMutation({
    mutationFn: (id: string) => api.post(`/technicians/${id}/verify`),
    onSuccess: () => { notify('تم توثيق الفني', 'success'); void qc.invalidateQueries({ queryKey: ['admin-technicians'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const techRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/technicians/${id}/reject`, { reason }),
    onSuccess: () => { notify('تم رفض الفني', 'success'); setTechReject(null); void qc.invalidateQueries({ queryKey: ['admin-technicians'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const guaranteeDecision = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) => api.post(`/guarantee/${id}/review`, { decision }),
    onSuccess: () => { notify('تم تحديث التذكرة', 'success'); void qc.invalidateQueries({ queryKey: ['admin-guarantee'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>موافقات المؤسس</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>كل ما ينتظر مراجعتك في شاشة واحدة — مواد، عروض أسعار، فنيون جدد، تذاكر ضمان.</p>
        </div>
        {cards.length > 0 && (
          <span className="px-3 py-1 rounded-full" style={{ fontSize: 12, fontWeight: 700, background: COLOR_STATUS_DANGER, color: COLOR_WHITE }}>{cards.length} بانتظار المراجعة</span>
        )}
      </div>

      <div className="p-3 rounded-xl" style={{ background: '#E8F1FE', fontSize: 12, color: '#0E4FA8' }}>
        بنود المواد تُعتمد تلقائياً بعد ساعتين بلا إجراء. نزاعات الأسعار تُخصم تلقائياً من مستحقات الفني بعد 24 ساعة بلا إثبات شراء.
      </div>

      {cards.length >= VA_HIRE_TRIGGER_COUNT && (
        <div className="p-3 rounded-xl" style={{ background: '#FEF3C7', fontSize: 12, color: '#92400E' }}>
          <strong>مؤشر توظيف مساعد افتراضي (§17.11):</strong> {cards.length} بنود بانتظار المراجعة — عند الوصول إلى 15–20 بنداً يومياً بشكل مستمر، حان وقت توظيف مساعد افتراضي.
        </div>
      )}

      {isLoading && <Card className="p-6"><Spinner /></Card>}
      {isError && <Card className="p-6"><EmptyState message="تعذّر تحميل قائمة الموافقات" /></Card>}
      {!isLoading && !isError && cards.length === 0 && <Card className="p-6"><EmptyState message="لا توجد بنود بانتظار المراجعة" /></Card>}

      <div className="flex flex-wrap gap-4">
        {cards.map((c) => {
          const meta = TYPE_META[c.type];
          return (
            <div key={`${c.type}-${c.id}`} className="bg-white rounded-2xl border border-slate-100 p-4" style={{ width: 340 }} dir="rtl">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.fg }}>{meta.ar}</span>
                {c.amount && <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13 }}>{c.amount}</span>}
              </div>
              <p style={{ fontWeight: 700, fontSize: 14, color: COLOR_TEXT_PRIMARY, marginTop: 8 }}>{c.title}</p>
              <p style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY, marginTop: 4 }}>{c.body}</p>

              {c.type === 'bom' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => bomDecision.mutate({ id: c.id, decision: 'APPROVED' })} disabled={bomDecision.isPending} className="flex-1 h-9 rounded-lg" style={{ background: COLOR_STATUS_SUCCESS, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}>اعتماد ✓</button>
                  <button onClick={() => bomDecision.mutate({ id: c.id, decision: 'DECLINED' })} disabled={bomDecision.isPending} className="flex-1 h-9 rounded-lg border" style={{ borderColor: COLOR_STATUS_DANGER, color: COLOR_STATUS_DANGER, fontWeight: 700, fontSize: 13 }}>رفض ✗</button>
                </div>
              )}

              {c.type === 'guarantee' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => guaranteeDecision.mutate({ id: c.id, decision: 'APPROVED' })} disabled={guaranteeDecision.isPending} className="flex-1 h-9 rounded-lg" style={{ background: COLOR_STATUS_SUCCESS, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}>اعتماد ✓</button>
                  <button onClick={() => guaranteeDecision.mutate({ id: c.id, decision: 'REJECTED' })} disabled={guaranteeDecision.isPending} className="flex-1 h-9 rounded-lg border" style={{ borderColor: COLOR_STATUS_DANGER, color: COLOR_STATUS_DANGER, fontWeight: 700, fontSize: 13 }}>رفض ✗</button>
                </div>
              )}

              {c.type === 'tech_docs' && techReject?.id !== c.id && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => techVerify.mutate(c.id)} disabled={techVerify.isPending} className="flex-1 h-9 rounded-lg" style={{ background: COLOR_STATUS_SUCCESS, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}>توثيق ✓</button>
                  <button onClick={() => setTechReject({ id: c.id, reason: '' })} className="flex-1 h-9 rounded-lg border" style={{ borderColor: COLOR_STATUS_DANGER, color: COLOR_STATUS_DANGER, fontWeight: 700, fontSize: 13 }}>رفض ✗</button>
                </div>
              )}
              {c.type === 'tech_docs' && techReject?.id === c.id && (
                <div className="mt-3 space-y-2">
                  <input
                    autoFocus
                    value={techReject.reason}
                    onChange={(e) => setTechReject({ id: c.id, reason: e.target.value })}
                    placeholder="سبب الرفض (مطلوب)"
                    className="w-full h-9 rounded-lg border border-slate-200 px-2"
                    style={{ fontSize: 12 }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => techReject.reason.trim() && techRejectMutation.mutate({ id: c.id, reason: techReject.reason.trim() })}
                      disabled={!techReject.reason.trim() || techRejectMutation.isPending}
                      className="flex-1 h-9 rounded-lg"
                      style={{ background: COLOR_STATUS_DANGER, color: COLOR_WHITE, fontWeight: 700, fontSize: 13, opacity: techReject.reason.trim() ? 1 : 0.5 }}
                    >
                      تأكيد الرفض
                    </button>
                    <button onClick={() => setTechReject(null)} className="flex-1 h-9 rounded-lg border" style={{ borderColor: '#CBD5E1', color: COLOR_TEXT_SECONDARY, fontWeight: 700, fontSize: 13 }}>إلغاء</button>
                  </div>
                </div>
              )}

              {c.type === 'quote' && (
                <Link to="/quotes" className="mt-3 flex items-center justify-center h-9 rounded-lg" style={{ background: meta.bg, color: meta.fg, fontWeight: 700, fontSize: 13 }}>
                  فتح للمراجعة الكاملة →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

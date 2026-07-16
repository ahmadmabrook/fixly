import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, DEFAULT_PAGE_SIZE, GuaranteeAdminItem } from '../lib/api';
import { shortId, safeHttpsUrl } from '../lib/format';
import { Card, Spinner, EmptyState, ActionBtn, ConfirmDialog, notify, Pagination, Pill, Drawer } from '../components/shared';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['IN_REVIEW', 'قيد المراجعة'], ['RESOLVED', 'موافق'], ['REJECTED', 'مرفوض'],
];
const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  OPEN: { ar: 'مفتوح', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  IN_REVIEW: { ar: 'قيد المراجعة', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  RESOLVED: { ar: 'موافق', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  REJECTED: { ar: 'مرفوض', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
};

function slaLabel(expiresAt: string): { text: string; color: string; pct: number } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'تجاوز SLA', color: COLOR_STATUS_DANGER, pct: 0 };
  const mins = Math.round(ms / 60000);
  // SLA window is 2h (120min); pct is remaining time as a fraction of that.
  return { text: `${mins} دقيقة متبقية`, color: mins < 30 ? COLOR_STATUS_WARNING : COLOR_BRAND_PRIMARY, pct: Math.min(100, (mins / 120) * 100) };
}

export default function Guarantee() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<GuaranteeAdminItem | null>(null);
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-guarantee', status, page],
    queryFn: () => api.list<GuaranteeAdminItem>(`/guarantee?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>تذاكر الضمان</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>مراجعة طلبات الضمان خلال مهلة الساعتين.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? COLOR_BRAND_PRIMARY : COLOR_WHITE, color: status === k ? COLOR_WHITE : COLOR_TEXT_SECONDARY, fontSize: 13, fontWeight: 600, border: `1px solid ${COLOR_BORDER_LIGHT}` }}>{label}</button>
        ))}
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل تذاكر الضمان" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد تذاكر" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => {
            const sla = slaLabel(t.expiresAt);
            const inReview = t.status === 'OPEN' || t.status === 'IN_REVIEW';
            const media = t.mediaUrls.map(safeHttpsUrl).filter((u): u is string => u !== undefined);
            return (
              <Card key={t.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ fontFamily: 'Inter', fontWeight: 700 }}>{shortId(t.id)}</div>
                    <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}><span>{t.booking?.customer?.name ?? '—'}</span> · {new Date(t.createdAt).toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  <Pill label={STATUS_PILL[t.status]?.ar ?? t.status} bg={STATUS_PILL[t.status]?.bg ?? COLOR_BORDER_LIGHT} fg={STATUS_PILL[t.status]?.fg ?? COLOR_TEXT_SECONDARY} />
                </div>
                <div className="mt-3" style={{ fontSize: 14, fontWeight: 600 }}>{t.booking?.service?.nameAr ?? '—'}</div>
                {t.description && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 13, marginTop: 4 }}>{t.description.slice(0, 80)}</p>}
                {media.length > 0 && (
                  <div className="mt-3 flex gap-1.5">
                    {media.slice(0, 3).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 shrink-0">
                        <span style={{ fontSize: 12, color: COLOR_TEXT_MUTED, fontWeight: 600 }}>مرفق {i + 1}</span>
                      </a>
                    ))}
                  </div>
                )}
                {inReview && (
                  <>
                    <div className="mt-3 flex items-center justify-between" style={{ fontSize: 12 }}>
                      <span style={{ color: COLOR_TEXT_SUBTLE }}>SLA (ساعتان)</span>
                      <span style={{ color: sla.color, fontWeight: 700 }}>{sla.text}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full" style={{ background: COLOR_SURFACE_MUTED }}>
                      <div className="h-full rounded-full" style={{ width: `${sla.pct}%`, background: sla.color }} />
                    </div>
                  </>
                )}
                <ActionBtn onClick={() => setActive(t)} className="mt-3 w-full justify-center">مراجعة</ActionBtn>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />

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
    <>
      <Drawer ariaLabel="مراجعة تذكرة الضمان" onClose={onClose}>
        <div className="p-6">
          <h2 style={{ fontWeight: 800, fontSize: 18 }}>مراجعة تذكرة الضمان</h2>
          <div className="mt-4 space-y-1" style={{ fontSize: 14 }}>
            <div><span style={{ color: COLOR_TEXT_MUTED }}>العميل:</span> {ticket.booking?.customer?.name}</div>
            <div><span style={{ color: COLOR_TEXT_MUTED }}>الخدمة:</span> {ticket.booking?.service?.nameAr}</div>
          </div>
          <p className="mt-4 p-3 rounded-lg" style={{ background: COLOR_SURFACE_SUBTLE, fontSize: 14 }}>{ticket.description}</p>
          {ticket.mediaUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ticket.mediaUrls.map(safeHttpsUrl).filter((u): u is string => u !== undefined).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 13 }}>مرفق {i + 1}</a>)}
            </div>
          )}
          <label className="block mt-5" style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>ملاحظة للعميل</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
          <label className="block mt-4" style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>موعد زيارة مجانية (عند الموافقة)</label>
          <input type="datetime-local" value={visit} onChange={(e) => setVisit(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <div className="mt-6 flex gap-2">
            <ActionBtn onClick={() => setConfirmDecision('APPROVED')} disabled={review.isPending} data-testid="approve-guarantee-btn">موافقة + زيارة</ActionBtn>
            <button onClick={() => setConfirmDecision('REJECTED')} disabled={review.isPending} data-testid="reject-guarantee-btn" className="px-4 rounded-lg disabled:opacity-50" style={{ background: COLOR_STATUS_DANGER_BG, color: COLOR_STATUS_DANGER, fontSize: 12, fontWeight: 600 }}>رفض</button>
            <button onClick={onClose} className="px-4 rounded-lg" style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>إغلاق</button>
          </div>
        </div>
      </Drawer>

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
    </>
  );
}

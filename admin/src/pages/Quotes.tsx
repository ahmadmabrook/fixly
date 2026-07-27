import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, Plus, Trash2, ShieldCheck, Send, Clock } from 'lucide-react';
import { api, DEFAULT_PAGE_SIZE, type AdminQuoteItem, type QuoteLineKind, type MaterialSource, type MaterialCatalogItem } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, ConfirmDialog, notify, Pagination, Pill } from '../components/shared';
import { fmtJod, fmtFils, shortId, safeHttpsUrl } from '../lib/format';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_INFO_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['PENDING', 'بانتظار التسعير'], ['QUOTED', 'مُسعّر'], ['ACCEPTED', 'مقبول'],
];
const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  PENDING: { ar: 'بانتظار التسعير', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  QUOTED: { ar: 'مُسعّر', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  ACCEPTED: { ar: 'مقبول', bg: COLOR_STATUS_INFO_BG, fg: COLOR_BRAND_PRIMARY },
  DECLINED: { ar: 'مرفوض', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
  EXPIRED: { ar: 'منتهٍ', bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
};
const KIND_LABEL: Record<QuoteLineKind, string> = { LABOUR: 'أجور عمل', MATERIAL: 'مادة', PREP: 'تجهيز', FEE: 'رسوم' };
const TIER_LABEL: Record<string, string> = { ECONOMY: 'اقتصادي', STANDARD: 'متوسط', PREMIUM: 'ممتاز' };

/** §2.6 materials rule 5 — expiresAt is set once at request time from the
 *  service's quoteValidityHours policy; the clock keeps running while ops
 *  builds the itemized price, so this is how much runway is actually left. */
function formatValidity(expiresAt: string): { label: string; urgent: boolean; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: 'منتهي الصلاحية', urgent: true, expired: true };
  const hours = ms / (60 * 60 * 1000);
  const urgent = hours < 24;
  if (hours >= 24) return { label: `صالح ${Math.floor(hours / 24)} يوم`, urgent, expired: false };
  return { label: `صالح ${Math.floor(hours)} ساعة`, urgent, expired: false };
}

interface LineDraft {
  kind: QuoteLineKind;
  materialId: string;
  description: string;
  qty: string;
  unit: string;
  unitPriceFils: string;
  source: MaterialSource;
}

const EMPTY_LINE_DRAFT: LineDraft = { kind: 'LABOUR', materialId: '', description: '', qty: '1', unit: '', unitPriceFils: '', source: 'TECHNICIAN_PROCURED' };

export default function Quotes() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  // Pending confirmation for a firm-price decision: setQuote is a one-shot,
  // customer-notifying action on the backend (a quote can only be priced
  // once — status must be PENDING — so there's no in-app way to correct a
  // mis-typed price afterwards). Every other money-setting action in the
  // admin panel (refund, payout, withdrawal) is confirm-gated; this matches.
  const [confirmQuote, setConfirmQuote] = useState<{ id: string; quotedJod: string; label: string } | null>(null);
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-quotes', status, page],
    queryFn: () => api.list<AdminQuoteItem>(`/quotes?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-quotes'] });

  const setQuote = useMutation({
    mutationFn: ({ id, quotedJod }: { id: string; quotedJod: string }) => api.post(`/quotes/${id}/quote`, { quotedJod }),
    onSuccess: () => { notify('تم تسعير الطلب', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const addLine = useMutation({
    mutationFn: ({ id, line }: { id: string; line: LineDraft }) =>
      api.post(`/quotes/${id}/lines`, {
        kind: line.kind,
        materialId: line.materialId.trim() || undefined,
        description: line.description.trim(),
        qty: Number(line.qty) || 1,
        unit: line.unit.trim() || undefined,
        unitPriceFils: Math.round(Number(line.unitPriceFils) * 1000),
        source: line.source,
      }),
    onSuccess: (_data, { id }) => { notify('تمت إضافة البند', 'success'); setDrafts((d) => ({ ...d, [id]: EMPTY_LINE_DRAFT })); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّرت إضافة البند', 'error'),
  });

  const removeLine = useMutation({
    mutationFn: ({ id, lineId }: { id: string; lineId: string }) => api.delete(`/quotes/${id}/lines/${lineId}`),
    onSuccess: () => invalidate(),
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر حذف البند', 'error'),
  });

  const opsReview = useMutation({
    mutationFn: (id: string) => api.post(`/quotes/${id}/ops-review`),
    onSuccess: () => { notify('تم اعتماد المراجعة', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const sendItemized = useMutation({
    mutationFn: (id: string) => api.post(`/quotes/${id}/send`),
    onSuccess: () => { notify('تم إرسال العرض للعميل', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر إرسال العرض', 'error'),
  });

  const items = data?.items ?? [];
  const draftFor = (id: string): LineDraft => drafts[id] ?? EMPTY_LINE_DRAFT;

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>طلبات التسعير</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>
          الفحص المرئي: راجع الفيديو وحدّد سعراً ثابتاً. الفئات القائمة على العرض: ابنِ عرضاً مفصّلاً (أجور + مواد).
        </p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? COLOR_BRAND_PRIMARY : COLOR_WHITE, color: status === k ? COLOR_WHITE : COLOR_TEXT_SECONDARY, fontSize: 13, fontWeight: 600, border: `1px solid ${COLOR_BORDER_LIGHT}` }}>{label}</button>
        ))}
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل طلبات التسعير" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد طلبات" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {items.map((q) => {
            const isItemized = (q.siteMediaUrls ?? []).length > 0;
            const videoUrl = safeHttpsUrl(q.videoUrl);
            const draft = draftFor(q.id);
            const totalFils = (q.labourFils ?? 0) + (q.materialsFils ?? 0);

            return (
              <Card key={q.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ fontFamily: 'Inter', fontWeight: 700 }}>{shortId(q.id)}</div>
                    <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>{q.customer?.name ?? '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isItemized && <Pill label="عرض مفصّل" bg={COLOR_STATUS_INFO_BG} fg={COLOR_BRAND_PRIMARY} />}
                    {(q.status === 'PENDING' || q.status === 'QUOTED') && q.expiresAt && (() => {
                      const v = formatValidity(q.expiresAt);
                      return (
                        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: v.urgent ? COLOR_STATUS_DANGER : COLOR_TEXT_MUTED }}>
                          <Clock size={12} /> {v.label}
                        </span>
                      );
                    })()}
                    <Pill label={STATUS_PILL[q.status]?.ar ?? q.status} bg={STATUS_PILL[q.status]?.bg ?? COLOR_BORDER_LIGHT} fg={STATUS_PILL[q.status]?.fg ?? COLOR_TEXT_SECONDARY} />
                  </div>
                </div>
                <div className="mt-3" style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{q.service?.nameAr ?? '—'}</span>
                  {q.description && <span style={{ color: COLOR_TEXT_MUTED }}> — {q.description}</span>}
                </div>

                {!isItemized ? (
                  <>
                    {videoUrl ? (
                      <a href={videoUrl} target="_blank" rel="noreferrer" className="mt-3 w-full aspect-video rounded-lg flex items-center justify-center" style={{ background: COLOR_TEXT_PRIMARY }}>
                        <PlayCircle size={40} color={COLOR_WHITE} />
                      </a>
                    ) : (
                      <div className="mt-3 w-full aspect-video rounded-lg flex items-center justify-center" style={{ background: COLOR_SURFACE_MUTED, color: COLOR_TEXT_SUBTLE, fontSize: 13 }}>لا يوجد فيديو</div>
                    )}
                    {q.status === 'PENDING' ? (
                      <div className="mt-3 flex gap-2 items-center">
                        <input
                          value={prices[q.id] ?? ''}
                          onChange={(e) => setPrices((p) => ({ ...p, [q.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                          placeholder="دينار"
                          className="h-9 flex-1 rounded-lg border border-slate-200 px-2"
                          style={{ fontSize: 13, direction: 'ltr' }}
                        />
                        <ActionBtn
                          onClick={() => {
                            const v = prices[q.id];
                            if (v && Number(v) > 0) setConfirmQuote({ id: q.id, quotedJod: v, label: q.customer?.name ?? shortId(q.id) });
                          }}
                          disabled={setQuote.isPending || !(Number(prices[q.id]) > 0)}
                          data-testid={`quote-price-btn-${q.id}`}
                        >تسعير</ActionBtn>
                      </div>
                    ) : (
                      <div className="mt-3" style={{ fontSize: 14, fontWeight: 700, color: COLOR_STATUS_SUCCESS }}>
                        {q.quotedJod != null ? `السعر الثابت: ${fmtJod(q.quotedJod)} دينار` : '—'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-3" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>
                      {q.requestedTier && <span>الفئة: {TIER_LABEL[q.requestedTier] ?? q.requestedTier}</span>}
                      {q.dimensionsNote && <span>الأبعاد: {q.dimensionsNote}</span>}
                      {q.opsReviewedAt && <span style={{ color: COLOR_STATUS_SUCCESS, fontWeight: 600 }}><ShieldCheck size={12} className="inline" /> تمت المراجعة</span>}
                    </div>
                    {q.siteMediaUrls.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {q.siteMediaUrls.map((url, i) => {
                          const safe = safeHttpsUrl(url);
                          return safe ? (
                            <a key={i} href={safe} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1" style={{ fontSize: 11, background: COLOR_SURFACE_MUTED, color: COLOR_TEXT_SECONDARY }}>وسائط {i + 1}</a>
                          ) : null;
                        })}
                      </div>
                    )}

                    {q.lines.length > 0 && (
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: COLOR_BORDER_LIGHT }}>
                        {q.lines.map((line) => (
                          <div key={line.id} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${COLOR_BORDER_LIGHT}`, fontSize: 13 }}>
                            <div>
                              <span style={{ fontWeight: 600 }}>{KIND_LABEL[line.kind]}</span>
                              <span style={{ color: COLOR_TEXT_MUTED }}> — {line.description} ({String(line.qty)} {line.unit ?? ''})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span style={{ fontWeight: 700 }}>{fmtFils(line.totalFils)} د.أ</span>
                              {q.status === 'PENDING' && (
                                <button onClick={() => removeLine.mutate({ id: q.id, lineId: line.id })} aria-label="حذف البند">
                                  <Trash2 size={14} color={COLOR_STATUS_DANGER} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2" style={{ fontSize: 13, fontWeight: 800, background: COLOR_SURFACE_MUTED }}>
                          <span>الإجمالي (أجور {fmtFils(q.labourFils ?? 0)} + مواد {fmtFils(q.materialsFils ?? 0)})</span>
                          <span>{fmtFils(totalFils)} د.أ</span>
                        </div>
                      </div>
                    )}

                    {q.status === 'PENDING' && (
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                        <select value={draft.kind} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: { ...draft, kind: e.target.value as QuoteLineKind } }))} className="h-9 rounded-lg border border-slate-200 px-2" style={{ fontSize: 12 }}>
                          {(Object.keys(KIND_LABEL) as QuoteLineKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                        <input placeholder="الوصف" value={draft.description} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: { ...draft, description: e.target.value } }))} className="h-9 rounded-lg border border-slate-200 px-2 col-span-2" style={{ fontSize: 12 }} />
                        {draft.kind === 'MATERIAL' ? (
                          <MaterialPicker
                            serviceId={q.serviceId}
                            value={draft.materialId}
                            onChange={(materialId, item) =>
                              setDrafts((d) => ({
                                ...d,
                                [q.id]: {
                                  ...draft,
                                  materialId,
                                  description: item ? item.nameAr : draft.description,
                                  unitPriceFils: item ? (item.unitPriceFils / 1000).toFixed(3) : draft.unitPriceFils,
                                },
                              }))
                            }
                          />
                        ) : (
                          <div />
                        )}
                        <input placeholder="الكمية" value={draft.qty} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: { ...draft, qty: e.target.value.replace(/[^\d.]/g, '') } }))} className="h-9 rounded-lg border border-slate-200 px-2" style={{ fontSize: 12, direction: 'ltr' }} />
                        <input placeholder="سعر الوحدة (د.أ)" value={draft.unitPriceFils} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: { ...draft, unitPriceFils: e.target.value.replace(/[^\d.]/g, '') } }))} className="h-9 rounded-lg border border-slate-200 px-2" style={{ fontSize: 12, direction: 'ltr' }} />
                        <ActionBtn
                          variant="ghost"
                          onClick={() => addLine.mutate({ id: q.id, line: draft })}
                          disabled={addLine.isPending || !draft.description.trim() || !(Number(draft.unitPriceFils) > 0)}
                        ><Plus size={12} className="inline" /> إضافة بند</ActionBtn>
                      </div>
                    )}

                    {q.status === 'PENDING' && (
                      <div className="flex gap-2 justify-end">
                        <ActionBtn variant="ghost" onClick={() => opsReview.mutate(q.id)} disabled={opsReview.isPending}><ShieldCheck size={12} className="inline" /> اعتماد المراجعة</ActionBtn>
                        <ActionBtn onClick={() => sendItemized.mutate(q.id)} disabled={sendItemized.isPending || q.lines.length === 0}><Send size={12} className="inline" /> إرسال العرض</ActionBtn>
                      </div>
                    )}
                    {q.status === 'QUOTED' && q.quotedJod != null && (
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLOR_STATUS_SUCCESS }}>السعر الإجمالي: {fmtJod(q.quotedJod)} دينار</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />

      <ConfirmDialog
        open={confirmQuote !== null}
        title="تأكيد السعر الثابت"
        body={
          confirmQuote
            ? `سيصبح السعر ${fmtJod(confirmQuote.quotedJod)} دينار السعر الثابت لطلب ${confirmQuote.label} وسيُبلَّغ العميل به فوراً. لا يمكن تعديل السعر بعد هذه الخطوة.`
            : undefined
        }
        confirmLabel="تأكيد السعر"
        cancelLabel="إلغاء"
        confirmVariant="primary"
        onConfirm={() => {
          if (confirmQuote) setQuote.mutate({ id: confirmQuote.id, quotedJod: confirmQuote.quotedJod });
          setConfirmQuote(null);
        }}
        onCancel={() => setConfirmQuote(null)}
      />
    </div>
  );
}

/** §17.5.6 rule 2 "the technician selects, never prices" applied to ops too —
 *  a MATERIAL line picks from the priced catalogue instead of a free-typed
 *  material UUID; picking an item prefills description + unit price. */
function MaterialPicker({ serviceId, value, onChange }: { serviceId: string; value: string; onChange: (materialId: string, item: MaterialCatalogItem | null) => void }) {
  const { data } = useQuery({
    queryKey: ['materials-catalog-picker', serviceId],
    queryFn: () => api.list<MaterialCatalogItem>(`/materials?serviceId=${serviceId}&isActive=true&limit=200`),
    enabled: !!serviceId,
  });
  const items = data?.items ?? [];

  return (
    <select
      value={value}
      onChange={(e) => {
        const item = items.find((i) => i.id === e.target.value) ?? null;
        onChange(e.target.value, item);
      }}
      aria-label="اختر مادة من الكتالوج"
      className="h-9 rounded-lg border border-slate-200 px-2"
      style={{ fontSize: 12 }}
    >
      <option value="">مادة (اختياري)</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>{i.nameAr} — {fmtFils(i.unitPriceFils)} د.أ</option>
      ))}
    </select>
  );
}

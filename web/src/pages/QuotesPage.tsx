import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, ChevronLeft, Camera, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateAr } from '../lib/format';
import { Card, notify, SkeletonList } from '../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ERROR_BG, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_TEXT_SUBTLE, COLOR_WARNING_BG, COLOR_WARNING_TEXT, COLOR_WHITE } from '../lib/theme';

/** Mirrors the backend `QuoteStatus` enum (backend/prisma/schema.prisma). */
type QuoteStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
type MaterialTier = 'ECONOMY' | 'STANDARD' | 'PREMIUM';
type QuoteLineKind = 'LABOUR' | 'MATERIAL' | 'PREP' | 'FEE';

interface QuoteLineDto {
  id: string;
  kind: QuoteLineKind;
  description: string;
  qty: string | number;
  unit: string | null;
  totalFils: number;
}

interface QuoteDto {
  id: string;
  status: QuoteStatus;
  videoUrl: string | null;
  siteMediaUrls: string[];
  dimensionsNote: string | null;
  requestedTier: MaterialTier | null;
  description: string | null;
  quotedJod: string | number | null;
  labourFils: number | null;
  materialsFils: number | null;
  feesFils: number | null;
  lines: QuoteLineDto[];
  service?: { nameAr?: string | null };
  createdAt: string;
  expiresAt: string;
}
/** Public catalogue entry — pricingModel decides which intake form this page shows. */
interface Svc { id: string; nameAr: string; pricingModel?: 'FIXED_SCOPE' | 'QUOTE_FIRST'; inspectionFeeFils?: number | null }

const STATUS_LABEL: Record<QuoteStatus, string> = { PENDING: 'بانتظار التسعير', QUOTED: 'مُسعّر', ACCEPTED: 'مقبول', DECLINED: 'مرفوض', EXPIRED: 'منتهٍ' };
const STATUS_COLOR: Record<QuoteStatus, { bg: string; fg: string }> = {
  PENDING: { bg: COLOR_WARNING_BG, fg: COLOR_WARNING_TEXT },
  QUOTED: { bg: COLOR_SUCCESS_BG, fg: COLOR_SUCCESS_TEXT },
  ACCEPTED: { bg: COLOR_BRAND_PRIMARY_TINT, fg: COLOR_BRAND_PRIMARY_DARK },
  DECLINED: { bg: COLOR_ERROR_BG, fg: COLOR_ERROR_TEXT },
  EXPIRED: { bg: COLOR_BG_SUBTLE, fg: COLOR_TEXT_MUTED },
};
/** §6.34/§10 — the middle tier is «متوسط» everywhere else in the app; this page
 *  previously showed «قياسي» for the same enum value. */
const TIER_LABEL: Record<MaterialTier, string> = { ECONOMY: 'اقتصادي', STANDARD: 'متوسط', PREMIUM: 'ممتاز' };
const KIND_LABEL: Record<QuoteLineKind, string> = { LABOUR: 'أجور عمل', MATERIAL: 'مادة', PREP: 'تجهيز', FEE: 'رسوم' };
/** 1 JOD = 1000 fils (§17.5) — display-only conversion for the itemized quote-first path. */
const fmtFils = (fils: number) => (fils / 1000).toFixed(2);

export default function QuotesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: quotes, isLoading } = useQuery({ queryKey: ['quotes'], queryFn: () => api.get<QuoteDto[]>('/quotes') });
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: () => api.get<Svc[]>('/services') });

  const [serviceId, setServiceId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [siteMediaUrls, setSiteMediaUrls] = useState<string[]>(['']);
  const [dimensionsNote, setDimensionsNote] = useState('');
  const [requestedTier, setRequestedTier] = useState<MaterialTier | ''>('');
  const [description, setDescription] = useState('');

  const selectedService = (services ?? []).find((s) => s.id === serviceId);
  const isQuoteFirst = selectedService?.pricingModel === 'QUOTE_FIRST';

  const create = useMutation({
    mutationFn: () =>
      api.post(
        '/quotes',
        isQuoteFirst
          ? {
              serviceId,
              siteMediaUrls: siteMediaUrls.map((u) => u.trim()).filter(Boolean),
              dimensionsNote: dimensionsNote.trim() || undefined,
              requestedTier: requestedTier || undefined,
              description: description.trim() || undefined,
            }
          : { serviceId, videoUrl: videoUrl.trim(), description: description.trim() || undefined },
      ),
    onSuccess: () => {
      notify(isQuoteFirst ? 'تم إرسال طلب المعاينة — سنرسل لك عرض سعر مفصّلاً قريباً' : 'تم إرسال الطلب — سنرسل لك سعراً ثابتاً قريباً', 'success');
      setServiceId(''); setVideoUrl(''); setSiteMediaUrls(['']); setDimensionsNote(''); setRequestedTier(''); setDescription('');
      void qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر إرسال الطلب', 'error'),
  });

  const accept = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/quotes/${id}/accept`, {}),
    onSuccess: () => { notify('تم إنشاء الحجز بالسعر المتفق عليه', 'success'); void qc.invalidateQueries({ queryKey: ['quotes'] }); navigate('/my-bookings'); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر قبول العرض', 'error'),
  });

  const validUrl = /^https:\/\/.+/.test(videoUrl.trim());
  const validMedia = siteMediaUrls.some((u) => /^https:\/\/.+/.test(u.trim()));
  const canSubmit = !!serviceId && (isQuoteFirst ? validMedia : validUrl) && !create.isPending;

  return (
    <main className="max-w-[720px] mx-auto px-6 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} aria-hidden="true" /> رجوع
      </button>
      <h1 className="mt-3 flex items-center gap-2" style={{ fontWeight: 800, fontSize: 26 }}>
        {isQuoteFirst ? <Camera size={24} color={COLOR_BRAND_PRIMARY} /> : <Video size={24} color={COLOR_BRAND_PRIMARY} />} طلبات التسعير
      </h1>
      <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 14, marginTop: 4 }}>
        {isQuoteFirst
          ? 'أرسل صوراً للموقع واحصل على عرض سعر مفصّل (أجور + مواد) قبل البدء — بدون مفاجآت.'
          : 'أرسل فيديو للمشكلة واحصل على سعر ثابت قبل الحجز — بدون مفاجآت.'}
      </p>

      <Card className="p-6 mt-5 space-y-3">
        <div>
          <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>الخدمة</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="اختر الخدمة" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
            <option value="">اختر الخدمة</option>
            {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>

        {isQuoteFirst ? (
          <>
            {selectedService?.inspectionFeeFils != null && (
              <div className="p-3 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY_TINT, fontSize: 13, color: COLOR_BRAND_PRIMARY_DARK }}>
                لا يوجد سعر فوري لهذه الخدمة — رسم المعاينة {fmtFils(selectedService.inspectionFeeFils)} دينار، ثم عرض سعر نهائي مفصّل قبل البدء.
              </div>
            )}
            <div>
              <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>صور/فيديو الموقع (https)</label>
              {siteMediaUrls.map((url, i) => (
                <div key={i} className="mt-1 flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setSiteMediaUrls((arr) => arr.map((u, j) => (j === i ? e.target.value : u)))}
                    placeholder="https://..."
                    aria-label={`رابط وسائط الموقع ${i + 1}`}
                    className="flex-1 h-12 rounded-xl border border-slate-200 px-3"
                    style={{ fontSize: 14, direction: 'ltr' }}
                  />
                  {siteMediaUrls.length > 1 && (
                    <button type="button" onClick={() => setSiteMediaUrls((arr) => arr.filter((_, j) => j !== i))} aria-label="حذف الرابط" className="w-12 h-12 rounded-xl flex items-center justify-center border border-slate-200">
                      <X size={16} color={COLOR_TEXT_MUTED} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setSiteMediaUrls((arr) => [...arr, ''])} className="mt-2 flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 13, fontWeight: 600 }}>
                <Plus size={14} /> إضافة رابط آخر
              </button>
            </div>
            <div>
              <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>الأبعاد التقريبية (اختياري)</label>
              <input value={dimensionsNote} onChange={(e) => setDimensionsNote(e.target.value)} placeholder="مثال: غرفة 4×5 متر" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
            </div>
            <div>
              <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>الفئة المطلوبة (اختياري)</label>
              <select value={requestedTier} onChange={(e) => setRequestedTier(e.target.value as MaterialTier | '')} className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
                <option value="">بدون تفضيل</option>
                {(Object.keys(TIER_LABEL) as MaterialTier[]).map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>رابط الفيديو (https)</label>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." aria-label="رابط فيديو المشكلة" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          </div>
        )}

        <div>
          <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>وصف المشكلة (اختياري)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
        </div>
        <button onClick={() => create.mutate()} disabled={!canSubmit} className="w-full h-12 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
          {isQuoteFirst ? 'إرسال طلب المعاينة' : 'إرسال طلب التسعير'}
        </button>
      </Card>

      <h2 className="mt-7" style={{ fontWeight: 700, fontSize: 18 }}>طلباتي</h2>
      <div className="mt-3 space-y-3">
        {isLoading && <SkeletonList count={3} rowHeight={72} />}
        {!isLoading && (quotes ?? []).length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد طلبات بعد.</p>}
        {(quotes ?? []).map((q) => {
          const itemized = (q.siteMediaUrls ?? []).length > 0;
          const totalFils = (q.labourFils ?? 0) + (q.materialsFils ?? 0) + (q.feesFils ?? 0);
          const svc = (services ?? []).find((s) => s.nameAr === q.service?.nameAr);
          const inspectionFeeFils = svc?.inspectionFeeFils ?? null;
          const isExpired = q.status === 'QUOTED' && new Date(q.expiresAt).getTime() < Date.now();
          const daysLeft = Math.max(0, Math.ceil((new Date(q.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-center justify-between">
                <div style={{ fontWeight: 700, fontSize: 15 }}>{q.service?.nameAr ?? '—'}</div>
                <span className="px-2.5 py-1 rounded-full" style={{ background: STATUS_COLOR[q.status].bg, color: STATUS_COLOR[q.status].fg, fontSize: 12, fontWeight: 700 }}>
                  {isExpired ? STATUS_LABEL.EXPIRED : STATUS_LABEL[q.status]}
                </span>
              </div>
              {q.description && <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, marginTop: 4 }}>{q.description}</p>}

              {itemized && (q.lines ?? []).length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                  {q.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100" style={{ fontSize: 13 }}>
                      <span>{KIND_LABEL[line.kind]} — {line.description}</span>
                      <span style={{ fontWeight: 700 }}>{fmtFils(line.totalFils)} دينار</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>
                    <span>أجور {fmtFils(q.labourFils ?? 0)} + مواد {fmtFils(q.materialsFils ?? 0)}{(q.feesFils ?? 0) > 0 ? ` + رسوم ${fmtFils(q.feesFils ?? 0)}` : ''}</span>
                  </div>
                  {!!inspectionFeeFils && (
                    <div className="px-3 py-2 border-t border-slate-100" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>
                      يشمل خصم رسوم المعاينة ({fmtFils(inspectionFeeFils)} دينار) من قيمة المشروع
                    </div>
                  )}
                </div>
              )}

              {q.status === 'QUOTED' && q.quotedJod != null && !isExpired && (
                <>
                  <div className="mt-2 text-right" style={{ fontSize: 12, color: daysLeft <= 1 ? COLOR_ERROR_TEXT : COLOR_TEXT_MUTED }}>
                    العرض صالح حتى {formatDateAr(q.expiresAt)} ({daysLeft} يوم متبقٍ)
                  </div>
                  <div className="mt-1 flex items-center justify-between p-3 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY_TINT }}>
                    <span style={{ fontWeight: 800, fontSize: 18, color: COLOR_BRAND_PRIMARY_DARK, fontFamily: 'Inter' }}>
                      {itemized ? fmtFils(totalFils) : Number(q.quotedJod)} دينار
                    </span>
                    <button onClick={() => accept.mutate(q.id)} disabled={accept.isPending} className="h-10 px-5 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}>
                      اقبل واحجز
                    </button>
                  </div>
                </>
              )}

              {isExpired && (
                <div className="mt-3 flex items-center justify-between p-3 rounded-xl" style={{ background: COLOR_ERROR_BG }}>
                  <span style={{ color: COLOR_ERROR_TEXT, fontSize: 13, fontWeight: 600 }}>انتهت صلاحية العرض — لا يمكن الحجز به بعد الآن</span>
                  <button onClick={() => q.service?.nameAr && setServiceId(svc?.id ?? '')} className="h-9 px-4 rounded-xl" style={{ background: COLOR_WHITE, color: COLOR_ERROR_TEXT, fontWeight: 700, fontSize: 13, border: `1px solid ${COLOR_ERROR_TEXT}` }}>
                    اطلب إعادة تسعير
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}

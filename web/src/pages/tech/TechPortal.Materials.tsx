import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Repeat, Receipt } from 'lucide-react';
import {
  api, BookingMaterialItem, BookingStatus, MaterialCatalogItem, MaterialSource, VarianceReasonKind, MaterialVerificationItem,
} from '../../lib/api';
import { useCountdown } from '../../hooks/useCountdown';
import { Card, Modal, MediaUpload, notify } from '../../components/shared';
import {
  COLOR_BADGE_INFO_BG, COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT,
  COLOR_ERROR_BG, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY,
  COLOR_WARNING_BG, COLOR_WARNING_TEXT, COLOR_WHITE,
} from '../../lib/theme';

// §17.5.9 — BOM lines are created/edited only before execution; locked the
// instant work starts (ARRIVED→IN_PROGRESS). Mirrors BOM_CREATABLE_STATUSES /
// EDITABLE_LINE_STATUSES in backend/src/application/materials/BookingMaterialService.ts.
const EDITABLE_BOOKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED'];
const EDITABLE_LINE_STATUSES = ['PENDING', 'PENDING_REVIEW'];

const LINE_STATUS_LABEL: Record<string, { ar: string; bg: string; fg: string }> = {
  PENDING: { ar: 'بانتظار موافقة العميل', bg: COLOR_BADGE_INFO_BG, fg: COLOR_BRAND_PRIMARY },
  PENDING_REVIEW: { ar: 'فرق سعر — بانتظار المراجعة', bg: COLOR_WARNING_BG, fg: COLOR_WARNING_TEXT },
  APPROVED: { ar: 'وافق العميل', bg: COLOR_SUCCESS_BG, fg: COLOR_SUCCESS_TEXT },
  DECLINED: { ar: 'رفض العميل', bg: COLOR_ERROR_BG, fg: COLOR_ERROR_TEXT },
  REPLACED: { ar: 'تم الاستبدال', bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY },
  UNUSED: { ar: 'لم تُستخدم', bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY },
  LOCKED: { ar: 'مقفلة — بدأ التنفيذ', bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY },
};

const VARIANCE_REASON_LABEL: Record<VarianceReasonKind, string> = {
  SPECIAL_TYPE: 'نوع خاص',
  IMPORTED_BRAND: 'ماركة مستوردة',
  ACCESS_DIFFICULTY: 'صعوبة وصول',
  OTHER: 'أخرى',
};

const SOURCE_LABEL: Record<MaterialSource, string> = {
  TECHNICIAN_PROCURED: 'أحضرها الفني',
  CUSTOMER_SUPPLIED: 'وفّرها العميل',
  PLATFORM_ARRANGED: 'رتّبتها المنصة',
};

function jodFromFils(fils: number): string {
  return (fils / 1000).toFixed(3);
}

/** Bill-of-Materials section for one active job card — list + draft/substitute/
 *  invoice actions. Mounted inside TechPortal.ActiveJobs.tsx per booking. */
export function MaterialsSection({ bookingId, serviceId, bookingStatus }: { bookingId: string; serviceId: string; bookingStatus: BookingStatus }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [substituteFor, setSubstituteFor] = useState<BookingMaterialItem | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<BookingMaterialItem | null>(null);

  const { data: lines } = useQuery({
    queryKey: ['booking-materials', bookingId],
    queryFn: () => api.get<BookingMaterialItem[]>(`/bookings/${bookingId}/materials`),
  });

  const editable = EDITABLE_BOOKING_STATUSES.includes(bookingStatus);

  function refetch() {
    void qc.invalidateQueries({ queryKey: ['booking-materials', bookingId] });
  }

  if (!lines) return null;
  if (lines.length === 0 && !editable) return null;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${COLOR_BORDER}` }}>
      <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, fontWeight: 700 }}>المواد (BOM)</div>
      <div className="mt-2 space-y-2">
        {lines.map((l) => {
          const st = LINE_STATUS_LABEL[l.status] ?? { ar: l.status, bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY };
          const canEdit = editable && EDITABLE_LINE_STATUSES.includes(l.status);
          return (
            <div key={l.id} className="rounded-xl p-3" style={{ border: `1px solid ${COLOR_BORDER}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{l.description}{l.brand ? ` — ${l.brand}` : ''}</div>
                  <div style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginTop: 2 }}>
                    {SOURCE_LABEL[l.source]} · <span style={{ fontFamily: 'Inter' }}>{l.qty}</span>{l.unit ? ` ${l.unit}` : ''} × <span style={{ fontFamily: 'Inter' }}>{jodFromFils(l.unitPriceFils)}</span> دينار
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700 }}>{st.ar}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span style={{ fontWeight: 700, fontSize: 13 }}><span style={{ fontFamily: 'Inter' }}>{jodFromFils(l.totalFils)}</span> دينار</span>
                {!!l.varianceBps && l.varianceBps > 0 && (
                  <span style={{ color: COLOR_WARNING_TEXT, fontSize: 11, fontWeight: 600 }}>
                    فرق <span style={{ fontFamily: 'Inter' }}>{(l.varianceBps / 100).toFixed(1)}%</span> عن المرجع
                    {l.varianceReason ? ` — ${VARIANCE_REASON_LABEL[l.varianceReason]}` : ''}
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setSubstituteFor(l)} className="flex-1 h-8 rounded-lg flex items-center justify-center gap-1" style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontSize: 11, fontWeight: 600 }}>
                    <Repeat size={12} /> استبدال
                  </button>
                  {!l.supplierInvoiceUrl && (
                    <button onClick={() => setInvoiceFor(l)} className="flex-1 h-8 rounded-lg flex items-center justify-center gap-1" style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontSize: 11, fontWeight: 600 }}>
                      <Receipt size={12} /> رفع فاتورة
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editable && (
        <button onClick={() => setAdding(true)} className="mt-2 w-full h-10 rounded-xl flex items-center justify-center gap-1.5" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 600, fontSize: 13 }}>
          <Plus size={15} /> إضافة مادة
        </button>
      )}
      {adding && (
        <MaterialLineModal
          bookingId={bookingId}
          serviceId={serviceId}
          title="إضافة مادة"
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refetch(); }}
        />
      )}
      {substituteFor && (
        <MaterialLineModal
          bookingId={bookingId}
          serviceId={serviceId}
          title="استبدال مادة"
          substituteLineId={substituteFor.id}
          initial={substituteFor}
          onClose={() => setSubstituteFor(null)}
          onSaved={() => { setSubstituteFor(null); refetch(); }}
        />
      )}
      {invoiceFor && (
        <InvoiceModal
          bookingId={bookingId}
          line={invoiceFor}
          onClose={() => setInvoiceFor(null)}
          onSaved={() => { setInvoiceFor(null); refetch(); }}
        />
      )}
    </div>
  );
}

function MaterialLineModal({
  bookingId, serviceId, title, substituteLineId, initial, onClose, onSaved,
}: {
  bookingId: string;
  serviceId: string;
  title: string;
  substituteLineId?: string;
  initial?: BookingMaterialItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: catalogue } = useQuery({
    queryKey: ['service-materials', serviceId],
    queryFn: () => api.get<MaterialCatalogItem[]>(`/services/${serviceId}/materials`),
  });
  const [materialId, setMaterialId] = useState<string>(initial?.materialId ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [priceJod, setPriceJod] = useState(initial ? jodFromFils(initial.unitPriceFils) : '');
  const [source, setSource] = useState<MaterialSource>(initial?.source ?? 'TECHNICIAN_PROCURED');
  const [saving, setSaving] = useState(false);

  function pickFromCatalogue(id: string) {
    setMaterialId(id);
    const item = (catalogue ?? []).find((c) => c.id === id);
    if (item) {
      setDescription(item.nameAr);
      setBrand(item.brand ?? '');
      setUnit(item.unit ?? '');
      setPriceJod(jodFromFils(item.unitPriceFils));
    }
  }

  async function submit() {
    const unitPriceFils = Math.round(Number(priceJod) * 1000);
    if (!description.trim() || !Number.isFinite(unitPriceFils) || unitPriceFils < 0) return;
    setSaving(true);
    try {
      const body = {
        materialId: materialId || undefined,
        description: description.trim(),
        brand: brand.trim() || undefined,
        qty: qty ? Number(qty) : undefined,
        unit: unit.trim() || undefined,
        unitPriceFils,
        source,
      };
      if (substituteLineId) {
        await api.post(`/bookings/${bookingId}/materials/${substituteLineId}/substitute`, body);
      } else {
        await api.post(`/bookings/${bookingId}/materials`, body);
      }
      notify('تم الحفظ', 'success');
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} variant="sheet" maxWidth="sm" onClose={onClose}>
      {!!(catalogue && catalogue.length) && (
        <select
          value={materialId}
          onChange={(e) => pickFromCatalogue(e.target.value)}
          aria-label="اختر من كتالوج المواد"
          className="mt-3 w-full h-11 rounded-xl border border-slate-200 px-3"
          style={{ fontSize: 13 }}
        >
          <option value="">اختر من الكتالوج (اختياري)</option>
          {catalogue.map((c) => (
            <option key={c.id} value={c.id}>{c.nameAr} — {jodFromFils(c.unitPriceFils)} دينار</option>
          ))}
        </select>
      )}
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المادة" aria-label="وصف المادة" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13 }} />
      <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="الماركة (اختياري)" aria-label="الماركة" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13 }} />
      <div className="mt-2 flex gap-2">
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} placeholder="الكمية" aria-label="الكمية" className="w-1/3 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13, direction: 'ltr' }} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="الوحدة" aria-label="الوحدة" className="w-1/3 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13 }} />
        <input value={priceJod} onChange={(e) => setPriceJod(e.target.value.replace(/[^\d.]/g, ''))} placeholder="السعر (دينار)" aria-label="سعر الوحدة بالدينار" className="w-1/3 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13, direction: 'ltr' }} />
      </div>
      <select value={source} onChange={(e) => setSource(e.target.value as MaterialSource)} aria-label="مصدر المادة" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 13 }}>
        {(Object.keys(SOURCE_LABEL) as MaterialSource[]).map((s) => (
          <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
        ))}
      </select>
      <button
        onClick={() => void submit()}
        disabled={saving || !description.trim() || !priceJod}
        className="mt-4 w-full h-11 rounded-xl disabled:opacity-50"
        style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}
      >
        حفظ
      </button>
    </Modal>
  );
}

function InvoiceModal({ bookingId, line, onClose, onSaved }: { bookingId: string; line: BookingMaterialItem; onClose: () => void; onSaved: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [reason, setReason] = useState<VarianceReasonKind | ''>(line.varianceReason ?? '');
  const [note, setNote] = useState(line.varianceReasonNote ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (urls.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/bookings/${bookingId}/materials/${line.id}/invoice`, {
        invoiceUrl: urls[0],
        varianceReasonKind: reason || undefined,
        varianceReasonNote: note.trim() || undefined,
      });
      notify('تم رفع الفاتورة', 'success');
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر رفع الفاتورة', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="رفع فاتورة الشراء" variant="sheet" maxWidth="sm" onClose={onClose}>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>{line.description}</p>
      <div className="mt-3">
        <MediaUpload value={urls} onChange={setUrls} purpose="supplier_invoice" max={1} />
      </div>
      {!!line.varianceBps && line.varianceBps > 0 && (
        <>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as VarianceReasonKind)}
            aria-label="سبب فرق السعر"
            className="mt-3 w-full h-11 rounded-xl border border-slate-200 px-3"
            style={{ fontSize: 13 }}
          >
            <option value="">سبب فرق السعر (إن وجد)</option>
            {(Object.keys(VARIANCE_REASON_LABEL) as VarianceReasonKind[]).map((r) => (
              <option key={r} value={r}>{VARIANCE_REASON_LABEL[r]}</option>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة سبب الفرق" rows={2} className="mt-2 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 13 }} />
        </>
      )}
      <button onClick={() => void submit()} disabled={saving || urls.length === 0} className="mt-4 w-full h-11 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
        إرسال
      </button>
    </Modal>
  );
}

/* ── §17.5.14 price-variance verification requests (technician side) ──────── */

function useDeadlineLabel(deadlineAt: string) {
  const remaining = useCountdown(deadlineAt);
  if (remaining == null) return { text: '', urgent: false };
  if (remaining <= 0) return { text: 'انتهت المهلة', urgent: true };
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const urgent = remaining < 3 * 3600;
  const text = hours > 0 ? `متبقي ${hours} س ${minutes} د` : `متبقي ${minutes} د`;
  return { text, urgent };
}

function DeadlineNote({ deadlineAt }: { deadlineAt: string }) {
  const { text, urgent } = useDeadlineLabel(deadlineAt);
  if (!text) return null;
  return <p style={{ color: urgent ? COLOR_ERROR_TEXT : COLOR_WARNING_TEXT, fontSize: 12, fontWeight: 700, marginTop: 6 }}>{text}</p>;
}

const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  OPEN: 'مفتوح',
  INVOICE_PROVIDED: 'تم إرسال الفاتورة',
  UPHELD: 'تم اعتماد السعر',
  DEDUCTED: 'تم خصم الفرق',
  WITHDRAWN: 'تم السحب',
};

/** Technician's own §17.5.14 price-variance disputes — 24h to upload the
 *  original purchase invoice before the difference auto-settles. */
export function Verifications() {
  const qc = useQueryClient();
  const [invoiceFor, setInvoiceFor] = useState<MaterialVerificationItem | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['tech-verifications'],
    queryFn: () => api.get<{ items: MaterialVerificationItem[]; total: number }>('/verifications'),
  });
  const items = data?.items ?? [];

  async function submitInvoice() {
    if (!invoiceFor || urls.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/verifications/${invoiceFor.id}/invoice`, { invoiceUrl: urls[0] });
      notify('تم رفع الفاتورة', 'success');
      setInvoiceFor(null);
      setUrls([]);
      void qc.invalidateQueries({ queryKey: ['tech-verifications'] });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر رفع الفاتورة', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد طلبات تحقق من الأسعار.</p>}
      {items.map((v) => (
        <Card key={v.id} className="p-4">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: 14 }}>فرق سعر <span style={{ fontFamily: 'Inter' }}>{jodFromFils(v.deltaFils)}</span> دينار</span>
            <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, fontWeight: 600 }}>{VERIFICATION_STATUS_LABEL[v.status] ?? v.status}</span>
          </div>
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, marginTop: 4 }}>
            المرجعي <span style={{ fontFamily: 'Inter' }}>{jodFromFils(v.referencePriceFils)}</span> دينار · المُحتسب <span style={{ fontFamily: 'Inter' }}>{jodFromFils(v.chargedPriceFils)}</span> دينار
          </div>
          {v.status === 'OPEN' && <DeadlineNote deadlineAt={v.deadlineAt} />}
          {v.status === 'OPEN' && (
            <button onClick={() => { setInvoiceFor(v); setUrls([]); }} className="mt-2 w-full h-10 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}>
              رفع فاتورة الشراء
            </button>
          )}
        </Card>
      ))}
      {invoiceFor && (
        <Modal title="رفع فاتورة الشراء" variant="sheet" maxWidth="sm" onClose={() => setInvoiceFor(null)}>
          <div className="mt-3">
            <MediaUpload value={urls} onChange={setUrls} purpose="supplier_invoice" max={1} />
          </div>
          <button onClick={() => void submitInvoice()} disabled={saving || urls.length === 0} className="mt-4 w-full h-11 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
            إرسال
          </button>
        </Modal>
      )}
    </div>
  );
}

/** Open-verification count for the Dashboard tab badge. */
export function useOpenVerificationsCount(): number {
  const { data } = useQuery({
    queryKey: ['tech-verifications'],
    queryFn: () => api.get<{ items: MaterialVerificationItem[]; total: number }>('/verifications'),
  });
  return (data?.items ?? []).filter((v) => v.status === 'OPEN').length;
}

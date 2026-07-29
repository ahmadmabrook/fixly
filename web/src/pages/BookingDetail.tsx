import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Star, Navigation, ShieldCheck, Download, LifeBuoy } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Booking, AdditionalWorkItem, Subscription } from '../lib/api';
import { formatDateAr, formatDateTimeAr } from '../lib/format';
import { DEFAULT_GUARANTEE_DAYS, PROTECTION_GUARANTEE_DAYS } from '../lib/constants';
import {
  Card, ServiceIcon, StatusBadge, InlineRow, Modal, notify,
  ReportTechnicianButton, ReportTechnicianModal, CancelBookingModal,
} from '../components/shared';
import { COLOR_ACCENT_AMBER, COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_ERROR_BG, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_SUCCESS_ACTION, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_SUBTLE, COLOR_WARNING_BORDER, COLOR_WHITE } from '../lib/theme';

/** §17.5.4 three-line invoice fields, fils→JOD (1000 fils = 1 JOD). */
function fmtFilsJod(fils: number | undefined): number {
  return (fils ?? 0) / 1000;
}

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;
const TIME_SLOTS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 8;
  return `${h.toString().padStart(2, '0')}:00`;
});

export interface SlotDay {
  key: string;
  label: string;
  dateStr: string;
  dayName: string;
}

/**
 * Builds the next 7 selectable days (starting *tomorrow* so no slot is ever in
 * the past). Uses local calendar fields throughout so the `dateStr` we store
 * matches how `new Date("YYYY-MM-DDThh:mm:00")` is later parsed (local time).
 * `Date.prototype.setDate` rolls over month/year boundaries correctly.
 */
export function buildSlotDays(now: Date = new Date()): SlotDay[] {
  const result: SlotDay[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    result.push({
      key: dateStr,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      dateStr,
      dayName: AR_DAYS[d.getDay()],
    });
  }
  return result;
}

/**
 * Escapes HTML-special characters so untrusted, server-supplied strings
 * (service name, additional-work description, payment status, IDs) cannot
 * break out of their text context when interpolated into the receipt HTML
 * string written to a new window. Without this, a technician-controlled
 * `description` is a stored-XSS sink in the print window.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateReceiptHtml(b: FullBooking, extras: AdditionalWorkItem[]) {
  const discount = Number(b.discountJod ?? 0);
  const materialsJod = fmtFilsJod(b.materialsFils);
  // §17.5.4 — labour · materials · fees, never one opaque total. labourFils
  // defaults to the full price for bookings created before this split existed.
  const labourJod = b.labourFils != null ? fmtFilsJod(b.labourFils) : Number(b.service?.priceJod ?? b.totalJod);
  const feesJod = fmtFilsJod(b.feesFils);
  const surchargeJod = fmtFilsJod(b.surchargeFils);
  const rows = [
    `<tr><td>أجور العمل</td><td>${escapeHtml(labourJod)} دينار</td></tr>`,
    ...(materialsJod > 0 ? [`<tr><td>المواد</td><td>${escapeHtml(materialsJod)} دينار</td></tr>`] : []),
    ...(feesJod > 0 ? [`<tr><td>الرسوم</td><td>${escapeHtml(feesJod)} دينار</td></tr>`] : []),
    ...(surchargeJod > 0 ? [`<tr><td>رسوم طارئة/خارج الدوام</td><td>${escapeHtml(surchargeJod)} دينار</td></tr>`] : []),
    ...(discount > 0 ? [`<tr><td>الخصم</td><td>- ${escapeHtml(discount)} دينار</td></tr>`] : []),
    ...extras.map((e) => `<tr><td>عمل إضافي: ${escapeHtml(e.description)}</td><td>${escapeHtml(Number(e.amountJod))} دينار</td></tr>`),
  ].join('');

  const date = b.scheduledAt
    ? formatDateAr(b.scheduledAt)
    : b.createdAt
      ? formatDateAr(b.createdAt)
      : '—';

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>إيصال Fixly</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:32px;max-width:420px;margin:0 auto;color:${COLOR_TEXT_PRIMARY}}
h1{font-size:22px;color:${COLOR_BRAND_PRIMARY};margin-bottom:4px}
.sub{color:${COLOR_TEXT_SUBTLE};font-size:12px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
td{padding:8px 0;font-size:14px;border-bottom:1px solid ${COLOR_BORDER}}
td:last-child{text-align:left;font-weight:600;font-family:'Inter',monospace}
.total td{border-bottom:none;font-weight:800;font-size:16px;padding-top:12px}
.meta{margin-top:20px;font-size:12px;color:${COLOR_TEXT_SUBTLE};line-height:1.8}
@media print{body{padding:16px}}
</style></head><body>
<h1>Fixly</h1>
<p class="sub">إيصال دفع</p>
<table>
<tr><td><strong>الخدمة</strong></td><td>${escapeHtml(b.service?.nameAr ?? '—')}</td></tr>
${rows}
<tr class="total"><td>الإجمالي</td><td>${escapeHtml(Number(b.totalJod))} دينار</td></tr>
</table>
<div class="meta">
<div>رقم الحجز: ${escapeHtml(b.id.slice(0, 8))}</div>
<div>التاريخ: ${escapeHtml(date)}</div>
<div>حالة الدفع: ${escapeHtml(b.payment?.status ?? '—')}</div>
</div>
</body></html>`;
}

export function downloadReceipt(b: FullBooking, extras: AdditionalWorkItem[]) {
  const html = generateReceiptHtml(b, extras);
  const w = window.open('', '_blank');
  if (!w) {
    notify('يرجى السماح بالنوافذ المنبثقة لتحميل الإيصال', 'error');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export type FullBooking = Booking & {
  technicianId: string | null;
  discountJod?: string | number;
  scheduledAt: string | null;
  completedAt?: string | null;
  createdAt?: string;
  payment?: { status: string; capturedAmountJod: string | number | null } | null;
};

export default function BookingDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [showRate, setShowRate] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reschedule, setReschedule] = useState('');

  const { data: b, isLoading, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get<FullBooking>(`/bookings/${id}`),
  });
  const { data: extra } = useQuery({
    queryKey: ['booking-extra', id],
    queryFn: () => api.get<AdditionalWorkItem[]>(`/bookings/${id}/additional-work`),
  });
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription | null>('/subscriptions/me') });

  if (isLoading) return <Centered>جارٍ التحميل...</Centered>;
  if (!b) return <Centered tone="error">الحجز غير موجود</Centered>;

  const discount = Number(b.discountJod ?? 0);
  const labourJod = b.labourFils != null ? fmtFilsJod(b.labourFils) : Number(b.service?.priceJod ?? b.totalJod);
  const materialsJod = fmtFilsJod(b.materialsFils);
  const feesJod = fmtFilsJod(b.feesFils);
  const surchargeJod = fmtFilsJod(b.surchargeFils);
  const price = labourJod; // kept for CancelBookingModal's pre-cancellation breakdown below
  const approvedExtras = (extra ?? []).filter((e) => e.status === 'APPROVED');
  const proposedExtras = (extra ?? []).filter((e) => e.status === 'PROPOSED');
  const guaranteeDays = sub?.status === 'ACTIVE' ? sub?.guaranteeDays ?? PROTECTION_GUARANTEE_DAYS : DEFAULT_GUARANTEE_DAYS;

  async function respondExtra(itemId: string, approve: boolean) {
    try {
      await api.post(`/bookings/${id}/additional-work/${itemId}/respond`, { approve });
      notify(approve ? 'تمت الموافقة على العمل الإضافي' : 'تم رفض العمل الإضافي', 'success');
      void qc.invalidateQueries({ queryKey: ['booking-extra', id] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'خطأ', 'error');
    }
  }
  const isScheduled = ['PENDING', 'CONFIRMED'].includes(b.status) && !!b.scheduledAt;
  const isActive = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status);
  const withinGuaranteeWindow = b.completedAt ? Date.now() - new Date(b.completedAt).getTime() < guaranteeDays * 864e5 : false;

  async function submitReview() {
    try {
      await api.post(`/bookings/${id}/review`, { rating, comment: comment.trim() || undefined });
      notify('شكراً لتقييمك', 'success');
      setShowRate(false);
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر إرسال التقييم', 'error');
    }
  }

  async function doReschedule() {
    if (!reschedule) return;
    try {
      await api.post(`/bookings/${id}/reschedule`, { scheduledAt: new Date(reschedule).toISOString() });
      notify('تم تغيير الموعد', 'success');
      setReschedule('');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر تغيير الموعد', 'error');
    }
  }

  async function doCancel(reason: string) {
    setCancelling(false);
    try {
      await api.post(`/bookings/${id}/cancel`, { reason });
      notify('تم إلغاء الحجز وإصدار المبلغ المسترد', 'success');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الإلغاء', 'error');
    }
  }

  return (
    <main className="max-w-[700px] mx-auto px-6 py-8">
      <button onClick={() => navigate('/my-bookings')} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} /> طلباتي
      </button>

      <Card className="mt-4 p-6">
        <div className="flex items-center gap-4">
          <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={24} />
          <div className="flex-1">
            <div style={{ fontWeight: 800, fontSize: 18 }}>{b.service?.nameAr}</div>
            <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>
              {b.scheduledAt ? formatDateTimeAr(b.scheduledAt) : 'فوراً'}
            </div>
          </div>
          <StatusBadge status={b.status} />
        </div>

        <div className="my-4 h-px bg-slate-100" />
        <h2 style={{ fontWeight: 700, fontSize: 15 }}>الإيصال</h2>
        {/* §17.5.4 three-line invoice — never one opaque total. */}
        <InlineRow label="أجور العمل" value={`${labourJod} دينار`} />
        {materialsJod > 0 && <InlineRow label="المواد" value={`${materialsJod} دينار`} />}
        {feesJod > 0 && <InlineRow label="الرسوم" value={`${feesJod} دينار`} />}
        {surchargeJod > 0 && <InlineRow label="رسوم طارئة/خارج الدوام" value={`${surchargeJod} دينار`} />}
        {discount > 0 && <InlineRow label="الخصم" value={`- ${discount} دينار`} />}
        {approvedExtras.map((e) => (
          <InlineRow key={e.id} label={`عمل إضافي: ${e.description}`} value={`${Number(e.amountJod)} دينار`} />
        ))}
        <div className="my-2 h-px bg-slate-100" />
        <InlineRow strong label="الإجمالي المدفوع" value={`${Number(b.totalJod)} دينار`} />
        {b.payment && (
          <p className="mt-2" style={{ color: COLOR_SUCCESS_TEXT, fontSize: 12 }}>حالة الدفع: {b.payment.status}</p>
        )}
        {Number(b.lateCompJod ?? 0) > 0 && (
          <p className="mt-2" style={{ color: COLOR_SUCCESS_TEXT, fontSize: 12, fontWeight: 600 }}>
            حصلت على <span style={{ fontFamily: 'Inter' }}>{Number(b.lateCompJod)}</span> دينار كتعويض تأخير — أُضيفت إلى رصيدك
          </p>
        )}
        <button
          onClick={() => downloadReceipt(b, approvedExtras)}
          className="mt-3 w-full h-11 rounded-xl flex items-center justify-center gap-2"
          style={{ background: COLOR_BG_SUBTLE, color: COLOR_BRAND_PRIMARY, fontWeight: 700, fontSize: 13 }}
        >
          <Download size={16} /> تحميل الإيصال
        </button>
      </Card>

      {proposedExtras.length > 0 && (
        <Card className="mt-4 p-5" style={{ border: `1px solid ${COLOR_WARNING_BORDER}` }}>
          <h2 style={{ fontWeight: 700, fontSize: 15 }}>عمل إضافي بانتظار موافقتك</h2>
          {proposedExtras.map((e) => (
            <div key={e.id} className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.description}</div>
                <div style={{ color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}><span style={{ fontFamily: 'Inter' }}>{Number(e.amountJod)}</span> دينار</div>
              </div>
              <button onClick={() => void respondExtra(e.id, true)} className="px-4 h-10 rounded-xl" style={{ background: COLOR_SUCCESS_ACTION, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}>موافقة</button>
              <button onClick={() => void respondExtra(e.id, false)} className="px-4 h-10 rounded-xl" style={{ background: COLOR_ERROR_BG, color: COLOR_ERROR_TEXT, fontWeight: 600, fontSize: 13 }}>رفض</button>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {isActive && (
          <button onClick={() => navigate(`/bookings/${id}/track`)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
            <Navigation size={18} /> تتبّع الحجز
          </button>
        )}
        {b.status === 'COMPLETED' && (
          <button onClick={() => setShowRate(true)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
            <Star size={18} /> قيّم الخدمة
          </button>
        )}
        {b.status === 'COMPLETED' && withinGuaranteeWindow && (
          <button onClick={() => navigate('/guarantee')} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT, fontWeight: 700 }}>
            <ShieldCheck size={18} /> فتح تذكرة ضمان
          </button>
        )}
        {b.status === 'COMPLETED' && (
          <ReportTechnicianButton onClick={() => setShowReport(true)} className="w-full h-12" label="الإبلاغ عن الفني" />
        )}
        {/* §17.1: support reachable from the order screen — always available,
            not just for completed bookings. */}
        <button onClick={() => navigate('/account?tab=support')} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 600 }}>
          <LifeBuoy size={18} /> تواصل مع الدعم
        </button>
        {isScheduled && (
          <Card className="p-4">
            <label className="block" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>تغيير الموعد</label>
            <SlotPicker value={reschedule} onChange={setReschedule} />
            <button
              onClick={() => void doReschedule()}
              disabled={!reschedule}
              className="mt-3 w-full h-11 rounded-xl disabled:opacity-50"
              style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}
            >
              تأكيد
            </button>
          </Card>
        )}
        {isScheduled && (
          <button onClick={() => setCancelling(true)} className="w-full h-12 rounded-xl" style={{ color: COLOR_ERROR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_ERROR_BORDER}` }}>
            إلغاء الحجز
          </button>
        )}
      </div>

      {showRate && (
        <Modal title="قيّم تجربتك" variant="sheet" maxWidth="sm" onClose={() => setShowRate(false)}>
          <div className="mt-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n} نجوم`} aria-pressed={n <= rating}>
                <Star size={36} fill={n <= rating ? COLOR_ACCENT_AMBER : 'none'} color={COLOR_ACCENT_AMBER} strokeWidth={n <= rating ? 0 : 2} />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="أضف تعليقاً (اختياري)"
            aria-label="تعليق التقييم"
            className="mt-4 w-full rounded-xl border border-slate-200 p-3 outline-none"
            rows={3}
            style={{ fontSize: 14 }}
          />
          <button
            onClick={() => void submitReview()}
            disabled={rating === 0}
            className="mt-4 w-full h-12 rounded-xl disabled:opacity-50"
            style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}
          >
            إرسال
          </button>
        </Modal>
      )}

      {cancelling && (
        <CancelBookingModal
          priceJod={price}
          discountJod={discount}
          totalJod={Number(b.totalJod)}
          onConfirm={(reason) => void doCancel(reason)}
          onCancel={() => setCancelling(false)}
        />
      )}
      {showReport && (
        <ReportTechnicianModal bookingId={id} technicianId={b.technicianId} onClose={() => setShowReport(false)} />
      )}
    </main>
  );
}

function SlotPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = useMemo(() => buildSlotDays(), []);

  function pickSlot(dateStr: string, time: string) {
    const iso = `${dateStr}T${time}:00`;
    onChange(iso);
  }

  const selectedTime = value ? value.split('T')[1]?.slice(0, 5) ?? null : null;

  return (
    <div className="mt-3">
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {days.map((d) => (
          <button
            key={d.key}
            onClick={() => setSelectedDate(d.key)}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-center"
            style={{
              minWidth: 72,
              background: selectedDate === d.key ? COLOR_BRAND_PRIMARY : COLOR_WHITE,
              color: selectedDate === d.key ? COLOR_WHITE : COLOR_TEXT_SECONDARY,
              border: '1px solid',
              borderColor: selectedDate === d.key ? COLOR_BRAND_PRIMARY : COLOR_BORDER,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <div>{d.dayName}</div>
            <div style={{ fontSize: 11, marginTop: 2, fontFamily: 'Inter' }}>{d.label}</div>
          </button>
        ))}
      </div>

      {selectedDate && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {TIME_SLOTS.map((t) => {
            const isActive = selectedDate === value?.split('T')[0] && selectedTime === t;
            return (
              <button
                key={t}
                onClick={() => pickSlot(selectedDate, t)}
                className="h-10 rounded-xl"
                style={{
                  background: isActive ? COLOR_BRAND_PRIMARY : COLOR_WHITE,
                  color: isActive ? COLOR_WHITE : COLOR_TEXT_SECONDARY,
                  border: '1px solid',
                  borderColor: isActive ? COLOR_BRAND_PRIMARY : COLOR_BORDER,
                  fontWeight: 600,
                  fontSize: 13,
                  fontFamily: 'Inter',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Centered({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return <main className="max-w-[700px] mx-auto px-6 py-16 text-center"><p style={{ color: tone === 'error' ? COLOR_ERROR_TEXT : COLOR_TEXT_MUTED, fontSize: 16 }}>{children}</p></main>;
}

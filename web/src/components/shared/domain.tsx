import { useState } from 'react';
import { Flag } from 'lucide-react';
import { api, ConductReportKind } from '../../lib/api';
import { Modal } from './dialogs';
import { InlineRow, notify } from './misc';

/* ── Report technician (conduct reports) ───────────────────────────────────── */

export const CONDUCT_REPORT_REASONS: ReadonlyArray<readonly [ConductReportKind, string]> = [
  ['OFF_PLATFORM_SOLICIT', 'محاولة التعامل خارج التطبيق'],
  ['NO_SHOW', 'لم يحضر'],
  ['QUALITY', 'جودة سيئة'],
  ['SAFETY', 'سلامة'],
  ['OTHER', 'أخرى'],
];

/**
 * Report-technician flow shared by TrackingPage and BookingDetail: a reason
 * picker (matching the conduct-report `kind` enum) + optional details, wired
 * to `POST /conduct-reports`.
 */
export function ReportTechnicianModal({
  bookingId,
  technicianId,
  onClose,
}: {
  bookingId: string;
  technicianId?: string | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ConductReportKind | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!kind) return;
    setSubmitting(true);
    try {
      await api.post('/conduct-reports', {
        kind,
        bookingId,
        subjectTechId: technicianId ?? undefined,
        details: details.trim() || undefined,
      });
      notify('تم إرسال بلاغك، سيتم مراجعته من فريقنا', 'success');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر إرسال البلاغ', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="الإبلاغ عن الفني" variant="sheet" maxWidth="sm" onClose={onClose}>
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="سبب البلاغ">
        {CONDUCT_REPORT_REASONS.map(([k, label]) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className="w-full flex items-center justify-between px-4 h-12 rounded-xl border-2 text-start"
            style={{ borderColor: kind === k ? '#1366D6' : '#E2E8F0', background: kind === k ? '#E8F1FE' : '#FFF' }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: kind === k ? '#1366D6' : '#0F172A' }}>{label}</span>
          </button>
        ))}
      </div>
      <label htmlFor="conduct-details" className="block mt-4" style={{ fontSize: 13, color: '#475569' }}>تفاصيل إضافية (اختياري)</label>
      <textarea
        id="conduct-details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        placeholder="اشرح ما حدث..."
        className="mt-1 w-full rounded-xl border border-slate-200 p-3 outline-none"
        style={{ fontSize: 14 }}
      />
      <button
        onClick={() => void submit()}
        disabled={!kind || submitting}
        className="mt-4 w-full h-12 rounded-xl disabled:opacity-50"
        style={{ background: '#B91C1C', color: '#FFF', fontWeight: 700 }}
      >
        {submitting ? '...' : 'إرسال البلاغ'}
      </button>
    </Modal>
  );
}

/** Button that opens the report-technician modal, for use in action rows or full-width stacks. */
export function ReportTechnicianButton({ onClick, className = '', label = 'إبلاغ' }: { onClick: () => void; className?: string; label?: string }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1 h-11 rounded-xl ${className}`} style={{ background: '#FEF2F2', color: '#B91C1C', fontWeight: 600, fontSize: 13 }}>
      <Flag size={16} /> {label}
    </button>
  );
}

/* ── Cancellation with reason + refund breakdown ───────────────────────────── */

export const CANCEL_REASONS: ReadonlyArray<readonly [string, string]> = [
  ['CHANGED_MIND', 'غيّرت رأيي'],
  ['FOUND_ALTERNATIVE', 'وجدت حلاً آخر'],
  ['TECH_DELAYED', 'تأخر الفني'],
  ['OTHER', 'سبب آخر'],
];

const CANCEL_REASON_LABEL: Record<string, string> = Object.fromEntries(CANCEL_REASONS);

/**
 * Two-step cancellation: pick a reason, then confirm against an itemized
 * refund summary. Shared by TrackingPage and BookingDetail.
 */
export function CancelBookingModal({
  priceJod,
  discountJod = 0,
  totalJod,
  onConfirm,
  onCancel,
}: {
  priceJod: number;
  discountJod?: number;
  totalJod: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);

  if (!reason) {
    return (
      <Modal title="سبب الإلغاء" variant="center" maxWidth="sm" onClose={onCancel}>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="سبب الإلغاء">
          {CANCEL_REASONS.map(([k, label]) => (
            <button
              key={k}
              role="radio"
              aria-checked={false}
              onClick={() => setReason(k)}
              className="w-full text-start px-4 h-12 rounded-xl border-2"
              style={{ borderColor: '#E2E8F0', background: '#FFF', fontWeight: 600, fontSize: 14 }}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="mt-4 w-full h-11 rounded-xl" style={{ color: '#475569', fontWeight: 600 }}>تراجع</button>
      </Modal>
    );
  }

  const refund = totalJod;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={() => setReason(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-5 bg-white rounded-2xl p-5 shadow-2xl"
        style={{ maxWidth: 380, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontWeight: 700, fontSize: 18, textAlign: 'center' }}>تأكيد إلغاء الحجز</h3>
        <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 6 }}>
          السبب: {CANCEL_REASON_LABEL[reason] ?? reason}
        </p>
        <div className="mt-4 rounded-xl p-3" style={{ background: '#F8FAFC' }}>
          <InlineRow label="سعر الخدمة" value={`${priceJod} دينار`} />
          {discountJod > 0 && <InlineRow label="الخصم" value={`- ${discountJod} دينار`} />}
          <div className="my-1 h-px bg-slate-200" />
          <InlineRow strong label="المبلغ المسترد" value={`${refund} دينار`} />
        </div>
        <div className="mt-5 space-y-2">
          <button onClick={() => onConfirm(CANCEL_REASON_LABEL[reason] ?? reason)} className="w-full h-[52px] rounded-xl" style={{ background: '#B91C1C', color: '#FFF', fontWeight: 700 }}>تأكيد الإلغاء</button>
          <button onClick={() => setReason(null)} className="w-full h-[52px] rounded-xl" style={{ color: '#1366D6', fontWeight: 600 }}>تراجع</button>
        </div>
      </div>
    </div>
  );
}

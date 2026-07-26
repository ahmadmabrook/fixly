import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api, EligibleBooking, GuaranteeTicketItem, GuaranteeTicketStatus, Subscription } from '../lib/api';
import { formatDateAr, formatDateTimeAr } from '../lib/format';
import { DEFAULT_GUARANTEE_DAYS, PROTECTION_GUARANTEE_DAYS } from '../lib/constants';
import { Card, ServiceIcon, Modal, notify } from '../components/shared';
import { COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ERROR_TEXT, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WARNING_TEXT, COLOR_WHITE } from '../lib/theme';

const WARRANTY_SCOPE_LABEL: Record<'FULL' | 'WORKMANSHIP_ONLY', string> = {
  FULL: 'ضمان كامل',
  WORKMANSHIP_ONLY: 'الضمان على العمل فقط — مواد العميل',
};

const STATUS_LABEL: Record<GuaranteeTicketStatus, { ar: string; color: string }> = {
  OPEN: { ar: 'مفتوح', color: COLOR_BRAND_PRIMARY },
  IN_REVIEW: { ar: 'قيد المراجعة', color: COLOR_WARNING_TEXT },
  RESOLVED: { ar: 'تمت الموافقة', color: COLOR_SUCCESS_TEXT },
  REJECTED: { ar: 'مرفوض', color: COLOR_ERROR_TEXT },
};

export default function GuaranteePage() {
  const qc = useQueryClient();
  const [openFor, setOpenFor] = useState<EligibleBooking | null>(null);
  const [desc, setDesc] = useState('');

  const { data: eligible } = useQuery({ queryKey: ['guarantee-eligible'], queryFn: () => api.get<EligibleBooking[]>('/guarantee/eligible') });
  const { data: tickets } = useQuery({ queryKey: ['guarantee-tickets'], queryFn: () => api.get<GuaranteeTicketItem[]>('/guarantee') });
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription | null>('/subscriptions/me') });
  const guaranteeDays = sub?.status === 'ACTIVE' ? sub?.guaranteeDays ?? PROTECTION_GUARANTEE_DAYS : DEFAULT_GUARANTEE_DAYS;

  async function submit() {
    if (!openFor || !desc.trim()) return;
    try {
      await api.post('/guarantee', { bookingId: openFor.id, description: desc.trim() });
      notify('تم فتح تذكرة الضمان — سيتم الرد خلال ساعتين', 'success');
      setOpenFor(null);
      setDesc('');
      void qc.invalidateQueries({ queryKey: ['guarantee-tickets'] });
      void qc.invalidateQueries({ queryKey: ['guarantee-eligible'] });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر فتح التذكرة', 'error');
    }
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-8">
      <div className="flex items-center gap-2">
        <ShieldCheck size={26} color={COLOR_SUCCESS_TEXT} />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>الضمان (<span style={{ fontFamily: 'Inter' }}>{guaranteeDays}</span> يوم)</h1>
      </div>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>
        كل خدمة مضمونة لمدة <span style={{ fontFamily: 'Inter' }}>{guaranteeDays}</span> يوماً. إذا واجهت أي مشكلة، افتح تذكرة وسنعيد الفني مجاناً.
      </p>

      <h2 className="mt-8" style={{ fontWeight: 700, fontSize: 18 }}>خدمات مؤهّلة للضمان</h2>
      <div className="mt-3 space-y-3">
        {(eligible ?? []).length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد خدمات مؤهّلة حالياً.</p>}
        {(eligible ?? []).map((b) => (
          <Card key={b.id} className="p-4 flex items-center gap-4">
            <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={20} />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{b.service?.nameAr}</div>
              <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>{b.completedAt ? formatDateAr(b.completedAt) : ''}</div>
              {b.warrantyScope && (
                <div style={{ color: b.warrantyScope === 'FULL' ? COLOR_SUCCESS_TEXT : COLOR_WARNING_TEXT, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                  {WARRANTY_SCOPE_LABEL[b.warrantyScope]}
                </div>
              )}
            </div>
            <button onClick={() => setOpenFor(b)} className="px-4 h-10 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 600, fontSize: 13 }}>
              فتح تذكرة
            </button>
          </Card>
        ))}
      </div>

      <h2 className="mt-8" style={{ fontWeight: 700, fontSize: 18 }}>تذاكري</h2>
      <div className="mt-3 space-y-3">
        {(tickets ?? []).length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد تذاكر بعد.</p>}
        {(tickets ?? []).map((t) => {
          const s = STATUS_LABEL[t.status] ?? { ar: t.status, color: COLOR_TEXT_SECONDARY };
          return (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between">
                <span style={{ fontWeight: 700, fontSize: 15 }}>{t.booking?.service?.nameAr ?? 'خدمة'}</span>
                <span style={{ color: s.color, fontWeight: 700, fontSize: 13 }}>{s.ar}</span>
              </div>
              {t.description && <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, marginTop: 6 }}>{t.description}</p>}
              {t.adminNote && <p style={{ color: COLOR_BRAND_PRIMARY_DARK, fontSize: 13, marginTop: 6, background: COLOR_BRAND_PRIMARY_TINT, padding: 8, borderRadius: 8 }}>رد الدعم: {t.adminNote}</p>}
              {t.booking?.warrantyScope && (
                <div style={{ color: t.booking.warrantyScope === 'FULL' ? COLOR_SUCCESS_TEXT : COLOR_WARNING_TEXT, fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                  {WARRANTY_SCOPE_LABEL[t.booking.warrantyScope]}
                </div>
              )}
              {t.scheduledVisitAt && <p style={{ color: COLOR_SUCCESS_TEXT, fontSize: 13, marginTop: 6 }}>زيارة مجانية مجدولة: {formatDateTimeAr(t.scheduledVisitAt)}</p>}
            </Card>
          );
        })}
      </div>

      {openFor && (
        <Modal title="فتح تذكرة ضمان" variant="sheet" maxWidth="md" onClose={() => setOpenFor(null)}>
          <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, marginTop: 4 }}>{openFor.service?.nameAr}</p>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="صف المشكلة التي واجهتها..."
            aria-label="وصف مشكلة الضمان"
            rows={4}
            className="mt-3 w-full rounded-xl border border-slate-200 p-3 outline-none"
            style={{ fontSize: 14 }}
          />
          <button onClick={() => void submit()} disabled={!desc.trim()} className="mt-4 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
            إرسال (سيتم الرد خلال ساعتين)
          </button>
        </Modal>
      )}
    </main>
  );
}

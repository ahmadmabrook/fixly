import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api, BookingMaterialItem, MaterialSource, VarianceReasonKind } from '../lib/api';
import { Card, notify } from '../components/shared';
import {
  COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_ERROR_BG, COLOR_ERROR_TEXT,
  COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_WARNING_BG, COLOR_WARNING_TEXT, COLOR_WHITE,
} from '../lib/theme';

const VARIANCE_REASON_LABEL: Record<VarianceReasonKind, string> = {
  SPECIAL_TYPE: 'نوع خاص',
  IMPORTED_BRAND: 'ماركة مستوردة',
  ACCESS_DIFFICULTY: 'صعوبة وصول',
  OTHER: 'أخرى',
};

const SOURCE_LABEL: Record<MaterialSource, string> = {
  TECHNICIAN_PROCURED: 'أحضرها الفني',
  CUSTOMER_SUPPLIED: 'مواد وفّرتها',
  PLATFORM_ARRANGED: 'رتّبتها المنصة',
};

const STATUS_NOTE: Partial<Record<string, string>> = {
  PENDING: 'تمت الموافقة — بانتظار بدء العمل',
  APPROVED: 'تمت المراجعة والموافقة',
  DECLINED: 'مرفوضة',
  REPLACED: 'تم استبدالها بمادة أخرى',
  UNUSED: 'لم تُستخدم فعلياً',
  LOCKED: 'مقفلة — العمل جارٍ',
};

function jodFromFils(fils: number): string {
  return (fils / 1000).toFixed(3);
}

/**
 * §8.12 — customer's Bill-of-Materials approval list. A plain PENDING line
 * blocks ARRIVED→IN_PROGRESS until approved (§17.5.9 requireBomApprovedForWorkStart);
 * a PENDING_REVIEW line (price above the catalog band) only asks for a decision
 * once the technician has recorded a variance reason, and approving/declining it
 * never blocks work-start on its own — it exists so "silence is not consent"
 * also applies to a price dispute, not only to the base BOM.
 */
export function CustomerMaterialsSection({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  // declineByCustomer doesn't set customerAckAt (only opens a verification
  // request and leaves status at PENDING_REVIEW) — the list endpoint can't
  // tell "just declined, technician now has 24h" apart from "not yet
  // actioned" after a refetch, so that one state is tracked locally instead
  // of being misread as still-actionable.
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());

  const { data: lines, refetch } = useQuery({
    queryKey: ['booking-materials', bookingId],
    queryFn: () => api.get<BookingMaterialItem[]>(`/bookings/${bookingId}/materials`),
  });

  async function approve(lineId: string) {
    setBusyId(lineId);
    try {
      await api.post(`/bookings/${bookingId}/materials/${lineId}/approve`, {});
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّرت الموافقة', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function ack(lineId: string) {
    setBusyId(lineId);
    try {
      await api.post(`/bookings/${bookingId}/materials/${lineId}/ack`, {});
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّرت الموافقة', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function decline(lineId: string) {
    setBusyId(lineId);
    try {
      await api.post(`/bookings/${bookingId}/materials/${lineId}/decline`, {});
      setDeclinedIds((prev) => new Set(prev).add(lineId));
      notify('تم إرسال طلب التحقق من السعر للفني — سيرد خلال 24 ساعة', 'success');
      void qc.invalidateQueries({ queryKey: ['booking-materials', bookingId] });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الرفض', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (!Array.isArray(lines) || lines.length === 0) return null;

  return (
    <Card className="p-5">
      <h3 style={{ fontWeight: 700, fontSize: 16 }}>المواد المستخدمة</h3>
      <div className="mt-3 space-y-2">
        {lines.map((l) => {
          const alreadyDeclined = declinedIds.has(l.id);
          const needsApproval = l.status === 'PENDING' && !l.customerAckAt;
          const disputeAwaitingCustomer = l.status === 'PENDING_REVIEW' && !!l.varianceReason && !l.customerAckAt && !alreadyDeclined;
          const waitingOnTech = l.status === 'PENDING_REVIEW' && !l.varianceReason;
          const highlight = needsApproval || disputeAwaitingCustomer;
          return (
            <div key={l.id} className="rounded-xl p-3" style={{ border: `1px solid ${highlight ? COLOR_BRAND_PRIMARY : COLOR_BORDER}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{l.description}{l.brand ? ` — ${l.brand}` : ''}</div>
                  <div style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginTop: 2 }}>
                    {SOURCE_LABEL[l.source]} · <span style={{ fontFamily: 'Inter' }}>{l.qty}</span>{l.unit ? ` ${l.unit}` : ''}
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: 13 }}><span style={{ fontFamily: 'Inter' }}>{jodFromFils(l.totalFils)}</span> دينار</span>
              </div>

              {disputeAwaitingCustomer && (
                <div className="mt-2 rounded-lg p-2" style={{ background: COLOR_WARNING_BG }}>
                  <p style={{ color: COLOR_WARNING_TEXT, fontSize: 12, fontWeight: 600 }}>
                    سعر أعلى من المرجع — سبب الفني: {VARIANCE_REASON_LABEL[l.varianceReason as VarianceReasonKind]}{l.varianceReasonNote ? ` — ${l.varianceReasonNote}` : ''}
                  </p>
                </div>
              )}
              {waitingOnTech && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginTop: 4 }}>فرق سعر — بانتظار توضيح الفني</p>}
              {l.status === 'PENDING_REVIEW' && alreadyDeclined && (
                <p style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginTop: 4 }}>تم إرسال طلب التحقق — بانتظار رد الفني خلال 24 ساعة</p>
              )}
              {!needsApproval && !disputeAwaitingCustomer && !waitingOnTech && !alreadyDeclined && STATUS_NOTE[l.status] && (
                <p style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginTop: 4 }}>{STATUS_NOTE[l.status]}</p>
              )}

              {needsApproval && (
                <button
                  onClick={() => void approve(l.id)}
                  disabled={busyId === l.id}
                  className="mt-2 w-full h-9 rounded-lg disabled:opacity-50"
                  style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 12 }}
                >
                  موافقة
                </button>
              )}
              {disputeAwaitingCustomer && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void ack(l.id)}
                    disabled={busyId === l.id}
                    className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
                    style={{ background: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT, fontWeight: 700, fontSize: 12 }}
                  >
                    <Check size={13} /> موافقة على الفرق
                  </button>
                  <button
                    onClick={() => void decline(l.id)}
                    disabled={busyId === l.id}
                    className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
                    style={{ background: COLOR_ERROR_BG, color: COLOR_ERROR_TEXT, fontWeight: 700, fontSize: 12 }}
                  >
                    <X size={13} /> رفض والتحقق
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

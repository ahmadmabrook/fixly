import { useState } from 'react';
import { ChevronLeft, Download, FileText, Share2 } from 'lucide-react';
import { api, AdditionalWorkItem, BookingListItem } from '../../lib/api';
import { Card, notify, SkeletonList, StatusBadge } from '../../components/shared';
import { useBookings } from '../../hooks/useBookings';
import { downloadReceipt, type FullBooking } from '../BookingDetail';
import { formatDateAr } from '../../lib/format';
import { COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WARNING_BG, COLOR_WARNING_TEXT } from '../../lib/theme';

/** §17.5.4 three-line invoice fields, fils→JOD (1000 fils = 1 JOD). */
function fmtFilsJod(fils: number | undefined): number {
  return (fils ?? 0) / 1000;
}

/** §17.8 — derived the same way GuaranteeService.deriveWarrantyScope does
 *  server-side: a customer-supplied materials line, once acknowledged,
 *  narrows the guarantee to workmanship only. */
function warrantyLabel(b: Pick<BookingListItem, 'customerSuppliedMaterialsAckAt'>) {
  return b.customerSuppliedMaterialsAckAt
    ? { ar: 'الضمان على العمل فقط — مواد العميل', bg: COLOR_WARNING_BG, fg: COLOR_WARNING_TEXT }
    : { ar: 'ضمان كامل', bg: COLOR_SUCCESS_BG, fg: COLOR_SUCCESS_TEXT };
}

export function ReceiptsTab() {
  const { data: bookings, isLoading } = useBookings();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const completed = (bookings ?? []).filter((b) => b.status === 'COMPLETED');

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const [full, extra] = await Promise.all([
        api.get<FullBooking>(`/bookings/${id}`),
        api.get<AdditionalWorkItem[]>(`/bookings/${id}/additional-work`),
      ]);
      const approvedExtras = extra.filter((e) => e.status === 'APPROVED');
      downloadReceipt(full, approvedExtras);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر تحميل الإيصال', 'error');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleShare(b: BookingListItem) {
    const text = `إيصال Fixly — ${b.service?.nameAr ?? ''} — ${Number(b.totalJod)} دينار`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'إيصال Fixly', text });
      } catch {
        /* user cancelled the native share sheet — not an error */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify('تم نسخ تفاصيل الإيصال', 'success');
    } catch {
      notify('تعذّرت المشاركة', 'error');
    }
  }

  if (isLoading) return <SkeletonList count={4} rowHeight={72} />;
  return (
    <div className="space-y-3">
      {completed.length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد فواتير بعد.</p>}
      {completed.map((b) => {
        const isOpen = expanded === b.id;
        const warranty = warrantyLabel(b);
        const labourJod = b.labourFils != null ? fmtFilsJod(b.labourFils) : Number(b.totalJod);
        const materialsJod = fmtFilsJod(b.materialsFils);
        const feesJod = fmtFilsJod(b.feesFils);
        const surchargeJod = fmtFilsJod(b.surchargeFils);
        const discount = Number(b.discountJod ?? 0);
        return (
          <Card key={b.id} className="overflow-hidden">
            <button onClick={() => setExpanded(isOpen ? null : b.id)} className="w-full p-4 flex items-center gap-3 text-start" aria-expanded={isOpen}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: COLOR_BG_SUBTLE }}>
                <FileText size={18} color={COLOR_TEXT_SECONDARY} aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.service?.nameAr}</div>
                <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, marginTop: 2 }}>
                  {b.scheduledAt ? formatDateAr(b.scheduledAt) : b.createdAt ? formatDateAr(b.createdAt) : '—'}
                </div>
                <span className="mt-1 inline-block text-xs font-semibold rounded px-1.5 py-0.5" style={{ background: warranty.bg, color: warranty.fg }}>
                  {warranty.ar}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13, color: COLOR_BRAND_PRIMARY_DARK }}>{Number(b.totalJod)} دينار</span>
                <StatusBadge status={b.status} />
                <ChevronLeft size={16} color={COLOR_TEXT_MUTED} aria-hidden="true" style={{ transform: isOpen ? 'rotate(-90deg)' : undefined, transition: 'transform 0.15s' }} />
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${COLOR_BORDER}` }}>
                {/* Three-line invoice (§17.5.4) — never one opaque total */}
                <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: COLOR_BG_SUBTLE }}>
                  <div className="flex justify-between" style={{ fontSize: 13 }}>
                    <span style={{ color: COLOR_TEXT_SECONDARY }}>أجور العمل</span>
                    <span style={{ fontWeight: 600 }}>{labourJod} دينار</span>
                  </div>
                  {materialsJod > 0 && (
                    <div className="flex justify-between" style={{ fontSize: 13 }}>
                      <span style={{ color: COLOR_TEXT_SECONDARY }}>المواد</span>
                      <span style={{ fontWeight: 600 }}>{materialsJod} دينار</span>
                    </div>
                  )}
                  {feesJod > 0 && (
                    <div className="flex justify-between" style={{ fontSize: 13 }}>
                      <span style={{ color: COLOR_TEXT_SECONDARY }}>الرسوم</span>
                      <span style={{ fontWeight: 600 }}>{feesJod} دينار</span>
                    </div>
                  )}
                  {surchargeJod > 0 && (
                    <div className="flex justify-between" style={{ fontSize: 13 }}>
                      <span style={{ color: COLOR_TEXT_SECONDARY }}>رسوم طارئة/خارج الدوام</span>
                      <span style={{ fontWeight: 600 }}>{surchargeJod} دينار</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between" style={{ fontSize: 13 }}>
                      <span style={{ color: COLOR_TEXT_SECONDARY }}>الخصم</span>
                      <span style={{ fontWeight: 600 }}>- {discount} دينار</span>
                    </div>
                  )}
                  <div className="h-px" style={{ background: COLOR_BORDER }} />
                  <div className="flex justify-between">
                    <span style={{ fontWeight: 700 }}>الإجمالي</span>
                    <span style={{ fontWeight: 800, color: COLOR_BRAND_PRIMARY }}>{Number(b.totalJod)} دينار</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void handleDownload(b.id)}
                    disabled={downloadingId === b.id}
                    aria-label="تنزيل الإيصال"
                    className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl disabled:opacity-50"
                    style={{ background: COLOR_BG_SUBTLE, color: COLOR_BRAND_PRIMARY, fontWeight: 700, fontSize: 13 }}
                  >
                    <Download size={16} /> تنزيل
                  </button>
                  <button
                    onClick={() => void handleShare(b)}
                    aria-label="مشاركة الإيصال"
                    className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl"
                    style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 700, fontSize: 13 }}
                  >
                    <Share2 size={16} /> مشاركة
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type MaterialVerificationAdminItem } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, Pill, Countdown, notify } from '../components/shared';
import { fmtFils, safeHttpsUrl } from '../lib/format';
import { COLOR_STATUS_DANGER, COLOR_STATUS_DANGER_BG, COLOR_STATUS_INFO_BG, COLOR_STATUS_SUCCESS, COLOR_STATUS_SUCCESS_BG, COLOR_STATUS_WARNING_BG, COLOR_BRAND_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY } from '../lib/theme';

const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  OPEN: { ar: 'بانتظار الفاتورة', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_DANGER },
  INVOICE_PROVIDED: { ar: 'فاتورة مرفوعة', bg: COLOR_STATUS_INFO_BG, fg: COLOR_BRAND_PRIMARY },
  UPHELD: { ar: 'مقبول', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  DEDUCTED: { ar: 'خُصم تلقائياً', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
  WITHDRAWN: { ar: 'أُلغي', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_TEXT_MUTED },
};

/**
 * §17.5.14 — price-variance dispute protocol. A customer declined a
 * justified over-reference material line; the technician has 24h to upload
 * the original invoice. Ops resolves UPHELD (invoice justifies it) or
 * DEDUCTED (difference comes off the technician's dues automatically on
 * timeout, or can be resolved manually here).
 */
export default function PriceVerifications() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-verifications'],
    queryFn: () => api.list<MaterialVerificationAdminItem>('/verifications?limit=100'),
  });
  const items = data?.items ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'UPHELD' | 'DEDUCTED' | 'WITHDRAWN' }) =>
      api.post(`/verifications/${id}/resolve`, { decision }),
    onSuccess: () => { notify('تم حل النزاع', 'success'); void qc.invalidateQueries({ queryKey: ['admin-verifications'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>نزاعات التحقق من الأسعار</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>مهلة 24 ساعة لرفع الفاتورة الأصلية — بعدها يُخصم الفرق تلقائياً.</p>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل النزاعات" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد نزاعات مفتوحة" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((v) => {
            const invoiceUrl = safeHttpsUrl(v.invoiceUrl);
            const actionable = v.status === 'OPEN' || v.status === 'INVOICE_PROVIDED';
            return (
              <Card key={v.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div style={{ fontWeight: 700 }}>حجز {v.bookingId.slice(0, 8)}</div>
                  <Pill label={STATUS_PILL[v.status]?.ar ?? v.status} bg={STATUS_PILL[v.status]?.bg ?? COLOR_STATUS_WARNING_BG} fg={STATUS_PILL[v.status]?.fg ?? COLOR_TEXT_MUTED} />
                </div>
                <div className="mt-3 flex justify-between" style={{ fontSize: 13 }}>
                  <span>المرجع: {fmtFils(v.referencePriceFils)} د.أ</span>
                  <span>المطلوب: {fmtFils(v.chargedPriceFils)} د.أ</span>
                  <span style={{ color: COLOR_STATUS_DANGER, fontWeight: 700 }}>الفرق: {fmtFils(v.deltaFils)} د.أ</span>
                </div>
                {v.status === 'OPEN' && <div style={{ fontSize: 12, color: COLOR_STATUS_DANGER, marginTop: 6 }}>متبقٍ: <Countdown deadlineAt={v.deadlineAt} /></div>}
                {v.status === 'DEDUCTED' && <div style={{ fontSize: 12, color: COLOR_STATUS_DANGER, marginTop: 6, fontWeight: 600 }}>خُصم {fmtFils(v.deltaFils)} د.أ من مستحقات الفني</div>}
                {invoiceUrl && <a href={invoiceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: COLOR_BRAND_PRIMARY, display: 'block', marginTop: 6 }}>عرض الفاتورة</a>}
                {actionable && (
                  <div className="flex gap-2 justify-end mt-3">
                    <ActionBtn variant="ghost" onClick={() => resolve.mutate({ id: v.id, decision: 'DEDUCTED' })} disabled={resolve.isPending}>خصم الفرق</ActionBtn>
                    <ActionBtn onClick={() => resolve.mutate({ id: v.id, decision: 'UPHELD' })} disabled={resolve.isPending}>قبول (الفاتورة تبرر السعر)</ActionBtn>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

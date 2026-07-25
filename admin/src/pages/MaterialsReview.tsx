import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type BookingMaterialAdminItem } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, notify } from '../components/shared';
import { fmtFils, safeHttpsUrl } from '../lib/format';
import { COLOR_STATUS_DANGER, COLOR_STATUS_SUCCESS, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY } from '../lib/theme';

/**
 * §17.5.9 — every BOM line priced off-catalogue or beyond the catalog's
 * varianceAlertBps auto-flags pending_review. This queue is where that
 * review happens before the technician can invoice the line.
 */
export default function MaterialsReview() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-materials-review'],
    queryFn: () => api.list<BookingMaterialAdminItem>('/materials-review?limit=100'),
  });
  const items = data?.items ?? [];

  const resolve = useMutation({
    mutationFn: ({ lineId, decision }: { lineId: string; decision: 'APPROVED' | 'DECLINED' }) =>
      api.post(`/materials-review/${lineId}`, { decision }),
    onSuccess: () => { notify('تم تحديث البند', 'success'); void qc.invalidateQueries({ queryKey: ['admin-materials-review'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>مراجعة بنود المواد</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>بنود خارج الكتالوج أو خارج نطاق السعر — بانتظار موافقة العمليات.</p>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل قائمة المراجعة" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد بنود بانتظار المراجعة" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((line) => {
            const invoiceUrl = safeHttpsUrl(line.supplierInvoiceUrl);
            const deviated = line.varianceBps != null;
            return (
              <Card key={line.id} className="p-5">
                <div style={{ fontWeight: 700 }}>{line.description}</div>
                <div style={{ fontSize: 12, color: COLOR_TEXT_MUTED, marginTop: 2 }}>حجز {line.bookingId.slice(0, 8)} · الكمية {String(line.qty)}</div>
                <div className="mt-3 flex items-center justify-between" style={{ fontSize: 13 }}>
                  <span>السعر المطلوب: <b>{fmtFils(line.totalFils)} د.أ</b></span>
                  {line.referencePriceFils != null && <span style={{ color: COLOR_TEXT_MUTED }}>المرجع: {fmtFils(line.referencePriceFils)} د.أ</span>}
                </div>
                {deviated && <div style={{ fontSize: 12, color: COLOR_STATUS_DANGER, marginTop: 4 }}>انحراف {((line.varianceBps ?? 0) / 100).toFixed(1)}% عن السعر المرجعي</div>}
                {invoiceUrl && <a href={invoiceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: COLOR_STATUS_SUCCESS, display: 'block', marginTop: 6 }}>عرض الفاتورة المرفوعة</a>}
                <div className="flex gap-2 justify-end mt-3">
                  <ActionBtn variant="ghost" onClick={() => resolve.mutate({ lineId: line.id, decision: 'DECLINED' })} disabled={resolve.isPending}>رفض</ActionBtn>
                  <ActionBtn onClick={() => resolve.mutate({ lineId: line.id, decision: 'APPROVED' })} disabled={resolve.isPending}>موافقة</ActionBtn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

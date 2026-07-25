import { useQuery } from '@tanstack/react-query';
import { api, type CategoryReadinessItem } from '../lib/api';
import { Card, Spinner, EmptyState, Pill } from '../components/shared';
import { COLOR_STATUS_DANGER, COLOR_STATUS_DANGER_BG, COLOR_STATUS_SUCCESS, COLOR_STATUS_SUCCESS_BG, COLOR_STATUS_WARNING, COLOR_STATUS_WARNING_BG, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY } from '../lib/theme';

const STATE_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  COLLECTING: { ar: 'قيد التجميع', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  READY: { ar: 'جاهز', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  BLOCKED: { ar: 'محظور', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
};

/** One threshold row: current value vs the target, with a pass/fail dot. */
function ThresholdRow({ label, current, target, passWhen }: { label: string; current: string; target: string; passWhen: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ fontSize: 13 }}>
      <span style={{ color: COLOR_TEXT_SECONDARY }}>{label}</span>
      <span style={{ fontWeight: 700, color: passWhen ? COLOR_STATUS_SUCCESS : COLOR_TEXT_PRIMARY }}>{current} / {target}</span>
    </div>
  );
}

/**
 * §17.5.15 — the quantitative L1→L2 promotion gate for each quote_first
 * category (e.g. Painting): closed quotes, dispute rate, and price-deviation
 * rate must ALL hold simultaneously before the category can switch on.
 * Read-only — the gate recomputes itself after every closed quote.
 */
export default function CategoryReadiness() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-category-readiness'],
    queryFn: () => api.list<CategoryReadinessItem>('/category-readiness?limit=100'),
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>جاهزية توسيع الفئات</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>
          الفئات القائمة على العرض (مثل الدهان) لا تُفعَّل إلا عند تحقق الشروط الثلاثة معاً — رقم على الشاشة، وليس تقديراً.
        </p>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل بيانات الجاهزية" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد فئات قائمة على العرض بعد" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((g) => (
            <Card key={g.serviceId} className="p-5">
              <div className="flex items-center justify-between">
                <div style={{ fontWeight: 700 }}>{g.service?.nameAr ?? g.serviceId}</div>
                <Pill label={STATE_PILL[g.state]?.ar ?? g.state} bg={STATE_PILL[g.state]?.bg ?? COLOR_STATUS_WARNING_BG} fg={STATE_PILL[g.state]?.fg ?? COLOR_STATUS_WARNING} />
              </div>
              <div className="mt-3">
                <ThresholdRow label="عروض مغلقة" current={String(g.quotesClosed)} target={`≥ ${g.quotesRequired}`} passWhen={g.quotesClosed >= g.quotesRequired} />
                <ThresholdRow label="نسبة النزاعات" current={`${(g.disputeBps / 100).toFixed(1)}%`} target={`< ${(g.maxDisputeBps / 100).toFixed(1)}%`} passWhen={g.disputeBps < g.maxDisputeBps} />
                <ThresholdRow label="الانحراف السعري" current={`${(g.priceDeviationBps / 100).toFixed(1)}%`} target={`< ${(g.maxPriceDeviationBps / 100).toFixed(1)}%`} passWhen={g.priceDeviationBps < g.maxPriceDeviationBps} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, DollarSign, TrendingUp, Users, ClipboardList, FileText, AlertCircle } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { api, FinancialReport } from '../lib/api';
import { Card, KpiCard, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, notify } from '../components/shared';
import { fmtJod, isoDaysAgo } from '../lib/format';
import {
  COLOR_ACCENT_TEAL,
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_CHART_GREEN,
  COLOR_CHART_ORANGE,
  COLOR_CHART_PURPLE,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
} from '../lib/theme';

/** §0.4b revenue-model-by-stream — mirrors AdminPanel.tsx Finance()'s stream
 *  cards exactly (rate, phase label, note, color). techPro/b2b are Phase 3
 *  and explicitly "not built" per spec — shown for ops visibility, not as a
 *  bug. protectionJod comes from live SubscriptionCharge data even though
 *  the Figma copy still labels it "Phase 2 · Feature-flagged": the Protect
 *  subscription is already shipped in this app (see Subscriptions.tsx).
 */
const REVENUE_STREAMS = [
  { key: 'jobCommissionJod' as const, stream: 'عمولة الحجوزات', rate: '20% من الأجرة', phase: 'المرحلة 1 · مُفعّلة', note: 'المواد تُمرَّر بسعر التكلفة ولا تُعد مصدر إيراد', bg: '#DCFCE7', fg: '#15803D' },
  { key: 'protectionJod' as const, stream: 'اشتراك الحماية', rate: '5 د.أ/شهر', phase: 'مُفعّلة', note: 'أولوية الفنيين · ضمان 90 يوم · دعم مميز', bg: '#DBEAFE', fg: '#1366D6' },
  { key: 'techProJod' as const, stream: 'اشتراك Tech Pro', rate: '15 د.أ/شهر', phase: 'المرحلة 3 · غير مُفعّلة', note: 'أولوية ظهور ضمن نفس مستوى الثقة فقط', bg: '#F3E8FF', fg: '#7C3AED' },
  { key: 'b2bJod' as const, stream: 'إعلانات B2B', rate: '500–1000 د.أ/شهر', phase: 'المرحلة 3 · غير مُفعّلة', note: 'خارج نطاق الإطلاق الأولي صراحةً', bg: '#FEF3C7', fg: '#B45309' },
];

export default function Reports() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');

  const qs = `from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z&granularity=${granularity}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-financial', from, to, granularity],
    queryFn: () => api.get<FinancialReport>(`/reports/financial?${qs}`),
  });

  const chartData = useMemo(
    () =>
      (data?.series ?? []).map((r) => ({
        period: new Date(r.period).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
        grossJod: Number(r.grossJod),
        platformFeeJod: Number(r.platformFeeJod),
      })),
    [data],
  );

  async function exportCsv() {
    try {
      await api.download(`/reports/financial.csv?${qs}`, `financial-${granularity}-${from}_${to}.csv`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر التصدير', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>التقارير المالية</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>الإيرادات وعمولة المنصة ومستحقات الفنيين.</p>
        </div>
        <ActionBtn onClick={() => void exportCsv()}>
          <span className="inline-flex items-center gap-1"><Download size={14} /> تصدير CSV</span>
        </ActionBtn>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>التجميع</label>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'month')} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }}>
            <option value="day">يومي</option><option value="month">شهري</option>
          </select>
        </div>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="إجمالي الإيراد" value={`${fmtJod(data.totals.grossJod)} JD`} icon={<DollarSign size={18} />} color={COLOR_BRAND_PRIMARY} />
            <KpiCard label="عمولة المنصة (إجمالي)" value={`${fmtJod(data.totals.platformFeeJod)} JD`} icon={<TrendingUp size={18} />} color={COLOR_ACCENT_TEAL} />
            <KpiCard label="ضريبة المبيعات المحصّلة (16%)" value={`${fmtJod(data.totals.platformFeeGstJod)} JD`} icon={<FileText size={18} />} color={COLOR_CHART_PURPLE} />
            <KpiCard label="صافي العمولة (بعد الضريبة)" value={`${fmtJod(data.totals.platformFeeGstNetJod)} JD`} icon={<TrendingUp size={18} />} color={COLOR_CHART_GREEN} />
            <KpiCard label="مستحقات الفنيين" value={`${fmtJod(data.totals.technicianNetJod)} JD`} icon={<Users size={18} />} color={COLOR_CHART_ORANGE} />
            <KpiCard label="عدد الحجوزات" value={data.totals.bookings} icon={<ClipboardList size={18} />} color={COLOR_CHART_PURPLE} />
          </div>

          <Card className="p-5">
            <h3 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 12 }}>نموذج الإيراد حسب المصدر (§0.4b)</h3>
            <div className="space-y-2">
              {REVENUE_STREAMS.map((s) => (
                <div key={s.key} className="p-3 rounded-xl" style={{ background: `${s.bg}40` }}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{s.stream}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13 }}>{fmtJod(data.streams[s.key])} JD</span>
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg }}>{s.phase}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: COLOR_TEXT_MUTED, marginTop: 4 }}>{s.note}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: '#E8F1FE' }}>
            <AlertCircle size={16} color="#1366D6" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: '#0E4FA8' }}>
              عمولة المنصة تخضع <strong>لضريبة المبيعات العامة 16%</strong> (دائرة ضريبة الدخل والمبيعات). يُحتسب صافي العمولة بعد الضريبة: 20% × (1 – 0.16) = <strong>16.8% فعلياً</strong>. كل عمولة محصّلة تتطلب <strong>فاتورة إلكترونية عبر JoFotara</strong> — الربط الفعلي بمنظومة JoFotara لا يزال معلّقاً حتى توفر بيانات الاعتماد الضريبية الرسمية.
            </p>
          </div>
        </>
      )}

      {chartData.length > 0 && (
        <Card className="p-5">
          <h3 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 12 }}>الإيراد مقابل عمولة المنصة</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR_SURFACE_MUTED} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: COLOR_TEXT_MUTED }} />
              <YAxis tick={{ fontSize: 11, fill: COLOR_TEXT_MUTED }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${COLOR_BORDER_LIGHT}`, fontSize: 13, direction: 'rtl' }} cursor={false} />
              <Bar dataKey="grossJod" fill={COLOR_BRAND_PRIMARY} radius={[6, 6, 0, 0]} name="الإيراد" isAnimationActive={false} />
              <Bar dataKey="platformFeeJod" fill={COLOR_ACCENT_TEAL} radius={[6, 6, 0, 0]} name="العمولة" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل التقرير" />}
        {data && data.series.length === 0 && <EmptyState message="لا توجد بيانات في هذه الفترة" />}
        {data && data.series.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: COLOR_SURFACE_SUBTLE }}><Th>الفترة</Th><Th>الحجوزات</Th><Th>الإيراد</Th><Th>العمولة</Th><Th>صافي الفني</Th></tr>
            </thead>
            <tbody>
              {data.series.map((r) => (
                <tr key={r.period} className="hover:bg-slate-50">
                  <Td><span style={{ fontFamily: 'Inter' }}>{new Date(r.period).toISOString().slice(0, 10)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{r.bookings}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{fmtJod(r.grossJod)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{fmtJod(r.platformFeeJod)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{fmtJod(r.technicianNetJod)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell, LabelList,
} from 'recharts';
import { api, AdminStats, FinancialReport } from '../lib/api';
import { KpiCard, Card, SkeletonKpiRow, SkeletonChart } from '../components/shared';
import { fmtJod } from '../lib/format';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

const BRAND_BLUE = '#1366D6';
const ACCENT_TEAL = '#0FB5A6';
const BAR_COLORS = ['#1366D6', '#0FB5A6', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#EF4444', '#6366F1'];

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<AdminStats>('/stats'),
  });

  const from30 = isoDaysAgo(30);
  const to0 = isoDaysAgo(0);
  const qs = `from=${from30}T00:00:00.000Z&to=${to0}T23:59:59.999Z&granularity=day`;
  const { data: financials } = useQuery<FinancialReport>({
    queryKey: ['admin-financial-dashboard', from30, to0],
    queryFn: () => api.get<FinancialReport>(`/reports/financial?${qs}`),
    enabled: !isLoading && !isError,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>لوحة التحكم</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>نظرة عامة على المنصة</p>
        </div>
        <SkeletonKpiRow />
        <SkeletonKpiRow />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div style={{ color: '#B91C1C', padding: 24 }}>
        تعذّر تحميل الإحصائيات
      </div>
    );
  }

  const revenueSeries = (financials?.series ?? []).map((s) => ({
    period: new Date(s.period).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
    grossJod: s.grossJod,
    platformFeeJod: s.platformFeeJod,
  }));

  const serviceData = stats.bookingsByService ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>لوحة التحكم</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>نظرة عامة على المنصة</p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="إيرادات اليوم"       value={`${fmtJod(stats.todayRevenueJod)} JD`} />
        <KpiCard label="إجمالي الحجوزات"     value={stats.totalBookings} sub={`${stats.pendingBookings} معلّقة`} />
        <KpiCard label="فنيون متاحون الآن"   value={stats.activeTechnicians} />
        <KpiCard label="متوسط التقييم"       value={fmtJod(stats.avgRating)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="الإيرادات الإجمالية" value={`${fmtJod(stats.totalRevenueJod)} JD`} />
        <KpiCard
          label="فنيون موثّقون"
          value={stats.verifiedTechnicians}
          sub={`${stats.totalTechnicians > 0 ? Math.round((stats.verifiedTechnicians / stats.totalTechnicians) * 100) : 0}% من ${stats.totalTechnicians}`}
        />
        <KpiCard label="تذاكر ضمان مفتوحة"   value={stats.openGuarantees} />
        <KpiCard label="مدفوعات معلّقة"      value={stats.pendingPayouts} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue trend (30 days) */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 16 }}>
            اتجاه الإيرادات (30 يوم)
          </h2>
          {revenueSeries.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 40 }}>لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${fmtJod(v)}`}
                  label={{ value: 'دينار', angle: -90, position: 'insideRight', style: { fontSize: 11, fill: '#94A3B8' } }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13, direction: 'rtl' }}
                  formatter={(v, name) => [`${fmtJod(Number(v))} JD`, name === 'grossJod' ? 'الإيراد الإجمالي' : 'عمولة المنصة']}
                  labelStyle={{ fontWeight: 600, color: '#0F172A' }}
                />
                <Line type="monotone" dataKey="grossJod" stroke={BRAND_BLUE} strokeWidth={2} dot={false} name="grossJod" />
                <Line type="monotone" dataKey="platformFeeJod" stroke={ACCENT_TEAL} strokeWidth={2} dot={false} name="platformFeeJod" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Bookings by service */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 16 }}>
            الحجوزات حسب الخدمة
          </h2>
          {serviceData.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 40 }}>لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={serviceData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="nameAr"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  label={{ value: 'عدد', angle: -90, position: 'insideRight', style: { fontSize: 11, fill: '#94A3B8' } }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13, direction: 'rtl' }}
                  formatter={(v) => [`${v}`, 'عدد الحجوزات']}
                  labelStyle={{ fontWeight: 600, color: '#0F172A' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                  {serviceData.map((_entry, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Quick summary card */}
      <Card className="p-6">
        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 16 }}>ملخص سريع</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: 'معدل إتمام الحجوزات', value: stats.totalBookings > 0 ? `${Math.round((stats.completedBookings / stats.totalBookings) * 100)}%` : 'لا بيانات' },
            { label: 'نسبة توثيق الفنيين',  value: stats.totalTechnicians > 0 ? `${Math.round((stats.verifiedTechnicians / stats.totalTechnicians) * 100)}%` : 'لا بيانات' },
            { label: 'متوسط قيمة الحجز',   value: stats.completedBookings > 0 ? `${fmtJod(stats.totalRevenueJod / stats.completedBookings)} JD` : 'لا بيانات' },
            { label: 'مدفوعات قيد الانتظار', value: stats.pendingPayouts },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontFamily: 'Inter' }}>{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

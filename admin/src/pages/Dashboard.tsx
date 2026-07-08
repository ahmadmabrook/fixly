import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell, LabelList,
} from 'recharts';
import { api, AdminStats, FinancialReport, OperationalStats, ActivityFeedItem, AtRiskOrder } from '../lib/api';
import { KpiCard, Card, SkeletonKpiRow, SkeletonChart, EmptyState } from '../components/shared';
import { fmtJod } from '../lib/format';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

/** Format a 0-100 percent value (backend already scales via rate()) as a whole-number string, e.g. 87.3 → "87%". */
function fmtRate(rate: number): string {
  return `${Math.round(rate)}%`;
}

/** Format a duration in seconds as whole minutes, e.g. 125 → "2 دقيقة". The
 *  backend returns null when there are no matching rows in the window (no
 *  assignments / no late arrivals); render that as "—" rather than a misleading
 *  "0 دقيقة" (which would read as perfect performance on an empty platform). */
function fmtMinutes(seconds: number | null): string {
  return seconds == null ? '—' : `${Math.round(seconds / 60)} دقيقة`;
}

/** Relative "time ago" for the live-activity feed, e.g. "قبل 5 دقائق". Mirrors
 *  the simple (non-pluralized) Arabic unit convention already used by fmtMinutes. */
function fmtRelativeAr(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

/** How overdue an at-risk order is, relative to the deadline that made it risky
 *  (SLA arrival time for 'late', creation time for 'unassigned'). */
function fmtOverdueAr(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `متأخر ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return `متأخر ${hours} ساعة`;
}

const ACTIVITY_META: Record<ActivityFeedItem['type'], { icon: string; color: string }> = {
  booking_status: { icon: '✅', color: '#15803D' },
  payment_captured: { icon: '💰', color: '#1366D6' },
  guarantee_opened: { icon: '⚠️', color: '#B91C1C' },
  new_customer: { icon: '👤', color: '#0FB5A6' },
};

const RISK_LABEL: Record<AtRiskOrder['riskType'], { ar: string; bg: string; fg: string }> = {
  late: { ar: 'متأخر', bg: '#FEE2E2', fg: '#B91C1C' },
  unassigned: { ar: 'غير معيّن', bg: '#FEF3C7', fg: '#B45309' },
};

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
  const { data: financials, isError: financialsError } = useQuery<FinancialReport>({
    queryKey: ['admin-financial-dashboard', from30, to0],
    queryFn: () => api.get<FinancialReport>(`/reports/financial?${qs}`),
    enabled: !isLoading && !isError,
  });

  const { data: operational, isError: operationalError } = useQuery<OperationalStats>({
    queryKey: ['admin-stats-operational'],
    queryFn: () => api.get<OperationalStats>('/stats/operational?windowDays=30'),
    enabled: !isLoading && !isError,
  });

  const { data: activity, isError: activityError } = useQuery<ActivityFeedItem[]>({
    queryKey: ['admin-activity-feed'],
    queryFn: () => api.get<ActivityFeedItem[]>('/activity-feed?limit=20'),
    enabled: !isLoading && !isError,
    refetchInterval: 30_000,
  });

  const { data: atRisk, isError: atRiskError } = useQuery<{ items: AtRiskOrder[]; total: number }>({
    queryKey: ['admin-at-risk'],
    queryFn: () => api.list<AtRiskOrder>('/orders/at-risk?limit=20'),
    enabled: !isLoading && !isError,
    refetchInterval: 30_000,
  });

  const [riskFilter, setRiskFilter] = useState<'' | AtRiskOrder['riskType']>('');

  // Defensive: a malformed/unexpected response shape must never crash the
  // dashboard render — fall back to an empty list rather than assuming array shape.
  const activityItems = Array.isArray(activity) ? activity : [];
  const atRiskItems = Array.isArray(atRisk?.items) ? atRisk.items : [];
  const filteredAtRisk = riskFilter ? atRiskItems.filter((o) => o.riskType === riskFilter) : atRiskItems;
  const lateCount = atRiskItems.filter((o) => o.riskType === 'late').length;
  const unassignedCount = atRiskItems.filter((o) => o.riskType === 'unassigned').length;

  // Derive chart datasets once per data change so recharts isn't handed a new
  // array identity on every render (which would force a full re-render/animate).
  // Hooks must run before any early return, so guard on the data inside.
  const revenueSeries = useMemo(
    () =>
      (financials?.series ?? []).map((s) => ({
        period: new Date(s.period).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
        grossJod: s.grossJod,
        platformFeeJod: s.platformFeeJod,
      })),
    [financials],
  );
  const serviceData = useMemo(() => stats?.bookingsByService ?? [], [stats?.bookingsByService]);

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

      {/* Operational KPIs */}
      <div>
        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 12 }}>
          مؤشرات تشغيلية
        </h2>
        {operationalError ? (
          <Card className="p-6">
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>تعذّر تحميل المؤشرات التشغيلية</p>
          </Card>
        ) : !operational ? (
          <SkeletonKpiRow />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="معدل القبول" value={fmtRate(operational.acceptanceRate)} />
            <KpiCard label="متوسط وقت التعيين" value={fmtMinutes(operational.avgTimeToAssignSeconds)} />
            <KpiCard label="متوسط تأخر الوصول" value={fmtMinutes(operational.avgArrivalDelaySeconds)} />
            <KpiCard label="معدل الإلغاء" value={fmtRate(operational.cancellationRate)} />
            <KpiCard label="معدل الشكاوى" value={fmtRate(operational.complaintRate)} />
            <KpiCard label="تكرار الحجز" value={fmtRate(operational.repeatBookingRate)} />
          </div>
        )}
      </div>

      {/* Live activity + at-risk orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 12 }}>نشاط مباشر</h2>
          {activityError ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 24 }}>تعذّر تحميل النشاط</p>
          ) : activityItems.length === 0 ? (
            <EmptyState message="لا يوجد نشاط حديث" />
          ) : (
            <div>
              {activityItems.map((a, i) => {
                const meta = ACTIVITY_META[a.type] ?? { icon: '•', color: '#64748B' };
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2"
                    style={{ borderBottom: i < activityItems.length - 1 ? '1px solid #F1F5F9' : undefined }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${meta.color}20` }}
                    >
                      {meta.icon}
                    </span>
                    <span className="flex-1" style={{ fontSize: 13, color: '#1E293B' }}>{a.message}</span>
                    <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>{fmtRelativeAr(a.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>طلبات معرّضة للخطر</h2>
          </div>
          <div className="flex gap-1.5 flex-wrap" style={{ marginBottom: 12 }}>
            {([
              ['', `الكل (${atRiskItems.length})`],
              ['late', `متأخر (${lateCount})`],
              ['unassigned', `غير معيّن (${unassignedCount})`],
            ] as const).map(([key, label]) => (
              <button
                key={key || 'all'}
                onClick={() => setRiskFilter(key)}
                className="px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 11, fontWeight: 600, border: '1px solid #E2E8F0',
                  background: riskFilter === key ? '#1366D6' : '#FFF',
                  color: riskFilter === key ? '#FFF' : '#475569',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {atRiskError ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 24 }}>تعذّر تحميل الطلبات المعرّضة للخطر</p>
          ) : filteredAtRisk.length === 0 ? (
            <EmptyState message="لا توجد طلبات معرّضة للخطر" />
          ) : (
            <div className="space-y-2">
              {filteredAtRisk.map((o) => {
                const risk = RISK_LABEL[o.riskType];
                return (
                  <Link
                    key={o.id}
                    to="/bookings"
                    className="block p-2.5 rounded-lg"
                    style={{ background: '#F8FAFC', textDecoration: 'none' }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{o.customer?.name ?? '—'}</span>
                      <span
                        className="px-2 py-0.5 rounded-full"
                        style={{ background: risk.bg, color: risk.fg, fontSize: 10, fontWeight: 700 }}
                      >
                        {risk.ar}
                      </span>
                    </div>
                    <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#64748B' }}>
                        {o.technician?.user?.name ? `الفني: ${o.technician.user.name}` : 'بدون فني'}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: risk.fg }}>
                        {fmtOverdueAr(o.riskType === 'late' ? (o.slaArriveBy ?? o.createdAt) : o.createdAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue trend (30 days) */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 16 }}>
            اتجاه الإيرادات (30 يوم)
          </h2>
          {financialsError ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 40 }}>تعذّر تحميل بيانات الإيرادات</p>
          ) : revenueSeries.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 40 }}>لا توجد بيانات</p>
          ) : (
            <div role="img" aria-label="رسم بياني لاتجاه الإيرادات خلال آخر 30 يوماً">
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
            </div>
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
            <div role="img" aria-label="رسم بياني لعدد الحجوزات حسب الخدمة">
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
            </div>
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

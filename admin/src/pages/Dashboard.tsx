import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import { DollarSign, ClipboardList, Users, Star, TrendingUp, UserCheck, ShieldCheck, Wallet } from 'lucide-react';
import { api, AdminStats, FinancialReport, OperationalStats, ActivityFeedItem, AtRiskOrder } from '../lib/api';
import { KpiCard, OpsStatTile, Card, SkeletonKpiRow, SkeletonChart, EmptyState } from '../components/shared';
import { fmtJod, isoDaysAgo } from '../lib/format';
import {
  COLOR_ACCENT_TEAL,
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_CHART_AMBER,
  COLOR_CHART_EMERALD,
  COLOR_CHART_GREEN,
  COLOR_CHART_INDIGO,
  COLOR_CHART_ORANGE,
  COLOR_CHART_PINK,
  COLOR_CHART_PURPLE,
  COLOR_CHART_RED,
  COLOR_CHART_ROSE,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_BODY,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

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
  booking_status: { icon: '✅', color: COLOR_STATUS_SUCCESS },
  payment_captured: { icon: '💰', color: COLOR_BRAND_PRIMARY },
  guarantee_opened: { icon: '⚠️', color: COLOR_STATUS_DANGER },
  new_customer: { icon: '👤', color: COLOR_ACCENT_TEAL },
};

const RISK_LABEL: Record<AtRiskOrder['riskType'], { ar: string; bg: string; fg: string }> = {
  late: { ar: 'متأخر', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
  unassigned: { ar: 'غير معيّن', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  // §17.6 "high-risk orders": new customer + probation-tier technician with a
  // prior complaint + a high booking value, all stacked on one active order.
  high_risk: { ar: 'خطورة مرتفعة', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
};

const SERVICE_CHART_COLORS = [COLOR_BRAND_PRIMARY, COLOR_ACCENT_TEAL, COLOR_CHART_AMBER, COLOR_CHART_PURPLE, COLOR_CHART_PINK, COLOR_CHART_EMERALD, COLOR_CHART_RED, COLOR_CHART_INDIGO];

/** Poll interval for the live-activity feed and at-risk-orders widgets —
 *  frequent enough to feel "live" without hammering the API. */
const LIVE_POLL_INTERVAL_MS = 30_000;

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
    refetchInterval: LIVE_POLL_INTERVAL_MS,
  });

  const { data: atRisk, isError: atRiskError } = useQuery<{ items: AtRiskOrder[]; total: number }>({
    queryKey: ['admin-at-risk'],
    queryFn: () => api.list<AtRiskOrder>('/orders/at-risk?limit=20'),
    enabled: !isLoading && !isError,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
  });

  const [riskFilter, setRiskFilter] = useState<'' | AtRiskOrder['riskType']>('');

  // Defensive: a malformed/unexpected response shape must never crash the
  // dashboard render — fall back to an empty list rather than assuming array shape.
  const activityItems = Array.isArray(activity) ? activity : [];
  const atRiskItems = Array.isArray(atRisk?.items) ? atRisk.items : [];
  const filteredAtRisk = riskFilter ? atRiskItems.filter((o) => o.riskType === riskFilter) : atRiskItems;
  const lateCount = atRiskItems.filter((o) => o.riskType === 'late').length;
  const unassignedCount = atRiskItems.filter((o) => o.riskType === 'unassigned').length;
  const highRiskCount = atRiskItems.filter((o) => o.riskType === 'high_risk').length;

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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>لوحة التحكم</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>نظرة عامة على المنصة</p>
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
      <div style={{ color: COLOR_STATUS_DANGER, padding: 24 }}>
        تعذّر تحميل الإحصائيات
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>لوحة التحكم</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>نظرة عامة على المنصة</p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="إيرادات اليوم"       value={`${fmtJod(stats.todayRevenueJod)} JD`} icon={<DollarSign size={18} />} color={COLOR_BRAND_PRIMARY} />
        <KpiCard label="إجمالي الحجوزات"     value={stats.totalBookings} sub={`${stats.pendingBookings} معلّقة`} icon={<ClipboardList size={18} />} color={COLOR_ACCENT_TEAL} />
        <KpiCard label="فنيون متاحون الآن"   value={stats.activeTechnicians} icon={<Users size={18} />} color={COLOR_CHART_ORANGE} />
        <KpiCard label="متوسط التقييم"       value={fmtJod(stats.avgRating)} icon={<Star size={18} />} color={COLOR_CHART_GREEN} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="الإيرادات الإجمالية" value={`${fmtJod(stats.totalRevenueJod)} JD`} icon={<TrendingUp size={18} />} color={COLOR_BRAND_PRIMARY} />
        <KpiCard
          label="فنيون موثّقون"
          value={stats.verifiedTechnicians}
          sub={`${stats.totalTechnicians > 0 ? Math.round((stats.verifiedTechnicians / stats.totalTechnicians) * 100) : 0}% من ${stats.totalTechnicians}`}
          icon={<UserCheck size={18} />} color={COLOR_ACCENT_TEAL}
        />
        <KpiCard label="تذاكر ضمان مفتوحة"   value={stats.openGuarantees} icon={<ShieldCheck size={18} />} color={COLOR_CHART_ROSE} />
        <KpiCard label="مدفوعات معلّقة"      value={stats.pendingPayouts} icon={<Wallet size={18} />} color={COLOR_CHART_ORANGE} />
      </div>

      {/* Operational KPIs */}
      <div>
        <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 12 }}>
          مؤشرات تشغيلية
        </h2>
        {operationalError ? (
          <Card className="p-6">
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center' }}>تعذّر تحميل المؤشرات التشغيلية</p>
          </Card>
        ) : !operational ? (
          <SkeletonKpiRow />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <OpsStatTile label="معدل القبول" value={fmtRate(operational.acceptanceRate)} />
            <OpsStatTile label="متوسط وقت التعيين" value={fmtMinutes(operational.avgTimeToAssignSeconds)} />
            <OpsStatTile label="متوسط تأخر الوصول" value={fmtMinutes(operational.avgArrivalDelaySeconds)} />
            <OpsStatTile label="معدل الإلغاء" value={fmtRate(operational.cancellationRate)} />
            <OpsStatTile label="معدل الشكاوى" value={fmtRate(operational.complaintRate)} />
            <OpsStatTile label="تكرار الحجز" value={fmtRate(operational.repeatBookingRate)} />
          </div>
        )}
      </div>

      {/* Live activity + at-risk orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 12 }}>نشاط مباشر</h2>
          {activityError ? (
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center', padding: 24 }}>تعذّر تحميل النشاط</p>
          ) : activityItems.length === 0 ? (
            <EmptyState message="لا يوجد نشاط حديث" />
          ) : (
            <div>
              {activityItems.map((a, i) => {
                const meta = ACTIVITY_META[a.type] ?? { icon: '•', color: COLOR_TEXT_MUTED };
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2"
                    style={{ borderBottom: i < activityItems.length - 1 ? `1px solid ${COLOR_SURFACE_MUTED}` : undefined }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${meta.color}20` }}
                    >
                      {meta.icon}
                    </span>
                    <span className="flex-1" style={{ fontSize: 13, color: COLOR_TEXT_BODY }}>{a.message}</span>
                    <span style={{ fontSize: 12, color: COLOR_TEXT_SUBTLE, whiteSpace: 'nowrap' }}>{fmtRelativeAr(a.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY }}>طلبات معرّضة للخطر</h2>
          </div>
          <div className="flex gap-1.5 flex-wrap" style={{ marginBottom: 12 }}>
            {([
              ['', `الكل (${atRiskItems.length})`],
              ['late', `متأخر (${lateCount})`],
              ['unassigned', `غير معيّن (${unassignedCount})`],
              ['high_risk', `خطورة مرتفعة (${highRiskCount})`],
            ] as const).map(([key, label]) => (
              <button
                key={key || 'all'}
                onClick={() => setRiskFilter(key)}
                className="px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 11, fontWeight: 600, border: `1px solid ${COLOR_BORDER_LIGHT}`,
                  background: riskFilter === key ? COLOR_BRAND_PRIMARY : COLOR_WHITE,
                  color: riskFilter === key ? COLOR_WHITE : COLOR_TEXT_SECONDARY,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {atRiskError ? (
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center', padding: 24 }}>تعذّر تحميل الطلبات المعرّضة للخطر</p>
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
                    style={{ background: COLOR_SURFACE_SUBTLE, textDecoration: 'none' }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLOR_TEXT_PRIMARY }}>{o.customer?.name ?? '—'}</span>
                      <span
                        className="px-2 py-0.5 rounded-full"
                        style={{ background: risk.bg, color: risk.fg, fontSize: 10, fontWeight: 700 }}
                      >
                        {risk.ar}
                      </span>
                    </div>
                    <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: COLOR_TEXT_MUTED }}>
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
          <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 16 }}>
            اتجاه الإيرادات (30 يوم)
          </h2>
          {financialsError ? (
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center', padding: 40 }}>تعذّر تحميل بيانات الإيرادات</p>
          ) : revenueSeries.length === 0 ? (
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center', padding: 40 }}>لا توجد بيانات</p>
          ) : (
            <div role="img" aria-label="رسم بياني لاتجاه الإيرادات خلال آخر 30 يوماً">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLOR_SURFACE_MUTED} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: COLOR_TEXT_MUTED }}
                  axisLine={{ stroke: COLOR_BORDER_LIGHT }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: COLOR_TEXT_MUTED }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${fmtJod(v)}`}
                  label={{ value: 'دينار', angle: -90, position: 'insideRight', style: { fontSize: 11, fill: COLOR_TEXT_SUBTLE } }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: `1px solid ${COLOR_BORDER_LIGHT}`, fontSize: 13, direction: 'rtl' }}
                  formatter={(v, name) => [`${fmtJod(Number(v))} JD`, name === 'grossJod' ? 'الإيراد الإجمالي' : 'عمولة المنصة']}
                  labelStyle={{ fontWeight: 600, color: COLOR_TEXT_PRIMARY }}
                />
                <Line type="monotone" dataKey="grossJod" stroke={COLOR_BRAND_PRIMARY} strokeWidth={2} dot={false} name="grossJod" />
                <Line type="monotone" dataKey="platformFeeJod" stroke={COLOR_ACCENT_TEAL} strokeWidth={2} dot={false} name="platformFeeJod" />
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Bookings by service */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 16 }}>
            الحجوزات حسب الخدمة
          </h2>
          {serviceData.length === 0 ? (
            <p style={{ color: COLOR_TEXT_SUBTLE, fontSize: 13, textAlign: 'center', padding: 40 }}>لا توجد بيانات</p>
          ) : (
            <div role="img" aria-label="رسم بياني دائري لعدد الحجوزات حسب الخدمة">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={serviceData} dataKey="count" nameKey="nameAr" innerRadius={45} outerRadius={78} isAnimationActive={false}>
                  {serviceData.map((_entry, idx) => (
                    <Cell key={idx} fill={SERVICE_CHART_COLORS[idx % SERVICE_CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: `1px solid ${COLOR_BORDER_LIGHT}`, fontSize: 13, direction: 'rtl' }}
                  formatter={(v) => [`${v}`, 'عدد الحجوزات']}
                />
              </PieChart>
            </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Quick summary card */}
      <Card className="p-6">
        <h2 style={{ fontWeight: 700, fontSize: 16, color: COLOR_TEXT_PRIMARY, marginBottom: 16 }}>ملخص سريع</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: 'معدل إتمام الحجوزات', value: stats.totalBookings > 0 ? `${Math.round((stats.completedBookings / stats.totalBookings) * 100)}%` : 'لا بيانات' },
            { label: 'نسبة توثيق الفنيين',  value: stats.totalTechnicians > 0 ? `${Math.round((stats.verifiedTechnicians / stats.totalTechnicians) * 100)}%` : 'لا بيانات' },
            { label: 'متوسط قيمة الحجز',   value: stats.completedBookings > 0 ? `${fmtJod(stats.totalRevenueJod / stats.completedBookings)} JD` : 'لا بيانات' },
            { label: 'مدفوعات قيد الانتظار', value: stats.pendingPayouts },
            { label: 'أرصدة العملاء المستحقة', value: `${fmtJod(stats.totalOutstandingCreditsJod)} JD` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
              <span style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLOR_TEXT_PRIMARY, fontFamily: 'Inter' }}>{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

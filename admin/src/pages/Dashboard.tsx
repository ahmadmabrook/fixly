import { useQuery } from '@tanstack/react-query';
import { api, AdminStats } from '../lib/api';
import { KpiCard, Spinner, Card } from '../components/shared';
import { fmtJod } from '../lib/format';

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<AdminStats>('/stats'),
  });

  if (isLoading) return <Spinner />;

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

      {/* Primary KPIs (spec: today's revenue, bookings, active techs, avg rating, open guarantees) */}
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

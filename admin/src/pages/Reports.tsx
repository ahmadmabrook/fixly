import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, DollarSign, TrendingUp, Users, ClipboardList } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { api, FinancialReport } from '../lib/api';
import { Card, KpiCard, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, notify } from '../components/shared';
import { fmtJod } from '../lib/format';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>التقارير المالية</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>الإيرادات وعمولة المنصة ومستحقات الفنيين.</p>
        </div>
        <ActionBtn onClick={() => void exportCsv()}>
          <span className="inline-flex items-center gap-1"><Download size={14} /> تصدير CSV</span>
        </ActionBtn>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block" style={{ fontSize: 12, color: '#64748B' }}>من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 12, color: '#64748B' }}>إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 12, color: '#64748B' }}>التجميع</label>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'month')} className="mt-1 h-10 rounded-lg border border-slate-200 px-3" style={{ fontSize: 13 }}>
            <option value="day">يومي</option><option value="month">شهري</option>
          </select>
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="إجمالي الإيراد" value={`${fmtJod(data.totals.grossJod)} JD`} icon={<DollarSign size={18} />} color="#1366D6" />
          <KpiCard label="عمولة المنصة" value={`${fmtJod(data.totals.platformFeeJod)} JD`} icon={<TrendingUp size={18} />} color="#0FB5A6" />
          <KpiCard label="مستحقات الفنيين" value={`${fmtJod(data.totals.technicianNetJod)} JD`} icon={<Users size={18} />} color="#F5A623" />
          <KpiCard label="عدد الحجوزات" value={data.totals.bookings} icon={<ClipboardList size={18} />} color="#8B5CF6" />
        </div>
      )}

      {chartData.length > 0 && (
        <Card className="p-5">
          <h3 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 12 }}>الإيراد مقابل عمولة المنصة</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13, direction: 'rtl' }} cursor={false} />
              <Bar dataKey="grossJod" fill="#1366D6" radius={[6, 6, 0, 0]} name="الإيراد" isAnimationActive={false} />
              <Bar dataKey="platformFeeJod" fill="#0FB5A6" radius={[6, 6, 0, 0]} name="العمولة" isAnimationActive={false} />
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
              <tr style={{ background: '#F8FAFC' }}><Th>الفترة</Th><Th>الحجوزات</Th><Th>الإيراد</Th><Th>العمولة</Th><Th>صافي الفني</Th></tr>
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

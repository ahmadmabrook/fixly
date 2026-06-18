import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, FinancialReport } from '../lib/api';
import { Card, KpiCard, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, notify } from '../components/shared';

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
          <KpiCard label="إجمالي الإيراد" value={`${data.totals.grossJod.toFixed(2)} JD`} />
          <KpiCard label="عمولة المنصة" value={`${data.totals.platformFeeJod.toFixed(2)} JD`} />
          <KpiCard label="مستحقات الفنيين" value={`${data.totals.technicianNetJod.toFixed(2)} JD`} />
          <KpiCard label="عدد الحجوزات" value={data.totals.bookings} />
        </div>
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
                  <Td><span style={{ fontFamily: 'Inter' }}>{r.grossJod.toFixed(2)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{r.platformFeeJod.toFixed(2)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{r.technicianNetJod.toFixed(2)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
}

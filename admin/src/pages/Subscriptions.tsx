import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, KpiCard, Spinner, EmptyState, TableWrapper, Th, Td, Pagination } from '../components/shared';
import { fmtJod } from '../lib/format';

interface SubscriptionItem {
  id: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  priceJod: string | number;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  customer?: { name?: string | null; phone?: string | null };
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'فعّال', PAST_DUE: 'متأخر', CANCELLED: 'ملغى', EXPIRED: 'منتهٍ' };
const STATUS_COLOR: Record<string, string> = { ACTIVE: '#15803D', PAST_DUE: '#B45309', CANCELLED: '#64748B', EXPIRED: '#94A3B8' };

export default function Subscriptions() {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-subscriptions', page],
    queryFn: () => api.list<SubscriptionItem>(`/admin/subscriptions?limit=${limit}&offset=${page * limit}`),
  });

  const items = data?.items ?? [];
  const activeOnPage = items.filter((s) => s.status === 'ACTIVE').length;
  const pastDueOnPage = items.filter((s) => s.status === 'PAST_DUE').length;
  const mrrOnPage = activeOnPage * 5; // Protection plan = 5 JOD/mo

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>اشتراكات الحماية</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>خطة الحماية الشهرية (5 دنانير) — الإيراد المتكرر والحالة.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="إجمالي المشتركين" value={data?.total ?? 0} />
        <KpiCard label="فعّال (هذه الصفحة)" value={activeOnPage} sub={`${pastDueOnPage} متأخر`} />
        <KpiCard label="إيراد شهري (هذه الصفحة)" value={`${fmtJod(mrrOnPage)} JD`} />
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الاشتراكات" />}
        {!isLoading && !isError && items.length === 0 && <EmptyState message="لا توجد اشتراكات" />}
        {!isLoading && !isError && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>العميل</Th><Th>الجوال</Th><Th>الحالة</Th><Th>ينتهي في</Th><Th>مشترك منذ</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>{s.customer?.name ?? '—'}</Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{s.customer?.phone ?? '—'}</span></Td>
                  <Td><span style={{ color: STATUS_COLOR[s.status], fontSize: 12, fontWeight: 700 }}>{STATUS_LABEL[s.status]}{s.cancelledAt && s.status === 'ACTIVE' ? ' (سيُلغى)' : ''}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(s.currentPeriodEnd)}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(s.createdAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>
    </div>
  );
}

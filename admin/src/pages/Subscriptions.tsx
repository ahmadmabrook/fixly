import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, CheckCircle2, DollarSign } from 'lucide-react';
import { api, DEFAULT_PAGE_SIZE } from '../lib/api';
import { Card, KpiCard, Spinner, EmptyState, TableWrapper, Th, Td, Pagination, Pill } from '../components/shared';
import { fmtJod } from '../lib/format';
import {
  COLOR_ACCENT_TEAL,
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
} from '../lib/theme';

interface SubscriptionItem {
  id: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  priceJod: string | number;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  customer?: { name?: string | null; phone?: string | null };
}

const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  ACTIVE: { ar: 'فعّال', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  PAST_DUE: { ar: 'متأخر', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  CANCELLED: { ar: 'ملغى', bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
  EXPIRED: { ar: 'منتهٍ', bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
};

/** Monthly price of the protection subscription plan, in JOD. */
const PROTECTION_PLAN_PRICE_JOD = 5;

export default function Subscriptions() {
  const [page, setPage] = useState(0);
  const limit = DEFAULT_PAGE_SIZE;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-subscriptions', page],
    queryFn: () => api.list<SubscriptionItem>(`/subscriptions?limit=${limit}&offset=${page * limit}`),
  });

  const items = data?.items ?? [];
  const activeOnPage = items.filter((s) => s.status === 'ACTIVE').length;
  const pastDueOnPage = items.filter((s) => s.status === 'PAST_DUE').length;
  const mrrOnPage = activeOnPage * PROTECTION_PLAN_PRICE_JOD;

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>اشتراكات الحماية</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>خطة الحماية الشهرية ({PROTECTION_PLAN_PRICE_JOD} دنانير) — الإيراد المتكرر والحالة.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="إجمالي المشتركين" value={data?.total ?? 0} icon={<Users size={18} />} color={COLOR_BRAND_PRIMARY} />
        <KpiCard label="فعّال (هذه الصفحة)" value={activeOnPage} sub={`${pastDueOnPage} متأخر`} icon={<CheckCircle2 size={18} />} color={COLOR_STATUS_SUCCESS} />
        <KpiCard label="إيراد شهري (هذه الصفحة)" value={`${fmtJod(mrrOnPage)} JD`} icon={<DollarSign size={18} />} color={COLOR_ACCENT_TEAL} />
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الاشتراكات" />}
        {!isLoading && !isError && items.length === 0 && <EmptyState message="لا توجد اشتراكات" />}
        {!isLoading && !isError && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: COLOR_SURFACE_SUBTLE }}>
                <Th>العميل</Th><Th>الجوال</Th><Th>الحالة</Th><Th>ينتهي في</Th><Th>مشترك منذ</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>{s.customer?.name ?? '—'}</Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{s.customer?.phone ?? '—'}</span></Td>
                  <Td><Pill label={`${STATUS_PILL[s.status].ar}${s.cancelledAt && s.status === 'ACTIVE' ? ' (سيُلغى)' : ''}`} bg={STATUS_PILL[s.status].bg} fg={STATUS_PILL[s.status].fg} /></Td>
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

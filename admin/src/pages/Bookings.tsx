import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, BookingItem } from '../lib/api';
import { Card, StatusBadge, Spinner, EmptyState, TableWrapper, Th, Td, Pagination } from '../components/shared';
import { fmtJod } from '../lib/format';
import BookingsMap from '../components/BookingsMap';

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const STATUS_LABELS: Record<string, string> = {
  '': 'الكل', PENDING: 'معلّق', CONFIRMED: 'مؤكد', EN_ROUTE: 'في الطريق',
  IN_PROGRESS: 'جارٍ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
};

export default function Bookings() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-bookings', status, page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (status) params.set('status', status);
      return api.list<BookingItem>(`/bookings?${params}`);
    },
  });

  const bookings = data?.items ?? [];
  const total = data?.total ?? 0;

  function fmt(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>الحجوزات</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            إدارة جميع حجوزات المنصة {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
          </p>
        </div>

        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(0); }}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: status === s ? '#1366D6' : '#E2E8F0',
                color: status === s ? '#FFF' : '#475569',
                transition: 'all .15s',
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Live map of the listed bookings (pins for those with coordinates). */}
      {!isLoading && !isError && bookings.some((b) => b.addressLat != null) && (
        <Card className="p-3">
          <BookingsMap bookings={bookings} height={320} />
        </Card>
      )}

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الحجوزات" />}
        {!isLoading && !isError && bookings.length === 0 && <EmptyState message="لا توجد حجوزات" />}
        {!isLoading && !isError && bookings.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>رقم الحجز</Th>
                <Th>العميل</Th>
                <Th>الخدمة</Th>
                <Th>الفني</Th>
                <Th>التاريخ</Th>
                <Th>المبلغ</Th>
                <Th>الحالة</Th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 12, color: '#94A3B8' }}>{b.id.slice(0, 8)}…</span></Td>
                  <Td>{b.customer?.name ?? '—'}</Td>
                  <Td>{b.service?.nameAr ?? '—'}</Td>
                  <Td>{b.technician?.user?.name ?? '—'}</Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(b.scheduledAt)}</span></Td>
                  <Td>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700, color: '#0E4FA8' }}>
                      {fmtJod(b.totalJod)} JD
                    </span>
                  </Td>
                  <Td><StatusBadge status={b.status} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        <Pagination page={page} total={total} limit={limit} onPage={setPage} />
      </Card>
    </div>
  );
}

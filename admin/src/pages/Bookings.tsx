import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { api, DEFAULT_PAGE_SIZE, AdminStats, BookingItem, BookingDetail } from '../lib/api';
import { Card, StatusBadge, Spinner, EmptyState, TableWrapper, Th, Td, Pagination, ActionBtn, notify, Drawer } from '../components/shared';
import { fmtJod, shortId } from '../lib/format';
import BookingsMap from '../components/BookingsMap';
import {
  COLOR_ACCENT_TEAL,
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_BRAND_PRIMARY_DARK,
  COLOR_CHART_GREEN,
  COLOR_CHART_ORANGE,
  COLOR_CHART_ROSE,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

const STATUS_DIST_COLORS = [COLOR_CHART_ORANGE, COLOR_ACCENT_TEAL, COLOR_CHART_GREEN, COLOR_CHART_ROSE];

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const STATUS_LABELS: Record<string, string> = {
  '': 'الكل', PENDING: 'معلّق', CONFIRMED: 'مؤكد', EN_ROUTE: 'في الطريق', ARRIVED: 'وصل الفني',
  IN_PROGRESS: 'جارٍ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', DISPUTED: 'نزاع',
  NO_SHOW: 'لم يحضر العميل', AWAITING_PAYMENT: 'بانتظار الدفع',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلّق', PRE_AUTHORIZED: 'مصرّح', CAPTURED: 'محصّل',
  PARTIALLY_REFUNDED: 'مسترد جزئياً', REFUNDED: 'مسترد', DISPUTED: 'نزاع',
  CHARGEBACK: 'استرداد إجباري', FAILED: 'فشل',
};

const WORK_STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'مقترح', APPROVED: 'موافق عليه', DECLINED: 'مرفوض',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Server-side CSV export (GET /admin/bookings.csv) — mirrors Reports.tsx's
 *  api.download() pattern. Streams up to 5000 matching rows, filtered by the
 *  same status filter as the on-screen list, instead of only the loaded page. */
async function exportBookingsCsv(status: string) {
  try {
    const qs = status ? `?status=${status}` : '';
    await api.download(`/bookings.csv${qs}`, `bookings-${status || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'تعذّر التصدير', 'error');
  }
}

export default function Bookings() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = DEFAULT_PAGE_SIZE;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-bookings', status, page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (status) params.set('status', status);
      return api.list<BookingItem>(`/bookings?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const bookings = data?.items ?? [];
  const total = data?.total ?? 0;

  const { data: stats } = useQuery<AdminStats>({ queryKey: ['admin-stats'], queryFn: () => api.get<AdminStats>('/stats') });
  const dist = stats?.bookingsByStatus;
  const distItems: Array<[string, number]> = dist
    ? [['قيد التنفيذ', dist.inProgress], ['في الطريق', dist.arriving], ['مكتملة', dist.completed], ['ملغاة', dist.cancelled]]
    : [];
  const distTotal = distItems.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>الحجوزات</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>
            إدارة جميع حجوزات المنصة {total > 0 && <>— <span style={{ color: COLOR_BRAND_PRIMARY }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
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
                  background: status === s ? COLOR_BRAND_PRIMARY : COLOR_BORDER_LIGHT,
                  color: status === s ? COLOR_WHITE : COLOR_TEXT_SECONDARY,
                  transition: 'all .15s',
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <ActionBtn onClick={() => void exportBookingsCsv(status)}>
            <span className="inline-flex items-center gap-1"><Download size={14} /> تصدير CSV</span>
          </ActionBtn>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live map of the listed bookings (pins for those with coordinates). */}
        {!isLoading && !isError && bookings.some((b) => b.addressLat != null) && (
          <Card className="p-3 lg:col-span-2">
            <BookingsMap bookings={bookings} height={280} />
          </Card>
        )}

        {distTotal > 0 && (
          <Card className="p-4">
            <h3 style={{ fontWeight: 700, fontSize: 14 }}>توزيع الحالات</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={distItems.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} isAnimationActive={false}>
                  {distItems.map(([name], idx) => <Cell key={name} fill={STATUS_DIST_COLORS[idx % STATUS_DIST_COLORS.length]} />)}
                </Pie>
                <Tooltip cursor={false} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5" style={{ fontSize: 12 }}>
              {distItems.map(([label, value], idx) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DIST_COLORS[idx % STATUS_DIST_COLORS.length] }} />
                  <span className="flex-1">{label}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'Inter' }}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الحجوزات" />}
        {!isLoading && !isError && bookings.length === 0 && <EmptyState message="لا توجد حجوزات" />}
        {!isLoading && !isError && bookings.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: COLOR_SURFACE_SUBTLE }}>
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
                <tr
                  key={b.id}
                  onClick={() => setDetailId(b.id)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  data-testid={`booking-row-${b.id}`}
                >
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 12, color: COLOR_TEXT_SUBTLE }}>{shortId(b.id)}…</span></Td>
                  <Td>{b.customer?.name ?? b.customer?.phone ?? '—'}</Td>
                  <Td>{b.service?.nameAr ?? '—'}</Td>
                  <Td>{b.technician?.user?.name ?? '—'}</Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(b.scheduledAt)}</span></Td>
                  <Td>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700, color: COLOR_BRAND_PRIMARY_DARK }}>
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

      {detailId && <BookingDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/**
 * Booking detail drawer. Lazily fetches GET /admin/bookings/:id when opened
 * (mirrors Technicians.tsx's DetailDrawer) and renders the booking's core
 * fields, a status-history timeline, the payment breakdown, and any
 * additional-work items.
 */
function BookingDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => api.get<BookingDetail>(`/bookings/${id}`),
  });
  const booking = data?.booking;

  return (
    <Drawer ariaLabel="تفاصيل الحجز" onClose={onClose}>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل تفاصيل الحجز" />}
        {booking && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: COLOR_TEXT_SUBTLE }}>{booking.id}</span>
              <StatusBadge status={booking.status} />
            </div>
            <div style={{ fontSize: 14 }} className="space-y-2">
              <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
                <span style={{ color: COLOR_TEXT_MUTED }}>العميل</span>
                <span style={{ fontWeight: 700 }}>{booking.customer?.name ?? booking.customer?.phone ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
                <span style={{ color: COLOR_TEXT_MUTED }}>الفني</span>
                <span style={{ fontWeight: 700 }}>{booking.technician?.user?.name ?? booking.technician?.user?.phone ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
                <span style={{ color: COLOR_TEXT_MUTED }}>الخدمة</span>
                <span style={{ fontWeight: 700 }}>{booking.service?.nameAr ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
                <span style={{ color: COLOR_TEXT_MUTED }}>العنوان</span>
                <span style={{ fontWeight: 700 }}>{booking.addressLine ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1" style={{ borderBottom: `1px solid ${COLOR_SURFACE_MUTED}` }}>
                <span style={{ color: COLOR_TEXT_MUTED }}>موعد الحجز</span>
                <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{fmt(booking.scheduledAt)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span style={{ color: COLOR_TEXT_MUTED }}>المبلغ الإجمالي</span>
                <span style={{ fontFamily: 'Inter', fontWeight: 800, color: COLOR_BRAND_PRIMARY_DARK }}>{fmtJod(booking.totalJod)} JD</span>
              </div>
            </div>

            {/* Status history timeline */}
            {data!.statusHistory.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>سجل الحالات</div>
                <div className="mt-2 space-y-2">
                  {data!.statusHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                      <span className="flex items-center gap-1">
                        {h.fromStatus && <span style={{ color: COLOR_TEXT_SUBTLE }}>{STATUS_LABELS[h.fromStatus] ?? h.fromStatus} ←</span>}
                        <span style={{ fontWeight: 600 }}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                      </span>
                      <span style={{ fontFamily: 'Inter', color: COLOR_TEXT_SUBTLE, fontSize: 12 }}>{fmtDateTime(h.changedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment breakdown */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>الدفع</div>
              {data!.payment ? (
                <div className="mt-2 space-y-1" style={{ fontSize: 13 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ color: COLOR_TEXT_MUTED }}>المبلغ المصرّح</span>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{fmtJod(data!.payment.amountJod)} JD</span>
                  </div>
                  {booking.discountJod != null && Number(booking.discountJod) > 0 && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: COLOR_TEXT_MUTED }}>الخصم</span>
                      <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{fmtJod(booking.discountJod)} JD</span>
                    </div>
                  )}
                  {data!.payment.capturedAmountJod != null && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: COLOR_TEXT_MUTED }}>المبلغ المحصّل</span>
                      <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{fmtJod(data!.payment.capturedAmountJod)} JD</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span style={{ color: COLOR_TEXT_MUTED }}>حالة الدفع</span>
                    <span style={{ fontWeight: 600 }}>{PAYMENT_STATUS_LABELS[data!.payment.status] ?? data!.payment.status}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-1" style={{ fontSize: 13, color: COLOR_TEXT_SUBTLE }}>لا توجد عملية دفع بعد</div>
              )}
            </div>

            {/* Additional work items */}
            {data!.additionalWork.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>أعمال إضافية</div>
                <div className="mt-2 space-y-2">
                  {data!.additionalWork.map((w) => (
                    <div key={w.id} className="p-2 rounded-lg" style={{ background: COLOR_SURFACE_SUBTLE, fontSize: 13 }}>
                      <div className="flex items-center justify-between">
                        <span>{w.description}</span>
                        <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{fmtJod(w.amountJod)} JD</span>
                      </div>
                      <div style={{ color: COLOR_TEXT_SUBTLE, fontSize: 12 }}>{WORK_STATUS_LABELS[w.status] ?? w.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t" style={{ borderColor: COLOR_SURFACE_MUTED }}>
              <button onClick={onClose} className="px-4 h-9 rounded-lg" style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>إغلاق</button>
            </div>
          </div>
        )}
    </Drawer>
  );
}

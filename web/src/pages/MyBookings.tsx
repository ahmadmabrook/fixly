import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useBookings } from '../hooks/useBookings';
import { useAuth } from '../lib/store';
import { useBookingSocket } from '../lib/socket';
import { Card, ServiceIcon, PriceBadge, StatusBadge, SkeletonList } from '../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

const ACTIVE_STATUSES = new Set(['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);

export default function MyBookings() {
  const accessToken = useAuth((s) => s.accessToken);
  const navigate = useNavigate();
  const { data: bookings, isLoading } = useBookings();
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const filtered = useMemo(
    () => (bookings ?? []).filter((b) => (tab === 'active' ? ACTIVE_STATUSES.has(b.status) : !ACTIVE_STATUSES.has(b.status))),
    [bookings, tab],
  );

  if (!accessToken) {
    return (
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 16 }}>سجّل دخولك لعرض طلباتك.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>طلباتي</h1>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="تصفية الطلبات">
        {(['active', 'past'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="px-4 py-2 rounded-full"
            style={{ background: tab === k ? COLOR_BRAND_PRIMARY : COLOR_BG_SUBTLE, color: tab === k ? COLOR_WHITE : COLOR_TEXT_SECONDARY, fontWeight: 700, fontSize: 13 }}
          >
            {k === 'active' ? 'نشطة' : 'سابقة'}
          </button>
        ))}
      </div>

      {isLoading && <div className="mt-6"><SkeletonList count={4} rowHeight={72} /></div>}
      {!isLoading && filtered.length === 0 && (
        <Card className="mt-6 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: COLOR_BG_SUBTLE }}>
            <Inbox size={26} color={COLOR_TEXT_MUTED} aria-hidden="true" />
          </div>
          <p className="mt-3" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 15 }}>
            {tab === 'active' ? 'لا توجد طلبات نشطة حالياً' : 'لا توجد طلبات سابقة بعد'}
          </p>
          {tab === 'active' && (
            <button onClick={() => navigate('/services')} className="mt-4 px-5 h-11 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}>
              اطلب خدمة الآن
            </button>
          )}
        </Card>
      )}

      <div className="mt-6 space-y-3" role="list" aria-label="قائمة الطلبات">
        {filtered.map((b) => (
          <BookingRow key={b.id} item={b} />
        ))}
      </div>
    </main>
  );
}

function BookingRow({ item }: { item: { id: string; status: string; scheduledAt: string | null; totalJod: string | number; service?: { nameAr: string; nameEn: string } | null } }) {
  const navigate = useNavigate();
  const live = useBookingSocket(item.id);
  const status = live ?? item.status;
  return (
    <Card className="p-5 cursor-pointer" role="listitem" data-testid={`booking-row-${item.id}`} onClick={() => navigate(`/bookings/${item.id}`)}>
      <div className="flex items-center gap-4">
        <ServiceIcon nameAr={item.service?.nameAr ?? ''} size={20} />
        <div className="flex-1">
          <div style={{ fontWeight: 700, fontSize: 16 }}>{item.service?.nameAr}</div>
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>
            {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString('ar-JO') : 'فوراً'}
          </div>
        </div>
        <span data-testid={`booking-status-${item.id}`}><StatusBadge status={status} /></span>
        <PriceBadge amount={Number(item.totalJod)} />
      </div>
    </Card>
  );
}

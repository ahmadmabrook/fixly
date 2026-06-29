import { useNavigate } from 'react-router-dom';
import { useBookings } from '../hooks/useBookings';
import { useAuth } from '../lib/store';
import { useBookingSocket } from '../lib/socket';
import { Card, ServiceIcon, PriceBadge, StatusBadge, SkeletonList } from '../components/shared';

export default function MyBookings() {
  const accessToken = useAuth((s) => s.accessToken);
  const { data: bookings, isLoading } = useBookings();

  if (!accessToken) {
    return (
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <p style={{ color: '#475569', fontSize: 16 }}>سجّل دخولك لعرض طلباتك.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>طلباتي</h1>

      {isLoading && <div className="mt-6"><SkeletonList count={4} rowHeight={72} /></div>}
      {!isLoading && (!bookings || bookings.length === 0) && (
        <p className="mt-6 text-center" style={{ color: '#94A3B8' }}>لا توجد طلبات بعد.</p>
      )}

      <div className="mt-6 space-y-3" role="list" aria-label="قائمة الطلبات">
        {(bookings ?? []).map((b) => (
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
          <div style={{ color: '#475569', fontSize: 12 }}>
            {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString('ar-JO') : 'فوراً'}
          </div>
        </div>
        <span data-testid={`booking-status-${item.id}`}><StatusBadge status={status} /></span>
        <PriceBadge amount={Number(item.totalJod)} />
      </div>
    </Card>
  );
}

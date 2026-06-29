import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Phone, MessageCircle, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Booking, TechnicianCard } from '../lib/api';
import { useBookingSocket, useBookingLocation } from '../lib/socket';
import { Card, StatusBadge, Stars, Avatar, ConfirmDialog, Modal, notify } from '../components/shared';
import TrackingMap from '../components/TrackingMap';

const STEPS: ReadonlyArray<readonly [string, string]> = [
  ['CONFIRMED', 'تم القبول'],
  ['EN_ROUTE', 'في الطريق'],
  ['ARRIVED', 'وصل'],
  ['IN_PROGRESS', 'الخدمة جارية'],
  ['COMPLETED', 'مكتملة'],
];

export default function TrackingPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get<Booking & { technicianId: string | null; addressLat: number; addressLng: number }>(`/bookings/${id}`),
  });
  const liveStatus = useBookingSocket(id);
  const location = useBookingLocation(id);
  const status = liveStatus ?? booking?.status ?? 'PENDING';

  const { data: tech } = useQuery({
    queryKey: ['tech-card', booking?.technicianId],
    queryFn: () => api.get<TechnicianCard>(`/technicians/${booking!.technicianId}`),
    enabled: !!booking?.technicianId,
  });

  const activeIdx = STEPS.findIndex(([s]) => s === status);

  async function doCancel() {
    setCancelling(false);
    try {
      await api.post(`/bookings/${id}/cancel`, { reason: 'تم الإلغاء من التطبيق' });
      notify('تم إلغاء الحجز وإصدار المبلغ المسترد', 'success');
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الإلغاء', 'error');
    }
  }

  if (isLoading) return <main className="max-w-[900px] mx-auto px-6 py-16 text-center"><p style={{ color: '#94A3B8' }}>جارٍ التحميل...</p></main>;
  if (!booking) return <main className="max-w-[900px] mx-auto px-6 py-16 text-center"><p style={{ color: '#B91C1C' }}>الحجز غير موجود</p></main>;

  const cancellable = !['COMPLETED', 'CANCELLED'].includes(status);

  return (
    <main className="max-w-[900px] mx-auto px-6 py-8">
      <button onClick={() => navigate('/my-bookings')} className="flex items-center gap-1" style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} /> طلباتي
      </button>

      <Card className="mt-4 overflow-hidden" aria-label="خريطة تتبع الفني">
        <TrackingMap
          customer={{ lat: booking.addressLat, lng: booking.addressLng }}
          tech={location ? { lat: location.lat, lng: location.lng } : null}
          height={300}
        />
      </Card>

      {/* ETA + status */}
      <div className="mt-4 flex items-center justify-between">
        <StatusBadge status={status} />
        {status === 'EN_ROUTE' && (
          <span className="px-3 py-1 rounded-full" style={{ background: '#CCFBF1', color: '#0F766E', fontWeight: 700, fontSize: 13 }}>
            الوصول خلال <span style={{ fontFamily: 'Inter' }}>5</span> دقائق
          </span>
        )}
      </div>

      {/* Status stepper */}
      <div className="mt-4 flex items-center justify-between" role="list" aria-label="مراحل الطلب">
        {STEPS.map(([s, label], i) => (
          <div key={s} className="flex-1 flex flex-col items-center" role="listitem" aria-current={i === activeIdx ? 'step' : undefined}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: i <= activeIdx ? '#1366D6' : '#E2E8F0', color: i <= activeIdx ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: 700, fontFamily: 'Inter' }}
            >
              {i + 1}
            </div>
            <span style={{ fontSize: 10, marginTop: 4, color: i <= activeIdx ? '#0F172A' : '#94A3B8', textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Technician card */}
      {tech && (
        <Card className="mt-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={tech.name ?? 'الفني'} size={56} verified={tech.isVerified} />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{tech.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <Stars rating={Number(tech.rating)} />
                <span style={{ color: '#475569', fontSize: 12 }}>({tech.totalReviews} تقييم)</span>
              </div>
              {tech.vehicle && <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{tech.vehicle}</div>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button onClick={() => notify('جارٍ الاتصال (رقم مُقنّع)')} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 600, fontSize: 13 }}>
              <Phone size={16} /> اتصال
            </button>
            <button onClick={() => notify('فتح المحادثة')} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 13 }}>
              <MessageCircle size={16} /> رسالة
            </button>
            <button onClick={() => setShowReviews(true)} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: '#F1F5F9', color: '#475569', fontWeight: 600, fontSize: 13 }}>
              <Star size={16} /> التقييمات
            </button>
          </div>
        </Card>
      )}

      {cancellable && (
        <button onClick={() => setCancelling(true)} className="mt-4 w-full h-12 rounded-xl" style={{ color: '#B91C1C', fontWeight: 600, border: '1px solid #FECACA' }}>
          إلغاء الحجز
        </button>
      )}
      {status === 'COMPLETED' && (
        <button onClick={() => navigate(`/bookings/${id}`)} className="mt-4 w-full h-12 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
          عرض الإيصال وتقييم الخدمة
        </button>
      )}

      {cancelling && (
        <ConfirmDialog
          title="هل أنت متأكد من إلغاء الحجز؟"
          body="سيتم إصدار المبلغ المسترد وفق سياسة الاسترجاع."
          confirmLabel="تأكيد الإلغاء"
          onConfirm={() => void doCancel()}
          onCancel={() => setCancelling(false)}
        />
      )}
      {showReviews && booking.technicianId && (
        <TechReviewsModal technicianId={booking.technicianId} onClose={() => setShowReviews(false)} />
      )}
    </main>
  );
}

function TechReviewsModal({ technicianId, onClose }: { technicianId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['tech-reviews', technicianId],
    queryFn: () => api.get<{ summary: { rating: string | number; totalReviews: number }; items: Array<{ id: string; rating: number; comment: string | null; reviewerName: string | null; createdAt: string }> }>(`/technicians/${technicianId}/reviews`),
  });
  return (
    <Modal title="التقييمات الموثّقة" variant="sheet" maxWidth="md" onClose={onClose}>
      {!data && <p className="mt-4" style={{ color: '#94A3B8', fontSize: 14 }}>جارٍ التحميل…</p>}
      {data && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Stars rating={Number(data.summary.rating)} size={18} />
            <span style={{ color: '#475569', fontSize: 13 }}>({data.summary.totalReviews})</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.items.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد تقييمات بعد.</p>}
            {data.items.map((r) => (
              <div key={r.id} className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reviewerName ?? 'عميل'}</span>
                  <Stars rating={r.rating} />
                </div>
                {r.comment && <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        </>
      )}
      <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إغلاق</button>
    </Modal>
  );
}

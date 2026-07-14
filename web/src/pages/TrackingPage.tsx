import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Check, Phone, MessageCircle, Star, Search } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Booking, TechnicianCard } from '../lib/api';
import { useBookingSocket, useBookingLocation } from '../lib/socket';
import {
  Card, StatusBadge, Stars, Avatar, Modal, notify,
  ReportTechnicianButton, ReportTechnicianModal, CancelBookingModal,
} from '../components/shared';
import TrackingMap from '../components/TrackingMap';
import { COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ENROUTE_BG, COLOR_ENROUTE_TEXT, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

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
  const [showReport, setShowReport] = useState(false);

  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () =>
      api.get<Booking & { technicianId: string | null; addressLat: number; addressLng: number; discountJod?: string | number }>(
        `/bookings/${id}`,
      ),
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

  // Masked calling (Twilio Proxy — see backend MaskedCallService): dial a
  // proxy number that bridges to the other party without exposing either
  // side's real phone number.
  async function callTechnician() {
    try {
      const { proxyNumber } = await api.post<{ proxyNumber: string }>(`/bookings/${id}/masked-call`, {});
      window.location.href = `tel:${proxyNumber}`;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر بدء الاتصال', 'error');
    }
  }

  async function doCancel(reason: string) {
    setCancelling(false);
    try {
      await api.post(`/bookings/${id}/cancel`, { reason });
      notify('تم إلغاء الحجز وإصدار المبلغ المسترد', 'success');
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الإلغاء', 'error');
    }
  }

  if (isLoading) return <main className="max-w-[900px] mx-auto px-6 py-16 text-center"><p style={{ color: COLOR_TEXT_MUTED }}>جارٍ التحميل...</p></main>;
  if (!booking) return <main className="max-w-[900px] mx-auto px-6 py-16 text-center"><p style={{ color: COLOR_ERROR_TEXT }}>الحجز غير موجود</p></main>;

  const cancellable = !['COMPLETED', 'CANCELLED'].includes(status);

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-8">
      <button onClick={() => navigate('/my-bookings')} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} /> طلباتي
      </button>

      <div className="mt-4 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="overflow-hidden" aria-label="خريطة تتبع الفني">
            <TrackingMap
              customer={{ lat: booking.addressLat, lng: booking.addressLng }}
              tech={location ? { lat: location.lat, lng: location.lng } : null}
              status={status}
              height={420}
            />
          </Card>

          {/* Dispatch-in-progress: no technician assigned yet */}
          {status === 'CONFIRMED' && !booking.technicianId && (
            <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl" style={{ background: COLOR_BRAND_PRIMARY_TINT }}>
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: COLOR_BRAND_PRIMARY }} />
                <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: COLOR_BRAND_PRIMARY }} />
              </span>
              <Search size={18} color={COLOR_BRAND_PRIMARY_DARK} />
              <span style={{ color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>نبحث عن أقرب فني…</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Status + vertical stepper */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 style={{ fontWeight: 700, fontSize: 16 }}>حالة الطلب</h3>
              <StatusBadge status={status} />
            </div>
            {status === 'EN_ROUTE' && (
              <span className="mt-2 inline-block px-3 py-1 rounded-full" style={{ background: COLOR_ENROUTE_BG, color: COLOR_ENROUTE_TEXT, fontWeight: 700, fontSize: 13 }}>
                الوصول خلال <span style={{ fontFamily: 'Inter' }}>5</span> دقائق
              </span>
            )}
            <div className="mt-5 space-y-0" role="list" aria-label="مراحل الطلب">
              {STEPS.map(([s, label], i) => {
                const done = i < activeIdx;
                const active = i === activeIdx;
                return (
                  <div key={s} className="flex items-center gap-3 pb-4 last:pb-0 relative" role="listitem" aria-current={active ? 'step' : undefined}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10" style={{ background: done || active ? COLOR_BRAND_PRIMARY : COLOR_BORDER, color: COLOR_WHITE }}>
                      {done ? <Check size={15} aria-hidden="true" /> : <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>}
                    </div>
                    {i < STEPS.length - 1 && <div className="absolute right-[13px] top-7 w-0.5 h-full" style={{ background: done ? COLOR_BRAND_PRIMARY : COLOR_BORDER }} />}
                    <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? COLOR_TEXT_PRIMARY : COLOR_TEXT_MUTED }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Technician card */}
          {tech && (
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <Avatar name={tech.name ?? 'الفني'} size={56} verified={tech.isVerified} />
                <div className="flex-1">
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{tech.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Stars rating={Number(tech.rating)} />
                    <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>({tech.totalReviews} تقييم)</span>
                  </div>
                  {tech.vehicle && <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, marginTop: 2 }}>{tech.vehicle}</div>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={() => void callTechnician()} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 600, fontSize: 13 }}>
                  <Phone size={16} /> اتصال
                </button>
                {/* No booking-scoped chat endpoint exists yet (only /support
                    tickets, which aren't tied to a specific technician) — say
                    so honestly instead of a fake "chat opened" toast. */}
                <button onClick={() => notify('المحادثة داخل التطبيق غير متاحة بعد — يمكنك الاتصال أو التواصل مع الدعم', 'info')} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 600, fontSize: 13 }}>
                  <MessageCircle size={16} /> رسالة
                </button>
                <button onClick={() => setShowReviews(true)} className="flex items-center justify-center gap-1 h-11 rounded-xl" style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 600, fontSize: 13 }}>
                  <Star size={16} /> التقييمات
                </button>
                <ReportTechnicianButton onClick={() => setShowReport(true)} />
              </div>
            </Card>
          )}

          {cancellable && (
            <button onClick={() => setCancelling(true)} className="w-full h-12 rounded-xl" style={{ color: COLOR_ERROR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_ERROR_BORDER}` }}>
              إلغاء الحجز
            </button>
          )}
          {status === 'COMPLETED' && (
            <button onClick={() => navigate(`/bookings/${id}`)} className="w-full h-12 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
              عرض الإيصال وتقييم الخدمة
            </button>
          )}
        </div>
      </div>

      {cancelling && (
        <CancelBookingModal
          priceJod={Number(booking.service?.priceJod ?? booking.totalJod)}
          discountJod={Number(booking.discountJod ?? 0)}
          totalJod={Number(booking.totalJod)}
          onConfirm={(reason) => void doCancel(reason)}
          onCancel={() => setCancelling(false)}
        />
      )}
      {showReviews && booking.technicianId && (
        <TechReviewsModal technicianId={booking.technicianId} onClose={() => setShowReviews(false)} />
      )}
      {showReport && (
        <ReportTechnicianModal bookingId={id} technicianId={booking.technicianId} onClose={() => setShowReport(false)} />
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
      {!data && <p className="mt-4" style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>جارٍ التحميل…</p>}
      {data && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Stars rating={Number(data.summary.rating)} size={18} />
            <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>({data.summary.totalReviews})</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.items.length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد تقييمات بعد.</p>}
            {data.items.map((r) => (
              <div key={r.id} className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reviewerName ?? 'عميل'}</span>
                  <Stars rating={r.rating} />
                </div>
                {r.comment && <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, marginTop: 4 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        </>
      )}
      <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>إغلاق</button>
    </Modal>
  );
}

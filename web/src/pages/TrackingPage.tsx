import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Check, Phone, MessageCircle, Star, Search, Wallet, Video, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Booking, TechnicianCard } from '../lib/api';
import { useBookingSocket, useBookingLocation } from '../lib/socket';
import {
  Card, StatusBadge, Stars, Avatar, CertifiedBadge, Modal, notify,
  ReportTechnicianButton, ReportTechnicianModal, CancelBookingModal, CANCEL_REASON_LABEL,
} from '../components/shared';
import TrackingMap from '../components/TrackingMap';
import { CustomerMaterialsSection } from './BookingMaterials';
import { COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ENROUTE_BG, COLOR_ENROUTE_TEXT, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WARNING_BG_SOFT, COLOR_WARNING_BORDER, COLOR_WARNING_TEXT, COLOR_WARNING_TEXT_STRONG, COLOR_WHITE } from '../lib/theme';

/** Reasons that mean "Fixly's own gap", not the customer's choice — worth a
 *  reassuring, action-oriented card instead of a flat "cancelled" badge. */
const SYSTEM_CANCEL_REASON = 'no_technician_available';

/** cancelReason values a customer should never see verbatim: internal/system
 *  strings that aren't in CANCEL_REASON_LABEL and aren't SYSTEM_CANCEL_REASON
 *  (e.g. the payment-timeout auto-cancel's English housekeeping string). */
function cancelReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === SYSTEM_CANCEL_REASON) return null; // handled by its own dedicated card
  return CANCEL_REASON_LABEL[reason] ?? 'تم إلغاء الطلب.';
}

// Below this the countdown stops quoting minutes and just says "about to
// arrive" — rounding 30s up to "1 minute" reads as wrong to someone watching
// the car turn onto their street.
const ETA_ARRIVING_SOON_SECONDS = 45;
const ETA_TICK_MS = 1_000;
const SECONDS_PER_MINUTE = 60;

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
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  // Live arrival ETA (minutes), driven by the tracking map's road route. Ticks
  // down every second between the ~2s location pings so it reads like Uber
  // instead of jumping.
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (etaSeconds === null || etaSeconds <= 0) return;
    const t = setInterval(() => setEtaSeconds((s) => (s === null ? null : Math.max(0, s - ETA_TICK_MS / 1_000))), ETA_TICK_MS);
    return () => clearInterval(t);
  }, [etaSeconds === null]);

  const { data: booking, isLoading, isError, refetch } = useQuery({
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
  // A failed request is not a missing booking. Telling a customer their live
  // booking "does not exist" because their phone dropped off the network is
  // alarming and, unlike a real 404, it's recoverable — so offer the retry.
  if (isError) {
    return (
      <main className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <p style={{ color: COLOR_ERROR_TEXT }}>تعذّر تحميل الحجز — تحقّق من اتصالك بالإنترنت</p>
        <button onClick={() => void refetch()} className="mt-4 h-11 px-6 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
          إعادة المحاولة
        </button>
      </main>
    );
  }
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
              onEtaSeconds={setEtaSeconds}
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
          {/* Dispatch exhausted every round with no technician accepting —
              Fixly's own gap, not the customer's doing, so lead with an
              apology + full-refund confirmation + one-tap retry rather than
              the flat generic "cancelled" badge. */}
          {status === 'CANCELLED' && booking.cancelReason === SYSTEM_CANCEL_REASON && (
            <div className="p-4 rounded-2xl" style={{ background: COLOR_WARNING_BG_SOFT, border: `1px solid ${COLOR_WARNING_BORDER}` }}>
              <div className="flex items-center gap-2">
                <RefreshCw size={18} color={COLOR_WARNING_TEXT_STRONG} />
                <span style={{ color: COLOR_WARNING_TEXT_STRONG, fontWeight: 700, fontSize: 14 }}>لم نجد فنياً متاحاً</span>
              </div>
              <p className="mt-1.5" style={{ color: COLOR_WARNING_TEXT, fontSize: 13 }}>
                تعذّر إيجاد فني متاح حالياً وتم استرداد المبلغ بالكامل. جرّب الطلب مرة أخرى أو اختر موعداً لاحقاً.
              </p>
              <button
                onClick={() => navigate(`/services/${encodeURIComponent(booking.service.id)}/book`)}
                className="mt-3 h-10 px-5 rounded-xl"
                style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 13 }}
              >
                اطلب مرة أخرى
              </button>
            </div>
          )}
          {/* Any other cancellation reason (customer's own choice, etc.) — a
              quieter confirmation line, no retry push since the customer
              already made this call themselves. */}
          {status === 'CANCELLED' && booking.cancelReason !== SYSTEM_CANCEL_REASON && cancelReasonLabel(booking.cancelReason) && (
            <div className="p-4 rounded-2xl" style={{ background: COLOR_BG_SUBTLE }}>
              <span style={{ color: COLOR_TEXT_SECONDARY, fontWeight: 600, fontSize: 13 }}>
                سبب الإلغاء: {cancelReasonLabel(booking.cancelReason)}
              </span>
            </div>
          )}

          {/* Late-arrival compensation (§0.3): granted the instant the technician
              is marked ARRIVED past the SLA + grace window — surfaced live here
              rather than making the customer wait for the post-completion
              receipt to discover the credit. */}
          {Number(booking.lateCompJod ?? 0) > 0 && (
            <div className="flex items-center gap-2 p-4 rounded-2xl" style={{ background: COLOR_SUCCESS_BG }}>
              <Wallet size={18} color={COLOR_SUCCESS_TEXT} />
              <span style={{ color: COLOR_SUCCESS_TEXT, fontWeight: 700, fontSize: 13 }}>
                حصلت على <span style={{ fontFamily: 'Inter' }}>{Number(booking.lateCompJod)}</span> دينار كتعويض تأخير — أُضيفت إلى رصيدك
              </span>
            </div>
          )}

          {/* Status + vertical stepper */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 style={{ fontWeight: 700, fontSize: 16 }}>حالة الطلب</h3>
              <StatusBadge status={status} />
            </div>
            {status === 'EN_ROUTE' && (
              <span className="mt-2 inline-block px-3 py-1 rounded-full" style={{ background: COLOR_ENROUTE_BG, color: COLOR_ENROUTE_TEXT, fontWeight: 700, fontSize: 13 }}>
                {etaSeconds === null
                  ? 'الفني في الطريق إليك'
                  : etaSeconds <= ETA_ARRIVING_SOON_SECONDS
                    ? 'الفني على وشك الوصول'
                    : <>الوصول خلال <span style={{ fontFamily: 'Inter' }}>{Math.round(etaSeconds / SECONDS_PER_MINUTE)}</span> دقائق</>}
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
                  {tech.isVerified && <div className="mt-1.5"><CertifiedBadge /></div>}
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
              {tech.introVideoUrl && (
                <button
                  onClick={() => setShowIntroVideo(true)}
                  className="mt-2 w-full h-10 rounded-xl flex items-center justify-center gap-1.5"
                  style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 600, fontSize: 13 }}
                >
                  <Video size={15} /> مشاهدة الفيديو التعريفي
                </button>
              )}
            </Card>
          )}

          <CustomerMaterialsSection bookingId={id} />

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
      {showIntroVideo && tech?.introVideoUrl && (
        <Modal title="الفيديو التعريفي" variant="sheet" maxWidth="md" onClose={() => setShowIntroVideo(false)}>
          <video src={tech.introVideoUrl} controls autoPlay className="mt-3 w-full rounded-xl" style={{ maxHeight: 400, background: '#000' }} />
        </Modal>
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

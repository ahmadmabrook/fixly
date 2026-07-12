import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useService } from '../hooks/useServices';
import { useCreateBooking } from '../hooks/useBookings';
import { useBookingSocket } from '../lib/socket';
import { api, ApiError, PromoQuote, CheckoutSession } from '../lib/api';
import { Card, ServiceIcon, PriceBadge, InlineRow, ConfirmDialog, StatusBadge, notify } from '../components/shared';
import MapAddressPicker, { type AddressValue } from '../components/MapAddressPicker';
import HyperPayWidget from '../components/HyperPayWidget';

interface SubscriptionDto { status: string; discountPercent: number; guaranteeDays: number }

interface BookingPageProps {
  serviceId: string;
  onBack: () => void;
  onDone: () => void;
}

const SCHEDULE_OPTIONS: ReadonlyArray<readonly ['now' | 'later', string, string]> = [
  ['now', 'فوراً', 'خلال 30 دقيقة'],
  ['later', 'حجز لاحقاً', 'غداً'],
];

// Amman, Jordan — sensible default until the user moves the pin.
const DEFAULT_LAT = 31.9522;
const DEFAULT_LNG = 35.9331;

// Arabic labels for the live booking status enum (hoisted so it isn't rebuilt
// on every render / status tick).
const STATUS_LABELS_AR: Record<string, string> = {
  PENDING: 'بانتظار الدفع',
  CONFIRMED: 'تم القبول',
  EN_ROUTE: 'الفني في الطريق',
  ARRIVED: 'الفني وصل',
  IN_PROGRESS: 'الخدمة جارية',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
  DISPUTED: 'نزاع',
};

export default function BookingPage({ serviceId, onBack, onDone }: BookingPageProps) {
  const { data: svc, isLoading, isError, error } = useService(serviceId);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [addr, setAddr] = useState<AddressValue>({ address: 'خلدا، شارع وصفي التل', lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoQuote | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const { mutate: createBooking, isPending } = useCreateBooking();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const liveStatus = useBookingSocket(createdId);
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<SubscriptionDto | null>('/subscriptions/me') });
  const member = sub?.status === 'ACTIVE';
  const discountPercent = sub?.discountPercent ?? 15;
  const guaranteeDays = member ? sub?.guaranteeDays ?? 90 : 30;

  // After a successful create, push the live status into the toast flow.
  useEffect(() => {
    if (liveStatus) {
      // Translate the enum to its Arabic label so the user sees a coherent
      // Arabic sentence instead of "حالة الطلب: EN_ROUTE".
      notify(`حالة الطلب: ${STATUS_LABELS_AR[liveStatus] ?? liveStatus}`, 'info');
    }
  }, [liveStatus]);

  const applyPromo = useCallback(async () => {
    if (!svc || !promoInput.trim()) return;
    setPromoChecking(true);
    try {
      const quote = await api.post<PromoQuote>('/promo/validate', { code: promoInput.trim(), serviceId: svc.id });
      setPromo(quote);
      notify('تم تطبيق رمز الخصم', 'success');
    } catch (e) {
      setPromo(null);
      notify(e instanceof ApiError ? e.message : 'رمز الخصم غير صالح', 'error');
    } finally {
      setPromoChecking(false);
    }
  }, [svc, promoInput]);

  const submit = useCallback(() => {
    if (!svc) return;
    const { lat: latNum, lng: lngNum, address } = addr;
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90 || !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      notify('حدّد موقعاً صالحاً على الخريطة', 'error');
      return;
    }
    if (address.trim().length === 0) {
      notify('الرجاء إدخال العنوان', 'error');
      return;
    }
    setConfirming(false);
    createBooking(
      {
        serviceId: svc.id,
        addressLine: address.trim(),
        addressLat: latNum,
        addressLng: lngNum,
        notes: notes.trim() || null,
        scheduledAt: when === 'now' ? null : (() => {
          const d = new Date(Date.now() + 86_400_000);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
        })(),
        promoCode: promo ? promoInput.trim() : null,
      },
      {
        onSuccess: ({ booking, checkout: session }) => {
          setCreatedId(booking.id);
          if (session) {
            // Hosted checkout: mount the payment widget; the booking stays
            // AWAITING_PAYMENT until the customer authorizes on HyperPay.
            setCheckout(session);
          } else {
            // Instant (mock) mode: the hold is placed server-side immediately.
            notify('تم تأكيد الحجز بنجاح', 'success');
            onDone();
          }
        },
        onError: (e) => notify(e instanceof Error ? e.message : 'حدث خطأ', 'error'),
      },
    );
  }, [svc, addr, notes, when, promo, promoInput, createBooking, onDone]);

  // Once a checkout session is open, render only the payment step.
  if (checkout && createdId) {
    const returnUrl = `${window.location.origin}/payment/return?bookingId=${createdId}`;
    return (
      <main className="max-w-[640px] mx-auto px-6 py-10">
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>إتمام الدفع</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: '6px 0 16px' }}>
          أدخل بيانات بطاقتك لإتمام الحجز. سيتم حجز المبلغ ويُخصم بعد إتمام الخدمة.
        </p>
        <Card className="p-6">
          <HyperPayWidget session={checkout} returnUrl={returnUrl} />
        </Card>
      </main>
    );
  }

  if (isLoading) {
    return <CenteredMessage tone="muted">جارٍ التحميل...</CenteredMessage>;
  }
  if (isError || !svc) {
    return (
      <CenteredMessage tone="error">
        تعذّر تحميل الخدمة: {(error as Error | null)?.message ?? 'غير معروفة'}
      </CenteredMessage>
    );
  }

  const price = Number(svc.priceJod);
  // Mirrors BookingService.create.ts's subscriberPrice: list price minus the
  // active subscription's percentage discount, rounded to the nearest cent.
  const subDiscount = member ? Math.round(price * discountPercent) / 100 : 0;
  const memberPrice = Math.round((price - subDiscount) * 100) / 100;
  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1" style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} aria-hidden="true" /> رجوع
      </button>

      <div className="mt-4 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>الموعد</h2>
            <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="اختر الموعد">
              {SCHEDULE_OPTIONS.map(([k, label, sub]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={when === k}
                  onClick={() => setWhen(k)}
                  className="p-4 rounded-xl border-2 text-start"
                  style={{ borderColor: when === k ? '#1366D6' : '#E2E8F0', background: when === k ? '#E8F1FE' : '#FFF' }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, color: when === k ? '#1366D6' : '#0F172A' }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>{sub}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>الموقع</h2>
            <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>اسحب الدبوس أو ابحث لتحديد عنوانك بدقة.</p>
            <div className="mt-3">
              <MapAddressPicker value={addr} onChange={setAddr} height={260} />
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              className="mt-3 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none"
              style={{ fontSize: 14 }}
              placeholder="ملاحظات (مثال: رمز البوابة 1234)"
            />
          </Card>

          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>الدفع</h2>
            {/* Only a real card checkout exists (HyperPay hosted checkout,
                VISA/MASTER only) — no Apple Pay/Google Pay integration. A
                3-way selector like the design mock would let the customer
                "choose" options that silently fall through to the same card
                form, which is worse than a single accurate option. */}
            <div
              className="mt-3 p-4 rounded-xl border-2 text-center"
              style={{ borderColor: '#1366D6', background: '#E8F1FE', fontWeight: 700, fontSize: 14, color: '#0E4FA8' }}
            >
              بطاقة ائتمان (Visa / Mastercard)
            </div>
          </Card>
        </div>

        <Card className="p-6 h-fit sticky top-20">
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>ملخص الطلب</h2>
          <div className="mt-4 flex items-center gap-3">
            <ServiceIcon nameAr={svc.nameAr} size={20} />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{svc.nameAr}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>سعر ثابت</div>
            </div>
            <PriceBadge amount={price} />
          </div>
          {liveStatus && (
            <div className="mt-3 flex items-center gap-2">
              <span style={{ fontSize: 12, color: '#475569' }}>الحالة الآن:</span>
              <StatusBadge status={liveStatus} />
            </div>
          )}
          <div className="my-4 h-px bg-slate-100" />
          {/* Promo / discount code */}
          <label htmlFor="promo" className="block" style={{ fontSize: 12, color: '#475569' }}>رمز الخصم</label>
          <div className="mt-1 flex gap-2">
            <input
              id="promo"
              value={promoInput}
              onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromo(null); }}
              placeholder="أدخل رمز الخصم"
              className="flex-1 h-11 rounded-xl border border-slate-200 px-3 outline-none"
              style={{ fontSize: 14 }}
              aria-label="رمز الخصم"
            />
            <button
              onClick={() => void applyPromo()}
              disabled={promoChecking || !promoInput.trim()}
              className="px-4 h-11 rounded-xl disabled:opacity-50"
              style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 700, fontSize: 13 }}
            >
              {promoChecking ? '...' : 'تطبيق'}
            </button>
          </div>
          {promo && (
            <p className="mt-2" style={{ color: '#15803D', fontSize: 12, fontWeight: 600 }}>
              تم تطبيق {promo.code} ✓
            </p>
          )}
          {/* Promo code nudge — clickable chip that fills the input */}
          {!promo && !promoInput.trim() && (
            <button
              type="button"
              onClick={() => { setPromoInput('WELCOME10'); }}
              className="mt-2 px-3 py-1.5 rounded-full"
              style={{ background: '#F1F5F9', color: '#475569', fontSize: 12, fontWeight: 600, border: '1px dashed #CBD5E1' }}
            >
              جرّب: WELCOME10 للحصول على خصم 10%
            </button>
          )}
          <div className="my-4 h-px bg-slate-100" />
          <InlineRow label="سعر الخدمة" value={`${price} دينار`} />
          {member && (
            <InlineRow
              label={`خصم العضوية −${discountPercent}%`}
              value={<span style={{ color: '#15803D' }}>−{subDiscount} دينار</span>}
            />
          )}
          <InlineRow label="الخصم" value={`${promo ? Number(promo.discountJod) : 0} دينار`} />
          <div className="my-2 h-px bg-slate-100" />
          {/* No-promo total reflects the actual server-charged amount
              (list price minus the subscription discount — see
              BookingService.create.ts's subscriberPrice). The promo-applied
              total still comes from /promo/validate, which quotes off the
              raw list price rather than the member price BookingService
              actually stacks the promo on — a real but separate backend
              discrepancy, not fixed here. */}
          <InlineRow strong label="الإجمالي" value={`${promo ? Number(promo.finalJod) : memberPrice} دينار`} />
          <p className="mt-3 p-3 rounded-lg" style={{ background: '#E8F1FE', color: '#0E4FA8', fontSize: 12 }}>
            سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة.
          </p>
          <p className="mt-2 flex items-center gap-1.5" style={{ color: '#15803D', fontSize: 12 }}>
            <ShieldCheck size={14} aria-hidden="true" /> ضمان <span style={{ fontFamily: 'Inter' }}>{guaranteeDays}</span> يوم مشمول
          </p>
          <button
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="mt-4 w-full h-12 rounded-xl disabled:opacity-50"
            style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}
          >
            تأكيد الحجز
          </button>
        </Card>
      </div>

      {confirming && (
        <ConfirmDialog
          title="تأكيد الحجز"
          body={`سيتم حجز ${promo ? Number(promo.finalJod) : memberPrice} دينار عبر البطاقة وخصمه بعد إتمام الخدمة.`}
          confirmLabel={isPending ? '...' : 'تأكيد والدفع'}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </main>
  );
}

function CenteredMessage({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  const color = tone === 'error' ? '#B91C1C' : '#94A3B8';
  return (
    <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
      <p style={{ color, fontSize: 16 }}>{children}</p>
    </main>
  );
}

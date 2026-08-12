import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ShieldCheck, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useService } from '../hooks/useServices';
import { useCreateBooking } from '../hooks/useBookings';
import { useBookingSocket } from '../lib/socket';
import { api, ApiError, PromoQuote, CheckoutSession, Subscription } from '../lib/api';
import { Card, ServiceIcon, PriceBadge, InlineRow, ConfirmDialog, StatusBadge, notify } from '../components/shared';
import MapAddressPicker, { type AddressValue } from '../components/MapAddressPicker';
import HyperPayWidget from '../components/HyperPayWidget';
import { DEFAULT_GUARANTEE_DAYS, DEFAULT_PROTECTION_DISCOUNT_PERCENT, EMERGENCY_SURCHARGE_JOD, PROTECTION_GUARANTEE_DAYS } from '../lib/constants';
import { COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BORDER_STRONG, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ERROR_TEXT, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_SUBTLE, COLOR_WHITE } from '../lib/theme';

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
  const [isEmergency, setIsEmergency] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoQuote | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const { mutate: createBooking, isPending } = useCreateBooking();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const liveStatus = useBookingSocket(createdId);
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription | null>('/subscriptions/me') });
  const member = sub?.status === 'ACTIVE';
  const discountPercent = sub?.discountPercent ?? DEFAULT_PROTECTION_DISCOUNT_PERCENT;
  const guaranteeDays = member ? sub?.guaranteeDays ?? PROTECTION_GUARANTEE_DAYS : DEFAULT_GUARANTEE_DAYS;
  // §17.5.2 / §17.5.4: wallet credit is redeemed automatically server-side —
  // this is a pre-confirmation estimate of that auto-redemption, not a toggle.
  const { data: credits } = useQuery({ queryKey: ['credits'], queryFn: () => api.get<{ balanceJod: string | number }>('/credits/me') });
  const creditBalance = Number(credits?.balanceJod ?? 0);

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
        isEmergency,
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
  }, [svc, addr, notes, when, promo, promoInput, isEmergency, createBooking, onDone]);

  // Once a checkout session is open, render only the payment step.
  if (checkout && createdId) {
    const returnUrl = `${window.location.origin}/payment/return?bookingId=${createdId}`;
    return (
      <main className="max-w-[640px] mx-auto px-6 py-10">
        <h1 style={{ fontSize: 20, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>إتمام الدفع</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_SUBTLE, margin: '6px 0 16px' }}>
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

  // §0.2 #4 — quote_first services (e.g. Painting) are never instant-bookable;
  // the backend rejects this too, but the booking form must not even be
  // offered for a service reached by direct link rather than through
  // ServicePage's own quote_first branch.
  if (svc.pricingModel === 'QUOTE_FIRST') {
    return (
      <main className="max-w-[720px] mx-auto px-6 py-16 text-center">
        <p style={{ fontSize: 15, color: COLOR_TEXT_SECONDARY }}>
          هذه الخدمة تحتاج معاينة أولاً — لا يوجد سعر فوري لها.
        </p>
        <a
          href="/quotes"
          className="mt-4 inline-flex items-center justify-center h-11 px-6 rounded-xl"
          style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}
        >
          اطلب عرض سعر
        </a>
      </main>
    );
  }

  const price = Number(svc.priceJod);
  // Mirrors BookingService.create.ts's subscriberPrice: list price minus the
  // active subscription's percentage discount, rounded to the nearest cent.
  const subDiscount = member ? Math.round(price * discountPercent) / 100 : 0;
  const memberPrice = Math.round((price - subDiscount) * 100) / 100;
  // Surcharge is added after discounts (§17.5.2: "never discounted").
  const preCreditTotal = (promo ? Number(promo.finalJod) : memberPrice) + (isEmergency ? EMERGENCY_SURCHARGE_JOD : 0);
  const creditApplied = Math.min(creditBalance, preCreditTotal);
  const finalTotal = Math.round((preCreditTotal - creditApplied) * 100) / 100;
  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
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
                  style={{ borderColor: when === k ? COLOR_BRAND_PRIMARY : COLOR_BORDER, background: when === k ? COLOR_BRAND_PRIMARY_TINT : COLOR_WHITE }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, color: when === k ? COLOR_BRAND_PRIMARY : COLOR_TEXT_PRIMARY }}>{label}</div>
                  <div style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY }}>{sub}</div>
                </button>
              ))}
            </div>
            {/* §17.5.2 / §8.4 — "time incl. emergency-surcharge chip": a disclosed,
                customer-declared flat surcharge, own invoice line, never discounted. */}
            <button
              type="button"
              onClick={() => setIsEmergency((v) => !v)}
              aria-pressed={isEmergency}
              className="mt-3 w-full flex items-center gap-2 p-3 rounded-xl border-2 text-start"
              style={{ borderColor: isEmergency ? COLOR_BRAND_PRIMARY : COLOR_BORDER, background: isEmergency ? COLOR_BRAND_PRIMARY_TINT : COLOR_WHITE }}
            >
              <Zap size={16} color={isEmergency ? COLOR_BRAND_PRIMARY : COLOR_TEXT_SECONDARY} aria-hidden="true" />
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 13, color: isEmergency ? COLOR_BRAND_PRIMARY : COLOR_TEXT_PRIMARY }}>طلب طارئ / خارج أوقات الدوام</div>
                <div style={{ fontSize: 11, color: COLOR_TEXT_SECONDARY }}>
                  رسوم طوارئ إضافية <span style={{ fontFamily: 'Inter' }}>{EMERGENCY_SURCHARGE_JOD}</span> دينار — تُعرض كبند منفصل ولا تخضع للخصومات
                </div>
              </div>
            </button>
          </Card>

          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>الموقع</h2>
            <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, marginTop: 4 }}>اسحب الدبوس أو ابحث لتحديد عنوانك بدقة.</p>
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
              style={{ borderColor: COLOR_BRAND_PRIMARY, background: COLOR_BRAND_PRIMARY_TINT, fontWeight: 700, fontSize: 14, color: COLOR_BRAND_PRIMARY_DARK }}
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
              <div style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY }}>سعر ثابت</div>
            </div>
            <PriceBadge amount={price} />
          </div>
          {liveStatus && (
            <div className="mt-3 flex items-center gap-2">
              <span style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY }}>الحالة الآن:</span>
              <StatusBadge status={liveStatus} />
            </div>
          )}
          <div className="my-4 h-px bg-slate-100" />
          {/* Promo / discount code */}
          <label htmlFor="promo" className="block" style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY }}>رمز الخصم</label>
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
              style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 700, fontSize: 13 }}
            >
              {promoChecking ? '...' : 'تطبيق'}
            </button>
          </div>
          {promo && (
            <p className="mt-2" style={{ color: COLOR_SUCCESS_TEXT, fontSize: 12, fontWeight: 600 }}>
              تم تطبيق {promo.code} ✓
            </p>
          )}
          {/* Promo code nudge — clickable chip that fills the input */}
          {!promo && !promoInput.trim() && (
            <button
              type="button"
              onClick={() => { setPromoInput('WELCOME10'); }}
              className="mt-2 px-3 py-1.5 rounded-full"
              style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontSize: 12, fontWeight: 600, border: `1px dashed ${COLOR_BORDER_STRONG}` }}
            >
              جرّب: WELCOME10 للحصول على خصم 10%
            </button>
          )}
          <div className="my-4 h-px bg-slate-100" />
          <InlineRow label="سعر الخدمة" value={`${price} دينار`} />
          {member && (
            <InlineRow
              label={`خصم العضوية −${discountPercent}%`}
              value={<span style={{ color: COLOR_SUCCESS_TEXT }}>−{subDiscount} دينار</span>}
            />
          )}
          <InlineRow label="الخصم" value={`${promo ? Number(promo.discountJod) : 0} دينار`} />
          {isEmergency && (
            <InlineRow label="رسوم طوارئ / خارج الدوام" value={`+${EMERGENCY_SURCHARGE_JOD} دينار`} />
          )}
          {creditApplied > 0 && (
            <InlineRow
              label="رصيدك (يُطبَّق تلقائياً)"
              value={<span style={{ color: COLOR_SUCCESS_TEXT }}>−{creditApplied.toFixed(2)} دينار</span>}
            />
          )}
          <div className="my-2 h-px bg-slate-100" />
          {/* Total reflects the actual server-charged amount: list price minus
              the subscription discount (BookingService.create.ts's
              subscriberPrice), with any promo correctly stacked on TOP of that
              member price (not the raw list price — see promo.ts's own
              /validate handler, which quotes off subscriberPrice for exactly
              this reason), plus the emergency surcharge and minus the
              auto-redeemed wallet credit estimate. */}
          <InlineRow strong label="الإجمالي" value={`${finalTotal} دينار`} />
          <p className="mt-3 p-3 rounded-lg" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontSize: 12 }}>
            سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة.
          </p>
          <p className="mt-2 flex items-center gap-1.5" style={{ color: COLOR_SUCCESS_TEXT, fontSize: 12 }}>
            <ShieldCheck size={14} aria-hidden="true" /> ضمان <span style={{ fontFamily: 'Inter' }}>{guaranteeDays}</span> يوم مشمول
          </p>
          <button
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="mt-4 w-full h-12 rounded-xl disabled:opacity-50"
            style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}
          >
            تأكيد الحجز
          </button>
        </Card>
      </div>

      {confirming && (
        <ConfirmDialog
          title="تأكيد الحجز"
          body={`سيتم حجز ${finalTotal} دينار عبر البطاقة وخصمه بعد إتمام الخدمة.`}
          confirmLabel={isPending ? '...' : 'تأكيد والدفع'}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </main>
  );
}

function CenteredMessage({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  const color = tone === 'error' ? COLOR_ERROR_TEXT : COLOR_TEXT_MUTED;
  return (
    <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
      <p style={{ color, fontSize: 16 }}>{children}</p>
    </main>
  );
}

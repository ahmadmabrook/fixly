import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useService } from '../hooks/useServices';
import { useCreateBooking } from '../hooks/useBookings';
import { useBookingSocket } from '../lib/socket';
import { api, ApiError, PromoQuote } from '../lib/api';
import { Card, ServiceIcon, PriceBadge, InlineRow, ConfirmDialog, StatusBadge, notify } from '../components/shared';
import MapAddressPicker, { type AddressValue } from '../components/MapAddressPicker';

interface BookingPageProps {
  serviceId: string;
  onBack: () => void;
  onDone: () => void;
}

const PAY_METHODS = ['Apple Pay', 'Google Pay', 'بطاقة'] as const;
const SCHEDULE_OPTIONS: ReadonlyArray<readonly ['now' | 'later', string, string]> = [
  ['now', 'فوراً', 'خلال 30 دقيقة'],
  ['later', 'حجز لاحقاً', 'غداً'],
];

// Amman, Jordan — sensible default until the user moves the pin.
const DEFAULT_LAT = 31.9522;
const DEFAULT_LNG = 35.9331;

export default function BookingPage({ serviceId, onBack, onDone }: BookingPageProps) {
  const { data: svc, isLoading, isError, error } = useService(serviceId);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [addr, setAddr] = useState<AddressValue>({ address: 'خلدا، شارع وصفي التل', lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [confirming, setConfirming] = useState(false);
  const [pay, setPay] = useState(0);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoQuote | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const { mutate: createBooking, isPending } = useCreateBooking();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const liveStatus = useBookingSocket(createdId);

  // After a successful create, push the live status into the toast flow.
  useEffect(() => {
    if (liveStatus) {
      // Translate the enum to its Arabic label so the user sees a coherent
      // Arabic sentence instead of "حالة الطلب: EN_ROUTE".
      const labels: Record<string, string> = {
        PENDING: 'بانتظار الدفع',
        CONFIRMED: 'تم القبول',
        EN_ROUTE: 'الفني في الطريق',
        ARRIVED: 'الفني وصل',
        IN_PROGRESS: 'الخدمة جارية',
        COMPLETED: 'مكتملة',
        CANCELLED: 'ملغاة',
        DISPUTED: 'نزاع',
      };
      notify(`حالة الطلب: ${labels[liveStatus] ?? liveStatus}`, 'info');
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
        scheduledAt: when === 'now' ? null : new Date(Date.now() + 86_400_000).toISOString(),
        promoCode: promo ? promoInput.trim() : null,
      },
      {
        onSuccess: (booking) => {
          setCreatedId(booking.id);
          notify('تم تأكيد الحجز بنجاح', 'success');
          onDone();
        },
        onError: (e) => notify(e instanceof Error ? e.message : 'حدث خطأ', 'error'),
      },
    );
  }, [svc, addr, when, promo, promoInput, createBooking, onDone]);

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
          </Card>

          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>الدفع</h2>
            <div className="mt-3 grid grid-cols-3 gap-3" role="radiogroup" aria-label="اختر طريقة الدفع">
              {PAY_METHODS.map((m, i) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={i === pay}
                  onClick={() => setPay(i)}
                  className="p-4 rounded-xl border-2 text-center"
                  style={{ borderColor: i === pay ? '#1366D6' : '#E2E8F0', background: i === pay ? '#E8F1FE' : '#FFF', fontWeight: 700, fontSize: 14 }}
                >
                  {m}
                </button>
              ))}
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
          <div className="my-4 h-px bg-slate-100" />
          <InlineRow label="سعر الخدمة" value={`${price} دينار`} />
          <InlineRow label="الخصم" value={`${promo ? Number(promo.discountJod) : 0} دينار`} />
          <div className="my-2 h-px bg-slate-100" />
          <InlineRow strong label="الإجمالي" value={`${promo ? Number(promo.finalJod) : price} دينار`} />
          <p className="mt-3 p-3 rounded-lg" style={{ background: '#E8F1FE', color: '#0E4FA8', fontSize: 12 }}>
            سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة.
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
          body={`سيتم حجز ${promo ? Number(promo.finalJod) : price} دينار عبر ${PAY_METHODS[pay]} وخصمه بعد إتمام الخدمة.`}
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

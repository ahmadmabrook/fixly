import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, ShieldCheck, Clock, CreditCard, Headphones, BadgeCheck, Star, Check, Wrench } from 'lucide-react';
import { useServices } from '../hooks/useServices';
import { api, BookingListItem, NearbyTechnician } from '../lib/api';
import { useAuth } from '../lib/store';
import { useT } from '../lib/i18n';
import { Card, GuaranteePill, Stars, ServiceIcon, PriceBadge, StatusBadge, SkeletonGrid } from '../components/shared';
import NearbyTechniciansMap from '../components/NearbyTechniciansMap';

// Amman, Jordan — sensible default until/unless the browser grants location.
const DEFAULT_LAT = 31.9522;
const DEFAULT_LNG = 35.9331;

interface PublicReview { id: string; rating: number; comment: string | null; reviewerName: string | null }

const VALUE_PROPS = [
  { i: <BadgeCheck size={26} color="#1366D6" aria-hidden="true" />, tKey: 'vp.certified.t', bKey: 'vp.certified.b' },
  { i: <CreditCard size={26} color="#0FB5A6" aria-hidden="true" />, tKey: 'vp.price.t', bKey: 'vp.price.b' },
  { i: <ShieldCheck size={26} color="#15803D" aria-hidden="true" />, tKey: 'vp.guarantee.t', bKey: 'vp.guarantee.b' },
  { i: <Clock size={26} color="#F5A623" aria-hidden="true" />, tKey: 'vp.speed.t', bKey: 'vp.speed.b' },
  { i: <Headphones size={26} color="#7C3AED" aria-hidden="true" />, tKey: 'vp.support.t', bKey: 'vp.support.b' },
];

const PROTECTION_BENEFITS = ['أولوية خلال 30 دقيقة', 'خصم 15% على كل خدمة', 'ضمان ممتد 90 يوم', 'فحص مجاني كل 3 أشهر', 'دعم VIP'];

const STEPS = [
  { n: 1, tKey: 'step.1.t', bKey: 'step.1.b' },
  { n: 2, tKey: 'step.2.t', bKey: 'step.2.b' },
  { n: 3, tKey: 'step.3.t', bKey: 'step.3.b' },
];

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

export default function Landing() {
  const navigate = useNavigate();
  const t = useT();
  const accessToken = useAuth((s) => s.accessToken);
  const { data: svcResponse, isLoading: servicesLoading } = useServices();
  const services = svcResponse?.data;

  // Active booking banner — only runs when authed
  const { data: activeBooking } = useQuery({
    queryKey: ['active-booking'],
    queryFn: async () => {
      const bookings = await api.get<BookingListItem[]>('/bookings?limit=1');
      const active = bookings.find((b) => ACTIVE_STATUSES.includes(b.status));
      return active ?? null;
    },
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  // Real, verified reviews from the API (no fabricated identities). Section is
  // hidden until at least one real review exists.
  const { data: reviews } = useQuery({
    queryKey: ['reviews-recent'],
    queryFn: () => api.get<PublicReview[]>('/reviews/recent'),
  });

  // Real nearby-technicians map (authed users only — no fake pins for
  // anonymous visitors). Falls back to Amman's center until/unless the
  // browser grants a more precise position.
  const [center, setCenter] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  useEffect(() => {
    if (!accessToken || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [accessToken]);
  const { data: nearbyTechs } = useQuery({
    queryKey: ['nearby-technicians', center.lat, center.lng],
    queryFn: () => api.get<NearbyTechnician[]>(`/technicians/nearby?lat=${center.lat}&lng=${center.lng}`),
    enabled: !!accessToken,
    refetchInterval: 20_000,
  });

  return (
    <div className="max-w-[1200px] mx-auto px-6">
      {/* Active booking banner */}
      {activeBooking && (
        <div
          className="mt-4 rounded-2xl p-4 flex items-center gap-4 flex-wrap"
          style={{ background: '#1366D6', color: '#FFF' }}
        >
          <ServiceIcon nameAr={activeBooking.service?.nameAr ?? ''} size={18} />
          <div className="flex-1 min-w-0">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{activeBooking.service?.nameAr ?? 'طلب نشط'}</div>
            <StatusBadge status={activeBooking.status} />
          </div>
          <button
            onClick={() => navigate(`/bookings/${activeBooking.id}`)}
            className="px-5 h-10 rounded-xl shrink-0"
            style={{ background: '#FFF', color: '#1366D6', fontWeight: 700, fontSize: 14 }}
          >
            تتبّع
          </button>
        </div>
      )}

      <section className="grid md:grid-cols-2 gap-8 items-center py-16">
        <div>
          <GuaranteePill />
          <h1 className="mt-4 text-3xl sm:text-5xl" style={{ fontWeight: 800, lineHeight: 1.15, color: '#0F172A' }}>
            {t('hero.title')} <span style={{ color: '#1366D6' }}>{t('hero.titleAccent')}</span>
          </h1>
          <p className="mt-4" style={{ fontSize: 17, color: '#475569' }}>
            {t('hero.sub')}
          </p>

          <form
            className="mt-7 p-2 bg-white rounded-2xl flex items-center gap-2"
            style={{ boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}
            onSubmit={(e) => {
              e.preventDefault();
              navigate('/services');
            }}
            role="search"
          >
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search size={18} color="#94A3B8" aria-hidden="true" />
              <input className="flex-1 h-12 outline-none bg-transparent" placeholder={t('hero.searchPlaceholder')} aria-label={t('hero.searchPlaceholder')} style={{ fontSize: 15 }} />
            </div>
            <div className="hidden sm:flex items-center gap-1 px-3 border-r border-slate-200" style={{ color: '#475569', fontSize: 14 }}>
              <MapPin size={16} aria-hidden="true" /> عمّان
            </div>
            <button type="submit" className="h-12 px-6 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>{t('hero.searchCta')}</button>
          </form>

          <div className="mt-6 flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-2"><Stars rating={4.8} /><span style={{ fontSize: 13, color: '#475569' }}>+5,000 تقييم</span></div>
            <div className="flex items-center gap-2" style={{ color: '#475569', fontSize: 13 }}><ShieldCheck size={16} color="#15803D" aria-hidden="true" /> ضمان 30 يوم</div>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-[4/5] rounded-3xl overflow-hidden relative">
            <NearbyTechniciansMap center={center} technicians={nearbyTechs ?? []} height={999} />
            <div className="absolute top-4 right-4 left-4 flex justify-between pointer-events-none">
              <Card className="p-3 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#DCFCE7' }}><Wrench size={18} color="#15803D" aria-hidden="true" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#475569' }}>فنيون قريبون منك</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}><span style={{ fontFamily: 'Inter' }}>{(nearbyTechs ?? []).length}</span> متاح الآن</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-16">
        {VALUE_PROPS.map((v) => (
          <Card key={v.tKey} className="p-5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#F1F5F9' }}>{v.i}</div>
            <div className="mt-3" style={{ fontWeight: 700, fontSize: 17 }}>{t(v.tKey)}</div>
            <div style={{ color: '#475569', fontSize: 13 }} className="mt-1">{t(v.bKey)}</div>
          </Card>
        ))}
      </section>

      <section className="pb-16">
        <h2 style={{ fontWeight: 800, fontSize: 32 }}>{t('sec.services')}</h2>
        {servicesLoading && <div className="mt-6"><SkeletonGrid count={5} cardHeight={180} /></div>}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          {!servicesLoading && (services ?? []).map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/services/${encodeURIComponent(s.id)}`)}
              className="text-start"
              aria-label={`اطلب خدمة ${s.nameAr}`}
            >
              <Card className="p-5 transition hover:-translate-y-0.5">
                <ServiceIcon nameAr={s.nameAr} size={28} />
                <div className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>{s.nameAr}</div>
                <div className="mt-1" style={{ color: '#94A3B8', fontSize: 12 }}>
                  المدة: <span style={{ fontFamily: 'Inter' }}>{s.durationMin}</span> د
                </div>
                <div className="mt-3"><PriceBadge amount={Number(s.priceJod)} /></div>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <section className="pb-16">
        <h2 style={{ fontWeight: 800, fontSize: 32 }}>{t('sec.how')}</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <Card key={s.n} className="p-6">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#1366D6', color: '#FFF', fontFamily: 'Inter', fontWeight: 800 }}>{s.n}</div>
              <div className="mt-4" style={{ fontWeight: 700, fontSize: 18 }}>{t(s.tKey)}</div>
              <div style={{ color: '#475569', fontSize: 14 }} className="mt-1.5">{t(s.bKey)}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="pb-16">
        <Card className="p-8 overflow-hidden relative" style={{ background: 'linear-gradient(120deg,#0E4FA8 0%,#1366D6 60%,#0FB5A6 100%)' }}>
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: '#FFF', fontSize: 12, fontWeight: 700 }}>
                <Star size={12} fill="#F5A623" strokeWidth={0} aria-hidden="true" /> خطة الحماية
              </span>
              <h2 className="mt-3" style={{ fontWeight: 800, fontSize: 30, color: '#FFF' }}>اشترك ووفّر على كل خدمة</h2>
              <div className="mt-2" style={{ color: '#DBEAFE', fontSize: 15 }}>
                <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 22, color: '#FFF' }}>5</span> دنانير/شهر
              </div>
              <button
                onClick={() => navigate(accessToken ? '/account?tab=protection' : '/login?returnTo=%2Faccount%3Ftab%3Dprotection')}
                className="mt-5 px-6 h-12 rounded-xl active:scale-[0.98] transition"
                style={{ background: '#FFF', color: '#1366D6', fontWeight: 700 }}
              >
                اشترك الآن
              </button>
            </div>
            <div className="grid gap-2.5">
              {PROTECTION_BENEFITS.map((b) => (
                <div key={b} className="flex items-center gap-2" style={{ color: '#FFF', fontSize: 15 }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <Check size={14} color="#FFF" aria-hidden="true" />
                  </span>
                  {b}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {reviews && reviews.length > 0 && (
        <section className="pb-16">
          <div className="flex items-end justify-between">
            <h2 style={{ fontWeight: 800, fontSize: 32 }}>{t('sec.reviews')}</h2>
          </div>
          <div className="mt-6 grid md:grid-cols-4 gap-4">
            {reviews.map((r) => (
              <Card key={r.id} className="p-5">
                <Stars rating={r.rating} />
                {r.comment && <p style={{ fontSize: 14 }} className="mt-3">«{r.comment}»</p>}
                <div className="mt-3" style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>{r.reviewerName}</div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, ShieldCheck, Clock, CreditCard, Headphones } from 'lucide-react';
import { useServices } from '../hooks/useServices';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Card, GuaranteePill, Stars, ServiceIcon, PriceBadge, StatusBadge } from '../components/shared';

interface PublicReview { id: string; rating: number; comment: string | null; reviewerName: string | null }

const VALUE_PROPS = [
  { i: <Clock size={26} color="#1366D6" aria-hidden="true" />, tKey: 'vp.speed.t', bKey: 'vp.speed.b' },
  { i: <CreditCard size={26} color="#0FB5A6" aria-hidden="true" />, tKey: 'vp.price.t', bKey: 'vp.price.b' },
  { i: <ShieldCheck size={26} color="#15803D" aria-hidden="true" />, tKey: 'vp.guarantee.t', bKey: 'vp.guarantee.b' },
  { i: <Headphones size={26} color="#F5A623" aria-hidden="true" />, tKey: 'vp.support.t', bKey: 'vp.support.b' },
];

const STEPS = [
  { n: 1, tKey: 'step.1.t', bKey: 'step.1.b' },
  { n: 2, tKey: 'step.2.t', bKey: 'step.2.b' },
  { n: 3, tKey: 'step.3.t', bKey: 'step.3.b' },
];

export default function Landing() {
  const navigate = useNavigate();
  const t = useT();
  const { data: services } = useServices();
  // Real, verified reviews from the API (no fabricated identities). Section is
  // hidden until at least one real review exists.
  const { data: reviews } = useQuery({
    queryKey: ['reviews-recent'],
    queryFn: () => api.get<PublicReview[]>('/reviews/recent'),
  });

  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <section className="grid md:grid-cols-2 gap-8 items-center py-16">
        <div>
          <GuaranteePill />
          <h1 className="mt-4" style={{ fontWeight: 800, fontSize: 48, lineHeight: 1.15, color: '#0F172A' }}>
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

          <div className="mt-6 flex items-center gap-6">
            <div className="flex items-center gap-2"><Stars rating={4.8} /><span style={{ fontSize: 13, color: '#475569' }}>+5,000 تقييم</span></div>
            <div className="flex items-center gap-2" style={{ color: '#475569', fontSize: 13 }}><ShieldCheck size={16} color="#15803D" aria-hidden="true" /> ضمان 30 يوم</div>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-[4/5] rounded-3xl overflow-hidden relative flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1366D6 0%,#0FB5A6 100%)' }}>
            <span style={{ fontSize: 160 }} aria-hidden="true">🔧</span>
            <Card className="absolute bottom-6 left-6 right-6 p-4 flex items-center gap-3">
              <ServiceIcon id="elec" size={20} />
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 14 }}>كهرباء — سعر ثابت</div>
                <StatusBadge status="EN_ROUTE" />
              </div>
              <PriceBadge amount={50} />
            </Card>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-16">
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
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          {(services ?? []).map((s) => (
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

      {reviews && reviews.length > 0 && (
        <section className="pb-16">
          <div className="flex items-end justify-between">
            <h2 style={{ fontWeight: 800, fontSize: 32 }}>{t('sec.reviews')}</h2>
          </div>
          <div className="mt-6 grid md:grid-cols-3 gap-4">
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

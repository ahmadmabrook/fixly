import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useServices } from '../hooks/useServices';
import { useT } from '../lib/i18n';
import { Card, ServiceIcon, PriceBadge } from '../components/shared';

export default function Catalog() {
  const navigate = useNavigate();
  const t = useT();
  const { data: services, isLoading, isError, refetch } = useServices();
  const [q, setQ] = useState('');
  const filtered = (services ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.nameAr.toLowerCase().includes(t) || s.nameEn.toLowerCase().includes(t);
  });

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>{t('catalog.title')}</h1>

      <div className="mt-5 relative max-w-md">
        <Search size={18} color="#94A3B8" style={{ position: 'absolute', insetInlineStart: 14, top: 15 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('catalog.search')}
          aria-label={t('catalog.search')}
          className="w-full h-12 rounded-xl border border-slate-200 outline-none"
          style={{ fontSize: 14, paddingInlineStart: 44, paddingInlineEnd: 14 }}
        />
      </div>

      {isLoading && <p className="mt-6 text-center" style={{ color: '#94A3B8' }}>جارٍ التحميل...</p>}

      {isError && (
        <div className="mt-6 text-center">
          <p style={{ color: '#B91C1C' }}>تعذّر تحميل الخدمات.</p>
          <button onClick={() => refetch()} className="mt-2 px-4 py-2 rounded-lg" style={{ background: '#1366D6', color: '#FFF', fontWeight: 600 }}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="mt-6 text-center" style={{ color: '#94A3B8' }}>{t('catalog.empty')}</p>
      )}

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/services/${encodeURIComponent(s.id)}`)}
            className="text-start"
            aria-label={`عرض خدمة ${s.nameAr}`}
          >
            <Card className="p-5 flex items-center gap-4">
              <ServiceIcon nameAr={s.nameAr} size={24} />
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 17 }}>{s.nameAr}</div>
                <div style={{ color: '#475569', fontSize: 12 }}>
                  {t('catalog.duration')}: <span style={{ fontFamily: 'Inter' }}>{s.durationMin}</span> {t('catalog.minutes')}
                </div>
              </div>
              <PriceBadge amount={Number(s.priceJod)} />
            </Card>
          </button>
        ))}
      </div>
    </main>
  );
}

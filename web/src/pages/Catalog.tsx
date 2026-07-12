import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronDown } from 'lucide-react';
import { useServices, type ServiceSort } from '../hooks/useServices';
import { useT } from '../lib/i18n';
import { Card, ServiceIcon, PriceBadge, SkeletonList } from '../components/shared';

const SORT_OPTIONS: ReadonlyArray<readonly [ServiceSort, string]> = [
  ['price_asc', 'السعر: الأقل'],
  ['price_desc', 'السعر: الأعلى'],
  ['duration_asc', 'المدة: الأقصر'],
  ['duration_desc', 'المدة: الأطول'],
];

export default function Catalog() {
  const navigate = useNavigate();
  const t = useT();
  const [searchParams] = useSearchParams();

  // Deep-linkable category filter (e.g. footer service links -> /services?category=ELECTRICAL).
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [sort, setSort] = useState<ServiceSort | ''>('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input (300ms)
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [q]);

  const { data, isLoading, isError, refetch } = useServices({
    category: category || undefined,
    search: debouncedQ || undefined,
    sort: (sort as ServiceSort) || undefined,
  });

  const services = data?.data ?? [];
  const categories = data?.meta?.categories ?? [];

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>{t('catalog.title')}</h1>

      {/* Search */}
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

      {/* Category pills + Sort */}
      <div className="mt-4 flex items-center gap-3 flex-wrap sm:flex-nowrap">
        {/* Category pills */}
        {categories.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto pb-1 flex-1 min-w-0"
            role="tablist"
            aria-label="فئات الخدمات"
            style={{ scrollbarWidth: 'none' }}
          >
            <button
              role="tab"
              aria-selected={!category}
              onClick={() => setCategory('')}
              className="shrink-0 px-4 h-9 rounded-full"
              style={{
                background: !category ? '#1366D6' : '#FFF',
                color: !category ? '#FFF' : '#475569',
                fontWeight: 600,
                fontSize: 13,
                border: '1px solid',
                borderColor: !category ? '#1366D6' : '#E2E8F0',
              }}
            >
              الكل
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={category === cat}
                onClick={() => setCategory(cat)}
                className="shrink-0 px-4 h-9 rounded-full"
                style={{
                  background: category === cat ? '#1366D6' : '#FFF',
                  color: category === cat ? '#FFF' : '#475569',
                  fontWeight: 600,
                  fontSize: 13,
                  border: '1px solid',
                  borderColor: category === cat ? '#1366D6' : '#E2E8F0',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ServiceSort | '')}
            aria-label="ترتيب الخدمات"
            className="appearance-none h-9 rounded-full border border-slate-200 outline-none cursor-pointer"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#475569',
              paddingInlineStart: 14,
              paddingInlineEnd: 32,
              background: '#FFF',
            }}
          >
            <option value="">الترتيب</option>
            {SORT_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            style={{ position: 'absolute', insetInlineEnd: 10, top: 12, pointerEvents: 'none', color: '#94A3B8' }}
          />
        </div>
      </div>

      {isLoading && <div className="mt-6"><SkeletonList count={5} rowHeight={80} /></div>}

      {isError && (
        <div className="mt-6 text-center">
          <p style={{ color: '#B91C1C' }}>تعذّر تحميل الخدمات.</p>
          <button onClick={() => refetch()} className="mt-2 px-4 py-2 rounded-lg" style={{ background: '#1366D6', color: '#FFF', fontWeight: 600 }}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && services.length === 0 && (
        <p className="mt-6 text-center" style={{ color: '#94A3B8' }}>{t('catalog.empty')}</p>
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/services/${encodeURIComponent(s.id)}`)}
            className="text-start"
            aria-label={`عرض خدمة ${s.nameAr}`}
          >
            <Card className="p-5 flex items-center gap-4">
              <ServiceIcon nameAr={s.nameAr} size={24} />
              <div className="flex-1 min-w-0">
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

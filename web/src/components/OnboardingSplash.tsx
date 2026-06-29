import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'fixly_onboarded';

const slides = [
  { emoji: '🔧', title: 'فني محترف خلال 30 دقيقة', subtitle: 'اطلب أي خدمة صيانة وسيصلك فني معتمد بسرعة.' },
  { emoji: '🛡️', title: 'أسعار ثابتة وضمان 30 يوم', subtitle: 'لا مفاجآت في السعر، وضمان على كل خدمة.' },
  { emoji: '📍', title: 'تتبّع الفني مباشرة', subtitle: 'راقب موقع الفني لحظة بلحظة حتى يصل إليك.' },
] as const;

export default function OnboardingSplash() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }, []);

  const next = useCallback(() => {
    if (current < slides.length - 1) setCurrent((c) => c + 1);
  }, [current]);

  const prev = useCallback(() => {
    if (current > 0) setCurrent((c) => c - 1);
  }, [current]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!visible) return;
      if (e.key === 'ArrowLeft') next();
      else if (e.key === 'ArrowRight') prev();
      else if (e.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, next, prev, dismiss]);

  // Focus trap: keep focus inside the overlay
  useEffect(() => {
    if (visible && containerRef.current) {
      containerRef.current.focus();
    }
  }, [visible, current]);

  if (!visible) return null;

  const slide = slides[current];
  const isLast = current === slides.length - 1;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="مرحباً بك في Fixly"
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', outline: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isLast) next(); }}
    >
      <div
        className="w-full max-w-[380px] mx-4 rounded-2xl p-8 text-center"
        style={{ background: '#FFF' }}
      >
        <div style={{ fontSize: 64, lineHeight: 1 }} aria-hidden="true">{slide.emoji}</div>
        <h2 className="mt-5" style={{ fontWeight: 800, fontSize: 20, color: '#0F172A' }}>{slide.title}</h2>
        <p className="mt-2" style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6 }}>{slide.subtitle}</p>

        {/* Dot indicators */}
        <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="شرائح">
          {slides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === current}
              aria-label={`شريحة ${i + 1}`}
              onClick={() => setCurrent(i)}
              className="rounded-full"
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                background: i === current ? '#1366D6' : '#CBD5E1',
                border: 'none',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        {isLast ? (
          <button
            onClick={dismiss}
            className="mt-6 w-full h-12 rounded-xl"
            style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 15 }}
          >
            ابدأ الآن
          </button>
        ) : (
          <div className="mt-6 flex gap-3">
            <button
              onClick={dismiss}
              className="flex-1 h-12 rounded-xl"
              style={{ color: '#64748B', fontWeight: 600, fontSize: 14, border: '1px solid #E2E8F0' }}
            >
              تخطّي
            </button>
            <button
              onClick={next}
              className="flex-1 h-12 rounded-xl"
              style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 14 }}
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

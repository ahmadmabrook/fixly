import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEY_ONBOARDED } from '../lib/constants';
import { COLOR_BORDER, COLOR_BORDER_STRONG, COLOR_BRAND_PRIMARY, COLOR_SCRIM_STRONG, COLOR_TEXT_PRIMARY, COLOR_TEXT_SUBTLE, COLOR_WHITE } from '../lib/theme';



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
    // localStorage access can throw in private mode / disabled-storage browsers.
    // Treat any failure as "already onboarded" so the splash never blocks the app.
    try {
      if (!localStorage.getItem(STORAGE_KEY_ONBOARDED)) setVisible(true);
    } catch {
      /* storage unavailable — skip the splash */
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ONBOARDED, '1');
    } catch {
      /* storage unavailable — still dismiss for this session */
    }
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
      style={{ background: COLOR_SCRIM_STRONG, outline: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isLast) next(); }}
    >
      <div
        className="w-full max-w-[380px] mx-4 rounded-2xl p-8 text-center"
        style={{ background: COLOR_WHITE }}
      >
        <div style={{ fontSize: 64, lineHeight: 1 }} aria-hidden="true">{slide.emoji}</div>
        <h2 className="mt-5" style={{ fontWeight: 800, fontSize: 20, color: COLOR_TEXT_PRIMARY }}>{slide.title}</h2>
        <p className="mt-2" style={{ color: COLOR_TEXT_SUBTLE, fontSize: 14, lineHeight: 1.6 }}>{slide.subtitle}</p>

        {/* Dot indicators — progress controls, not a real tablist (no tabpanels) */}
        <div className="mt-6 flex justify-center gap-2" role="group" aria-label="شرائح التعريف">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`الانتقال إلى الشريحة ${i + 1}`}
              aria-current={i === current ? 'true' : undefined}
              onClick={() => setCurrent(i)}
              className="rounded-full"
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                background: i === current ? COLOR_BRAND_PRIMARY : COLOR_BORDER_STRONG,
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
            style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 15 }}
          >
            ابدأ الآن
          </button>
        ) : (
          <div className="mt-6 flex gap-3">
            <button
              onClick={dismiss}
              className="flex-1 h-12 rounded-xl"
              style={{ color: COLOR_TEXT_SUBTLE, fontWeight: 600, fontSize: 14, border: `1px solid ${COLOR_BORDER}` }}
            >
              تخطّي
            </button>
            <button
              onClick={next}
              className="flex-1 h-12 rounded-xl"
              style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { COLOR_BG_SUBTLE, COLOR_BORDER } from '../../lib/theme';

/* ── Skeleton shimmer placeholder ──────────────────────────────────────────── */

const shimmerKeyframes = `
@keyframes fixly-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}`;
let shimmerInjected = false;
function injectShimmer() {
  if (shimmerInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
  shimmerInjected = true;
}

/**
 * Configurable skeleton placeholder with a CSS shimmer animation.
 * Renders a rounded div that pulses light-to-grey, replacing "جارٍ التحميل...".
 */
export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  injectShimmer();
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${COLOR_BORDER} 25%, ${COLOR_BG_SUBTLE} 50%, ${COLOR_BORDER} 75%)`,
        backgroundSize: '800px 100%',
        animation: 'fixly-shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/** Grid of skeleton cards matching the services grid layout. */
export function SkeletonGrid({ count = 5, cardHeight = 180 }: { count?: number; cardHeight?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
          <Skeleton height={cardHeight} borderRadius={16} />
        </div>
      ))}
    </div>
  );
}

/** List of skeleton rows for booking/notification lists. */
export function SkeletonList({ count = 4, rowHeight = 72 }: { count?: number; rowHeight?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={rowHeight} borderRadius={16} />
      ))}
    </div>
  );
}

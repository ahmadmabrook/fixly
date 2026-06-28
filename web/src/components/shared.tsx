import { ReactNode, useId } from 'react';
import {
  Zap, Droplets, Snowflake, PaintRoller, Sofa, ShieldCheck, Star,
  BadgeCheck, Wrench, MapPin, Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDialog } from '../hooks/useDialog';

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
        background: 'linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)',
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

export const notify = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
  if (kind === 'success') toast.success(msg);
  else if (kind === 'error') toast.error(msg);
  else toast(msg);
};

export const SERVICES_STATIC = [
  { id: 'elec',  ar: 'كهرباء',      en: 'Electricity', price: 50, dur: 45,  Icon: Zap,         tint: '#FEF3C7', color: '#D97706' },
  { id: 'plumb', ar: 'سباكة',       en: 'Plumbing',    price: 40, dur: 60,  Icon: Droplets,    tint: '#DBEAFE', color: '#1366D6' },
  { id: 'ac',    ar: 'تنظيف تكييف', en: 'AC Cleaning', price: 30, dur: 45,  Icon: Snowflake,   tint: '#CFFAFE', color: '#0E7490' },
  { id: 'paint', ar: 'دهان',        en: 'Painting',    price: 70, dur: 180, Icon: PaintRoller, tint: '#FCE7F3', color: '#BE185D' },
  { id: 'furn',  ar: 'تركيب أثاث',  en: 'Furniture',   price: 35, dur: 60,  Icon: Sofa,        tint: '#DCFCE7', color: '#15803D' },
] as const;

export type ServiceId = typeof SERVICES_STATIC[number]['id'];

const ICON_MAP: Record<string, typeof Zap> = {
  elec: Zap, plumb: Droplets, ac: Snowflake, paint: PaintRoller, furn: Sofa,
};

const COLOR_MAP: Record<string, { tint: string; color: string }> = {
  elec:  { tint: '#FEF3C7', color: '#D97706' },
  plumb: { tint: '#DBEAFE', color: '#1366D6' },
  ac:    { tint: '#CFFAFE', color: '#0E7490' },
  paint: { tint: '#FCE7F3', color: '#BE185D' },
  furn:  { tint: '#DCFCE7', color: '#15803D' },
};

function guessServiceId(nameAr: string): string {
  if (nameAr.includes('كهرب')) return 'elec';
  if (nameAr.includes('سباك')) return 'plumb';
  if (nameAr.includes('تكييف')) return 'ac';
  if (nameAr.includes('دهان')) return 'paint';
  if (nameAr.includes('أثاث') || nameAr.includes('نجار')) return 'furn';
  return 'elec';
}

export function ServiceIcon({ id, nameAr, size = 28 }: { id?: string; nameAr?: string; size?: number }) {
  const key = id ?? (nameAr ? guessServiceId(nameAr) : 'elec');
  const Icon = ICON_MAP[key] ?? Wrench;
  const { tint, color } = COLOR_MAP[key] ?? { tint: '#F1F5F9', color: '#475569' };
  return (
    <div
      className="flex items-center justify-center rounded-xl shrink-0"
      style={{ width: size + 20, height: size + 20, background: tint, color }}
    >
      <Icon size={size} strokeWidth={2} />
    </div>
  );
}

export function PriceBadge({ amount, big = false }: { amount: number; big?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-lg"
      style={{
        background: big ? 'transparent' : '#E8F1FE',
        color: '#0E4FA8',
        padding: big ? 0 : '4px 10px',
        fontWeight: 700,
        fontSize: big ? 28 : 14,
      }}
    >
      <span style={{ fontFamily: 'Inter' }}>{amount}</span>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: 600 }}>دينار</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { ar: string; bg: string; fg: string }> = {
    PENDING:            { ar: 'بانتظار الدفع',     bg: '#E2E8F0', fg: '#475569' },
    CONFIRMED:          { ar: 'تم القبول',         bg: '#DBEAFE', fg: '#1366D6' },
    EN_ROUTE:           { ar: 'الفني في الطريق',   bg: '#CCFBF1', fg: '#0F766E' },
    ARRIVED:            { ar: 'الفني وصل',         bg: '#CCFBF1', fg: '#0F766E' },
    IN_PROGRESS:        { ar: 'الخدمة جارية',      bg: '#FEF3C7', fg: '#B45309' },
    COMPLETED:          { ar: 'مكتملة',            bg: '#DCFCE7', fg: '#15803D' },
    CANCELLED:          { ar: 'ملغاة',             bg: '#FEE2E2', fg: '#B91C1C' },
    DISPUTED:           { ar: 'نزاع',              bg: '#FEE2E2', fg: '#B91C1C' },
  };
  const s = map[status] ?? { ar: status, bg: '#E2E8F0', fg: '#475569' };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
      style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {s.ar}
    </span>
  );
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: '#F5A623', fontWeight: 600, fontSize: size }}>
      <Star size={size} fill="#F5A623" strokeWidth={0} />
      <span style={{ fontFamily: 'Inter', color: '#0F172A' }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export function Avatar({ name, size = 40, verified = false }: { name: string; size?: number; verified?: boolean }) {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const hue = (name.charCodeAt(0) * 37) % 360;
  return (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, background: `hsl(${hue} 50% 55%)`, fontSize: size * 0.4 }}
      >
        {initials}
      </div>
      {verified && (
        <div className="absolute -bottom-0.5 -end-0.5 bg-white rounded-full">
          <BadgeCheck size={size * 0.4} color="#1366D6" fill="#fff" />
        </div>
      )}
    </div>
  );
}

export function Card({
  children,
  className = '',
  style,
  ...rest
}: { children: ReactNode; className?: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white rounded-2xl ${className}`}
      style={{ boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GuaranteePill() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 600 }}>
      <ShieldCheck size={12} />
      ضمان 30 يوم
    </div>
  );
}

export function InlineRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span style={{ color: '#475569', fontSize: 14 }}>{label}</span>
      <span style={{ color: '#0F172A', fontWeight: strong ? 700 : 500, fontSize: strong ? 16 : 14 }}>{value}</span>
    </div>
  );
}

export function MapMock({ customerLabel = 'موقعك', height = 360 }: { customerLabel?: string; height?: number }) {
  return (
    <div className="relative w-full overflow-hidden" style={{ height, background: 'linear-gradient(180deg,#EEF2F7 0%,#E5ECF3 100%)' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="none">
        <g stroke="#FFF" strokeWidth="6" fill="none" opacity="0.9">
          <path d="M-20 80 L420 120" /><path d="M-20 220 L420 200" /><path d="M-20 320 L420 340" />
          <path d="M80 -20 L60 420" /><path d="M220 -20 L260 420" /><path d="M340 -20 L320 420" />
        </g>
        <g stroke="#D8E1EA" strokeWidth="2" fill="none">
          <path d="M-20 150 L420 160" /><path d="M160 -20 L150 420" />
        </g>
        <rect x="20" y="240" width="90" height="80" rx="8" fill="#DCEBD8" />
        <rect x="280" y="40" width="100" height="70" rx="8" fill="#DCEBD8" />
      </svg>
      <div className="absolute" style={{ left: '40%', top: '35%', transform: 'translate(-50%,-100%)' }}>
        <div className="flex flex-col items-center">
          <div className="px-2.5 py-1 rounded-full bg-white shadow-md text-[11px] font-semibold mb-1" style={{ color: '#0F172A' }}>{customerLabel}</div>
          <MapPin size={28} color="#1366D6" fill="#1366D6" strokeWidth={1.5} stroke="#FFF" />
        </div>
      </div>
      <button onClick={() => notify('تم تحديد موقعك')} className="absolute bottom-4 left-4 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center">
        <Navigation size={18} color="#1366D6" />
      </button>
    </div>
  );
}

/**
 * Accessible modal shell: backdrop click + Escape close, focus trap, focus
 * restore on unmount, and the required dialog ARIA wiring. Use this for any
 * bottom-sheet / centered dialog so a11y behaviour is consistent everywhere
 * instead of being re-implemented (and forgotten) per page.
 */
export function Modal({
  title,
  onClose,
  children,
  variant = 'sheet',
  maxWidth = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 'sheet' = bottom sheet on mobile, centered on desktop; 'center' = always centered. */
  variant?: 'sheet' | 'center';
  maxWidth?: 'sm' | 'md';
}) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();
  const align = variant === 'sheet' ? 'items-end md:items-center' : 'items-center';
  const radius = variant === 'sheet' ? 'rounded-t-2xl md:rounded-2xl' : 'rounded-2xl';
  const width = maxWidth === 'sm' ? 'md:max-w-sm' : 'md:max-w-md';
  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${align}`}
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white ${radius} p-5 w-full ${width} max-h-[85vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, textAlign: variant === 'center' ? 'center' : undefined }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, body, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء',
  onConfirm, onCancel,
}: {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(onCancel);
  const titleId = useId();
  const bodyId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCancel}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="mx-5 bg-white rounded-2xl p-5 shadow-2xl"
        style={{ maxWidth: 360, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, textAlign: 'center' }}>{title}</h3>
        {body && <p id={bodyId} style={{ color: '#475569', fontSize: 14, textAlign: 'center', marginTop: 8 }}>{body}</p>}
        <div className="mt-5 space-y-2">
          <button onClick={onConfirm} className="w-full h-[52px] rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>{confirmLabel}</button>
          <button onClick={onCancel} className="w-full h-[52px] rounded-xl" style={{ color: '#1366D6', fontWeight: 600 }}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

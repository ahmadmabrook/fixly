import { ReactNode, useEffect, useState } from 'react';
import {
  Zap, Droplets, Snowflake, PaintRoller, Sofa, BadgeCheck, Wrench, MapPin, Navigation, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

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
      <button onClick={() => notify('تم تحديد موقعك')} className="absolute bottom-4 left-4 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center" aria-label="تحديد موقعي">
        <Navigation size={18} color="#1366D6" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── Offline detection banner ──────────────────────────────────────────────── */

/**
 * Persistent top banner shown whenever the browser goes offline. Mounted once
 * at the app root (App.tsx) so it's global rather than per-page.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      className="w-full text-center py-2 px-4"
      style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: 600, fontSize: 13 }}
    >
      لا يوجد اتصال بالإنترنت
    </div>
  );
}

/* ── FAQ accordion ──────────────────────────────────────────────────────────── */

export function FaqAccordion({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map(([q, a], i) => {
        const open = openIdx === i;
        const panelId = `faq-panel-${i}`;
        return (
          <Card key={q} className="overflow-hidden">
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              aria-expanded={open}
              aria-controls={panelId}
              className="w-full flex items-center justify-between px-4 py-3 text-start"
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{q}</span>
              <ChevronDown size={18} color="#475569" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {open && (
              <div id={panelId} className="px-4 pb-4" style={{ color: '#475569', fontSize: 13, lineHeight: 1.7 }}>
                {a}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

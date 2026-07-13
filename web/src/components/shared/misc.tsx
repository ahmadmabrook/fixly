import { ReactNode, useEffect, useState } from 'react';
import {
  Zap, Droplets, Snowflake, PaintRoller, Sofa, BadgeCheck, Wrench, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { COLOR_BADGE_INFO_BG, COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_CATEGORY_CYAN_BG, COLOR_CATEGORY_CYAN_FG, COLOR_CATEGORY_ORANGE_FG, COLOR_CATEGORY_PINK_BG, COLOR_CATEGORY_PINK_FG, COLOR_ERROR_BG, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WARNING_BG, COLOR_WHITE } from '../../lib/theme';

export const notify = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
  if (kind === 'success') toast.success(msg);
  else if (kind === 'error') toast.error(msg);
  else toast(msg);
};

export const SERVICES_STATIC = [
  { id: 'elec',  ar: 'كهرباء',      en: 'Electricity', price: 50, dur: 45,  Icon: Zap,         tint: COLOR_WARNING_BG, color: COLOR_CATEGORY_ORANGE_FG },
  { id: 'plumb', ar: 'سباكة',       en: 'Plumbing',    price: 40, dur: 60,  Icon: Droplets,    tint: COLOR_BADGE_INFO_BG, color: COLOR_BRAND_PRIMARY },
  { id: 'ac',    ar: 'تنظيف تكييف', en: 'AC Cleaning', price: 30, dur: 45,  Icon: Snowflake,   tint: COLOR_CATEGORY_CYAN_BG, color: COLOR_CATEGORY_CYAN_FG },
  { id: 'paint', ar: 'دهان',        en: 'Painting',    price: 70, dur: 180, Icon: PaintRoller, tint: COLOR_CATEGORY_PINK_BG, color: COLOR_CATEGORY_PINK_FG },
  { id: 'furn',  ar: 'تركيب أثاث',  en: 'Furniture',   price: 35, dur: 60,  Icon: Sofa,        tint: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT },
] as const;

export type ServiceId = typeof SERVICES_STATIC[number]['id'];

const ICON_MAP: Record<string, typeof Zap> = {
  elec: Zap, plumb: Droplets, ac: Snowflake, paint: PaintRoller, furn: Sofa,
};

const COLOR_MAP: Record<string, { tint: string; color: string }> = {
  elec:  { tint: COLOR_WARNING_BG, color: COLOR_CATEGORY_ORANGE_FG },
  plumb: { tint: COLOR_BADGE_INFO_BG, color: COLOR_BRAND_PRIMARY },
  ac:    { tint: COLOR_CATEGORY_CYAN_BG, color: COLOR_CATEGORY_CYAN_FG },
  paint: { tint: COLOR_CATEGORY_PINK_BG, color: COLOR_CATEGORY_PINK_FG },
  furn:  { tint: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT },
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
  const { tint, color } = COLOR_MAP[key] ?? { tint: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY };
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
          <BadgeCheck size={size * 0.4} color={COLOR_BRAND_PRIMARY} fill={COLOR_WHITE} />
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
      <span style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>{label}</span>
      <span style={{ color: COLOR_TEXT_PRIMARY, fontWeight: strong ? 700 : 500, fontSize: strong ? 16 : 14 }}>{value}</span>
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
      style={{ background: COLOR_ERROR_BG, color: COLOR_ERROR_TEXT, fontWeight: 600, fontSize: 13 }}
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
              <ChevronDown size={18} color={COLOR_TEXT_SECONDARY} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {open && (
              <div id={panelId} className="px-4 pb-4" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7 }}>
                {a}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

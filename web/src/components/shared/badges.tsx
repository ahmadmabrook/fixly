import { BadgeCheck, ShieldCheck, Star } from 'lucide-react';
import { BookingStatus } from '../../lib/api';
import { COLOR_ACCENT_AMBER, COLOR_BADGE_INFO_BG, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ENROUTE_BG, COLOR_ENROUTE_TEXT, COLOR_ERROR_BG, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WARNING_BG, COLOR_WARNING_TEXT } from '../../lib/theme';

/** Booking-status badge styling. Deliberately keyed by `Partial<Record<BookingStatus, ...>>`
 *  via `satisfies` so every key is checked against the real enum, but callers may still pass
 *  any string (e.g. an unrecognized status) and fall back to the default styling below. */
type StatusStyle = { ar: string; bg: string; fg: string };

/** §0.2 #4 / §6.8 — a quote_first service (Painting etc.) NEVER shows an
 *  instant flat price; every catalogue/landing/service-detail card that
 *  renders a price must branch on pricingModel through this one component. */
export function PriceBadge({ amount, big = false, quoteFirst = false }: { amount: number; big?: boolean; quoteFirst?: boolean }) {
  if (quoteFirst) {
    return (
      <span
        className="inline-flex items-baseline gap-1 rounded-lg"
        style={{
          background: big ? 'transparent' : COLOR_BRAND_PRIMARY_TINT,
          color: COLOR_BRAND_PRIMARY_DARK,
          padding: big ? 0 : '4px 10px',
          fontWeight: 700,
          fontSize: big ? 20 : 13,
        }}
      >
        حسب المعاينة
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-lg"
      style={{
        background: big ? 'transparent' : COLOR_BRAND_PRIMARY_TINT,
        color: COLOR_BRAND_PRIMARY_DARK,
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
  const map = {
    AWAITING_PAYMENT:   { ar: 'بانتظار الدفع',     bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY },
    PENDING:            { ar: 'قيد البحث عن فني',  bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY },
    CONFIRMED:          { ar: 'تم القبول',         bg: COLOR_BADGE_INFO_BG, fg: COLOR_BRAND_PRIMARY },
    EN_ROUTE:           { ar: 'الفني في الطريق',   bg: COLOR_ENROUTE_BG, fg: COLOR_ENROUTE_TEXT },
    ARRIVED:            { ar: 'الفني وصل',         bg: COLOR_ENROUTE_BG, fg: COLOR_ENROUTE_TEXT },
    IN_PROGRESS:        { ar: 'الخدمة جارية',      bg: COLOR_WARNING_BG, fg: COLOR_WARNING_TEXT },
    COMPLETED:          { ar: 'مكتملة',            bg: COLOR_SUCCESS_BG, fg: COLOR_SUCCESS_TEXT },
    CANCELLED:          { ar: 'ملغاة',             bg: COLOR_ERROR_BG, fg: COLOR_ERROR_TEXT },
    DISPUTED:           { ar: 'نزاع',              bg: COLOR_ERROR_BG, fg: COLOR_ERROR_TEXT },
    NO_SHOW:            { ar: 'عدم تواجد العميل',  bg: COLOR_ERROR_BG, fg: COLOR_ERROR_TEXT },
  } satisfies Partial<Record<BookingStatus, StatusStyle>>;
  const s = (map as Record<string, StatusStyle>)[status] ?? { ar: status, bg: COLOR_BORDER, fg: COLOR_TEXT_SECONDARY };
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
    <span className="inline-flex items-center gap-1" style={{ color: COLOR_ACCENT_AMBER, fontWeight: 600, fontSize: size }}>
      <Star size={size} fill={COLOR_ACCENT_AMBER} strokeWidth={0} />
      <span style={{ fontFamily: 'Inter', color: COLOR_TEXT_PRIMARY }}>{rating.toFixed(1)}</span>
    </span>
  );
}

/** Fixly Certified pill — shown next to a verified technician's name (design
 *  system: DesignSystem.tsx/CustomerWeb.tsx `CertifiedBadge`), distinct from
 *  the small checkmark ring `Avatar`'s own `verified` prop draws. */
export function CertifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY, fontSize: 11, fontWeight: 700 }}>
      <BadgeCheck size={12} /> فني معتمد
    </span>
  );
}

export function GuaranteePill({ days = 30 }: { days?: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT, fontSize: 11, fontWeight: 600 }}>
      <ShieldCheck size={12} />
      ضمان <span style={{ fontFamily: 'Inter' }}>{days}</span> يوم
    </div>
  );
}

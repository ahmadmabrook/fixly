/**
 * Single source of truth for every color used in admin/src.
 *
 * Every color is named for the *role* it plays (brand, text emphasis,
 * surface, status, chart series) rather than for its hex value, so a
 * future palette change only ever touches this file. Do not add a new
 * hardcoded hex literal anywhere else in admin/src — add or reuse a
 * token here instead.
 *
 * Grouped by role. Where a hex value is genuinely reused for the same
 * role across pages (e.g. brand blue, muted text, a status pair), it
 * has exactly one constant. Visually close-but-different hex values
 * (e.g. the two "reds" used in chart series, or the two dark-slate
 * text tones) are kept as separate constants on purpose — they are not
 * byte-identical and merging them would be a silent value change.
 */

/* ── Brand ──────────────────────────────────────────────────────────── */

/** Primary brand blue: buttons, active nav/filter states, links, the
 *  brand chart series, "CONFIRMED"/"ACCEPTED"/verified-tier fg text. */
export const COLOR_BRAND_PRIMARY = '#1366D6';
/** Darker brand blue: money amounts (booking/payout totals), the
 *  technician skill-pill text, and the dark stop of the brand gradient. */
export const COLOR_BRAND_PRIMARY_DARK = '#0E4FA8';
/** Light brand-tinted background paired with COLOR_BRAND_PRIMARY (or
 *  COLOR_BRAND_PRIMARY_DARK) text: header/sidebar active states,
 *  selected filter chips, technician skill pills. */
export const COLOR_BRAND_PRIMARY_TINT = '#E8F1FE';

/* ── Text ───────────────────────────────────────────────────────────── */

/** Darkest text: page headings, primary KPI values, modal titles. */
export const COLOR_TEXT_PRIMARY = '#0F172A';
/** Table-cell / activity-feed body text — visually close to
 *  COLOR_TEXT_PRIMARY but a distinct value, kept separate. */
export const COLOR_TEXT_BODY = '#1E293B';
/** Secondary text: field labels, "closed/neutral" status fg, cancel
 *  buttons, unselected filter chip text. */
export const COLOR_TEXT_SECONDARY = '#475569';
/** Login form `<label>` text — a distinct, slightly darker gray used
 *  only on the login screen. */
export const COLOR_TEXT_FORM_LABEL = '#374151';
/** Muted text: sub-headings, table secondary text, most "helper" text. */
export const COLOR_TEXT_MUTED = '#64748B';
/** Subtle/placeholder-level text and icons: sub-captions, search icons,
 *  timestamps, empty inline notes. */
export const COLOR_TEXT_SUBTLE = '#94A3B8';
/** One-off emphasis text (Broadcast "expected reach" label). */
export const COLOR_TEXT_EMPHASIS = '#334155';
/** Faint neutral used interchangeably as a subtle border or a
 *  near-invisible disabled/empty-state text color. */
export const COLOR_NEUTRAL_FAINT = '#CBD5E1';

/* ── Surfaces & borders ─────────────────────────────────────────────── */

export const COLOR_WHITE = '#FFFFFF';
/** Light border / unselected-chip background / skeleton gradient stop. */
export const COLOR_BORDER_LIGHT = '#E2E8F0';
/** Very light surface: hover backgrounds, dividers, chart grid lines,
 *  skeleton gradient midpoint, disabled search boxes. */
export const COLOR_SURFACE_MUTED = '#F1F5F9';
/** Even lighter surface: table header rows, table-cell borders, chat
 *  background. */
export const COLOR_SURFACE_SUBTLE = '#F8FAFC';
/** Page-level background (Layout shell, Login screen). */
export const COLOR_APP_BACKGROUND = '#F6F8FB';

/* ── Status pairs (bg + fg used together on badges/pills) ────────────── */

export const COLOR_STATUS_DANGER = '#B91C1C';
export const COLOR_STATUS_DANGER_BG = '#FEE2E2';
export const COLOR_STATUS_SUCCESS = '#15803D';
export const COLOR_STATUS_SUCCESS_BG = '#DCFCE7';
export const COLOR_STATUS_WARNING = '#B45309';
export const COLOR_STATUS_WARNING_BG = '#FEF3C7';
/** "En route / arrived" teal status pair. */
export const COLOR_STATUS_TEAL = '#0F766E';
export const COLOR_STATUS_TEAL_BG = '#CCFBF1';
/** "Info" bg for confirmed/accepted/in-progress pills, paired with
 *  COLOR_BRAND_PRIMARY as the fg. */
export const COLOR_STATUS_INFO_BG = '#DBEAFE';
/** Soft warning background for inline notices (narrower than a status
 *  pill), e.g. Support's refund autofill notice. */
export const COLOR_WARNING_SOFT_BG = '#FFFBEB';

/* ── Accent & tier ─────────────────────────────────────────────────── */

/** Secondary brand accent (teal) distinct from the status teal above —
 *  used for KPI icons, chart bars, and the "new customer" activity icon. */
export const COLOR_ACCENT_TEAL = '#0FB5A6';
/** "PRO" trust-tier badge pair (Quality page). */
export const COLOR_TIER_PRO = '#7C3AED';
export const COLOR_TIER_PRO_BG = '#EDE9FE';

/* ── Chart series (Dashboard / Reports / Bookings distribution) ──────── */

export const COLOR_CHART_ORANGE = '#F5A623';
export const COLOR_CHART_GREEN = '#1FAA59';
/** Rose-red chart slice (Bookings status distribution, Dashboard KPI). */
export const COLOR_CHART_ROSE = '#E5484D';
export const COLOR_CHART_PURPLE = '#8B5CF6';
export const COLOR_CHART_AMBER = '#F59E0B';
export const COLOR_CHART_PINK = '#EC4899';
export const COLOR_CHART_EMERALD = '#10B981';
/** Bright red chart slice (service breakdown) — distinct from
 *  COLOR_CHART_ROSE and COLOR_STATUS_DANGER. */
export const COLOR_CHART_RED = '#EF4444';
export const COLOR_CHART_INDIGO = '#6366F1';

/**
 * Single source of truth for color values used across web/src.
 *
 * Every color literal previously hardcoded inline (in `style={{...}}` objects,
 * JSX color/fill props, or CSS-in-JS strings) is named here by the semantic
 * role it plays at its call sites, not by its raw hex value. Where the same
 * hex value played the same role everywhere it appeared, it has exactly one
 * constant. Where a hex value is visually close to another but not byte-
 * identical (e.g. brand blue vs. its darker gradient stop), each keeps its
 * own constant rather than being merged.
 *
 * Do not add new inline hex literals to web/src — add a named constant here
 * instead and import it.
 */

// Brand
export const COLOR_BRAND_PRIMARY = '#1366D6';
export const COLOR_BRAND_PRIMARY_DARK = '#0E4FA8';
export const COLOR_BRAND_PRIMARY_TINT = '#E8F1FE';
export const COLOR_BRAND_ACCENT_TEAL = '#0FB5A6';
export const COLOR_ACCENT_PURPLE = '#7C3AED';
export const COLOR_ACCENT_AMBER = '#F5A623';

// Neutrals / text
export const COLOR_WHITE = '#FFFFFF';
export const COLOR_TEXT_PRIMARY = '#0F172A';
export const COLOR_TEXT_STRONG = '#334155';
export const COLOR_TEXT_SECONDARY = '#475569';
export const COLOR_TEXT_SUBTLE = '#64748B';
export const COLOR_TEXT_MUTED = '#94A3B8';
export const COLOR_BORDER = '#E2E8F0';
export const COLOR_BORDER_STRONG = '#CBD5E1';
export const COLOR_BG_SUBTLE = '#F1F5F9';
export const COLOR_BG_PAGE_ALT = '#F8FAFC';
export const COLOR_BG_APP = '#F6F8FB';
export const COLOR_BG_MAP_PLACEHOLDER = '#EEF2F7';
export const COLOR_BG_UNREAD = '#F0F7FF';

// Success
export const COLOR_SUCCESS_TEXT = '#15803D';
export const COLOR_SUCCESS_BG = '#DCFCE7';

// Warning
export const COLOR_WARNING_TEXT = '#B45309';
export const COLOR_WARNING_TEXT_STRONG = '#92400E';
export const COLOR_WARNING_BG = '#FEF3C7';
export const COLOR_WARNING_BG_SOFT = '#FFFBEB';
export const COLOR_WARNING_BORDER = '#FDE68A';

// Error / destructive
export const COLOR_ERROR_TEXT = '#B91C1C';
export const COLOR_ERROR_TEXT_STRONG = '#991B1B';
export const COLOR_ERROR_BG = '#FEE2E2';
export const COLOR_ERROR_BG_SOFT = '#FEF2F2';
export const COLOR_ERROR_BORDER = '#FECACA';
export const COLOR_DESTRUCTIVE_ACCENT = '#E5484D';
/** Distinct from COLOR_ERROR_TEXT — used only for the HyperPay checkout widget's own error text. */
export const COLOR_HYPERPAY_ERROR = '#D03B3B';

// Status badges (booking/quote "en route" and generic info states)
export const COLOR_ENROUTE_BG = '#CCFBF1';
export const COLOR_ENROUTE_TEXT = '#0F766E';
export const COLOR_BADGE_INFO_BG = '#DBEAFE';
export const COLOR_BADGE_DOT = '#EF4444';

// Technician tier badge ("Elite")
export const COLOR_TIER_ELITE_BG = '#EDE9FE';
export const COLOR_TIER_ELITE_FG = '#6D28D9';

// Service category tints (Catalog / booking flow category chips)
export const COLOR_CATEGORY_ORANGE_FG = '#D97706';
export const COLOR_CATEGORY_CYAN_BG = '#CFFAFE';
export const COLOR_CATEGORY_CYAN_FG = '#0E7490';
export const COLOR_CATEGORY_PINK_BG = '#FCE7F3';
export const COLOR_CATEGORY_PINK_FG = '#BE185D';

/** Light text used on top of the brand-gradient cards (e.g. tech portal support banner). */
export const COLOR_ON_GRADIENT_TEXT = '#CFE0FB';

// Translucent surfaces. Kept as rgba() rather than hex because each is composited
// over unknown page content and needs its alpha channel.
/** Standard modal/dialog backdrop scrim. */
export const COLOR_SCRIM = 'rgba(0,0,0,0.45)';
/** Heavier scrim for the full-screen onboarding takeover. */
export const COLOR_SCRIM_STRONG = 'rgba(0,0,0,0.6)';
/** Frosted top-nav surface (pairs with a backdrop blur). */
export const COLOR_SURFACE_TRANSLUCENT = 'rgba(255,255,255,0.95)';
/** Chips/badges laid over the brand gradient — a white wash, not a solid fill. */
export const COLOR_OVERLAY_ON_BRAND = 'rgba(255,255,255,0.2)';

// Elevation. Mirrors --shadow-card / --shadow-elevated in index.css; these are the
// values for consumers that build inline styles rather than classes.
export const SHADOW_CARD = '0 2px 8px rgba(15, 23, 42, 0.06)';
export const SHADOW_ELEVATED = '0 10px 30px rgba(15, 23, 42, 0.08)';
/** Drop shadow on map markers — darker than SHADOW_CARD so a marker stays legible
 *  over satellite/street tiles rather than over a page background. */
export const SHADOW_MAP_MARKER = '0 2px 6px rgba(0,0,0,0.35)';

/**
 * Shared business-rule constants used across web/src. Values here have real
 * product meaning (a minimum amount, a guarantee window, a refresh cadence) —
 * name them instead of repeating the literal at each call site.
 */

/** How often "live-ish" data (nearby jobs, active-job list, technician location
 *  push) is refetched/re-pushed while a technician or customer is actively
 *  watching a screen that depends on it. */
export const REALTIME_POLL_INTERVAL_MS = 30_000;

/** Hard ceiling on any single API request (see lib/api.ts's `request`) so a
 *  stalled connection surfaces as an error instead of a spinner that never
 *  resolves. Also applied to the direct Mapbox calls in lib/mapbox.ts. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Header name for client-generated idempotency keys on money-moving POSTs
 *  (see backend/src/interface/http/middleware/idempotency.ts). A retry sent
 *  with the same key replays the original response instead of double-booking. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Cadence at which an available technician's position is pushed to the backend
 *  and broadcast to the customer's tracking room (see useTechnicianLocationPush).
 *  Must stay comfortably under the backend's HEARTBEAT_STALE_MS (30s — see
 *  backend/src/infrastructure/cache/redis.ts), and is the cadence TrackingMap
 *  animates against, so both ends read it from here rather than each hard-coding
 *  the same 2s and drifting apart. */
export const LOCATION_PING_INTERVAL_MS = 2_000;

/** Minimum balance a technician can withdraw per request (see also the
 *  matching backend rule in WithdrawalService). */
export const MIN_WITHDRAWAL_JOD = 20;

/** Standard (non-Protection-plan) repair guarantee window, in days. */
export const DEFAULT_GUARANTEE_DAYS = 30;

/** Guarantee window granted to customers on the paid Protection plan, used as
 *  the fallback when the subscription payload omits `guaranteeDays`. */
export const PROTECTION_GUARANTEE_DAYS = 90;

/** Protection-plan per-service discount, used as the fallback when the
 *  subscription payload omits `discountPercent`. */
export const DEFAULT_PROTECTION_DISCOUNT_PERCENT = 15;

/** §17.5.2 flat night/emergency surcharge (own invoice line, never discounted)
 *  — mirrors backend's EMERGENCY_SURCHARGE_JOD (BookingService.create.ts).
 *  Duplicated client-side only for pre-confirmation disclosure; the server is
 *  still the source of truth for what's actually charged. */
export const EMERGENCY_SURCHARGE_JOD = 10;

/**
 * localStorage keys. Centralized because a key is a contract between the code
 * that writes it and every other place that reads it — a typo at one call site
 * reads as "absent" at the others rather than failing loudly.
 * Note: no credential is stored here. The access token is memory-only and the
 * refresh token is an httpOnly cookie (see lib/store.ts).
 */
export const STORAGE_KEY_ROLE = 'role';
export const STORAGE_KEY_LANG = 'lang';
export const STORAGE_KEY_THEME = 'theme';
export const STORAGE_KEY_ONBOARDED = 'fixly_onboarded';
/** Written only by app versions that predate the httpOnly refresh cookie; read
 *  solely to scrub it on logout. */
export const STORAGE_KEY_LEGACY_REFRESH_TOKEN = 'refresh_token';

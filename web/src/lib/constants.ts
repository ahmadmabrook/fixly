/**
 * Shared business-rule constants used across web/src. Values here have real
 * product meaning (a minimum amount, a guarantee window, a refresh cadence) —
 * name them instead of repeating the literal at each call site.
 */

/** How often "live-ish" data (nearby jobs, active-job list, technician location
 *  push) is refetched/re-pushed while a technician or customer is actively
 *  watching a screen that depends on it. */
export const REALTIME_POLL_INTERVAL_MS = 30_000;

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

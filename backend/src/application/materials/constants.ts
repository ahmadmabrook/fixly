/**
 * Named thresholds for the materials/pricing engine (FIXLY_SYSTEM_DESIGN.md
 * §17.5). Centralised here — never inline — so a future tuning pass changes
 * one number instead of hunting through every service that reads it.
 *
 * `OPS_REVIEW_THRESHOLD_FILS` is deployment-tunable (env.ts) because it is a
 * money threshold operators may want to move without a deploy. The constants
 * below are basis-point/time thresholds the spec states as fixed defaults, not
 * per-deployment knobs — matching how `QUOTE_TTL_DAYS` (quote/BookingQuoteService.ts)
 * and `LATE_COMPENSATION_JOD` (credit/ServiceCreditService.ts) are plain
 * exported constants rather than env vars.
 */

/** Basis-point denominator (100.00% = 10000 bps). Shared by every bps ratio in
 *  this domain (MaterialCatalog.varianceAlertBps, CategoryReadinessGate.*Bps). */
export const BPS_DENOMINATOR = 10_000;

/**
 * §17.5.14 step 1 ("Justify"). A BookingMaterial line priced more than this far
 * above its catalog reference cannot be invoiced without a recorded
 * `varianceReason` + note, AND (step 2) the customer's digital `customerAckAt`
 * before execution. Distinct from and stricter than the lower per-catalog-item
 * `MaterialCatalog.varianceAlertBps` (default 1500 = 15%, §17.5.9), which only
 * routes the line to `pending_review` — 20% additionally demands justification
 * and consent.
 */
export const VARIANCE_JUSTIFY_BPS = 2000;

/**
 * §17.5.14 step 3 ("Verify"). Once a customer declines a justified
 * over-reference line, the technician has this many hours to upload the
 * original purchase invoice before `settleExpiredVerifications` auto-deducts
 * the difference (step 4).
 */
export const MATERIAL_VERIFICATION_DEADLINE_HOURS = 24;

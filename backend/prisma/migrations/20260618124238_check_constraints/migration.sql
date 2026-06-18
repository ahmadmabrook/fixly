-- DB-level invariants (defense-in-depth; app validates too). Hand-written CHECKs
-- (not expressible in schema.prisma) — `prisma migrate dev` will report drift for
-- these, which is expected. Existing rows already satisfy them.

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "technician_profiles"
  ADD CONSTRAINT "technician_profiles_hourly_rate_range"
  CHECK ("hourlyRateJod" IS NULL OR ("hourlyRateJod" >= 40 AND "hourlyRateJod" <= 60));

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_amounts_nonneg" CHECK ("totalJod" >= 0 AND "discountJod" >= 0);

ALTER TABLE "withdrawal_requests"
  ADD CONSTRAINT "withdrawal_requests_amount_pos" CHECK ("amountJod" > 0);

ALTER TABLE "additional_work_items"
  ADD CONSTRAINT "additional_work_items_amount_pos" CHECK ("amountJod" > 0);

ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_codes_value_nonneg" CHECK ("value" >= 0);

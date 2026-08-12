-- Data correction (not a schema change): the Painting service row was seeded
-- as FIXED_SCOPE with an instant 70 JOD price, contradicting the spec's own
-- explicit rule that a materials-driven job (wall area, coats, prep, paint
-- tier) can never be sold at a flat instant price (§0.2 #4). The spec's own
-- v1.7 changelog already recorded this as "seed data corrected" — it never
-- actually reached any deployed database, only the local dev seed script.
--
-- Guarded by id + current pricingModel so this is a no-op if already correct
-- (idempotent, safe to re-run) and never touches a row an operator has since
-- deliberately changed some other way.
UPDATE "services"
SET "pricingModel" = 'QUOTE_FIRST', "inspectionFeeFils" = 10000
WHERE id = '00000000-0000-0000-0000-000000000004' AND "pricingModel" = 'FIXED_SCOPE';

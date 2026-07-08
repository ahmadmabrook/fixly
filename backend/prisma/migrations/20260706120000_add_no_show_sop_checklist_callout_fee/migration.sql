-- Technician-initiated no-show, server-enforced pre-start/pre-close SOP checklist,
-- and the service callout fee charged on a no-show. All added columns are
-- nullable or defaulted — no data loss on existing rows.

-- ============ BOOKING STATUS: NO_SHOW ============
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

-- ============ SERVICE CALLOUT FEE (services) ============
ALTER TABLE "services" ADD COLUMN "calloutFeeJod" DECIMAL(10,3) NOT NULL DEFAULT 5.000;

-- ============ SOP CHECKLIST (bookings) ============
ALTER TABLE "bookings" ADD COLUMN "preStartChecklistAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "preStartPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "bookings" ADD COLUMN "preCloseChecklistAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "preClosePhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ============ ONBOARDING CONSENT (technician_profiles) ============
ALTER TABLE "technician_profiles" ADD COLUMN "agreementAcceptedAt" TIMESTAMP(3);

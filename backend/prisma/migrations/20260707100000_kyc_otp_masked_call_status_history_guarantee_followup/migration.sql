-- Backend audit fixes (FIXLY_SYSTEM_DESIGN.md gaps):
--   1. technician_profiles.nationalIdEnc — encrypted KYC national ID (AES-256-GCM,
--      encrypted/decrypted in shared/crypto.ts; never returned by any API response).
--   2. booking_status_history — append-only audit trail of booking status transitions.
--   3. guarantee_tickets.followupBookingId — links an approved guarantee ticket's
--      scheduled visit to the actual zero-cost re-visit Booking created for it.
-- (Idempotency-Key handling, the WhatsApp OTP provider, and the Twilio masked-call
-- provider are HTTP/service-layer additions with no schema footprint.)

-- AlterTable
ALTER TABLE "technician_profiles" ADD COLUMN "nationalIdEnc" BYTEA;

-- AlterTable
ALTER TABLE "guarantee_tickets" ADD COLUMN "followupBookingId" UUID;

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" UUID,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_status_history_bookingId_changedAt_idx" ON "booking_status_history"("bookingId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "guarantee_tickets_followupBookingId_key" ON "guarantee_tickets"("followupBookingId");

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantee_tickets" ADD CONSTRAINT "guarantee_tickets_followupBookingId_fkey" FOREIGN KEY ("followupBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

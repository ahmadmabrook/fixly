-- Broadcast-and-accept dispatch model: new columns on bookings, new enum + table.

-- Dispatch columns on bookings (all nullable or defaulted — no data loss).
ALTER TABLE "bookings" ADD COLUMN "dispatchRound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "dispatchRadiusKm" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "dispatchExpiresAt" TIMESTAMP(3);

-- Sweep index: PENDING bookings with an expired dispatch round.
CREATE INDEX "bookings_status_dispatchExpiresAt_idx" ON "bookings"("status", "dispatchExpiresAt");

-- Dispatch offer status enum.
CREATE TYPE "DispatchOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- Dispatch offers table.
CREATE TABLE "dispatch_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookingId" UUID NOT NULL,
    "technicianId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "radiusKm" INTEGER NOT NULL,
    "status" "DispatchOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "dispatch_offers_pkey" PRIMARY KEY ("id")
);

-- At most one offer per technician per booking (idempotent re-offer guard).
CREATE UNIQUE INDEX "dispatch_offers_bookingId_technicianId_key" ON "dispatch_offers"("bookingId", "technicianId");

-- Worker queries: all OFFERED offers for a booking; sweep queries by status.
CREATE INDEX "dispatch_offers_bookingId_status_idx" ON "dispatch_offers"("bookingId", "status");
CREATE INDEX "dispatch_offers_status_idx" ON "dispatch_offers"("status");

-- Foreign keys.
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technician_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

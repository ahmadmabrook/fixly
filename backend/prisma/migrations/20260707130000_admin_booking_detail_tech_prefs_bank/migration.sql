-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "technician_profiles" ADD COLUMN     "bankIban" TEXT,
ADD COLUMN     "bankName" TEXT;

-- CreateTable
CREATE TABLE "technician_notification_prefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technicianId" UUID NOT NULL,
    "newJobRequests" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "earningsUpdates" BOOLEAN NOT NULL DEFAULT true,
    "promotions" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_notification_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_notification_prefs_technicianId_key" ON "technician_notification_prefs"("technicianId");

-- CreateIndex
CREATE INDEX "bookings_updatedAt_idx" ON "bookings"("updatedAt");

-- AddForeignKey
ALTER TABLE "technician_notification_prefs" ADD CONSTRAINT "technician_notification_prefs_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technician_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- DropIndex
DROP INDEX "guarantee_tickets_status_idx";

-- CreateIndex
CREATE INDEX "bookings_customerId_createdAt_idx" ON "bookings"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_technicianId_createdAt_idx" ON "bookings"("technicianId", "createdAt");

-- CreateIndex
CREATE INDEX "guarantee_tickets_status_createdAt_idx" ON "guarantee_tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_createdAt_idx" ON "reviews"("createdAt");


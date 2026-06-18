-- DropIndex
DROP INDEX "promo_redemptions_promoCodeId_idx";

-- DropIndex
DROP INDEX "support_tickets_userId_idx";

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'SUPPORT';

-- CreateIndex
CREATE INDEX "bookings_customerId_status_completedAt_idx" ON "bookings"("customerId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "payments_capturedAt_idx" ON "payments"("capturedAt");

-- CreateIndex
CREATE INDEX "payouts_technicianId_createdAt_idx" ON "payouts"("technicianId", "createdAt");

-- CreateIndex
CREATE INDEX "promo_redemptions_promoCodeId_userId_idx" ON "promo_redemptions"("promoCodeId", "userId");

-- CreateIndex
CREATE INDEX "reviews_revieweeId_createdAt_idx" ON "reviews"("revieweeId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_userId_updatedAt_idx" ON "support_tickets"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_updatedAt_idx" ON "support_tickets"("status", "updatedAt");


-- Partial unique index: at most ONE in-flight (REQUESTED/PROCESSING) withdrawal
-- per technician. Hard DB guard that closes the balance/cooldown TOCTOU race in
-- TechnicianService.requestWithdrawal (a 2nd concurrent request hits a unique
-- violation). NOTE: not expressible in schema.prisma (partial index) — managed
-- in raw SQL; `prisma migrate dev` will report drift for it (expected).
CREATE UNIQUE INDEX "withdrawal_requests_one_pending_per_tech"
  ON "withdrawal_requests"("technicianId")
  WHERE "status" IN ('REQUESTED', 'PROCESSING');

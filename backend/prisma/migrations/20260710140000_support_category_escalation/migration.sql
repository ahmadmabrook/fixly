-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('QUALITY', 'DELAY', 'PRICING', 'BEHAVIOR', 'SAFETY', 'OTHER');

-- AlterTable
ALTER TABLE "support_tickets"
  ADD COLUMN "category" "SupportCategory",
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

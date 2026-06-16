-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerType" ADD VALUE 'DISPUTE';
ALTER TYPE "LedgerType" ADD VALUE 'CHARGEBACK';
ALTER TYPE "LedgerType" ADD VALUE 'ADJUSTMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'DISPUTED';
ALTER TYPE "PaymentStatus" ADD VALUE 'CHARGEBACK';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'JOD',
ADD COLUMN     "direction" "LedgerDirection";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "capturedAmountJod" DECIMAL(10,3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'JOD',
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "feeJod" DECIMAL(10,3),
ADD COLUMN     "refundedAmountJod" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'JOD',
ADD COLUMN     "paymentId" UUID;

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "paymentId" UUID NOT NULL,
    "providerRef" TEXT,
    "reason" TEXT,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psp_webhook_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "psp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disputes_paymentId_idx" ON "disputes"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "psp_webhook_events_provider_eventId_key" ON "psp_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_paymentId_key" ON "payouts"("paymentId");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


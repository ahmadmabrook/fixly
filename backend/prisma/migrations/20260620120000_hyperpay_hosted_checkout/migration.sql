-- AlterEnum
-- Hosted-checkout providers (e.g. HyperPay) create a booking in AWAITING_PAYMENT
-- until the customer authorizes payment, at which point it is promoted to PENDING.
ALTER TYPE "BookingStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterTable
-- Hosted-checkout correlation + tokenised card metadata (never a PAN). All additive
-- and nullable so existing rows are unaffected (forward-only migration).
ALTER TABLE "payments" ADD COLUMN     "checkoutId" TEXT,
ADD COLUMN     "method" TEXT DEFAULT 'card',
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkoutId_key" ON "payments"("checkoutId");

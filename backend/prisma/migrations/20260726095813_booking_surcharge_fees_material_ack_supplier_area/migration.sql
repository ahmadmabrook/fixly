-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "customerSuppliedMaterialsAckAt" TIMESTAMP(3),
ADD COLUMN     "feesFils" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "surchargeFils" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "area" TEXT;

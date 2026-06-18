-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPS', 'FINANCE', 'SUPPORT');

-- CreateEnum
CREATE TYPE "TechnicianStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "BroadcastSegment" AS ENUM ('ALL', 'CUSTOMERS', 'TECHNICIANS');

-- CreateEnum
CREATE TYPE "AdditionalWorkStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "discountJod" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "promoCodeId" UUID,
ADD COLUMN     "rescheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guarantee_tickets" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduledVisitAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "technician_profiles" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "certificateUrl" TEXT,
ADD COLUMN     "hourlyRateJod" DECIMAL(10,3),
ADD COLUMN     "idDocUrl" TEXT,
ADD COLUMN     "lastWithdrawalAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "selfieUrl" TEXT,
ADD COLUMN     "status" "TechnicianStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "vehicle" TEXT;

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "building" TEXT,
    "apartment" TEXT,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "providerRef" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,
    "minOrderJod" DECIMAL(10,3),
    "maxRedemptions" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "promoCodeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "technicianId" UUID NOT NULL,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "iban" TEXT,
    "bankName" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "titleAr" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "segment" "BroadcastSegment" NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_work_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bookingId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "status" "AdditionalWorkStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TechnicianServices" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE INDEX "payment_methods_userId_idx" ON "payment_methods"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_isActive_idx" ON "promo_codes"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_bookingId_key" ON "promo_redemptions"("bookingId");

-- CreateIndex
CREATE INDEX "promo_redemptions_promoCodeId_idx" ON "promo_redemptions"("promoCodeId");

-- CreateIndex
CREATE INDEX "promo_redemptions_userId_idx" ON "promo_redemptions"("userId");

-- CreateIndex
CREATE INDEX "withdrawal_requests_technicianId_idx" ON "withdrawal_requests"("technicianId");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_createdAt_idx" ON "withdrawal_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "broadcasts_createdAt_idx" ON "broadcasts"("createdAt");

-- CreateIndex
CREATE INDEX "additional_work_items_bookingId_idx" ON "additional_work_items"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "_TechnicianServices_AB_unique" ON "_TechnicianServices"("A", "B");

-- CreateIndex
CREATE INDEX "_TechnicianServices_B_index" ON "_TechnicianServices"("B");

-- CreateIndex
CREATE INDEX "guarantee_tickets_status_idx" ON "guarantee_tickets"("status");

-- CreateIndex
CREATE INDEX "technician_profiles_status_idx" ON "technician_profiles"("status");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technician_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_work_items" ADD CONSTRAINT "additional_work_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TechnicianServices" ADD CONSTRAINT "_TechnicianServices_A_fkey" FOREIGN KEY ("A") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TechnicianServices" ADD CONSTRAINT "_TechnicianServices_B_fkey" FOREIGN KEY ("B") REFERENCES "technician_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


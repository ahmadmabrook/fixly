-- v1.5 business features: technician trust/vetting, subscriptions, video pre-check
-- quotes, customer service credits, conduct reports, arrival SLA + late compensation.
-- All added columns are nullable or defaulted — no data loss on existing rows.

-- ============ ENUMS ============
CREATE TYPE "TrustTier"          AS ENUM ('PROBATION', 'VERIFIED', 'PRO', 'ELITE');
CREATE TYPE "BgCheckStatus"      AS ENUM ('PENDING', 'PASSED', 'FAILED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "QuoteStatus"        AS ENUM ('PENDING', 'QUOTED', 'ACCEPTED', 'DECLINED', 'EXPIRED');
CREATE TYPE "CreditReason"       AS ENUM ('LATE_COMPENSATION', 'REFERRAL', 'GOODWILL', 'PROMO', 'ADJUSTMENT', 'REDEMPTION');
CREATE TYPE "ConductKind"        AS ENUM ('OFF_PLATFORM_SOLICIT', 'NO_SHOW', 'QUALITY', 'SAFETY', 'OTHER');
CREATE TYPE "ConductStatus"      AS ENUM ('OPEN', 'REVIEWING', 'UPHELD', 'DISMISSED');

-- ============ TECHNICIAN TRUST & VETTING (technician_profiles) ============
ALTER TABLE "technician_profiles" ADD COLUMN "trustTier" "TrustTier" NOT NULL DEFAULT 'PROBATION';
ALTER TABLE "technician_profiles" ADD COLUMN "bgCheckStatus" "BgCheckStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "technician_profiles" ADD COLUMN "skillsTestPassedAt" TIMESTAMP(3);
ALTER TABLE "technician_profiles" ADD COLUMN "isInsured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "technician_profiles" ADD COLUMN "introVideoUrl" TEXT;
ALTER TABLE "technician_profiles" ADD COLUMN "jobsCompleted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "technician_profiles" ADD COLUMN "offPlatformFlags" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "technician_profiles_trustTier_idx" ON "technician_profiles"("trustTier");

-- ============ BOOKING SLA + PRIORITY (bookings) ============
ALTER TABLE "bookings" ADD COLUMN "isPriority" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN "slaArriveBy" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "arrivedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "lateCompJod" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- ============ SUBSCRIPTIONS ============
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "planSlug" TEXT NOT NULL DEFAULT 'protect',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceJod" DECIMAL(10,3) NOT NULL DEFAULT 5.000,
    "discountPercent" INTEGER NOT NULL DEFAULT 15,
    "guaranteeDays" INTEGER NOT NULL DEFAULT 90,
    "priorityDispatch" BOOLEAN NOT NULL DEFAULT true,
    "inspectionEveryDays" INTEGER NOT NULL DEFAULT 90,
    "nextInspectionAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "paymentToken" TEXT,
    "providerRef" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscriptions_customerId_idx" ON "subscriptions"("customerId");
CREATE INDEX "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");
-- At most one ACTIVE subscription per customer (partial unique index).
CREATE UNIQUE INDEX "subscriptions_customerId_active_key" ON "subscriptions"("customerId") WHERE "status" = 'ACTIVE';

CREATE TABLE "subscription_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscriptionId" UUID NOT NULL,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "chargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscription_charges_subscriptionId_createdAt_idx" ON "subscription_charges"("subscriptionId", "createdAt");

-- ============ BOOKING QUOTES (video pre-check) ============
CREATE TABLE "booking_quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "videoUrl" TEXT NOT NULL,
    "description" TEXT,
    "quotedJod" DECIMAL(10,3),
    "quotedById" UUID,
    "addressLine" TEXT,
    "addressLat" DOUBLE PRECISION,
    "addressLng" DOUBLE PRECISION,
    "bookingId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "booking_quotes_bookingId_key" ON "booking_quotes"("bookingId");
CREATE INDEX "booking_quotes_customerId_createdAt_idx" ON "booking_quotes"("customerId", "createdAt");
CREATE INDEX "booking_quotes_status_idx" ON "booking_quotes"("status");

-- ============ SERVICE CREDITS (customer wallet) ============
CREATE TABLE "service_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "amountJod" DECIMAL(10,3) NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "bookingId" UUID,
    "refKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_credits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_credits_refKey_key" ON "service_credits"("refKey");
CREATE INDEX "service_credits_customerId_createdAt_idx" ON "service_credits"("customerId", "createdAt");

-- ============ CONDUCT REPORTS (anti-disintermediation + quality) ============
CREATE TABLE "conduct_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporterId" UUID NOT NULL,
    "subjectTechId" UUID,
    "bookingId" UUID,
    "kind" "ConductKind" NOT NULL,
    "details" TEXT,
    "status" "ConductStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conduct_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conduct_reports_status_createdAt_idx" ON "conduct_reports"("status", "createdAt");
CREATE INDEX "conduct_reports_subjectTechId_idx" ON "conduct_reports"("subjectTechId");

-- ============ FOREIGN KEYS ============
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_quotes" ADD CONSTRAINT "booking_quotes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_credits" ADD CONSTRAINT "service_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_credits" ADD CONSTRAINT "service_credits_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conduct_reports" ADD CONSTRAINT "conduct_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conduct_reports" ADD CONSTRAINT "conduct_reports_subjectTechId_fkey" FOREIGN KEY ("subjectTechId") REFERENCES "technician_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

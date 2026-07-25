-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED_SCOPE', 'QUOTE_FIRST');

-- CreateEnum
CREATE TYPE "QuoteLineKind" AS ENUM ('LABOUR', 'MATERIAL', 'PREP', 'FEE');

-- CreateEnum
CREATE TYPE "MaterialTier" AS ENUM ('ECONOMY', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "MaterialMode" AS ENUM ('LABOUR_ONLY', 'MICRO_INCLUDED', 'GOVERNED_ADDONS', 'QUOTE_FIRST_BOM', 'PROJECT_STAGED');

-- CreateEnum
CREATE TYPE "MaterialSource" AS ENUM ('TECHNICIAN_PROCURED', 'CUSTOMER_SUPPLIED', 'PLATFORM_ARRANGED');

-- CreateEnum
CREATE TYPE "MaterialLineStatus" AS ENUM ('PENDING', 'PENDING_REVIEW', 'APPROVED', 'DECLINED', 'REPLACED', 'UNUSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "CatalogSource" AS ENUM ('RETAIL_OBSERVED', 'SUPPLIER_QUOTE', 'INTERNAL_STANDARD');

-- CreateEnum
CREATE TYPE "ReadinessState" AS ENUM ('COLLECTING', 'READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RefreshCadence" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL');

-- CreateEnum
CREATE TYPE "PriceConfidence" AS ENUM ('CONFIRMED', 'ESTIMATED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "PriceIndexKind" AS ENUM ('DOS_CPI', 'DOS_CPI_MAINTENANCE', 'MEMR_FUEL', 'CHAMBER_OF_INDUSTRY');

-- CreateEnum
CREATE TYPE "VarianceReason" AS ENUM ('SPECIAL_TYPE', 'IMPORTED_BRAND', 'ACCESS_DIFFICULTY', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('OPEN', 'INVOICE_PROVIDED', 'UPHELD', 'DEDUCTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SubstitutionPolicy" AS ENUM ('SAME_OR_HIGHER_TIER', 'NOT_ALLOWED');

-- AlterTable
ALTER TABLE "booking_quotes" ADD COLUMN     "dimensionsNote" TEXT,
ADD COLUMN     "labourFils" INTEGER,
ADD COLUMN     "materialsFils" INTEGER,
ADD COLUMN     "opsReviewedAt" TIMESTAMP(3),
ADD COLUMN     "opsReviewedById" UUID,
ADD COLUMN     "requestedTier" "MaterialTier",
ADD COLUMN     "siteMediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "videoUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "labourFils" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materialsFils" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "refKey" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "inspectionFeeFils" INTEGER,
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED_SCOPE';

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quoteId" UUID NOT NULL,
    "kind" "QuoteLineKind" NOT NULL,
    "materialId" UUID,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPriceFils" INTEGER NOT NULL,
    "totalFils" INTEGER NOT NULL,
    "source" "MaterialSource" NOT NULL DEFAULT 'TECHNICIAN_PROCURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "contactPhone" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contractRef" TEXT,
    "isPilot" BOOLEAN NOT NULL DEFAULT true,
    "referralCommissionBps" INTEGER,
    "agreementKind" TEXT NOT NULL DEFAULT 'verbal',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "commissionPaidOk" BOOLEAN,
    "priceManipulationObserved" BOOLEAN,
    "trialNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceId" UUID,
    "supplierId" UUID,
    "catalogSource" "CatalogSource" NOT NULL DEFAULT 'RETAIL_OBSERVED',
    "lastPricedAt" TIMESTAMP(3),
    "refreshCadence" "RefreshCadence" NOT NULL DEFAULT 'MONTHLY',
    "priceConfidence" "PriceConfidence" NOT NULL DEFAULT 'CONFIRMED',
    "indexKind" "PriceIndexKind",
    "baseReferenceFils" INTEGER,
    "indexedAt" TIMESTAMP(3),
    "slug" TEXT NOT NULL,
    "subcategory" TEXT,
    "allowedForServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "brand" TEXT,
    "tier" "MaterialTier" NOT NULL DEFAULT 'STANDARD',
    "unit" TEXT NOT NULL,
    "wholesaleFils" INTEGER,
    "techMarginBps" INTEGER NOT NULL DEFAULT 0,
    "unitPriceFils" INTEGER NOT NULL,
    "priceMinFils" INTEGER NOT NULL,
    "priceMaxFils" INTEGER NOT NULL,
    "varianceAlertBps" INTEGER NOT NULL DEFAULT 1500,
    "coverageNote" TEXT,
    "priceRefreshedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_rate_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceId" UUID NOT NULL,
    "tier" "MaterialTier" NOT NULL,
    "unit" TEXT NOT NULL,
    "rateFils" INTEGER NOT NULL,
    "includesMaterials" BOOLEAN NOT NULL DEFAULT true,
    "descriptionAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL DEFAULT CURRENT_DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookingId" UUID NOT NULL,
    "materialId" UUID,
    "source" "MaterialSource" NOT NULL DEFAULT 'TECHNICIAN_PROCURED',
    "status" "MaterialLineStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "qty" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPriceFils" INTEGER NOT NULL,
    "totalFils" INTEGER NOT NULL,
    "referencePriceFils" INTEGER,
    "varianceBps" INTEGER,
    "varianceReason" "VarianceReason",
    "varianceReasonNote" TEXT,
    "customerAckAt" TIMESTAMP(3),
    "isMicro" BOOLEAN NOT NULL DEFAULT false,
    "replacesLineId" UUID,
    "supplierInvoiceUrl" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_material_policies" (
    "serviceId" UUID NOT NULL,
    "mode" "MaterialMode" NOT NULL DEFAULT 'LABOUR_ONLY',
    "microThresholdFils" INTEGER NOT NULL DEFAULT 3000,
    "allowCustomerSupply" BOOLEAN NOT NULL DEFAULT true,
    "substitution" "SubstitutionPolicy" NOT NULL DEFAULT 'SAME_OR_HIGHER_TIER',
    "quoteRequiredAboveFils" INTEGER,
    "quoteValidityHours" INTEGER NOT NULL DEFAULT 168,
    "qualityFloorGrade" "MaterialTier" NOT NULL DEFAULT 'ECONOMY',
    "surplusBelongsToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_material_policies_pkey" PRIMARY KEY ("serviceId")
);

-- CreateTable
CREATE TABLE "supplier_price_observations" (
    "id" SERIAL NOT NULL,
    "materialId" UUID NOT NULL,
    "supplierId" UUID,
    "shopName" TEXT,
    "area" TEXT,
    "observedFils" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedById" UUID,
    "note" TEXT,

    CONSTRAINT "supplier_price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookingMaterialId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "technicianId" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'OPEN',
    "referencePriceFils" INTEGER NOT NULL,
    "chargedPriceFils" INTEGER NOT NULL,
    "deltaFils" INTEGER NOT NULL,
    "invoiceUrl" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_index_readings" (
    "id" SERIAL NOT NULL,
    "kind" "PriceIndexKind" NOT NULL,
    "periodMonth" DATE NOT NULL,
    "valueNumeric" DECIMAL(12,4) NOT NULL,
    "unit" TEXT,
    "sourceUrl" TEXT,
    "recordedById" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "price_index_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_readiness_gate" (
    "serviceId" UUID NOT NULL,
    "state" "ReadinessState" NOT NULL DEFAULT 'COLLECTING',
    "quotesRequired" INTEGER NOT NULL DEFAULT 50,
    "quotesClosed" INTEGER NOT NULL DEFAULT 0,
    "maxDisputeBps" INTEGER NOT NULL DEFAULT 800,
    "disputeBps" INTEGER NOT NULL DEFAULT 0,
    "maxPriceDeviationBps" INTEGER NOT NULL DEFAULT 1500,
    "priceDeviationBps" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_readiness_gate_pkey" PRIMARY KEY ("serviceId")
);

-- CreateIndex
CREATE INDEX "quote_lines_quoteId_idx" ON "quote_lines"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_slug_key" ON "material_catalog"("slug");

-- CreateIndex
CREATE INDEX "material_catalog_serviceId_idx" ON "material_catalog"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "service_rate_cards_serviceId_tier_effectiveFrom_key" ON "service_rate_cards"("serviceId", "tier", "effectiveFrom");

-- CreateIndex
CREATE INDEX "booking_materials_bookingId_idx" ON "booking_materials"("bookingId");

-- CreateIndex
CREATE INDEX "booking_materials_status_idx" ON "booking_materials"("status");

-- CreateIndex
CREATE INDEX "supplier_price_observations_materialId_observedAt_idx" ON "supplier_price_observations"("materialId", "observedAt");

-- CreateIndex
CREATE INDEX "material_verification_requests_status_deadlineAt_idx" ON "material_verification_requests"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_index_readings_kind_periodMonth_key" ON "price_index_readings"("kind", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_refKey_key" ON "ledger_entries"("refKey");

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "booking_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog" ADD CONSTRAINT "material_catalog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog" ADD CONSTRAINT "material_catalog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_materials" ADD CONSTRAINT "booking_materials_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_materials" ADD CONSTRAINT "booking_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_materials" ADD CONSTRAINT "booking_materials_replacesLineId_fkey" FOREIGN KEY ("replacesLineId") REFERENCES "booking_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_material_policies" ADD CONSTRAINT "service_material_policies_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_observations" ADD CONSTRAINT "supplier_price_observations_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_observations" ADD CONSTRAINT "supplier_price_observations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_verification_requests" ADD CONSTRAINT "material_verification_requests_bookingMaterialId_fkey" FOREIGN KEY ("bookingMaterialId") REFERENCES "booking_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_verification_requests" ADD CONSTRAINT "material_verification_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_verification_requests" ADD CONSTRAINT "material_verification_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technician_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_readiness_gate" ADD CONSTRAINT "category_readiness_gate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

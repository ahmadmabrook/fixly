-- CreateTable
CREATE TABLE "customer_notification_prefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "bookings" BOOLEAN NOT NULL DEFAULT true,
    "arriving" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "guarantee" BOOLEAN NOT NULL DEFAULT true,
    "promotions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notification_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_notification_prefs_customerId_key" ON "customer_notification_prefs"("customerId");

-- AddForeignKey
ALTER TABLE "customer_notification_prefs" ADD CONSTRAINT "customer_notification_prefs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


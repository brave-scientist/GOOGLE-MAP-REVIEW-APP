-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- AlterTable ReportDeliveryLog
ALTER TABLE "ReportDeliveryLog" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportDeliveryLog_status_claimedAt_idx" ON "ReportDeliveryLog"("status", "claimedAt");

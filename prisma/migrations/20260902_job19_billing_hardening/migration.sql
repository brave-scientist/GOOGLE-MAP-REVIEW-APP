-- AlterTable StripeWebhookEvent
ALTER TABLE "StripeWebhookEvent" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE "StripeWebhookEvent" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StripeWebhookEvent" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "StripeWebhookEvent" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_status_createdAt_idx" ON "StripeWebhookEvent"("status", "createdAt");

-- AlterTable Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastEventTimestamp" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastEventId" TEXT;

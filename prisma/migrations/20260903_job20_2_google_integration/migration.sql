-- AlterTable Business
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleLocationVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleSyncStatus" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleSyncError" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organization" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill existing organizations as completed
UPDATE "Organization" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingCompletedAt" IS NULL;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "reviewPageTitle" TEXT;
ALTER TABLE "Business" ADD COLUMN "reviewPageSubtitle" TEXT;
ALTER TABLE "Business" ADD COLUMN "reviewPagePrivateFeedbackEnabled" BOOLEAN NOT NULL DEFAULT true;

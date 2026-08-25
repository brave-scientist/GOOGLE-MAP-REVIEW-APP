-- CreateEnum
CREATE TYPE "PublishAttemptStatus" AS ENUM ('IN_FLIGHT', 'SUCCESS', 'FAILED', 'UNCONFIRMED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENCY_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENCY_STAFF';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_STAFF';
ALTER TYPE "DraftStatus" ADD VALUE IF NOT EXISTS 'POSTING';
ALTER TYPE "ReviewSource" ADD VALUE IF NOT EXISTS 'INTERNAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewPublishAttempt" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "platform" "ReviewSource" NOT NULL,
    "status" "PublishAttemptStatus" NOT NULL DEFAULT 'IN_FLIGHT',
    "errorMessage" TEXT,
    "remoteId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewPublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewPublishAttempt_reviewId_status_idx" ON "ReviewPublishAttempt"("reviewId", "status");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPublishAttempt" ADD CONSTRAINT "ReviewPublishAttempt_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add googlePlaceId to Business for Google Maps Place ID redirection
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT;

-- CreateTable: Add EmailOtp table for production distributed hashed OTPs
CREATE TABLE IF NOT EXISTS "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "businessName" TEXT,
    "isNewUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOtp_email_expiresAt_idx" ON "EmailOtp"("email", "expiresAt");

-- CreateTable: Add OAuthTransactionState table for distributed single-use OAuth transactions
CREATE TABLE IF NOT EXISTS "OAuthTransactionState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthTransactionState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthTransactionState_state_key" ON "OAuthTransactionState"("state");
CREATE INDEX IF NOT EXISTS "OAuthTransactionState_state_expiresAt_idx" ON "OAuthTransactionState"("state", "expiresAt");

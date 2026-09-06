-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SslStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AgencyBranding" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "supportEmail" TEXT,
    "portalTitle" TEXT,
    "hideReviewReplyBadge" BOOLEAN NOT NULL DEFAULT false,
    "emailSenderName" TEXT,
    "replyToEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" TEXT NOT NULL,
    "cnameTarget" TEXT NOT NULL DEFAULT 'cname.reviewreply.com',
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "sslStatus" "SslStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalShare" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passcodeHash" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDeliveryLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "businessId" TEXT,
    "recipient" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyBranding_orgId_key" ON "AgencyBranding"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_verificationToken_key" ON "CustomDomain"("verificationToken");

-- CreateIndex
CREATE INDEX "CustomDomain_orgId_idx" ON "CustomDomain"("orgId");

-- CreateIndex
CREATE INDEX "CustomDomain_domain_status_idx" ON "CustomDomain"("domain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalShare_tokenHash_key" ON "ClientPortalShare"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPortalShare_businessId_idx" ON "ClientPortalShare"("businessId");

-- CreateIndex
CREATE INDEX "ClientPortalShare_orgId_idx" ON "ClientPortalShare"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDeliveryLog_idempotencyKey_key" ON "ReportDeliveryLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReportDeliveryLog_reportId_createdAt_idx" ON "ReportDeliveryLog"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportDeliveryLog_orgId_createdAt_idx" ON "ReportDeliveryLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportDeliveryLog_businessId_idx" ON "ReportDeliveryLog"("businessId");

-- AddForeignKey
ALTER TABLE "AgencyBranding" ADD CONSTRAINT "AgencyBranding_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalShare" ADD CONSTRAINT "ClientPortalShare_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalShare" ADD CONSTRAINT "ClientPortalShare_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDeliveryLog" ADD CONSTRAINT "ReportDeliveryLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ScheduledReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDeliveryLog" ADD CONSTRAINT "ReportDeliveryLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

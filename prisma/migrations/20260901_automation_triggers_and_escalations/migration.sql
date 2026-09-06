-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('NEW_REVIEW', 'SENTIMENT_ALERT', 'RATING_THRESHOLD', 'NEGATIVE_FEEDBACK');

-- CreateEnum
CREATE TYPE "SentimentScoreCategory" AS ENUM ('ANY', 'NEGATIVE', 'NEUTRAL', 'POSITIVE');

-- CreateEnum
CREATE TYPE "EscalationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('CREATE_ESCALATION', 'DISPATCH_NOTIFICATION', 'ESCALATE_AND_NOTIFY');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "AutomationTriggerType" NOT NULL DEFAULT 'NEW_REVIEW',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "sentimentThreshold" "SentimentScoreCategory" NOT NULL DEFAULT 'ANY',
    "minSeverity" "EscalationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "sources" TEXT NOT NULL DEFAULT 'ALL',
    "actionType" "AutomationActionType" NOT NULL DEFAULT 'CREATE_ESCALATION',
    "actionConfig" TEXT,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "EscalationSeverity" NOT NULL DEFAULT 'HIGH',
    "sentiment" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedToEmail" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reviewId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "sentiment" TEXT,
    "severity" TEXT,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationDispatch" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_businessId_isEnabled_idx" ON "AutomationRule"("businessId", "isEnabled");

-- CreateIndex
CREATE INDEX "AutomationRule_businessId_triggerType_idx" ON "AutomationRule"("businessId", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_reviewId_ruleId_key" ON "Escalation"("reviewId", "ruleId");

-- CreateIndex
CREATE INDEX "Escalation_businessId_status_idx" ON "Escalation"("businessId", "status");

-- CreateIndex
CREATE INDEX "Escalation_businessId_severity_idx" ON "Escalation"("businessId", "severity");

-- CreateIndex
CREATE INDEX "Escalation_reviewId_idx" ON "Escalation"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_idempotencyKey_key" ON "AutomationExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationExecution_businessId_executedAt_idx" ON "AutomationExecution"("businessId", "executedAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_ruleId_status_idx" ON "AutomationExecution"("ruleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationDispatch_idempotencyKey_key" ON "EscalationDispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EscalationDispatch_escalationId_status_idx" ON "EscalationDispatch"("escalationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationWebhookEvent_eventId_key" ON "AutomationWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "AutomationWebhookEvent_eventId_createdAt_idx" ON "AutomationWebhookEvent"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationDispatch" ADD CONSTRAINT "EscalationDispatch_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

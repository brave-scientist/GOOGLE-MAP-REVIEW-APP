-- AlterTable
ALTER TABLE "ReplyTemplate" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AiReplyPreset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tone" TEXT NOT NULL,
    "responseLength" TEXT NOT NULL DEFAULT 'BALANCED',
    "customInstructions" TEXT,
    "signature" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReplyPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyTemplate_businessId_idx" ON "ReplyTemplate"("businessId");

-- CreateIndex
CREATE INDEX "ReplyTemplate_businessId_category_idx" ON "ReplyTemplate"("businessId", "category");

-- CreateIndex
CREATE INDEX "AiReplyPreset_businessId_idx" ON "AiReplyPreset"("businessId");

-- CreateIndex
CREATE INDEX "AiReplyPreset_businessId_isDefault_idx" ON "AiReplyPreset"("businessId", "isDefault");

-- AddForeignKey
ALTER TABLE "AiReplyPreset" ADD CONSTRAINT "AiReplyPreset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

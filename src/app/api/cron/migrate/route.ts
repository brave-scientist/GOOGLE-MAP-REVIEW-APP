import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminEmailHeader = request.headers.get('x-admin-email')?.trim().toLowerCase()
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const sessionSecret = process.env.SESSION_SECRET

  const isAuthorized =
    (adminEmailHeader && adminEmails.includes(adminEmailHeader)) ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (sessionSecret && authHeader === `Bearer ${sessionSecret}`)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ddl = [
      // 1. Enums
      `DO $$ BEGIN
         CREATE TYPE "PublishAttemptStatus" AS ENUM ('IN_FLIGHT', 'SUCCESS', 'FAILED', 'UNCONFIRMED');
       EXCEPTION WHEN duplicate_object THEN null;
       END $$;`,
      `DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENCY_ADMIN'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENCY_STAFF'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_ADMIN'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT_STAFF'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN ALTER TYPE "DraftStatus" ADD VALUE IF NOT EXISTS 'POSTING'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN ALTER TYPE "ReviewSource" ADD VALUE IF NOT EXISTS 'INTERNAL'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,

      // 2. User table columns
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;`,

      // 3. Organization table columns
      `ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;`,
      `ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;`,
      `ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" TEXT;`,
      `ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);`,

      // 4. Business table columns
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "orgId" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "industry" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "address" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "phone" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/New_York';`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleLocationId" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "facebookPageId" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "slug" TEXT;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0;`,
      `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Business_slug_key" ON "Business"("slug");`,

      // 5. Review table columns
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "authorAvatar" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "title" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "sentimentScore" DOUBLE PRECISION;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "topics" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "replyText" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "repliedBy" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "draftText" TEXT;`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "draftStatus" "DraftStatus" NOT NULL DEFAULT 'NONE';`,
      `ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

      // 6. AuditLog table columns
      `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ip" TEXT;`,

      // 7. PasswordResetToken
      `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "tokenHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "consumedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");`,
      `CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");`,
      `DO $$ BEGIN
          ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN null;
       END $$;`,

      // 8. StripeWebhookEvent
      `CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "processedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");`,

      // 9. ReviewPublishAttempt
      `CREATE TABLE IF NOT EXISTS "ReviewPublishAttempt" (
          "id" TEXT NOT NULL,
          "reviewId" TEXT NOT NULL,
          "platform" "ReviewSource" NOT NULL,
          "status" "PublishAttemptStatus" NOT NULL DEFAULT 'IN_FLIGHT',
          "errorMessage" TEXT,
          "remoteId" TEXT,
          "idempotencyKey" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ReviewPublishAttempt_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "ReviewPublishAttempt_reviewId_status_idx" ON "ReviewPublishAttempt"("reviewId", "status");`,
      `DO $$ BEGIN
          ALTER TABLE "ReviewPublishAttempt" ADD CONSTRAINT "ReviewPublishAttempt_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN null;
       END $$;`,
    ]

    const results: Array<{ statement: string; status: string; error?: string }> = []
    for (const statement of ddl) {
      try {
        await db.$executeRawUnsafe(statement)
        results.push({ statement: statement.slice(0, 45) + '...', status: 'OK' })
      } catch (err: any) {
        results.push({ statement: statement.slice(0, 45) + '...', status: 'WARN', error: err?.message })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Comprehensive schema synchronization applied successfully',
      results,
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Migration failed' },
      { status: 500 }
    )
  }
}

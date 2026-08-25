import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const sessionSecret = process.env.SESSION_SECRET

  const adminEmailHeader = request.headers.get('x-admin-email')?.trim().toLowerCase()
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

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

      // 2. User sessionVersion
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;`,

      // 3. PasswordResetToken
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

      // 4. StripeWebhookEvent
      `CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "processedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");`,

      // 5. ReviewPublishAttempt
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
        results.push({ statement: statement.slice(0, 40) + '...', status: 'OK' })
      } catch (err: any) {
        results.push({ statement: statement.slice(0, 40) + '...', status: 'WARN', error: err?.message })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Stage 3 schema migration applied successfully',
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

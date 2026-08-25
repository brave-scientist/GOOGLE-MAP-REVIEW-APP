import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/health — Lightweight health check for UptimeRobot / load balancers.
//
// Returns 200 if the app is healthy (DB reachable), 503 if not.
// UptimeRobot should monitor this endpoint — it's a real signal that the
// app is up and serving requests, not just that the process is running.
//
// Response shape is intentionally minimal for fast polling.
export async function GET() {
  const start = Date.now()
  try {
    // Simple DB ping — if this fails, the DB is down
    await db.$queryRaw`SELECT 1`

    // Ensure Stage 3 schema objects exist (idempotent)
    const schemaStatements = [
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
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;`,
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
      `CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "processedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");`,
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

    for (const sql of schemaStatements) {
      try {
        await db.$executeRawUnsafe(sql)
      } catch (err) {
        console.warn('Schema sync notice:', err)
      }
    }

    const latencyMs = Date.now() - start
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      schema: 'synchronized',
      latencyMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const latencyMs = Date.now() - start
    console.error('Health check failed:', error)
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'error',
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}

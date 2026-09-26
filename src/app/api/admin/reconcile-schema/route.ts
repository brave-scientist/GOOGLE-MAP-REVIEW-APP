import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const sessionSecret = process.env.SESSION_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (sessionSecret && authHeader === `Bearer ${sessionSecret}`) return true

  return false
}

// GET /api/admin/reconcile-schema — Safe, read-only inspection of production schema
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Check migrations in _prisma_migrations
    const migrations = await db.$queryRawUnsafe<any[]>(
      'SELECT id, migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at ASC;'
    ).catch(() => [])

    // 2. Check physical tables in public schema
    const tables = await db.$queryRawUnsafe<any[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name ASC;"
    )
    const tableNames = tables.map(t => t.table_name)

    // 3. Inspect TeamInvitation details if present
    let teamInvitationColumns: any[] = []
    let teamInvitationIndexes: any[] = []
    let teamInvitationFks: any[] = []

    if (tableNames.includes('TeamInvitation')) {
      teamInvitationColumns = await db.$queryRawUnsafe<any[]>(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'TeamInvitation' ORDER BY ordinal_position;"
      )
      teamInvitationIndexes = await db.$queryRawUnsafe<any[]>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'TeamInvitation';"
      )
      teamInvitationFks = await db.$queryRawUnsafe<any[]>(
        `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints AS tc
         JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'TeamInvitation';`
      )
    }

    // 4. Test Prisma Client model access
    let teamInvitationQueryPass = false
    let accountQueryPass = false
    try {
      await db.teamInvitation.findMany({ take: 1 })
      teamInvitationQueryPass = true
    } catch {
      teamInvitationQueryPass = false
    }

    try {
      await db.account.findMany({ take: 1 })
      accountQueryPass = true
    } catch {
      accountQueryPass = false
    }

    return NextResponse.json({
      status: 'ok',
      totalTables: tableNames.length,
      hasTeamInvitationTable: tableNames.includes('TeamInvitation'),
      hasAccountTable: tableNames.includes('Account'),
      teamInvitationQueryPass,
      accountQueryPass,
      teamInvitationColumns: teamInvitationColumns.map(c => c.column_name),
      teamInvitationIndexes: teamInvitationIndexes.map(i => i.indexname),
      teamInvitationForeignKeys: teamInvitationFks.map(f => `${f.constraint_name} (${f.column_name} -> ${f.foreign_table_name})`),
      appliedMigrations: migrations.map(m => ({
        name: m.migration_name,
        finished: Boolean(m.finished_at),
        rolledBack: Boolean(m.rolled_back_at),
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Inspection failed' }, { status: 500 })
  }
}

// POST /api/admin/reconcile-schema — Deterministic, idempotent schema reconciliation
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ddlStatements = [
    // 1. Account table
    `CREATE TABLE IF NOT EXISTS "Account" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        "email" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");`,
    `DO $$ BEGIN
        ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null;
     END $$;`,

    // 2. TeamInvitation table
    `CREATE TABLE IF NOT EXISTS "TeamInvitation" (
        "id" TEXT NOT NULL,
        "orgId" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'STAFF',
        "tokenHash" TEXT NOT NULL,
        "invitedById" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "consumedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");`,
    `CREATE INDEX IF NOT EXISTS "TeamInvitation_orgId_email_idx" ON "TeamInvitation"("orgId", "email");`,
    `DO $$ BEGIN
        ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null;
     END $$;`,
    `DO $$ BEGIN
        ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null;
     END $$;`,

    // 3. Record migrations in _prisma_migrations if not already recorded
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260917_add_account_table') THEN
          INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (gen_random_uuid()::text, '7055a0dc751cd0cb3cfcf8ca56c1fc0600a66ff08fd1c20c77ef853cec10f15d', NOW(), '20260917_add_account_table', NULL, NULL, NOW(), 1);
        END IF;
     END $$;`,

    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260926_reconcile_team_invitation') THEN
          INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (gen_random_uuid()::text, 'reconcile_team_invitation_20260926', NOW(), '20260926_reconcile_team_invitation', NULL, NULL, NOW(), 1);
        END IF;
     END $$;`,
  ]

  const executionResults: Array<{ statement: string; status: string; error?: string }> = []
  for (const sql of ddlStatements) {
    try {
      await db.$executeRawUnsafe(sql)
      executionResults.push({ statement: sql.slice(0, 45).replace(/\n/g, ' ') + '...', status: 'OK' })
    } catch (err: any) {
      executionResults.push({ statement: sql.slice(0, 45).replace(/\n/g, ' ') + '...', status: 'WARN', error: err?.message })
    }
  }

  // Verify post-execution state
  const tables = await db.$queryRawUnsafe<any[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name ASC;"
  )
  const tableNames = tables.map(t => t.table_name)

  return NextResponse.json({
    success: true,
    hasTeamInvitation: tableNames.includes('TeamInvitation'),
    hasAccount: tableNames.includes('Account'),
    results: executionResults,
  })
}

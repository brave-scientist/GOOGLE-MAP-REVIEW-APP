import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Singleton Prisma client.
 *
 * Serverless / Vercel considerations:
 * - Each serverless function invocation is a fresh Node.js process; the global
 *   singleton prevents creating a new PrismaClient on every *module import*
 *   within the same invocation, but each cold-start still opens connections.
 * - connection_limit=1 is the correct setting for Supabase's transaction-mode
 *   PgBouncer / Supavisor: the pooler itself manages the real Postgres pool, so
 *   Prisma should hold at most one connection slot per serverless instance.
 * - pool_timeout=15 causes Prisma to fail fast rather than queue indefinitely
 *   when the pooler is saturated, enabling proper 503 detection.
 * - socket_timeout=20 prevents zombie connections from holding slots.
 *
 * Do NOT call $connect() or $disconnect() in route handlers — Prisma manages
 * the connection lifecycle automatically.
 */
function getDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) return undefined

  try {
    const parsed = new URL(rawUrl)
    // Serverless / Supavisor connection optimization:
    // Only set defaults if not already explicitly provided in the connection string
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '1')
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '15')
    }
    if (!parsed.searchParams.has('socket_timeout')) {
      parsed.searchParams.set('socket_timeout', '20')
    }
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true')
    }
    return parsed.toString()
  } catch {
    // If standard URL parsing fails on custom protocols, fallback to safe string manipulation
    if (rawUrl.includes('connection_limit')) {
      return rawUrl
    }
    const separator = rawUrl.includes('?') ? '&' : '?'
    return `${rawUrl}${separator}connection_limit=1&pool_timeout=15&socket_timeout=20&pgbouncer=true`
  }
}

const dbUrl = getDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
  })

if (globalForPrisma.prisma === undefined) {
  globalForPrisma.prisma = db
}
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

  // Only append params if the URL does not already contain them.
  // Supabase transaction-mode Supavisor: 1 connection per serverless instance,
  // 15 s pool timeout so saturation surfaces as a fast 503 (not a hung request).
  if (rawUrl.includes('connection_limit')) {
    return rawUrl
  }

  const separator = rawUrl.includes('?') ? '&' : '?'
  return `${rawUrl}${separator}connection_limit=1&pool_timeout=15&socket_timeout=20&pgbouncer=true`
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
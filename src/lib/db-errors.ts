import { NextResponse } from 'next/server'

/**
 * Detects whether an error originates from database connection pool saturation,
 * connection exhaustion, or serverless pooler timeouts.
 */
export function isDatabasePoolError(error: unknown): boolean {
  if (!error) return false

  const err = error as Record<string, any>
  const msg = typeof err.message === 'string' ? err.message : ''
  const name = typeof err.name === 'string' ? err.name : ''
  const code = typeof err.code === 'string' ? err.code : ''
  const lowerMsg = msg.toLowerCase()

  // Supabase PgBouncer / Supavisor session & transaction pooler saturation
  if (
    msg.includes('EMAXCONNSESSION') ||
    lowerMsg.includes('max clients reached') ||
    lowerMsg.includes('too many clients already') ||
    lowerMsg.includes('remaining connection slots are reserved') ||
    lowerMsg.includes('too many connections') ||
    lowerMsg.includes('connection limit') ||
    msg.includes('pool_size')
  ) {
    return true
  }

  // Prisma connection pool timeout / initialization exhaustion
  if (
    name === 'PrismaClientInitializationError' ||
    msg.includes('PrismaClientInitializationError') ||
    lowerMsg.includes('timed out fetching a new connection') ||
    lowerMsg.includes('timed out acquiring a connection') ||
    lowerMsg.includes('connection pool timeout') ||
    lowerMsg.includes('connector error')
  ) {
    return true
  }

  // Known Prisma database availability and pool exhaustion error codes:
  // P1001: Can't reach database server
  // P1002: The database server was reached but timed out
  // P1017: Server has closed the connection
  // P2024: Timed out acquiring a connection from the pool
  if (code === 'P1001' || code === 'P1002' || code === 'P1017' || code === 'P2024' || msg.includes('P2024')) {
    return true
  }

  return false
}

/**
 * Standardized HTTP 503 response for database connection pool saturation.
 */
export function createDatabasePoolResponse(context?: string): NextResponse {
  const errorMsg = context
    ? `Database connection limit reached: ${context}. Please retry in a few moments.`
    : 'Database connection limit reached. Please retry in a few moments.'

  return NextResponse.json(
    {
      error: errorMsg,
      code: 'DATABASE_POOL_SATURATED',
      message: 'The database connection pool is currently saturated. Please wait a few seconds and retry.',
      retryAfter: 3,
    },
    {
      status: 503,
      headers: {
        'Retry-After': '3',
      },
    }
  )
}

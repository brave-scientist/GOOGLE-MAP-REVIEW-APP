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

    const latencyMs = Date.now() - start
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
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


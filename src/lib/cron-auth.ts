import { NextRequest, NextResponse } from 'next/server'

/**
 * Enforces strict, fail-closed Bearer authentication for all cron jobs.
 *
 * Security Contract:
 * 1. CRON_SECRET missing or empty: HTTP 500 (fails closed in all environments).
 * 2. Authorization header missing: HTTP 401.
 * 3. Authorization header incorrect: HTTP 401.
 * 4. Authorization header matches Bearer <CRON_SECRET>: returns null (proceed).
 */
export function enforceCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || cronSecret.trim().length === 0) {
    console.error('CRON_SECRET is not configured. Rejecting cron invocation in all environments.')
    return NextResponse.json(
      { error: 'Cron service unconfigured: CRON_SECRET required' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing bearer token' },
      { status: 401 }
    )
  }

  return null
}

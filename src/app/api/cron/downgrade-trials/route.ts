import { NextRequest, NextResponse } from 'next/server'
import { downgradeExpiredTrials } from '@/lib/plan-enforcement'
import { enforceCronAuth } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

async function handleDowngrade(request: NextRequest) {
  // Enforce fail-closed Bearer auth in all environments
  const authError = enforceCronAuth(request)
  if (authError) return authError

  try {
    const result = await downgradeExpiredTrials()
    return NextResponse.json({
      success: true,
      downgraded: result.downgraded,
      message: result.downgraded > 0
        ? `${result.downgraded} organization(s) downgraded from trial to FREE`
        : 'No expired trials found',
    })
  } catch (error) {
    console.error('Trial downgrade error:', error)
    return NextResponse.json({ error: 'Failed to downgrade trials' }, { status: 500 })
  }
}

// GET /api/cron/downgrade-trials (Vercel Cron invokes via GET)
export async function GET(request: NextRequest) {
  return handleDowngrade(request)
}

// POST /api/cron/downgrade-trials (External schedulers invoke via POST)
export async function POST(request: NextRequest) {
  return handleDowngrade(request)
}

import { NextRequest, NextResponse } from 'next/server'
import { downgradeExpiredTrials } from '@/lib/plan-enforcement'

export const dynamic = 'force-dynamic'

async function handleDowngrade(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  // INFRA-002: Fail closed if CRON_SECRET is not configured or in production
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not configured in production. Rejecting cron invocation.')
      return NextResponse.json(
        { error: 'Cron service unconfigured: CRON_SECRET required' },
        { status: 500 }
      )
    }
  }

  // Verify Authorization Bearer header
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing bearer token' }, { status: 401 })
  }

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

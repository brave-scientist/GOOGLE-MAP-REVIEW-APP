import { NextRequest, NextResponse } from 'next/server'
import { downgradeExpiredTrials } from '@/lib/plan-enforcement'

export const dynamic = 'force-dynamic'

// POST /api/cron/downgrade-trials — Downgrade orgs with expired trials to FREE
// Can be called by a cron job (e.g. Vercel Cron, or external scheduler)
// Protect with a secret header in production
export async function POST(request: NextRequest) {
  // Simple auth: check for a cron secret header
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/review-us-page/sends?businessId=X — list past Review Us Page sends
// SEC-01: requires auth + verifies business ownership
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
  }

  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) return denied

  const sends = await db.reviewUsSend.findMany({
    where: { businessId },
    orderBy: { sentAt: 'desc' },
    take: 20,
    select: {
      id: true,
      channel: true,
      messageTemplate: true,
      reviewUsUrl: true,
      recipientCount: true,
      sentCount: true,
      skippedOptOutCount: true,
      failedCount: true,
      sentAt: true,
    },
  })

  return NextResponse.json({
    sends: sends.map(s => ({
      ...s,
      sentAt: s.sentAt.toISOString(),
    })),
  })
}

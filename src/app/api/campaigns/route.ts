import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const campaigns = await db.campaign.findMany({
      include: {
        business: { select: { name: true, industry: true } },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        businessName: c.business.name,
        channelMix: c.channelMix.split(','),
        status: c.status,
        trigger: c.trigger,
        sentCount: c.sentCount,
        clickCount: c.clickCount,
        conversionCount: c.conversionCount,
        clickRate: c.sentCount > 0 ? Math.round((c.clickCount / c.sentCount) * 100) : 0,
        conversionRate: c.clickCount > 0 ? Math.round((c.conversionCount / c.clickCount) * 100) : 0,
        totalConversionRate: c.sentCount > 0 ? Math.round((c.conversionCount / c.sentCount) * 100) : 0,
        requestCount: c._count.requests,
        createdAt: c.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Campaigns API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campaigns', details: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/export — Export reviews as CSV
export async function GET(request: NextRequest) {
  // SEC-01: require auth + STARTER plan + org scoping
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'reviews'
    const businessId = searchParams.get('businessId')

    // SEC-01: if businessId specified, verify ownership
    if (businessId && businessId !== 'all') {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    if (type === 'reviews') {
      const where = businessId && businessId !== 'all'
        ? { businessId }
        : { businessId: { in: ctx.businessIds } }
      const reviews = await db.review.findMany({
        where,
        include: { business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const rows = [
        ['ID', 'Author', 'Rating', 'Source', 'Title', 'Text', 'Sentiment', 'Topics', 'Business', 'Draft Status', 'Reply Text', 'Replied At', 'Created At'].join(','),
        ...reviews.map(r => [
          r.id,
          `"${r.author.replace(/"/g, '""')}"`,
          r.rating,
          r.source,
          `"${(r.title || '').replace(/"/g, '""')}"`,
          `"${r.text.replace(/"/g, '""')}"`,
          r.sentimentScore || '',
          `"${r.topics || ''}"`,
          `"${r.business.name.replace(/"/g, '""')}"`,
          r.draftStatus,
          `"${(r.replyText || '').replace(/"/g, '""')}"`,
          r.repliedAt?.toISOString() || '',
          r.createdAt.toISOString(),
        ].join(',')),
      ]

      const csv = rows.join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="reviews-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    if (type === 'campaigns') {
      const campaigns = await db.campaign.findMany({
        where: { businessId: { in: ctx.businessIds } },
        include: { business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const rows = [
        ['ID', 'Name', 'Business', 'Status', 'Channel Mix', 'Sent', 'Clicked', 'Converted', 'Created At'].join(','),
        ...campaigns.map(c => [
          c.id,
          `"${c.name.replace(/"/g, '""')}"`,
          `"${c.business.name.replace(/"/g, '""')}"`,
          c.status,
          c.channelMix,
          c.sentCount,
          c.clickCount,
          c.conversionCount,
          c.createdAt.toISOString(),
        ].join(',')),
      ]

      const csv = rows.join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="campaigns-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export', details: String(error) },
      { status: 500 }
    )
  }
}

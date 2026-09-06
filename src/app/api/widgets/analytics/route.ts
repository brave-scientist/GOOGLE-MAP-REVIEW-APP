import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

/**
 * GET /api/widgets/analytics — Tenant-scoped analytics for review widgets.
 *
 * Query params:
 *   businessId (optional) — scope to a specific business in tenant's org.
 *
 * Returns:
 *   - availableLayouts: number of supported layout templates in /widget.js (canonical)
 *   - activeWidgets: number of active layouts configured (legacy compatibility)
 *   - totalReviews: reviews eligible for widget display
 *   - avgRating: business average rating
 *   - ratingsBreakdown: distribution across 5-star rating bands
 *   - layouts: array of supported widget layouts with honest operational metadata
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    let scopedBusinessIds: string[] = ctx.businessIds
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      scopedBusinessIds = [businessId]
    }

    if (scopedBusinessIds.length === 0) {
      return NextResponse.json({
        hasBusiness: false,
        availableLayouts: 0,
        activeWidgets: 0,
        totalReviews: 0,
        avgRating: 0,
        layouts: [],
        telemetryStatus: 'not_configured',
      })
    }

    // Query real businesses scoped strictly to tenant
    const businesses = await db.business.findMany({
      where: { id: { in: scopedBusinessIds } },
      select: { id: true, name: true },
    })

    if (businesses.length === 0) {
      return NextResponse.json({
        hasBusiness: false,
        availableLayouts: 0,
        activeWidgets: 0,
        totalReviews: 0,
        avgRating: 0,
        layouts: [],
        telemetryStatus: 'not_configured',
      })
    }

    // Database-level aggregation for high-performance and scalability (DEF-WIDGET-02)
    const [reviewStats, ratingBuckets] = await Promise.all([
      db.review.aggregate({
        where: { businessId: { in: scopedBusinessIds } },
        _count: { id: true },
        _avg: { rating: true },
      }),
      db.review.groupBy({
        by: ['rating'],
        where: { businessId: { in: scopedBusinessIds } },
        _count: { id: true },
      }),
    ])

    const totalReviews = reviewStats._count.id || 0
    const avgRating = reviewStats._avg.rating
      ? Math.round(reviewStats._avg.rating * 10) / 10
      : 0

    // Compute truthful rating breakdown from DB group
    const ratingsBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const b of ratingBuckets) {
      if (b.rating >= 1 && b.rating <= 5) {
        ratingsBreakdown[b.rating] = b._count.id
      }
    }

    const highStarCount = (ratingsBreakdown[4] || 0) + (ratingsBreakdown[5] || 0)

    // Supported layouts configured for active business
    const layouts = [
      {
        id: 'carousel',
        name: 'Carousel Layout',
        type: 'carousel',
        status: 'READY',
        eligibleReviews: highStarCount,
        description: 'Auto-rotating interactive review reel',
      },
      {
        id: 'grid',
        name: 'Grid Layout',
        type: 'grid',
        status: 'READY',
        eligibleReviews: highStarCount,
        description: 'Multi-column masonry review cards',
      },
      {
        id: 'badge',
        name: 'Floating Badge',
        type: 'badge',
        status: 'READY',
        eligibleReviews: totalReviews,
        description: 'Compact star rating trust badge',
      },
      {
        id: 'slider',
        name: 'Horizontal Slider',
        type: 'slider',
        status: 'READY',
        eligibleReviews: highStarCount,
        description: 'Swipeable horizontal testimonial cards',
      },
    ]

    return NextResponse.json({
      hasBusiness: true,
      businessId: scopedBusinessIds[0],
      businessName: businesses[0].name,
      availableLayouts: 4, // Canonical semantic field: 4 responsive layout templates supported in /widget.js
      activeWidgets: 4, // Legacy compatibility field
      totalReviews,
      avgRating,
      ratingsBreakdown,
      layouts,
      telemetryStatus: 'not_configured',
    })
  } catch (error) {
    console.error('Widget Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch widget analytics' },
      { status: 500 }
    )
  }
}

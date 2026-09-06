import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/reports/executive — Real database-backed executive analytics & velocity
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessIdParam = searchParams.get('businessId')

    let scopedBusinessIds: string[] = []
    let activeBusinessName: string | null = null

    if (businessIdParam) {
      const denied = assertBusinessOwnership(ctx, businessIdParam)
      if (denied) return denied

      scopedBusinessIds = [businessIdParam]

      const business = await db.business.findUnique({
        where: { id: businessIdParam },
        select: { name: true },
      })
      activeBusinessName = business?.name || null
    } else {
      scopedBusinessIds = ctx.businessIds
    }

    // Fail-closed if no business exists
    if (scopedBusinessIds.length === 0) {
      return NextResponse.json({
        hasBusiness: false,
        businessId: null,
        businessName: null,
        isOrgWide: true,
        totalReviews: 0,
        avgRating: 0,
        responseRate: 0,
        customerNps: 0,
        ratingsBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        periodComparison: {
          totalReviewsChange: '+0%',
          avgRatingChange: '+0.0',
          responseRateChange: '+0%',
          npsChange: '+0',
        },
        velocity: [],
        summary: 'No active locations configured',
      })
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000)

    // Parallel execution of database aggregation primitives
    const [
      overallStats,
      ratingBuckets,
      repliedCount,
      current30DaysStats,
      current30DaysReplied,
      prior30DaysStats,
      prior30DaysReplied,
      velocityReviews,
    ] = await Promise.all([
      // 1. Overall stats
      db.review.aggregate({
        where: { businessId: { in: scopedBusinessIds } },
        _count: { id: true },
        _avg: { rating: true },
      }),
      // 2. Rating breakdown for NPS
      db.review.groupBy({
        by: ['rating'],
        where: { businessId: { in: scopedBusinessIds } },
        _count: { id: true },
      }),
      // 3. Replied reviews count
      db.review.count({
        where: {
          businessId: { in: scopedBusinessIds },
          OR: [
            { draftStatus: 'POSTED' },
            { repliedAt: { not: null } },
            { replyText: { not: null } },
          ],
        },
      }),
      // 4. Current 30 days review stats
      db.review.aggregate({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
        _avg: { rating: true },
      }),
      // 5. Current 30 days replied
      db.review.count({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: thirtyDaysAgo },
          OR: [
            { draftStatus: 'POSTED' },
            { repliedAt: { not: null } },
            { replyText: { not: null } },
          ],
        },
      }),
      // 6. Prior 30-60 days review stats
      db.review.aggregate({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
        _count: { id: true },
        _avg: { rating: true },
      }),
      // 7. Prior 30-60 days replied
      db.review.count({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          OR: [
            { draftStatus: 'POSTED' },
            { repliedAt: { not: null } },
            { replyText: { not: null } },
          ],
        },
      }),
      // 8. 12-week velocity reviews
      db.review.findMany({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: twelveWeeksAgo },
        },
        select: {
          id: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const totalReviews = overallStats._count.id || 0
    const avgRating = overallStats._avg.rating ? Math.round(overallStats._avg.rating * 10) / 10 : 0
    const responseRate = totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0

    // Compute ratings breakdown & NPS (Net Promoter Score proxy from 1-5★)
    // Promoters = 5★, Passives = 4★, Detractors = 1-3★
    const ratingsBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const b of ratingBuckets) {
      if (b.rating >= 1 && b.rating <= 5) {
        ratingsBreakdown[b.rating] = b._count.id
      }
    }

    const promoters = ratingsBreakdown[5] || 0
    const detractors = (ratingsBreakdown[1] || 0) + (ratingsBreakdown[2] || 0) + (ratingsBreakdown[3] || 0)
    const customerNps = totalReviews > 0 ? Math.round(((promoters - detractors) / totalReviews) * 100) : 0

    // Compute 30-day period comparisons
    const curTotal = current30DaysStats._count.id || 0
    const priorTotal = prior30DaysStats._count.id || 0
    let totalReviewsChange = '+0%'
    if (priorTotal > 0) {
      const pct = Math.round(((curTotal - priorTotal) / priorTotal) * 100)
      totalReviewsChange = pct >= 0 ? `+${pct}%` : `${pct}%`
    } else if (curTotal > 0) {
      totalReviewsChange = `+100%`
    }

    const curAvg = current30DaysStats._avg.rating || 0
    const priorAvg = prior30DaysStats._avg.rating || 0
    let avgRatingChange = '+0.0'
    if (curAvg > 0 && priorAvg > 0) {
      const diff = Math.round((curAvg - priorAvg) * 10) / 10
      avgRatingChange = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)
    }

    const curResponseRate = curTotal > 0 ? Math.round((current30DaysReplied / curTotal) * 100) : 0
    const priorResponseRate = priorTotal > 0 ? Math.round((prior30DaysReplied / priorTotal) * 100) : 0
    const responseDiff = curResponseRate - priorResponseRate
    const responseRateChange = responseDiff >= 0 ? `+${responseDiff}%` : `${responseDiff}%`

    // Velocity: 12 weekly buckets (7-day windows)
    // Week 12 is current week, Week 1 is 11-12 weeks ago
    const velocity: Array<{
      weekNumber: number
      weekLabel: string
      startDate: string
      endDate: string
      count: number
    }> = []

    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
    for (let i = 11; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - i * MS_PER_WEEK)
      const weekStart = new Date(now.getTime() - (i + 1) * MS_PER_WEEK)

      const weekReviews = velocityReviews.filter(
        r => r.createdAt >= weekStart && r.createdAt < weekEnd
      )

      const startMonth = weekStart.toLocaleString('en-US', { month: 'short' })
      const endMonth = weekEnd.toLocaleString('en-US', { month: 'short' })
      const startDay = weekStart.getDate()
      const endDay = weekEnd.getDate()

      const label = startMonth === endMonth
        ? `${startMonth} ${startDay}-${endDay}`
        : `${startMonth} ${startDay} - ${endMonth} ${endDay}`

      velocity.push({
        weekNumber: 12 - i,
        weekLabel: `W${12 - i}`,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
        count: weekReviews.length,
      })
    }

    // Determine summary trend
    const recentVelocitySum = velocity.slice(-4).reduce((sum, w) => sum + w.count, 0)
    const priorVelocitySum = velocity.slice(-8, -4).reduce((sum, w) => sum + w.count, 0)
    let trendBadge = 'Stable'
    if (recentVelocitySum > priorVelocitySum) {
      trendBadge = 'Trending up'
    } else if (recentVelocitySum < priorVelocitySum && recentVelocitySum > 0) {
      trendBadge = 'Pacing down'
    } else if (totalReviews === 0) {
      trendBadge = 'No reviews'
    }

    return NextResponse.json({
      hasBusiness: true,
      businessId: businessIdParam || null,
      businessName: activeBusinessName,
      isOrgWide: !businessIdParam,
      totalReviews,
      avgRating,
      responseRate,
      customerNps,
      ratingsBreakdown,
      periodComparison: {
        totalReviewsChange,
        avgRatingChange,
        responseRateChange,
        npsChange: totalReviewsChange,
      },
      velocity,
      trendBadge,
      summary: totalReviews > 0
        ? `${totalReviews} total reviews analyzed with an average rating of ${avgRating.toFixed(1)}★ across ${scopedBusinessIds.length} location(s).`
        : 'No reviews recorded yet for this location.',
    })
  } catch (error) {
    console.error('Executive reports analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to compute executive analytics' },
      { status: 500 }
    )
  }
}

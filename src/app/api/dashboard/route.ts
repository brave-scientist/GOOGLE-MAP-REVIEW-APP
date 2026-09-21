import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { getBusinessDashboardReadiness } from '@/lib/readiness'
import { isDatabasePoolError, createDatabasePoolResponse } from '@/lib/db-errors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // SEC-01: scope every query to the user's org
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    if (ctx.businessIds.length === 0) {
      return NextResponse.json({
        businesses: [],
        stats: { totalReviews: 0, avgRating: 0, pendingReplies: 0, conversionRate: 0 },
        recentReviews: [],
        ratingDistribution: [],
        sentimentTrend: [],
        dashboardReadiness: await getBusinessDashboardReadiness(null, Boolean(ctx.user)),
      })
    }

    const { searchParams } = new URL(request.url)
    const businessIdParam = searchParams.get('businessId')

    let scopedBusinessIds = ctx.businessIds
    if (businessIdParam && businessIdParam !== 'all') {
      const denied = assertBusinessOwnership(ctx, businessIdParam)
      if (denied) return denied
      scopedBusinessIds = [businessIdParam]
    }

    const businesses = await db.business.findMany({
      where: { id: { in: ctx.businessIds } },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const totalReviews = await db.review.count({
      where: { businessId: { in: scopedBusinessIds } },
    })
    const avgRatingAgg = await db.review.aggregate({
      _avg: { rating: true },
      where: { businessId: { in: scopedBusinessIds } },
    })
    const pendingReplies = await db.review.count({
      where: { businessId: { in: scopedBusinessIds }, draftStatus: 'PENDING' },
    })

    const campaignStats = await db.campaign.aggregate({
      _sum: { sentCount: true, conversionCount: true },
      where: { businessId: { in: scopedBusinessIds } },
    })
    const conversionRate = campaignStats._sum.sentCount && campaignStats._sum.sentCount > 0
      ? Math.round((campaignStats._sum.conversionCount! / campaignStats._sum.sentCount) * 100)
      : 0

    const ratingBuckets = await db.review.groupBy({
      by: ['rating'],
      _count: true,
      orderBy: { rating: 'asc' },
      where: { businessId: { in: scopedBusinessIds } },
    })
    const ratingDistribution = [1, 2, 3, 4, 5].map(r => ({
      rating: r,
      count: ratingBuckets.find(b => b.rating === r)?._count || 0,
    }))

    const eightWeeksAgo = new Date()
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
    const recentReviewsData = await db.review.findMany({
      where: {
        businessId: { in: scopedBusinessIds },
        createdAt: { gte: eightWeeksAgo },
      },
      select: { createdAt: true, sentimentScore: true, rating: true },
    })
    const weeks: { week: string; avgSentiment: number; reviewCount: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - i * 7 - 7)
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() - i * 7)
      const weekReviews = recentReviewsData.filter(r => r.createdAt >= weekStart && r.createdAt < weekEnd)
      const avgSentiment = weekReviews.length > 0
        ? weekReviews.reduce((sum, r) => sum + (r.sentimentScore || 0), 0) / weekReviews.length
        : 0
      weeks.push({
        week: `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`,
        avgSentiment: Math.round(avgSentiment * 100) / 100,
        reviewCount: weekReviews.length,
      })
    }

    const recent = await db.review.findMany({
      where: { businessId: { in: scopedBusinessIds } },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { business: { select: { name: true } } },
    })

    // Compute authoritative dashboard readiness for the scoped business
    const primaryBiz = businesses.find(b => scopedBusinessIds.includes(b.id)) || businesses[0]
    const dashboardReadiness = await getBusinessDashboardReadiness(primaryBiz, Boolean(ctx.user))

    return NextResponse.json({
      businesses: businesses.map(b => ({
        id: b.id,
        name: b.name,
        industry: b.industry,
        address: b.address,
        phone: b.phone,
        timezone: b.timezone,
        avgRating: b.avgRating,
        reviewCount: b.reviewCount,
        googleLocationVerified: b.googleLocationVerified,
        googleSyncStatus: b.googleSyncStatus,
        googleSyncedAt: b.googleSyncedAt?.toISOString() || null,
      })),
      stats: {
        totalReviews,
        avgRating: Math.round((avgRatingAgg._avg.rating || 0) * 10) / 10,
        pendingReplies,
        conversionRate,
      },
      recentReviews: recent.map(r => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        text: r.text,
        source: r.source,
        businessName: r.business.name,
        draftStatus: r.draftStatus,
        createdAt: r.createdAt.toISOString(),
      })),
      ratingDistribution,
      sentimentTrend: weeks,
      dashboardReadiness,
    })
  } catch (error: unknown) {
    console.error('Dashboard API error:', error)
    if (isDatabasePoolError(error)) {
      return createDatabasePoolResponse()
    }
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}


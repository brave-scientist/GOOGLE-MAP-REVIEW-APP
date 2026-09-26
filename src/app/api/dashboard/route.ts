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

  const execute = async () => {
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
    const businessesOnly = searchParams.get('businessesOnly') === 'true'

    // Lightweight path for BusinessProvider: return only business rows, skipping heavy review aggregations
    if (businessesOnly) {
      const businesses = await db.business.findMany({
        where: { id: { in: ctx.businessIds } },
        select: {
          id: true,
          name: true,
          industry: true,
          address: true,
          phone: true,
          timezone: true,
          avgRating: true,
          reviewCount: true,
          googleLocationVerified: true,
          googleSyncStatus: true,
          googleSyncedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      return NextResponse.json({
        businesses: businesses.map(b => ({
          ...b,
          googleSyncedAt: b.googleSyncedAt?.toISOString() || null,
        })),
        stats: { totalReviews: 0, avgRating: 0, pendingReplies: 0, conversionRate: 0 },
        recentReviews: [],
        ratingDistribution: [],
        sentimentTrend: [],
      })
    }

    let scopedBusinessIds = ctx.businessIds
    if (businessIdParam && businessIdParam !== 'all') {
      const denied = assertBusinessOwnership(ctx, businessIdParam)
      if (denied) return denied
      scopedBusinessIds = [businessIdParam]
    }

    // Fetch businesses without loading all reviews (avoid N+1)
    const businesses = await db.business.findMany({
      where: { id: { in: ctx.businessIds } },
      select: {
        id: true,
        name: true,
        industry: true,
        address: true,
        phone: true,
        timezone: true,
        avgRating: true,
        reviewCount: true,
        googleLocationVerified: true,
        googleSyncStatus: true,
        googleSyncedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate stats in parallel — single connection round-trip per query
    const eightWeeksAgo = new Date()
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

    const [
      reviewAgg,
      pendingReplies,
      campaignStats,
      ratingBuckets,
      recentReviewsData,
      recent,
    ] = await Promise.all([
      db.review.aggregate({
        _count: { id: true },
        _avg: { rating: true },
        where: { businessId: { in: scopedBusinessIds } },
      }),
      db.review.count({
        where: { businessId: { in: scopedBusinessIds }, draftStatus: 'PENDING' },
      }),
      db.campaign.aggregate({
        _sum: { sentCount: true, conversionCount: true },
        where: { businessId: { in: scopedBusinessIds } },
      }),
      db.review.groupBy({
        by: ['rating'],
        _count: true,
        orderBy: { rating: 'asc' },
        where: { businessId: { in: scopedBusinessIds } },
      }),
      db.review.findMany({
        where: {
          businessId: { in: scopedBusinessIds },
          createdAt: { gte: eightWeeksAgo },
        },
        select: { createdAt: true, sentimentScore: true, rating: true },
      }),
      db.review.findMany({
        where: { businessId: { in: scopedBusinessIds } },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          author: true,
          rating: true,
          text: true,
          source: true,
          externalId: true,
          draftStatus: true,
          createdAt: true,
          business: { select: { name: true } },
        },
      }),
    ])

    const conversionRate = campaignStats._sum.sentCount && campaignStats._sum.sentCount > 0
      ? Math.round((campaignStats._sum.conversionCount! / campaignStats._sum.sentCount) * 100)
      : 0

    const ratingDistribution = [1, 2, 3, 4, 5].map(r => ({
      rating: r,
      count: ratingBuckets.find(b => b.rating === r)?._count || 0,
    }))

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
        totalReviews: reviewAgg._count.id,
        avgRating: Math.round((reviewAgg._avg.rating || 0) * 10) / 10,
        pendingReplies,
        conversionRate,
      },
      recentReviews: recent.map(r => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        text: r.text,
        // Surface INTERNAL (demo) reviews with INTERNAL badge — never GOOGLE
        source: r.source === 'INTERNAL' && r.externalId?.startsWith('seed_') ? 'SAMPLE' : r.source,
        businessName: r.business.name,
        draftStatus: r.draftStatus,
        createdAt: r.createdAt.toISOString(),
      })),
      ratingDistribution,
      sentimentTrend: weeks,
      dashboardReadiness,
    })
  }

  try {
    return await execute()
  } catch (error: unknown) {
    if (isDatabasePoolError(error)) {
      // Single bounded transient retry after 250ms delay
      try {
        await new Promise((resolve) => setTimeout(resolve, 250))
        return await execute()
      } catch (retryErr: unknown) {
        if (isDatabasePoolError(retryErr)) {
          return createDatabasePoolResponse()
        }
        throw retryErr
      }
    }

    console.error('[Dashboard API] error:', {
      route: '/api/dashboard',
      errorClass: (error as Error)?.name || 'UnknownError',
    })
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

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
      })
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
      where: { businessId: { in: ctx.businessIds } },
    })
    const avgRatingAgg = await db.review.aggregate({
      _avg: { rating: true },
      where: { businessId: { in: ctx.businessIds } },
    })
    const pendingReplies = await db.review.count({
      where: { businessId: { in: ctx.businessIds }, draftStatus: 'PENDING' },
    })

    const campaignStats = await db.campaign.aggregate({
      _sum: { sentCount: true, conversionCount: true },
      where: { businessId: { in: ctx.businessIds } },
    })
    const conversionRate = campaignStats._sum.sentCount && campaignStats._sum.sentCount > 0
      ? Math.round((campaignStats._sum.conversionCount! / campaignStats._sum.sentCount) * 100)
      : 0

    const ratingBuckets = await db.review.groupBy({
      by: ['rating'],
      _count: true,
      orderBy: { rating: 'asc' },
      where: { businessId: { in: ctx.businessIds } },
    })
    const ratingDistribution = [1, 2, 3, 4, 5].map(r => ({
      rating: r,
      count: ratingBuckets.find(b => b.rating === r)?._count || 0,
    }))

    const eightWeeksAgo = new Date()
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
    const recentReviewsData = await db.review.findMany({
      where: {
        businessId: { in: ctx.businessIds },
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
      where: { businessId: { in: ctx.businessIds } },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { business: { select: { name: true } } },
    })

    return NextResponse.json({
      businesses: businesses.map(b => ({
        id: b.id,
        name: b.name,
        industry: b.industry,
        avgRating: b.avgRating,
        reviewCount: b.reviewCount,
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
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}

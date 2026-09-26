import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isDatabasePoolError, createDatabasePoolResponse } from '@/lib/db-errors'

export const dynamic = 'force-dynamic'

// GET /api/agency — Fetch real client businesses from DB
export async function GET(request: NextRequest) {
  // SEC-01: require auth + ENTERPRISE plan + org scoping
  const ctx = await getTenantContext(request, 'ENTERPRISE')
  if (ctx instanceof NextResponse) return ctx

  try {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Fetch businesses WITHOUT loading all reviews (avoid N+1 full-table scan).
    // Use pre-computed avgRating/reviewCount columns plus targeted aggregates.
    const businesses = await db.business.findMany({
      where: { orgId: ctx.orgId },
      select: {
        id: true,
        name: true,
        industry: true,
        avgRating: true,
        reviewCount: true,
        createdAt: true,
        // Count only posted-draft reviews for response rate — bounded aggregation
        reviews: {
          where: { createdAt: { gte: weekAgo } },
          select: { rating: true, draftStatus: true, createdAt: true },
          take: 100, // bound: only care about velocity, not full history
        },
      },
      orderBy: { avgRating: 'desc' },
    })

    // Count posted (replied) reviews per business in one query instead of loading all reviews
    const businessIds = businesses.map(b => b.id)
    const postedCounts = await db.review.groupBy({
      by: ['businessId'],
      _count: { id: true },
      where: {
        businessId: { in: businessIds },
        draftStatus: 'POSTED',
      },
    })
    const postedMap = new Map(postedCounts.map(r => [r.businessId, r._count.id]))

    const clients = businesses.map(b => {
      const recentReviews = b.reviews
      const replied = postedMap.get(b.id) || 0
      const responseRate = b.reviewCount > 0 ? Math.round((replied / b.reviewCount) * 100) : 0

      const ratingScore = (b.avgRating / 5) * 40
      const velocityScore = Math.min(recentReviews.length / 10, 1) * 30
      const responseScore = (responseRate / 100) * 30
      const healthScore = Math.round(ratingScore + velocityScore + responseScore)

      const status = healthScore >= 60 ? 'active' : 'at-risk'
      const plan = b.reviewCount > 200 ? 'Enterprise' : b.reviewCount > 100 ? 'Pro' : 'Starter'

      return {
        id: b.id,
        name: b.name,
        industry: b.industry || 'business',
        plan,
        rating: Math.round(b.avgRating * 10) / 10,
        reviews: b.reviewCount,
        reviewVelocity: recentReviews.length,
        healthScore,
        status,
        lastActive: recentReviews[0]?.createdAt?.toISOString() || b.createdAt.toISOString(),
      }
    })

    const avgHealth = clients.length > 0 ? Math.round(clients.reduce((sum, c) => sum + c.healthScore, 0) / clients.length) : 0
    const atRisk = clients.filter(c => c.status === 'at-risk').length
    const totalReviews = clients.reduce((sum, c) => sum + c.reviews, 0)
    const avgRating = clients.length > 0
      ? Math.round((clients.reduce((sum, c) => sum + c.rating, 0) / clients.length) * 10) / 10
      : 0

    return NextResponse.json({
      clients,
      stats: {
        totalClients: clients.length,
        avgRating,
        avgHealth,
        atRisk,
        totalReviews,
      },
    })
  } catch (error) {
    if (isDatabasePoolError(error)) {
      return createDatabasePoolResponse()
    }
    console.error('[Agency API] error:', {
      route: '/api/agency',
      errorClass: (error as Error)?.name || 'UnknownError',
    })
    return NextResponse.json(
      { error: 'Failed to fetch agency data' },
      { status: 500 }
    )
  }
}

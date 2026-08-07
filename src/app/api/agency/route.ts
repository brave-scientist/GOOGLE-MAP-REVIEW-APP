import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/agency — Fetch real client businesses from DB
export async function GET() {
  try {
    const businesses = await db.business.findMany({
      include: {
        reviews: {
          select: { rating: true, createdAt: true, draftStatus: true },
        },
      },
      orderBy: { avgRating: 'desc' },
    })

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const clients = businesses.map(b => {
      const reviews = b.reviews
      const recentReviews = reviews.filter(r => r.createdAt >= weekAgo)
      const replied = reviews.filter(r => r.draftStatus === 'POSTED').length
      const responseRate = reviews.length > 0 ? Math.round((replied / reviews.length) * 100) : 0

      const ratingScore = (b.avgRating / 5) * 40
      const velocityScore = Math.min(recentReviews.length / 10, 1) * 30
      const responseScore = (responseRate / 100) * 30
      const healthScore = Math.round(ratingScore + velocityScore + responseScore)

      const status = healthScore >= 60 ? 'active' : 'at-risk'
      const plan = b.reviewCount > 200 ? 'Enterprise' : b.reviewCount > 100 ? 'Pro' : 'Starter'
      const mrr = plan === 'Enterprise' ? 299 : plan === 'Pro' ? 99 : 49

      return {
        id: b.id,
        name: b.name,
        industry: b.industry || 'business',
        plan,
        mrr,
        rating: Math.round(b.avgRating * 10) / 10,
        reviews: b.reviewCount,
        reviewVelocity: recentReviews.length,
        healthScore,
        status,
        lastActive: recentReviews[0]?.createdAt?.toISOString() || b.createdAt.toISOString(),
      }
    })

    const totalMRR = clients.reduce((sum, c) => sum + c.mrr, 0)
    const avgHealth = clients.length > 0 ? Math.round(clients.reduce((sum, c) => sum + c.healthScore, 0) / clients.length) : 0
    const atRisk = clients.filter(c => c.status === 'at-risk').length
    const totalReviews = clients.reduce((sum, c) => sum + c.reviews, 0)

    return NextResponse.json({
      clients,
      stats: {
        totalClients: clients.length,
        totalMRR,
        avgHealth,
        atRisk,
        totalReviews,
      },
    })
  } catch (error) {
    console.error('Agency API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agency data', details: String(error) },
      { status: 500 }
    )
  }
}

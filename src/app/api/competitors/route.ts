import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/competitors — list competitors for a business/tenant
export async function GET(request: NextRequest) {
  // SEC-01: require auth + PRO plan
  const ctx = await getTenantContext(request, 'PRO')
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
      return NextResponse.json({ competitors: [] })
    }

    // Query real competitors scoped to tenant businesses
    const competitors = await db.competitor.findMany({
      where: {
        businessId: { in: scopedBusinessIds },
      },
      include: {
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Format competitors with computed trends / velocities
    const formatted = competitors.map(c => {
      let ratingTrend = 0
      let reviewVelocity = 0

      if (c.snapshots.length >= 2) {
        const latest = c.snapshots[0]
        const previous = c.snapshots[1]
        ratingTrend = Math.round((latest.rating - previous.rating) * 10) / 10
        reviewVelocity = Math.max(0, latest.reviewCount - previous.reviewCount)
      } else if (c.snapshots.length === 1) {
        ratingTrend = 0
        reviewVelocity = 0
      }

      return {
        id: c.id,
        businessId: c.businessId,
        name: c.name,
        googleMapsUrl: c.googleMapsUrl,
        placeId: c.placeId,
        rating: c.rating,
        ratingTrend,
        reviews: c.reviewCount,
        reviewCount: c.reviewCount,
        reviewVelocity,
        responseRate: Math.round(c.responseRate),
        sentiment: c.sentimentScore ?? 0.5,
        sentimentScore: c.sentimentScore ?? 0.5,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }
    })

    // Compute business metrics and authentic strategy recommendations if scoped to a single business
    let businessData: {
      id: string
      name: string
      avgRating: number
      reviewCount: number
      responseRate: number
      reviewVelocity: number
    } | null = null

    let benchmark: {
      yourRank: number
      totalTracked: number
      ratingGap: number
      marketAvgRating: number
      marketAvgVelocity: number
      marketAvgResponseRate: number
    } | null = null

    let alert: {
      type: 'warning' | 'info' | 'success'
      competitorName: string
      title: string
      message: string
      actionText: string
      actionType: string
    } | null = null

    const suggestions: Array<{
      priority: 'High' | 'Medium' | 'Low'
      title: string
      desc: string
      impact: string
      actionType?: string
      actionLabel?: string
    }> = []

    if (scopedBusinessIds.length === 1) {
      const primaryBizId = scopedBusinessIds[0]
      const biz = await db.business.findUnique({
        where: { id: primaryBizId },
        select: {
          id: true,
          name: true,
          avgRating: true,
          reviewCount: true,
          industry: true,
        },
      })

      if (biz) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
        const [recentReviewsCount, repliedCount] = await Promise.all([
          db.review.count({
            where: {
              businessId: primaryBizId,
              createdAt: { gte: sevenDaysAgo },
            },
          }),
          db.review.count({
            where: {
              businessId: primaryBizId,
              replyText: { not: null },
            },
          }),
        ])

        const totalReviews = biz.reviewCount || 0
        const bizResponseRate = totalReviews > 0 ? Math.min(100, Math.round((repliedCount / totalReviews) * 100)) : 0
        const bizVelocity = Math.max(recentReviewsCount, Math.round(totalReviews / 20))

        businessData = {
          id: biz.id,
          name: biz.name,
          avgRating: biz.avgRating ? Math.round(biz.avgRating * 10) / 10 : 0,
          reviewCount: totalReviews,
          responseRate: bizResponseRate,
          reviewVelocity: bizVelocity,
        }

        if (formatted.length > 0) {
          const compCount = formatted.length
          const avgCompRating = Math.round((formatted.reduce((s, c) => s + c.rating, 0) / compCount) * 10) / 10
          const avgCompVelocity = Math.round(formatted.reduce((s, c) => s + c.reviewVelocity, 0) / compCount)
          const avgCompResponseRate = Math.round(formatted.reduce((s, c) => s + c.responseRate, 0) / compCount)
          const ratingGap = Math.round(((biz.avgRating || 0) - avgCompRating) * 10) / 10

          const topVelocityComp = [...formatted].sort((a, b) => b.reviewVelocity - a.reviewVelocity)[0]
          const topRatingComp = [...formatted].sort((a, b) => b.rating - a.rating)[0]

          const yourRank = formatted.filter(c => c.rating > (biz.avgRating || 0)).length + 1

          benchmark = {
            yourRank,
            totalTracked: compCount + 1,
            ratingGap,
            marketAvgRating: avgCompRating,
            marketAvgVelocity: avgCompVelocity,
            marketAvgResponseRate: avgCompResponseRate,
          }

          // Authentic Alert based on real competitor metrics
          if (topVelocityComp && topVelocityComp.reviewVelocity > bizVelocity && topVelocityComp.reviewVelocity >= 4) {
            alert = {
              type: 'warning',
              competitorName: topVelocityComp.name,
              title: `${topVelocityComp.name} review velocity is outpacing your business`,
              message: `${topVelocityComp.name}'s review velocity is currently ${topVelocityComp.reviewVelocity} reviews/week vs your ${bizVelocity}/week. They may be running an active review campaign. Consider launching a campaign to maintain your local ranking.`,
              actionText: 'Launch campaign',
              actionType: 'campaign',
            }
          } else if (topRatingComp && topRatingComp.rating > (biz.avgRating || 0)) {
            const gap = (topRatingComp.rating - (biz.avgRating || 0)).toFixed(1)
            alert = {
              type: 'info',
              competitorName: topRatingComp.name,
              title: `${topRatingComp.name} leads your local market rating`,
              message: `${topRatingComp.name} holds a ${topRatingComp.rating}★ rating (${gap}★ above your business). Prioritize responding to reviews and service recovery to close the gap.`,
              actionText: 'Launch campaign',
              actionType: 'campaign',
            }
          }

          // Deterministic Strategy Suggestions grounded in real numbers
          if (topVelocityComp && bizVelocity < topVelocityComp.reviewVelocity) {
            suggestions.push({
              priority: 'High',
              title: `Close the review velocity gap with ${topVelocityComp.name}`,
              desc: `Your review pace (${bizVelocity}/wk) trails ${topVelocityComp.name} (${topVelocityComp.reviewVelocity}/wk). Initiating post-service SMS or email review requests can accelerate your review pace.`,
              impact: `+${Math.max(4, topVelocityComp.reviewVelocity - bizVelocity + 2)} reviews/week`,
              actionType: 'campaign',
              actionLabel: 'Launch campaign',
            })
          }

          if (topRatingComp && (biz.avgRating || 0) < topRatingComp.rating) {
            const ratingDiff = (topRatingComp.rating - (biz.avgRating || 0)).toFixed(1)
            suggestions.push({
              priority: 'High',
              title: `Close the ${ratingDiff}★ rating gap with ${topRatingComp.name}`,
              desc: `${topRatingComp.name} leads the local benchmark with a ${topRatingComp.rating}★ rating. Analyze negative feedback trends in your inbox to resolve recurring service bottlenecks.`,
              impact: '+0.2★ projected lift',
              actionType: 'inbox',
              actionLabel: 'View inbox',
            })
          }

          if (bizResponseRate < 90) {
            suggestions.push({
              priority: 'Medium',
              title: 'Elevate review response rate above 90%',
              desc: `Your current response rate is ${bizResponseRate}%. Reaching 90%+ improves Google Maps ranking signals and demonstrates dedicated customer care.`,
              impact: `+${90 - bizResponseRate}% response lift`,
              actionType: 'inbox',
              actionLabel: 'Go to inbox',
            })
          }

          if (topRatingComp && (biz.avgRating || 0) >= topRatingComp.rating) {
            suggestions.push({
              priority: 'Medium',
              title: `Leverage market-leading ${businessData?.avgRating ?? (biz.avgRating || 0)}★ rating`,
              desc: `Your business holds the highest rating among your tracked local competitors. Embed your live review badge on your website to drive higher conversion rates.`,
              impact: 'Conversion lift',
              actionType: 'widgets',
              actionLabel: 'Manage widgets',
            })
          }
        }
      }
    }

    return NextResponse.json({
      competitors: formatted,
      business: businessData,
      benchmark,
      alert,
      suggestions,
    })
  } catch (error) {
    console.error('Competitors API error:', error)
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500 })
  }
}

// POST /api/competitors — add a new competitor + initial snapshot
export async function POST(request: NextRequest) {
  // SEC-01: require auth + PRO plan
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { name, businessId, googleMapsUrl, rating, reviewCount, responseRate, sentimentScore } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Competitor name is required' }, { status: 400 })
    }

    // Determine target business
    let targetBusinessId = businessId
    if (targetBusinessId) {
      const denied = assertBusinessOwnership(ctx, targetBusinessId)
      if (denied) return denied
    } else {
      if (ctx.businessIds.length === 0) {
        return NextResponse.json({ error: 'No business found for this organization' }, { status: 400 })
      }
      targetBusinessId = ctx.businessIds[0]
    }

    const parsedRating = typeof rating === 'number' ? rating : (rating ? parseFloat(rating) : NaN)
    const parsedReviews = typeof reviewCount === 'number' ? reviewCount : (reviewCount ? parseInt(reviewCount, 10) : NaN)
    const parsedResponseRate = typeof responseRate === 'number' ? responseRate : (responseRate ? parseFloat(responseRate) : NaN)
    const parsedSentiment = typeof sentimentScore === 'number' ? sentimentScore : (sentimentScore ? parseFloat(sentimentScore) : NaN)

    const cleanRating = !isNaN(parsedRating) ? Math.min(5, Math.max(1, parsedRating)) : 4.2
    const cleanReviews = !isNaN(parsedReviews) ? Math.max(0, Math.floor(parsedReviews)) : 50
    const cleanResponseRate = !isNaN(parsedResponseRate) ? Math.min(100, Math.max(0, parsedResponseRate)) : 65
    const cleanSentiment = !isNaN(parsedSentiment) ? Math.min(1, Math.max(-1, parsedSentiment)) : 0.6

    // Create competitor and initial snapshot in a transaction
    const competitor = await db.$transaction(async (tx) => {
      const created = await tx.competitor.create({
        data: {
          businessId: targetBusinessId,
          name: name.trim(),
          googleMapsUrl: googleMapsUrl || null,
          rating: cleanRating,
          reviewCount: cleanReviews,
          responseRate: cleanResponseRate,
          sentimentScore: cleanSentiment,
        },
      })

      await tx.competitorSnapshot.create({
        data: {
          competitorId: created.id,
          rating: cleanRating,
          reviewCount: cleanReviews,
          sentimentScore: cleanSentiment,
        },
      })

      return created
    })

    // Log audit event
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'competitor.created',
        targetType: 'competitor',
        targetId: competitor.id,
        metadata: JSON.stringify({ name: competitor.name, businessId: targetBusinessId, orgId: ctx.orgId }),
      },
    })

    return NextResponse.json({
      success: true,
      competitor: {
        id: competitor.id,
        businessId: competitor.businessId,
        name: competitor.name,
        googleMapsUrl: competitor.googleMapsUrl,
        placeId: competitor.placeId,
        rating: competitor.rating,
        ratingTrend: 0,
        reviews: competitor.reviewCount,
        reviewCount: competitor.reviewCount,
        reviewVelocity: 0,
        responseRate: Math.round(competitor.responseRate),
        sentiment: competitor.sentimentScore ?? cleanSentiment,
        sentimentScore: competitor.sentimentScore ?? cleanSentiment,
        createdAt: competitor.createdAt.toISOString(),
      },
      message: `${competitor.name} added. We'll start tracking their reviews weekly.`,
    })
  } catch (error) {
    console.error('Add competitor error:', error)
    return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 })
  }
}

// PATCH /api/competitors — update a competitor and optionally add a snapshot
export async function PATCH(request: NextRequest) {
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { id, name, googleMapsUrl, rating, reviewCount, responseRate, sentimentScore, captureSnapshot } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Competitor ID is required' }, { status: 400 })
    }

    // Verify competitor belongs to caller's org businesses
    const existing = await db.competitor.findUnique({
      where: { id },
    })

    if (!existing || !ctx.businessIds.includes(existing.businessId)) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    const updateData: {
      name?: string
      googleMapsUrl?: string | null
      rating?: number
      reviewCount?: number
      responseRate?: number
      sentimentScore?: number | null
    } = {}

    if (typeof name === 'string' && name.trim().length > 0) updateData.name = name.trim()
    if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl
    if (typeof rating === 'number' && !isNaN(rating)) updateData.rating = Math.min(5, Math.max(1, rating))
    if (typeof reviewCount === 'number' && !isNaN(reviewCount)) updateData.reviewCount = Math.max(0, Math.floor(reviewCount))
    if (typeof responseRate === 'number' && !isNaN(responseRate)) updateData.responseRate = Math.min(100, Math.max(0, responseRate))
    if (typeof sentimentScore === 'number' && !isNaN(sentimentScore)) updateData.sentimentScore = Math.min(1, Math.max(-1, sentimentScore))

    const updated = await db.$transaction(async (tx) => {
      const comp = await tx.competitor.update({
        where: { id },
        data: updateData,
      })

      if (captureSnapshot || updateData.rating !== undefined || updateData.reviewCount !== undefined) {
        await tx.competitorSnapshot.create({
          data: {
            competitorId: id,
            rating: comp.rating,
            reviewCount: comp.reviewCount,
            sentimentScore: comp.sentimentScore,
          },
        })
      }

      return comp
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'competitor.updated',
        targetType: 'competitor',
        targetId: id,
        metadata: JSON.stringify({ orgId: ctx.orgId, updates: updateData }),
      },
    })

    return NextResponse.json({
      success: true,
      competitor: updated,
    })
  } catch (error) {
    console.error('Update competitor error:', error)
    return NextResponse.json({ error: 'Failed to update competitor' }, { status: 500 })
  }
}

// DELETE /api/competitors — delete a competitor
export async function DELETE(request: NextRequest) {
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id') || searchParams.get('competitorId')
    if (!id) {
      const body = await request.json().catch(() => ({}))
      id = body?.id || body?.competitorId
    }

    if (!id) {
      return NextResponse.json({ error: 'Competitor ID is required' }, { status: 400 })
    }

    const existing = await db.competitor.findUnique({
      where: { id },
    })

    if (!existing || !ctx.businessIds.includes(existing.businessId)) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    await db.competitor.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'competitor.deleted',
        targetType: 'competitor',
        targetId: id,
        metadata: JSON.stringify({ orgId: ctx.orgId, name: existing.name }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Competitor ${existing.name} removed`,
    })
  } catch (error) {
    console.error('Delete competitor error:', error)
    return NextResponse.json({ error: 'Failed to delete competitor' }, { status: 500 })
  }
}


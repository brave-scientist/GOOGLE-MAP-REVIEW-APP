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

    return NextResponse.json({
      competitors: formatted,
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

    const cleanRating = typeof rating === 'number' && !isNaN(rating) ? Math.min(5, Math.max(1, rating)) : 4.2
    const cleanReviews = typeof reviewCount === 'number' && !isNaN(reviewCount) ? Math.max(0, Math.floor(reviewCount)) : 50
    const cleanResponseRate = typeof responseRate === 'number' && !isNaN(responseRate) ? Math.min(100, Math.max(0, responseRate)) : 65
    const cleanSentiment = typeof sentimentScore === 'number' && !isNaN(sentimentScore) ? Math.min(1, Math.max(-1, sentimentScore)) : 0.6

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
    let id = searchParams.get('id')
    if (!id) {
      const body = await request.json().catch(() => ({}))
      id = body?.id
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


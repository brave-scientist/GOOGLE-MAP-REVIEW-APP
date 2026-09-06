import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // SEC-01: scope every query to the user's org
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const rating = searchParams.get('rating')
    const source = searchParams.get('source')
    const businessId = searchParams.get('businessId')
    const groupId = searchParams.get('groupId')
    const search = searchParams.get('q')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // SEC-01: hard-scope to businesses permitted for this user in their org.
    let scopedBusinessIds: string[] = ctx.businessIds

    // 1. If groupId is provided, filter by locations in this group
    if (groupId && groupId !== 'all') {
      const group = await db.locationGroup.findUnique({
        where: { id: groupId },
        include: { locations: { select: { businessId: true } } },
      })
      if (!group || group.orgId !== ctx.orgId) {
        return NextResponse.json(
          { error: 'Location group not found', code: 'GROUP_NOT_FOUND' },
          { status: 404 }
        )
      }
      const groupBusinessIds = group.locations.map((l) => l.businessId)
      scopedBusinessIds = scopedBusinessIds.filter((bId) => groupBusinessIds.includes(bId))
    }

    // 2. If businessId is provided, verify it's in ctx.businessIds
    if (businessId && businessId !== 'all') {
      if (!ctx.businessIds.includes(businessId)) {
        return NextResponse.json(
          { error: 'Access denied', code: 'BUSINESS_NOT_OWNED' },
          { status: 403 },
        )
      }
      scopedBusinessIds = scopedBusinessIds.filter((bId) => bId === businessId)
    }

    const where: Record<string, unknown> = {
      businessId: { in: scopedBusinessIds },
    }

    if (status === 'pending') {
      where.draftStatus = DraftStatus.PENDING
    } else if (status === 'replied') {
      where.draftStatus = DraftStatus.POSTED
    } else if (status === 'escalated') {
      where.OR = [
        { escalations: { some: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } } },
        { AND: [{ rating: { lte: 2 } }, { repliedAt: null }] },
      ]
    }

    if (rating === 'positive') {
      where.rating = { gte: 4 }
    } else if (rating === 'negative') {
      where.rating = { lte: 2 }
    } else if (rating && rating !== 'all') {
      const r = parseInt(rating)
      if (!isNaN(r) && r >= 1 && r <= 5) {
        where.rating = r
      }
    }

    if (source && source !== 'all') {
      const sourceMap: Record<string, ReviewSource> = {
        google: ReviewSource.GOOGLE,
        facebook: ReviewSource.FACEBOOK,
        yelp: ReviewSource.YELP,
        trustpilot: ReviewSource.TRUSTPILOT,
      }
      if (sourceMap[source]) {
        where.source = sourceMap[source]
      }
    }

    if (search) {
      where.OR = [
        { text: { contains: search } },
        { author: { contains: search } },
        { title: { contains: search } },
      ]
    }

    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, industry: true } },
          escalations: {
            where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              severity: true,
              reason: true,
            },
          },
          publishAttempts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              platform: true,
              errorMessage: true,
              remoteId: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.review.count({ where }),
    ])

    return NextResponse.json({
      reviews: reviews.map(r => ({
        id: r.id,
        externalId: r.externalId,
        author: r.author,
        authorAvatar: r.authorAvatar,
        rating: r.rating,
        title: r.title,
        text: r.text,
        source: r.source,
        language: r.language,
        sentimentScore: r.sentimentScore,
        topics: r.topics ? JSON.parse(r.topics) : [],
        replyText: r.replyText,
        repliedAt: r.repliedAt?.toISOString() || null,
        draftText: r.draftText,
        draftStatus: r.draftStatus,
        activeEscalation: r.escalations?.[0] || null,
        latestPublishAttempt: r.publishAttempts?.[0]
          ? {
              id: r.publishAttempts[0].id,
              status: r.publishAttempts[0].status,
              platform: r.publishAttempts[0].platform,
              errorMessage: r.publishAttempts[0].errorMessage,
              remoteId: r.publishAttempts[0].remoteId,
              createdAt: r.publishAttempts[0].createdAt.toISOString(),
            }
          : null,
        createdAt: r.createdAt.toISOString(),
        business: r.business,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Inbox API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reviews' },
      { status: 500 }
    )
  }
}

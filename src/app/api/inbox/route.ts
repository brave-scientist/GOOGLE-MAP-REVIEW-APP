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
    const search = searchParams.get('q')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // SEC-01: hard-scope to businesses in the user's org.
    // If the caller passes businessId, verify it's in ctx.businessIds.
    let scopedBusinessIds: string[] = ctx.businessIds
    if (businessId && businessId !== 'all') {
      if (!ctx.businessIds.includes(businessId)) {
        return NextResponse.json(
          { error: 'Access denied', code: 'BUSINESS_NOT_OWNED' },
          { status: 403 },
        )
      }
      scopedBusinessIds = [businessId]
    }

    const where: Record<string, unknown> = {
      businessId: { in: scopedBusinessIds },
    }

    if (status === 'pending') {
      where.draftStatus = DraftStatus.PENDING
    } else if (status === 'replied') {
      where.draftStatus = DraftStatus.POSTED
    } else if (status === 'escalated') {
      where.AND = [{ rating: { lte: 2 } }, { repliedAt: null }]
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
      { error: 'Failed to fetch reviews', details: String(error) },
      { status: 500 }
    )
  }
}

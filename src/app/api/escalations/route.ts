import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { EscalationSeverity, EscalationStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/escalations — List review escalations with status & severity filters
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const severityParam = searchParams.get('severity')
    const businessIdParam = searchParams.get('businessId')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    let scopedBusinessIds = ctx.businessIds
    if (businessIdParam && businessIdParam !== 'all') {
      if (!ctx.businessIds.includes(businessIdParam)) {
        return NextResponse.json({ error: 'Access denied', code: 'BUSINESS_NOT_OWNED' }, { status: 403 })
      }
      scopedBusinessIds = [businessIdParam]
    }

    const where: any = {
      businessId: { in: scopedBusinessIds },
    }

    if (statusParam && statusParam !== 'all') {
      if (Object.values(EscalationStatus).includes(statusParam as EscalationStatus)) {
        where.status = statusParam as EscalationStatus
      }
    }

    if (severityParam && severityParam !== 'all') {
      if (Object.values(EscalationSeverity).includes(severityParam as EscalationSeverity)) {
        where.severity = severityParam as EscalationSeverity
      }
    }

    const [escalations, total] = await Promise.all([
      db.escalation.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, industry: true } },
          review: {
            select: {
              id: true,
              author: true,
              authorAvatar: true,
              rating: true,
              text: true,
              source: true,
              createdAt: true,
              draftStatus: true,
              replyText: true,
            },
          },
          rule: { select: { id: true, name: true, triggerType: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          dispatches: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              channel: true,
              recipient: true,
              status: true,
              sentAt: true,
              errorMessage: true,
            },
          },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.escalation.count({ where }),
    ])

    return NextResponse.json({
      escalations: escalations.map((e) => ({
        id: e.id,
        businessId: e.businessId,
        business: e.business,
        reviewId: e.reviewId,
        review: {
          ...e.review,
          createdAt: e.review.createdAt.toISOString(),
        },
        ruleId: e.ruleId,
        rule: e.rule,
        status: e.status,
        severity: e.severity,
        sentiment: e.sentiment,
        sentimentScore: e.sentimentScore,
        reason: e.reason,
        assignedToUserId: e.assignedToUserId,
        assignedTo: e.assignedTo,
        assignedToEmail: e.assignedToEmail,
        resolutionNotes: e.resolutionNotes,
        resolvedAt: e.resolvedAt?.toISOString() || null,
        resolvedByUserId: e.resolvedByUserId,
        dispatches: e.dispatches.map((d) => ({
          ...d,
          sentAt: d.sentAt?.toISOString() || null,
        })),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('List escalations error:', error)
    return NextResponse.json({ error: 'Failed to fetch escalations' }, { status: 500 })
  }
}

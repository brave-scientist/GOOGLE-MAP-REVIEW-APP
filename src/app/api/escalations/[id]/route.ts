import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { EscalationStatus, EscalationSeverity } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/escalations/[id] — Retrieve single escalation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const escalation = await db.escalation.findUnique({
    where: { id },
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
        select: {
          id: true,
          channel: true,
          recipient: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          retryCount: true,
        },
      },
    },
  })

  if (!escalation || !ctx.businessIds.includes(escalation.businessId)) {
    return NextResponse.json({ error: 'Escalation not found' }, { status: 404 })
  }

  return NextResponse.json({
    escalation: {
      id: escalation.id,
      businessId: escalation.businessId,
      business: escalation.business,
      reviewId: escalation.reviewId,
      review: {
        ...escalation.review,
        createdAt: escalation.review.createdAt.toISOString(),
      },
      ruleId: escalation.ruleId,
      rule: escalation.rule,
      status: escalation.status,
      severity: escalation.severity,
      sentiment: escalation.sentiment,
      sentimentScore: escalation.sentimentScore,
      reason: escalation.reason,
      assignedToUserId: escalation.assignedToUserId,
      assignedTo: escalation.assignedTo,
      assignedToEmail: escalation.assignedToEmail,
      resolutionNotes: escalation.resolutionNotes,
      resolvedAt: escalation.resolvedAt?.toISOString() || null,
      resolvedByUserId: escalation.resolvedByUserId,
      dispatches: escalation.dispatches.map((d) => ({
        ...d,
        sentAt: d.sentAt?.toISOString() || null,
      })),
      createdAt: escalation.createdAt.toISOString(),
      updatedAt: escalation.updatedAt.toISOString(),
    },
  })
}

// PUT /api/escalations/[id] — Update escalation state, assignment, or resolution notes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json(
      { error: 'Viewers cannot modify escalations', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const { id } = await params
  const existing = await db.escalation.findUnique({
    where: { id },
  })

  if (!existing || !ctx.businessIds.includes(existing.businessId)) {
    return NextResponse.json({ error: 'Escalation not found' }, { status: 404 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { status, assignedToUserId, assignedToEmail, resolutionNotes, severity } = body

    const updateData: any = {}
    let actionType = 'escalation.updated'

    if (status !== undefined) {
      if (!Object.values(EscalationStatus).includes(status as EscalationStatus)) {
        return NextResponse.json({ error: 'Invalid escalation status' }, { status: 400 })
      }
      updateData.status = status as EscalationStatus

      if (status === EscalationStatus.RESOLVED) {
        updateData.resolvedAt = new Date()
        updateData.resolvedByUserId = ctx.user.id
        actionType = 'escalation.resolved'
      } else if (status === EscalationStatus.DISMISSED) {
        updateData.resolvedAt = new Date()
        updateData.resolvedByUserId = ctx.user.id
        actionType = 'escalation.dismissed'
      } else if (status === EscalationStatus.ACKNOWLEDGED) {
        actionType = 'escalation.acknowledged'
      }
    }

    if (severity !== undefined) {
      if (Object.values(EscalationSeverity).includes(severity as EscalationSeverity)) {
        updateData.severity = severity as EscalationSeverity
      }
    }

    if (assignedToUserId !== undefined) {
      updateData.assignedToUserId = assignedToUserId || null
      actionType = 'escalation.routed'
    }

    if (assignedToEmail !== undefined) {
      updateData.assignedToEmail = assignedToEmail ? String(assignedToEmail).trim() : null
    }

    if (resolutionNotes !== undefined) {
      updateData.resolutionNotes = resolutionNotes ? String(resolutionNotes).trim().slice(0, 2000) : null
    }

    const updated = await db.escalation.update({
      where: { id },
      data: updateData,
      include: {
        business: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })

    // Structured audit logging
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: actionType,
        targetType: 'escalation',
        targetId: id,
        metadata: JSON.stringify({
          escalationId: id,
          businessId: updated.businessId,
          status: updated.status,
          assignedToUserId: updated.assignedToUserId,
          changes: Object.keys(updateData),
        }),
      },
    })

    return NextResponse.json({
      escalation: {
        ...updated,
        resolvedAt: updated.resolvedAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Update escalation error:', error)
    return NextResponse.json({ error: 'Failed to update escalation' }, { status: 500 })
  }
}

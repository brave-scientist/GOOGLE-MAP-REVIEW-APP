import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { AutomationActionType, AutomationTriggerType, EscalationSeverity, SentimentScoreCategory } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/automations/[id] — Retrieve single automation rule
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const rule = await db.automationRule.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true } },
      _count: { select: { escalations: true, executions: true } },
    },
  })

  if (!rule || !ctx.businessIds.includes(rule.businessId)) {
    return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
  }

  return NextResponse.json({
    rule: {
      id: rule.id,
      businessId: rule.businessId,
      businessName: rule.business.name,
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      isEnabled: rule.isEnabled,
      minRating: rule.minRating,
      maxRating: rule.maxRating,
      sentimentThreshold: rule.sentimentThreshold,
      minSeverity: rule.minSeverity,
      sources: rule.sources,
      actionType: rule.actionType,
      actionConfig: rule.actionConfig ? JSON.parse(rule.actionConfig) : null,
      cooldownMinutes: rule.cooldownMinutes,
      lastTriggeredAt: rule.lastTriggeredAt?.toISOString() || null,
      escalationCount: rule._count.escalations,
      executionCount: rule._count.executions,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    },
  })
}

// PUT /api/automations/[id] — Update an automation rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json(
      { error: 'Viewers cannot modify automation rules', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const { id } = await params
  const existingRule = await db.automationRule.findUnique({
    where: { id },
  })

  if (!existingRule || !ctx.businessIds.includes(existingRule.businessId)) {
    return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const {
      name,
      description,
      triggerType,
      isEnabled,
      minRating,
      maxRating,
      sentimentThreshold,
      minSeverity,
      sources,
      actionType,
      actionConfig,
      cooldownMinutes,
    } = body

    // Validation
    const updateData: any = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Rule name cannot be empty' }, { status: 400 })
      }
      updateData.name = name.trim().slice(0, 150)
    }

    if (description !== undefined) {
      updateData.description = description ? String(description).trim().slice(0, 500) : null
    }

    if (triggerType !== undefined) {
      updateData.triggerType = triggerType as AutomationTriggerType
    }

    if (isEnabled !== undefined) {
      updateData.isEnabled = Boolean(isEnabled)
    }

    if (minRating !== undefined) {
      if (minRating !== null && (typeof minRating !== 'number' || minRating < 1 || minRating > 5)) {
        return NextResponse.json({ error: 'minRating must be between 1 and 5' }, { status: 400 })
      }
      updateData.minRating = minRating
    }

    if (maxRating !== undefined) {
      if (maxRating !== null && (typeof maxRating !== 'number' || maxRating < 1 || maxRating > 5)) {
        return NextResponse.json({ error: 'maxRating must be between 1 and 5' }, { status: 400 })
      }
      updateData.maxRating = maxRating
    }

    const effectiveMinRating = minRating !== undefined ? minRating : existingRule.minRating
    const effectiveMaxRating = maxRating !== undefined ? maxRating : existingRule.maxRating
    if (effectiveMinRating !== null && effectiveMaxRating !== null && effectiveMinRating > effectiveMaxRating) {
      return NextResponse.json({ error: 'minRating cannot be greater than maxRating' }, { status: 400 })
    }

    if (sentimentThreshold !== undefined) {
      updateData.sentimentThreshold = sentimentThreshold as SentimentScoreCategory
    }

    if (minSeverity !== undefined) {
      updateData.minSeverity = minSeverity as EscalationSeverity
    }

    if (sources !== undefined) {
      updateData.sources = typeof sources === 'string' && sources.trim() ? sources.trim().toUpperCase() : 'ALL'
    }

    if (actionType !== undefined) {
      updateData.actionType = actionType as AutomationActionType
    }

    if (actionConfig !== undefined) {
      updateData.actionConfig =
        actionConfig && typeof actionConfig === 'object'
          ? JSON.stringify(actionConfig)
          : typeof actionConfig === 'string'
          ? actionConfig
          : null
    }

    if (cooldownMinutes !== undefined) {
      updateData.cooldownMinutes =
        typeof cooldownMinutes === 'number' && cooldownMinutes >= 0 ? Math.floor(cooldownMinutes) : 0
    }

    const updated = await db.automationRule.update({
      where: { id },
      data: updateData,
    })

    // Audit Log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'automation.updated',
        targetType: 'automation_rule',
        targetId: id,
        metadata: JSON.stringify({
          ruleId: id,
          businessId: updated.businessId,
          changes: Object.keys(updateData),
        }),
      },
    })

    return NextResponse.json({
      rule: {
        ...updated,
        actionConfig: updated.actionConfig ? JSON.parse(updated.actionConfig) : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Update automation error:', error)
    return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 })
  }
}

// DELETE /api/automations/[id] — Delete an automation rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json(
      { error: 'Viewers cannot delete automation rules', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const { id } = await params
  const existingRule = await db.automationRule.findUnique({
    where: { id },
  })

  if (!existingRule || !ctx.businessIds.includes(existingRule.businessId)) {
    return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
  }

  try {
    await db.automationRule.delete({
      where: { id },
    })

    // Audit Log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'automation.deleted',
        targetType: 'automation_rule',
        targetId: id,
        metadata: JSON.stringify({
          ruleId: id,
          businessId: existingRule.businessId,
          ruleName: existingRule.name,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Automation rule deleted successfully' })
  } catch (error: any) {
    console.error('Delete automation error:', error)
    return NextResponse.json({ error: 'Failed to delete automation rule' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { assertWithinLimit, executeWithQuotaLock } from '@/lib/billing'
import { AutomationActionType, AutomationTriggerType, EscalationSeverity, SentimentScoreCategory } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/automations — List automation rules for caller's businesses
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessIdParam = searchParams.get('businessId')

    let scopedBusinessIds = ctx.businessIds
    if (businessIdParam && businessIdParam !== 'all') {
      if (!ctx.businessIds.includes(businessIdParam)) {
        return NextResponse.json({ error: 'Access denied', code: 'BUSINESS_NOT_OWNED' }, { status: 403 })
      }
      scopedBusinessIds = [businessIdParam]
    }

    const rules = await db.automationRule.findMany({
      where: {
        businessId: { in: scopedBusinessIds },
      },
      include: {
        business: {
          select: { id: true, name: true },
        },
        _count: {
          select: { escalations: true, executions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      rules: rules.map((r) => {
        let parsedActionConfig: any = null
        if (r.actionConfig) {
          try {
            parsedActionConfig = JSON.parse(r.actionConfig)
          } catch {
            // Defensive recovery: prevent malformed persisted JSON from crashing the endpoint
            parsedActionConfig = { error: 'CORRUPTED_CONFIG', raw: r.actionConfig.slice(0, 100) }
          }
        }

        return {
          id: r.id,
          businessId: r.businessId,
          businessName: r.business.name,
          name: r.name,
          description: r.description,
          triggerType: r.triggerType,
          isEnabled: r.isEnabled,
          minRating: r.minRating,
          maxRating: r.maxRating,
          sentimentThreshold: r.sentimentThreshold,
          minSeverity: r.minSeverity,
          sources: r.sources,
          actionType: r.actionType,
          actionConfig: parsedActionConfig,
          cooldownMinutes: r.cooldownMinutes,
          lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
          escalationCount: r._count.escalations,
          executionCount: r._count.executions,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }
      }),
    })
  } catch (error: any) {
    console.error('List automations error:', error)
    return NextResponse.json({ error: 'Failed to fetch automation rules' }, { status: 500 })
  }
}

// POST /api/automations — Create a new automation rule
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // RBAC: VIEWER cannot create automation rules
  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json(
      { error: 'Viewers cannot create automation rules', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const {
      businessId,
      name,
      description,
      triggerType = AutomationTriggerType.NEW_REVIEW,
      isEnabled = true,
      minRating,
      maxRating,
      sentimentThreshold = SentimentScoreCategory.ANY,
      minSeverity = EscalationSeverity.MEDIUM,
      sources = 'ALL',
      actionType = AutomationActionType.CREATE_ESCALATION,
      actionConfig,
      cooldownMinutes = 0,
    } = body

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    // SEC-01 / Anti-IDOR: verify business belongs to caller's org
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 })
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Rule name must not exceed 100 characters' }, { status: 400 })
    }

    if (description && (typeof description !== 'string' || description.trim().length > 500)) {
      return NextResponse.json({ error: 'Description must not exceed 500 characters' }, { status: 400 })
    }

    // Enum Validations
    if (!Object.values(AutomationTriggerType).includes(triggerType)) {
      return NextResponse.json({ error: `Invalid triggerType: ${triggerType}`, code: 'INVALID_ENUM' }, { status: 400 })
    }
    if (!Object.values(SentimentScoreCategory).includes(sentimentThreshold)) {
      return NextResponse.json({ error: `Invalid sentimentThreshold: ${sentimentThreshold}`, code: 'INVALID_ENUM' }, { status: 400 })
    }
    if (!Object.values(EscalationSeverity).includes(minSeverity)) {
      return NextResponse.json({ error: `Invalid minSeverity: ${minSeverity}`, code: 'INVALID_ENUM' }, { status: 400 })
    }
    if (!Object.values(AutomationActionType).includes(actionType)) {
      return NextResponse.json({ error: `Invalid actionType: ${actionType}`, code: 'INVALID_ENUM' }, { status: 400 })
    }

    // Rating bounds validation
    if (minRating !== undefined && minRating !== null) {
      if (typeof minRating !== 'number' || !Number.isInteger(minRating) || minRating < 1 || minRating > 5) {
        return NextResponse.json({ error: 'minRating must be an integer between 1 and 5' }, { status: 400 })
      }
    }
    if (maxRating !== undefined && maxRating !== null) {
      if (typeof maxRating !== 'number' || !Number.isInteger(maxRating) || maxRating < 1 || maxRating > 5) {
        return NextResponse.json({ error: 'maxRating must be an integer between 1 and 5' }, { status: 400 })
      }
    }
    if (minRating !== null && maxRating !== null && minRating !== undefined && maxRating !== undefined && minRating > maxRating) {
      return NextResponse.json({ error: 'minRating cannot be greater than maxRating' }, { status: 400 })
    }

    // Cooldown validation (0 to 10080 minutes / 7 days)
    if (typeof cooldownMinutes !== 'number' || !Number.isInteger(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 10080) {
      return NextResponse.json({ error: 'cooldownMinutes must be an integer between 0 and 10080' }, { status: 400 })
    }
    const parsedCooldown = cooldownMinutes

    // ActionConfig validation & stringification (max 10KB)
    let stringifiedActionConfig: string | null = null
    if (actionConfig !== undefined && actionConfig !== null) {
      if (typeof actionConfig === 'object') {
        stringifiedActionConfig = JSON.stringify(actionConfig)
      } else if (typeof actionConfig === 'string') {
        try {
          JSON.parse(actionConfig)
          stringifiedActionConfig = actionConfig
        } catch {
          return NextResponse.json({ error: 'actionConfig string must be valid JSON', code: 'INVALID_JSON' }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: 'actionConfig must be an object or JSON string', code: 'INVALID_CONFIG' }, { status: 400 })
      }

      if (stringifiedActionConfig && stringifiedActionConfig.length > 10000) {
        return NextResponse.json({ error: 'actionConfig payload is too large (max 10KB)', code: 'PAYLOAD_TOO_LARGE' }, { status: 400 })
      }
    }

    // Concurrency-safe quota check and rule creation
    const quotaResult = await executeWithQuotaLock(ctx.orgId, 'automation_rules', 1, async (tx) => {
      return await tx.automationRule.create({
        data: {
          businessId,
          name: name.trim().slice(0, 100),
          description: description ? String(description).trim().slice(0, 500) : null,
          triggerType,
          isEnabled: Boolean(isEnabled),
          minRating: minRating ?? null,
          maxRating: maxRating ?? null,
          sentimentThreshold,
          minSeverity,
          sources: typeof sources === 'string' && sources.trim() ? sources.trim().toUpperCase().slice(0, 100) : 'ALL',
          actionType,
          actionConfig: stringifiedActionConfig,
          cooldownMinutes: parsedCooldown,
        },
      })
    })

    if (!quotaResult.success) {
      return NextResponse.json(
        {
          error: quotaResult.check.reason || 'Automation rule limit exceeded',
          code: quotaResult.check.code || 'PLAN_UPGRADE_REQUIRED',
        },
        { status: 403 }
      )
    }

    const rule = quotaResult.result

    // Audit Log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'automation.created',
        targetType: 'automation_rule',
        targetId: rule.id,
        metadata: JSON.stringify({
          ruleId: rule.id,
          businessId: rule.businessId,
          name: rule.name,
          triggerType: rule.triggerType,
          actionType: rule.actionType,
        }),
      },
    })

    return NextResponse.json(
      {
        rule: {
          ...rule,
          actionConfig: rule.actionConfig ? JSON.parse(rule.actionConfig) : null,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Create automation error:', error)
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 })
  }
}

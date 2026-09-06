import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// POST /api/automations/[id]/disable — Pause / disable an automation rule
export async function POST(
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
    const updated = await db.automationRule.update({
      where: { id },
      data: { isEnabled: false },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'automation.disabled',
        targetType: 'automation_rule',
        targetId: id,
        metadata: JSON.stringify({
          ruleId: id,
          businessId: updated.businessId,
          ruleName: updated.name,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      rule: {
        ...updated,
        actionConfig: updated.actionConfig ? JSON.parse(updated.actionConfig) : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Disable automation error:', error)
    return NextResponse.json({ error: 'Failed to disable automation rule' }, { status: 500 })
  }
}

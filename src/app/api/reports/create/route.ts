import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// POST /api/reports/create — Create a scheduled report
// SEC-01: requires auth; reports are scoped to the caller's org via audit log.
// No businessId is accepted from the body — reports are org-level.
export async function POST(request: NextRequest) {
  // SEC-01: require auth + org scoping
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
      const { name, schedule, recipients, format, channel } = body

      if (!name || !schedule) {
        return NextResponse.json({ error: 'name and schedule are required' }, { status: 400 })
      }

      // Store as audit log entry (in production, create a scheduled_reports table)
      const report = {
        id: `rpt_${Date.now().toString(36)}`,
        name,
        schedule, // daily | weekly | monthly
        recipients: recipients || [ctx.user.email],
        format: format || 'email',
        channel: channel || 'email',
        status: 'active',
        orgId: ctx.orgId, // SEC-01: stamp the orgId so the report is scoped
        createdAt: new Date().toISOString(),
      }

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'report.created',
          targetType: 'report',
          targetId: report.id,
          metadata: JSON.stringify(report),
        },
      })

      return NextResponse.json({
        success: true,
        report,
        message: `Report "${name}" created. Schedule: ${schedule}. Recipients: ${report.recipients.length}. The report will be sent ${schedule} once email sending is configured.`,
      })
  } catch (error) {
    console.error('Report create error:', error)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// PUT /api/reports/update — Update an existing report
export async function PUT(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { reportId, name, schedule, recipients, status } = body

    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
    }

    const update = {
      reportId,
      name: name || '(unchanged)',
      schedule: schedule || '(unchanged)',
      recipients: recipients || [],
      status: status || 'active',
      orgId: ctx.orgId, // SEC-01: stamp the orgId
      updatedAt: new Date().toISOString(),
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'report.updated',
        targetType: 'report',
        targetId: reportId,
        metadata: JSON.stringify(update),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Report updated. New schedule: ${update.schedule}. Status: ${update.status}.`,
    })
  } catch (error) {
    console.error('Report update error:', error)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}

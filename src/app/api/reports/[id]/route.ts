import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/reports/[id] — Retrieve a single scheduled report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 })
    }

    const report = await db.scheduledReport.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (!report.businessId && !isOrgAdminRole(ctx.user.role)) {
      return NextResponse.json(
        { error: 'Only organization administrators can access organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    if (report.businessId) {
      const denied = assertBusinessOwnership(ctx, report.businessId)
      if (denied) return denied
    }

    let parsedRecipients: string[] = []
    try {
      parsedRecipients = JSON.parse(report.recipients)
    } catch {
      parsedRecipients = [report.recipients]
    }

    return NextResponse.json({
      report: {
        id: report.id,
        orgId: report.orgId,
        businessId: report.businessId,
        name: report.name,
        schedule: report.schedule,
        recipients: parsedRecipients,
        format: report.format,
        status: report.status,
        timezone: report.timezone,
        reportType: report.reportType,
        lastSentAt: report.lastSentAt?.toISOString() ?? null,
        nextRunAt: report.nextRunAt?.toISOString() ?? null,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Fetch report error:', error)
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
  }
}

// DELETE /api/reports/[id] — Delete a scheduled report
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 })
    }

    const report = await db.scheduledReport.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Role check: OWNER, ADMIN, AGENCY_ADMIN can delete org-wide reports
    if (!report.businessId && !isOrgAdminRole(ctx.user.role)) {
      return NextResponse.json(
        { error: 'Only organization administrators can delete organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    if (report.businessId) {
      const denied = assertBusinessOwnership(ctx, report.businessId)
      if (denied) return denied
    }

    await db.scheduledReport.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'report.deleted',
        targetType: 'report',
        targetId: id,
        metadata: JSON.stringify({
          orgId: ctx.orgId,
          name: report.name,
          schedule: report.schedule,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Report "${report.name}" deleted.`,
    })
  } catch (error) {
    console.error('Delete report error:', error)
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 })
  }
}

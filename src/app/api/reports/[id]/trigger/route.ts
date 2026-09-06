import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { executeScheduledReportDelivery } from '@/lib/reports/delivery-service'

export const dynamic = 'force-dynamic'

// POST /api/reports/[id]/trigger — Trigger immediate execution and delivery of a scheduled report
export async function POST(
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
        { error: 'Only organization administrators can trigger organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    if (report.businessId) {
      const denied = assertBusinessOwnership(ctx, report.businessId)
      if (denied) return denied
    }

    const deliveryResult = await executeScheduledReportDelivery({
      scheduleId: report.id,
      actorId: ctx.user.id,
    })

    return NextResponse.json({
      success: deliveryResult.success,
      result: deliveryResult,
      message: `Report execution completed: ${deliveryResult.sent} sent, ${deliveryResult.skipped} skipped, ${deliveryResult.failed} failed.`,
    })
  } catch (error: any) {
    console.error('Trigger report delivery error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to trigger report delivery' },
      { status: 500 }
    )
  }
}

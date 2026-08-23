import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// DELETE /api/reports/[id] — Delete a scheduled report
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // RBAC: Only OWNER or ADMIN can delete reports
  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners or admins can delete reports', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

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
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/reports/history — Delivery logs and status history for caller's organization
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('reportId')
    const businessId = searchParams.get('businessId')
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))

    const whereClause: {
      orgId: string
      reportId?: string
      businessId?: string | { in: string[] }
    } = {
      orgId: ctx.orgId,
    }

    // Role-based scope
    if (!isOrgAdminRole(ctx.user.role)) {
      if (!ctx.businessIds || ctx.businessIds.length === 0) {
        return NextResponse.json({ history: [], total: 0 })
      }
      whereClause.businessId = { in: ctx.businessIds }
    }

    if (reportId) {
      // Validate that report belongs to this org
      const report = await db.scheduledReport.findUnique({
        where: { id: reportId },
        select: { id: true, orgId: true, businessId: true },
      })

      if (!report || report.orgId !== ctx.orgId) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }

      if (report.businessId && !ctx.businessIds.includes(report.businessId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      whereClause.reportId = reportId
    }

    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      whereClause.businessId = businessId
    }

    const [logs, total] = await Promise.all([
      db.reportDeliveryLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          report: {
            select: {
              id: true,
              name: true,
              schedule: true,
            },
          },
        },
      }),
      db.reportDeliveryLog.count({
        where: whereClause,
      }),
    ])

    const formatted = logs.map((log) => ({
      id: log.id,
      reportId: log.reportId,
      reportName: log.report?.name || 'Unknown Report',
      schedule: log.report?.schedule || null,
      orgId: log.orgId,
      businessId: log.businessId,
      recipient: log.recipient,
      format: log.format,
      status: log.status,
      idempotencyKey: log.idempotencyKey,
      reportPeriod: log.reportPeriod,
      periodStart: log.periodStart?.toISOString() ?? null,
      periodEnd: log.periodEnd?.toISOString() ?? null,
      attempts: log.attempts,
      lastAttemptAt: log.lastAttemptAt?.toISOString() ?? null,
      providerMessageId: log.providerMessageId,
      error: log.error,
      sentAt: log.sentAt?.toISOString() ?? null,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      history: formatted,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Report delivery history error:', error)
    return NextResponse.json({ error: 'Failed to fetch report delivery history' }, { status: 500 })
  }
}

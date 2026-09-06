import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseSchedule(input: unknown): ReportSchedule {
  if (typeof input !== 'string') return ReportSchedule.WEEKLY
  const normalized = input.trim().toUpperCase()
  if (normalized === 'DAILY') return ReportSchedule.DAILY
  if (normalized === 'WEEKLY') return ReportSchedule.WEEKLY
  if (normalized === 'MONTHLY') return ReportSchedule.MONTHLY
  if (normalized === 'REALTIME_ALERT' || normalized === 'REALTIME' || normalized === 'ALERT') return ReportSchedule.REALTIME_ALERT
  return ReportSchedule.WEEKLY
}

function parseFormat(input: unknown): ReportFormat {
  if (typeof input !== 'string') return ReportFormat.EMAIL_HTML
  const normalized = input.trim().toUpperCase()
  if (normalized === 'EMAIL_HTML' || normalized === 'EMAIL') return ReportFormat.EMAIL_HTML
  if (normalized === 'PDF_ATTACHMENT' || normalized === 'PDF') return ReportFormat.PDF_ATTACHMENT
  if (normalized === 'BOTH' || normalized === 'PDF_AND_EMAIL') return ReportFormat.BOTH
  return ReportFormat.EMAIL_HTML
}

function parseRecipients(input: unknown, defaultEmail: string): string[] {
  let list: string[] = []
  if (Array.isArray(input)) {
    list = input.map(item => String(item).trim())
  } else if (typeof input === 'string') {
    list = input.split(',').map(s => s.trim())
  }

  list = list.filter(e => EMAIL_REGEX.test(e))
  if (list.length === 0) list = [defaultEmail]
  return Array.from(new Set(list))
}

// POST /api/reports/create — Create a scheduled report
export async function POST(request: NextRequest) {
  // SEC-01: require auth + org scoping
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { name, schedule, recipients, format, businessId } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const parsedSchedule = parseSchedule(schedule)
    const validRecipients = parseRecipients(recipients, ctx.user.email)
    const parsedFormat = parseFormat(format)

    if (!businessId && !ctx.isOrgAdmin) {
      return NextResponse.json(
        { error: 'Only organization administrators can configure organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    let targetBusinessId: string | null = null
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      targetBusinessId = businessId
    }

    const report = await db.scheduledReport.create({
      data: {
        orgId: ctx.orgId,
        businessId: targetBusinessId,
        name: name.trim(),
        schedule: parsedSchedule,
        recipients: JSON.stringify(validRecipients),
        format: parsedFormat,
        status: ReportStatus.ACTIVE,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'report.created',
        targetType: 'report',
        targetId: report.id,
        metadata: JSON.stringify({
          orgId: ctx.orgId,
          name: report.name,
          schedule: report.schedule,
          recipientsCount: validRecipients.length,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        orgId: report.orgId,
        businessId: report.businessId,
        name: report.name,
        schedule: report.schedule,
        recipients: validRecipients,
        format: report.format,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      },
      message: `Report "${report.name}" created. Schedule: ${report.schedule}. Recipients: ${validRecipients.length}. The report will be sent ${report.schedule}.`,
    })
  } catch (error) {
    console.error('Report create error:', error)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// PUT /api/reports/create (or update) — Update an existing report
export async function PUT(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { reportId, id, name, schedule, recipients, status, format } = body
    const targetId = reportId || id

    if (!targetId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
    }

    const existing = await db.scheduledReport.findUnique({
      where: { id: targetId },
    })

    if (!existing || existing.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const updateData: {
      name?: string
      schedule?: ReportSchedule
      recipients?: string
      format?: ReportFormat
      status?: ReportStatus
    } = {}

    if (typeof name === 'string' && name.trim().length > 0) updateData.name = name.trim()
    if (schedule) updateData.schedule = parseSchedule(schedule)
    if (format) {
      const parsedFmt = parseFormat(format)
      updateData.format = parsedFmt
    }
    if (recipients) updateData.recipients = JSON.stringify(parseRecipients(recipients, ctx.user.email))
    if (status) {
      const s = String(status).toUpperCase()
      if (s === 'ACTIVE') updateData.status = ReportStatus.ACTIVE
      else if (s === 'PAUSED') updateData.status = ReportStatus.PAUSED
      else if (s === 'ARCHIVED') updateData.status = ReportStatus.ARCHIVED
    }

    const updated = await db.scheduledReport.update({
      where: { id: targetId },
      data: updateData,
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'report.updated',
        targetType: 'report',
        targetId: targetId,
        metadata: JSON.stringify({ orgId: ctx.orgId, updates: updateData }),
      },
    })

    return NextResponse.json({
      success: true,
      report: updated,
      message: `Report updated. New schedule: ${updated.schedule}. Status: ${updated.status}.`,
    })
  } catch (error) {
    console.error('Report update error:', error)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}


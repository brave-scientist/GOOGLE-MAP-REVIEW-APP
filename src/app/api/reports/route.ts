import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseSchedule(input: unknown): ReportSchedule | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim().toUpperCase()
  if (normalized === 'DAILY') return ReportSchedule.DAILY
  if (normalized === 'WEEKLY') return ReportSchedule.WEEKLY
  if (normalized === 'MONTHLY') return ReportSchedule.MONTHLY
  if (normalized === 'REALTIME_ALERT' || normalized === 'REALTIME' || normalized === 'ALERT') return ReportSchedule.REALTIME_ALERT
  return null
}

function parseFormat(input: unknown): ReportFormat | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim().toUpperCase()
  if (normalized === 'EMAIL_HTML' || normalized === 'EMAIL') return ReportFormat.EMAIL_HTML
  if (normalized === 'PDF_ATTACHMENT' || normalized === 'PDF') return ReportFormat.PDF_ATTACHMENT
  if (normalized === 'BOTH' || normalized === 'PDF_AND_EMAIL') return ReportFormat.BOTH
  return null
}

function parseStatus(input: unknown): ReportStatus | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim().toUpperCase()
  if (normalized === 'ACTIVE') return ReportStatus.ACTIVE
  if (normalized === 'PAUSED') return ReportStatus.PAUSED
  if (normalized === 'ARCHIVED') return ReportStatus.ARCHIVED
  return null
}

function parseRecipients(input: unknown): string[] | null {
  let list: string[] = []
  if (Array.isArray(input)) {
    list = input.map(item => String(item).trim())
  } else if (typeof input === 'string') {
    list = input.split(',').map(s => s.trim())
  } else {
    return null
  }

  list = list.filter(Boolean)
  if (list.length === 0) return null

  for (const email of list) {
    if (!EMAIL_REGEX.test(email)) {
      return null // Invalid recipient found
    }
  }

  return Array.from(new Set(list)) // Deduplicate
}

// GET /api/reports — List all scheduled reports for caller's org
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const businessIdParam = searchParams.get('businessId')

    const whereClause: {
      orgId: string
      status?: ReportStatus
      businessId?: string
    } = {
      orgId: ctx.orgId,
    }

    if (statusParam) {
      const parsedStatus = parseStatus(statusParam)
      if (parsedStatus) whereClause.status = parsedStatus
    }

    if (businessIdParam) {
      const denied = assertBusinessOwnership(ctx, businessIdParam)
      if (denied) return denied
      whereClause.businessId = businessIdParam
    }

    const reports = await db.scheduledReport.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    })

    const formatted = reports.map(r => {
      let parsedRecipients: string[] = []
      try {
        parsedRecipients = JSON.parse(r.recipients)
      } catch {
        parsedRecipients = [r.recipients]
      }

      return {
        id: r.id,
        orgId: r.orgId,
        businessId: r.businessId,
        name: r.name,
        schedule: r.schedule,
        recipients: parsedRecipients,
        format: r.format,
        status: r.status,
        lastSentAt: r.lastSentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({
      reports: formatted,
    })
  } catch (error) {
    console.error('List reports error:', error)
    return NextResponse.json({ error: 'Failed to fetch scheduled reports' }, { status: 500 })
  }
}

// POST /api/reports — Create a scheduled report
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { name, schedule, recipients, format, businessId } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Report name is required' }, { status: 400 })
    }

    const parsedSchedule = parseSchedule(schedule)
    if (!parsedSchedule) {
      return NextResponse.json(
        { error: 'Invalid schedule. Allowed values: DAILY, WEEKLY, MONTHLY, REALTIME_ALERT' },
        { status: 400 },
      )
    }

    const validRecipients = parseRecipients(recipients ?? [ctx.user.email])
    if (!validRecipients) {
      return NextResponse.json(
        { error: 'Invalid recipients. Please provide valid email addresses' },
        { status: 400 },
      )
    }

    const parsedFormat = parseFormat(format ?? 'EMAIL_HTML')
    if (!parsedFormat) {
      return NextResponse.json(
        { error: 'Invalid format. Allowed values: EMAIL_HTML, PDF_ATTACHMENT, BOTH' },
        { status: 400 },
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
      message: `Report "${report.name}" created successfully with schedule: ${report.schedule}.`,
    })
  } catch (error) {
    console.error('Create report error:', error)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// PATCH /api/reports — Update / pause / activate a scheduled report
export async function PATCH(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { id, reportId, name, schedule, recipients, format, status } = body
    const targetId = id || reportId

    if (!targetId || typeof targetId !== 'string') {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 })
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

    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim()
    }

    if (schedule !== undefined) {
      const parsedSched = parseSchedule(schedule)
      if (!parsedSched) {
        return NextResponse.json({ error: 'Invalid schedule value' }, { status: 400 })
      }
      updateData.schedule = parsedSched
    }

    if (recipients !== undefined) {
      const parsedRecips = parseRecipients(recipients)
      if (!parsedRecips) {
        return NextResponse.json({ error: 'Invalid recipient email addresses' }, { status: 400 })
      }
      updateData.recipients = JSON.stringify(parsedRecips)
    }

    if (format !== undefined) {
      const parsedFmt = parseFormat(format)
      if (!parsedFmt) {
        return NextResponse.json({ error: 'Invalid format value' }, { status: 400 })
      }
      updateData.format = parsedFmt
    }

    if (status !== undefined) {
      const parsedStat = parseStatus(status)
      if (!parsedStat) {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
      }
      updateData.status = parsedStat
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
      message: `Report "${updated.name}" updated successfully.`,
    })
  } catch (error) {
    console.error('Update report error:', error)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}

// DELETE /api/reports — Delete a scheduled report
export async function DELETE(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')
    if (!id) {
      const body = await request.json().catch(() => ({}))
      id = body?.id || body?.reportId
    }

    if (!id) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 })
    }

    const existing = await db.scheduledReport.findUnique({
      where: { id },
    })

    if (!existing || existing.orgId !== ctx.orgId) {
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
        metadata: JSON.stringify({ orgId: ctx.orgId, name: existing.name }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Report "${existing.name}" deleted.`,
    })
  } catch (error) {
    console.error('Delete report error:', error)
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 })
  }
}

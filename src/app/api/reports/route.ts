import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'
import { isValidIanaTimezone, calculateNextRunAt } from '@/lib/reports/timezone-scheduler'
import { assertWithinLimit, getEntitlementLimit, assertEntitlement, executeWithQuotaLock } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
const MAX_RECIPIENTS_PER_SCHEDULE = 10
const MAX_SCHEDULES_PER_ORG = 25
const MAX_EMAIL_LENGTH = 254

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

export function validateAndNormalizeRecipients(input: unknown, maxLimit: number = MAX_RECIPIENTS_PER_SCHEDULE): { valid: boolean; recipients?: string[]; error?: string } {
  let list: string[] = []
  if (Array.isArray(input)) {
    list = input.map(item => String(item).trim().toLowerCase())
  } else if (typeof input === 'string') {
    list = input.split(',').map(s => s.trim().toLowerCase())
  } else {
    return { valid: false, error: 'Recipients must be an array or comma-separated list of email addresses' }
  }

  list = list.filter(Boolean)
  if (list.length === 0) {
    return { valid: false, error: 'At least one recipient email address is required' }
  }

  // Deduplicate
  const deduplicated = Array.from(new Set(list))

  const effectiveLimit = Math.min(maxLimit, MAX_RECIPIENTS_PER_SCHEDULE)
  if (deduplicated.length > effectiveLimit) {
    return {
      valid: false,
      error: `Maximum ${effectiveLimit} recipients allowed per report schedule (received ${deduplicated.length})`,
    }
  }

  for (const email of deduplicated) {
    if (email.length > MAX_EMAIL_LENGTH) {
      return { valid: false, error: `Recipient email exceeds maximum allowed length of ${MAX_EMAIL_LENGTH} characters` }
    }
    if (!EMAIL_REGEX.test(email)) {
      return { valid: false, error: `Invalid recipient email address format: ${email}` }
    }
  }

  return { valid: true, recipients: deduplicated }
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
      businessId?: string | { in: string[] }
    } = {
      orgId: ctx.orgId,
    }

    // Role scoping: if not org admin, restrict to caller's permitted business IDs
    if (!isOrgAdminRole(ctx.user.role)) {
      if (!ctx.businessIds || ctx.businessIds.length === 0) {
        return NextResponse.json({ reports: [] })
      }
      whereClause.businessId = { in: ctx.businessIds }
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

    const formatted = reports.map((r) => {
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
        timezone: r.timezone,
        reportType: r.reportType,
        lastSentAt: r.lastSentAt?.toISOString() ?? null,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
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
    const { name, schedule, recipients, format, businessId, timezone, reportType } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Report name is required' }, { status: 400 })
    }

    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Report name must not exceed 100 characters' }, { status: 400 })
    }

    // Role check: Only OWNER, ADMIN, AGENCY_ADMIN can configure org-wide reports
    if (!businessId && !isOrgAdminRole(ctx.user.role)) {
      return NextResponse.json(
        { error: 'Only organization administrators can configure organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    const parsedSchedule = parseSchedule(schedule)
    if (!parsedSchedule) {
      return NextResponse.json(
        { error: 'Invalid schedule. Allowed values: DAILY, WEEKLY, MONTHLY, REALTIME_ALERT' },
        { status: 400 }
      )
    }

    // Recipient validation against plan limit
    const planRecipientLimit = await getEntitlementLimit(ctx.orgId, 'report_recipients')
    const recipientValidation = validateAndNormalizeRecipients(recipients ?? [ctx.user.email], planRecipientLimit)
    if (!recipientValidation.valid || !recipientValidation.recipients) {
      return NextResponse.json(
        { error: recipientValidation.error || 'Invalid recipients. Please provide valid email addresses' },
        { status: 400 }
      )
    }

    const parsedFormat = parseFormat(format ?? 'EMAIL_HTML')
    if (!parsedFormat) {
      return NextResponse.json(
        { error: 'Invalid format. Allowed values: EMAIL_HTML, PDF_ATTACHMENT, BOTH', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    // Timezone validation: Must be valid IANA timezone
    const effectiveTimezone = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC'
    if (!isValidIanaTimezone(effectiveTimezone)) {
      return NextResponse.json(
        {
          error: `Invalid timezone "${timezone}". Must be a valid IANA timezone identifier (e.g. UTC, America/New_York, Asia/Kolkata).`,
          code: 'INVALID_TIMEZONE',
        },
        { status: 400 }
      )
    }

    // Report type validation
    const validReportType = typeof reportType === 'string' && reportType.trim() ? reportType.trim() : 'EXECUTIVE_SUMMARY'
    if (validReportType !== 'EXECUTIVE_SUMMARY') {
      return NextResponse.json(
        { error: 'Invalid reportType. Supported types: EXECUTIVE_SUMMARY', code: 'INVALID_REPORT_TYPE' },
        { status: 400 }
      )
    }

    let targetBusinessId: string | null = null
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      targetBusinessId = businessId
    }

    // Server-authoritative nextRunAt calculation (never trust client-supplied timestamp)
    const serverDerivedNextRunAt = calculateNextRunAt({
      schedule: parsedSchedule,
      timezone: effectiveTimezone,
    })

    // Concurrency-safe quota lock on scheduled_reports
    const quotaResult = await executeWithQuotaLock(ctx.orgId, 'scheduled_reports', 1, async (tx) => {
      const existingCount = await tx.scheduledReport.count({
        where: { orgId: ctx.orgId },
      })
      if (existingCount >= MAX_SCHEDULES_PER_ORG) {
        throw new Error('MAX_CEILING_EXCEEDED')
      }

      return await tx.scheduledReport.create({
        data: {
          orgId: ctx.orgId,
          businessId: targetBusinessId,
          name: name.trim(),
          schedule: parsedSchedule,
          recipients: JSON.stringify(recipientValidation.recipients),
          format: parsedFormat,
          status: ReportStatus.ACTIVE,
          timezone: effectiveTimezone,
          reportType: validReportType,
          nextRunAt: serverDerivedNextRunAt,
        },
      })
    })

    if (!quotaResult.success) {
      return NextResponse.json(
        {
          error: quotaResult.check.reason || `Organization schedule limit reached (${MAX_SCHEDULES_PER_ORG} max). Please delete or update existing schedules.`,
          code: 'SCHEDULE_LIMIT_EXCEEDED',
        },
        { status: 400 }
      )
    }

    const report = quotaResult.result

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
          recipientsCount: recipientValidation.recipients.length,
          format: report.format,
          timezone: report.timezone,
          nextRunAt: serverDerivedNextRunAt.toISOString(),
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
        recipients: recipientValidation.recipients,
        format: report.format,
        status: report.status,
        timezone: report.timezone,
        reportType: report.reportType,
        nextRunAt: report.nextRunAt?.toISOString() ?? null,
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
    const { id, reportId, name, schedule, recipients, format, status, timezone, reportType } = body
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

    // Role check: modifying org-wide report requires org admin
    if (!existing.businessId && !isOrgAdminRole(ctx.user.role)) {
      return NextResponse.json(
        { error: 'Only organization administrators can modify organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    // If business-scoped, caller must own/have access to that business
    if (existing.businessId) {
      const denied = assertBusinessOwnership(ctx, existing.businessId)
      if (denied) return denied
    }

    const updateData: {
      name?: string
      schedule?: ReportSchedule
      recipients?: string
      format?: ReportFormat
      status?: ReportStatus
      timezone?: string
      reportType?: string
      nextRunAt?: Date | null
    } = {}

    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim().slice(0, 100)
    }

    let scheduleChanged = false
    let newSchedule = existing.schedule
    if (schedule !== undefined) {
      const entitlementCheck = await assertEntitlement(ctx.orgId, 'scheduled_reports')
      if (!entitlementCheck.allowed) {
        return NextResponse.json(
          { error: entitlementCheck.reason || 'Scheduled reports require a paid plan', code: 'PLAN_UPGRADE_REQUIRED' },
          { status: 403 }
        )
      }

      const parsedSched = parseSchedule(schedule)
      if (!parsedSched) {
        return NextResponse.json({ error: 'Invalid schedule value' }, { status: 400 })
      }
      updateData.schedule = parsedSched
      newSchedule = parsedSched
      scheduleChanged = true
    }

    if (recipients !== undefined) {
      const planRecipientLimit = await getEntitlementLimit(ctx.orgId, 'report_recipients')
      const recipientValidation = validateAndNormalizeRecipients(recipients, planRecipientLimit)
      if (!recipientValidation.valid || !recipientValidation.recipients) {
        return NextResponse.json(
          { error: recipientValidation.error || 'Invalid recipient email addresses' },
          { status: 400 }
        )
      }
      updateData.recipients = JSON.stringify(recipientValidation.recipients)
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

    let tzChanged = false
    let newTz = existing.timezone
    if (timezone !== undefined && typeof timezone === 'string') {
      const trimmedTz = timezone.trim()
      if (!isValidIanaTimezone(trimmedTz)) {
        return NextResponse.json(
          { error: `Invalid timezone identifier: "${timezone}"`, code: 'INVALID_TIMEZONE' },
          { status: 400 }
        )
      }
      updateData.timezone = trimmedTz
      newTz = trimmedTz
      tzChanged = true
    }

    if (reportType !== undefined && typeof reportType === 'string') {
      const trimmedRt = reportType.trim()
      if (trimmedRt === 'EXECUTIVE_SUMMARY') {
        updateData.reportType = trimmedRt
      }
    }

    // If schedule or timezone changed, recalculate nextRunAt automatically
    if (scheduleChanged || tzChanged) {
      updateData.nextRunAt = calculateNextRunAt({
        schedule: newSchedule,
        timezone: newTz,
      })
    }

    const updated = await db.scheduledReport.update({
      where: { id: targetId },
      data: updateData,
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: updateData.status
          ? (updateData.status === ReportStatus.ACTIVE ? 'report.enabled' : 'report.disabled')
          : 'report.updated',
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

    const report = await db.scheduledReport.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

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

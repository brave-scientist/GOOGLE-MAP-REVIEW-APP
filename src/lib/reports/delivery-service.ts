import { db } from '@/lib/db'
import { ScheduledReport, ReportFormat, ReportStatus, DeliveryStatus } from '@prisma/client'
import { generateExecutiveReportData, ExecutiveReportData } from './report-service'
import { renderExecutiveReportPdf } from './pdf-renderer'
import { sendEmail, EmailAttachment } from '@/lib/integrations/resend'
import { escapeHtml, escapeAndTruncate } from './html-sanitizer'

export interface DeliveryExecutionResult {
  scheduleId: string
  recipient: string
  status: 'SENT' | 'FAILED' | 'SKIPPED_ALREADY_SENT'
  idempotencyKey: string
  providerMessageId?: string
  error?: string
}

const STALE_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes
const MAX_DELIVERY_ATTEMPTS = 5

/**
 * Generates an executive digest HTML email body.
 * Guaranteed HTML-safe against arbitrary reviewer and customer markup injection.
 */
export function generateExecutiveDigestHtml(params: {
  reportData: ExecutiveReportData
  scheduleName: string
  frequency: string
  appUrl: string
}): string {
  const { reportData, scheduleName, frequency, appUrl } = params
  const { kpis, branding, businessName, period } = reportData

  const primaryColor = branding.primaryColor || '#1E40AF'
  const brandName = escapeHtml(branding.brandName || 'ReviewReply')
  const safeScheduleName = escapeHtml(scheduleName)
  const safeBusinessName = escapeHtml(businessName)
  const safePeriodLabel = escapeHtml(period.label)
  const safeFrequency = escapeHtml(frequency)

  const reviewRows = reportData.recentReviews.slice(0, 3).map((r) => {
    const author = escapeHtml(r.author || 'Anonymous')
    const comment = r.text
      ? escapeAndTruncate(r.text, 150)
      : 'No comment provided'

    return `
    <div style="padding: 12px; margin-bottom: 8px; background: #fafafa; border-radius: 6px; border: 1px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <strong style="color: #111827; font-size: 13px;">${author}</strong>
        <span style="color: #d97706; font-weight: 700; font-size: 13px;">${'★'.repeat(r.rating)} (${r.rating}/5)</span>
      </div>
      <p style="font-size: 13px; color: #4b5563; margin: 0; line-height: 1.4;">${comment}</p>
    </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 20px; background: #f3f4f6; color: #111827;">
  <div style="background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="border-bottom: 2px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${primaryColor};">${brandName} • ${safeFrequency} Executive Digest</span>
      <h1 style="font-size: 20px; color: #111827; margin: 6px 0 0 0;">${safeScheduleName}</h1>
      <p style="font-size: 13px; color: #6b7280; margin: 4px 0 0 0;">Business: <strong>${safeBusinessName}</strong> • Period: ${safePeriodLabel}</p>
    </div>

    <!-- Executive KPI Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
      <div style="padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Average Rating</div>
        <div style="font-size: 22px; font-weight: 800; color: ${primaryColor}; margin-top: 2px;">${kpis.avgRatingPeriod.toFixed(1)} ★</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">All-time: ${kpis.avgRatingAllTime.toFixed(1)}</div>
      </div>
      <div style="padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">New Reviews</div>
        <div style="font-size: 22px; font-weight: 800; color: #111827; margin-top: 2px;">+${kpis.totalReviewsPeriod}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">All-time: ${kpis.totalReviewsAllTime}</div>
      </div>
      <div style="padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Reply Coverage</div>
        <div style="font-size: 22px; font-weight: 800; color: #059669; margin-top: 2px;">${kpis.replyCoverageRate}%</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${kpis.repliedCount} replied</div>
      </div>
      <div style="padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Actionable / Unreplied</div>
        <div style="font-size: 22px; font-weight: 800; color: ${kpis.actionableCount > 0 ? '#dc2626' : '#059669'}; margin-top: 2px;">${kpis.actionableCount}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${kpis.pendingRepliesCount} total pending</div>
      </div>
    </div>

    <!-- Recent Reviews Snippet -->
    ${reviewRows ? `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; margin: 0 0 10px 0; color: #111827;">Recent Customer Reviews</h3>
        ${reviewRows}
      </div>
    ` : ''}

    <div style="padding: 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; margin-bottom: 24px; text-align: center;">
      <p style="font-size: 13px; color: #166534; margin: 0; font-weight: 500;">
        📎 A full executive PDF report is attached with complete charts and review breakdown.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center;">
      <p style="font-size: 11px; color: #9ca3af; margin: 0;">
        This automated executive report was generated by ${brandName} for ${safeBusinessName}.
      </p>
    </div>
  </div>
</body>
</html>
  `
}

/**
 * Delivers a scheduled report to all configured recipients with true database-level idempotency
 * and atomic concurrency claim locks.
 */
export async function executeScheduledReportDelivery(params: {
  scheduleId: string
  actorId?: string
  overridePeriod?: { startDate?: Date | string; endDate?: Date | string }
}): Promise<{
  success: boolean
  processed: number
  sent: number
  failed: number
  skipped: number
  results: DeliveryExecutionResult[]
}> {
  const { scheduleId, actorId = 'system.cron' } = params

  // 1. Fetch ScheduledReport with Org and Business context
  const report = await db.scheduledReport.findUnique({
    where: { id: scheduleId },
    include: {
      org: true,
      business: true,
    },
  })

  if (!report) {
    throw new Error('Scheduled report not found')
  }

  // Disabled / Paused check
  if (report.status !== ReportStatus.ACTIVE) {
    return {
      success: true,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 1,
      results: [{
        scheduleId: report.id,
        recipient: 'ALL',
        status: 'SKIPPED_ALREADY_SENT',
        idempotencyKey: `skipped:inactive:${report.id}`,
        error: 'Report is not active',
      }],
    }
  }

  // Parse recipients
  let recipients: string[] = []
  try {
    recipients = JSON.parse(report.recipients)
  } catch {
    recipients = [report.recipients]
  }
  recipients = recipients.filter((r) => typeof r === 'string' && r.trim().length > 0)

  // 2. Generate Executive Report Data
  const reportData = await generateExecutiveReportData({
    orgId: report.orgId,
    businessId: report.businessId,
    schedule: report.schedule,
    timezone: report.timezone,
    startDate: params.overridePeriod?.startDate,
    endDate: params.overridePeriod?.endDate,
  })

  // 3. Render PDF if required
  let pdfBuffer: Buffer | null = null
  const shouldIncludePdf = report.format === ReportFormat.PDF_ATTACHMENT || report.format === ReportFormat.BOTH
  if (shouldIncludePdf) {
    pdfBuffer = renderExecutiveReportPdf(reportData)
  }

  const appUrl = process.env.NEXTAUTH_URL || 'https://reviewreply.pw'
  const emailHtml = generateExecutiveDigestHtml({
    reportData,
    scheduleName: report.name,
    frequency: report.schedule,
    appUrl,
  })

  // 4. Structured period boundaries for idempotency and retry reproducibility
  const periodStart = new Date(reportData.period.startDate)
  const periodEnd = new Date(reportData.period.endDate)
  const periodKey = reportData.period.startDate.slice(0, 10) + '_' + reportData.period.endDate.slice(0, 10)

  const results: DeliveryExecutionResult[] = []
  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0

  const now = new Date()
  const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_THRESHOLD_MS)

  for (const recipient of recipients) {
    const idempotencyKey = `report:${report.id}:${recipient}:${periodKey}`

    // 5. Atomic Concurrency Lock & Delivery State Machine
    // Check if record already exists
    const existingLog = await db.reportDeliveryLog.findUnique({
      where: { idempotencyKey },
    })

    if (existingLog) {
      if (existingLog.status === DeliveryStatus.SENT) {
        // Successful SENT delivery is NEVER resent
        skippedCount++
        results.push({
          scheduleId: report.id,
          recipient,
          status: 'SKIPPED_ALREADY_SENT',
          idempotencyKey,
          providerMessageId: existingLog.providerMessageId || undefined,
        })
        continue
      }

      // Check max attempts
      if (existingLog.attempts >= MAX_DELIVERY_ATTEMPTS) {
        failedCount++
        results.push({
          scheduleId: report.id,
          recipient,
          status: 'FAILED',
          idempotencyKey,
          error: `Max delivery attempts exceeded (${MAX_DELIVERY_ATTEMPTS})`,
        })
        continue
      }

      // Atomic Claim: Only transition if QUEUED, FAILED, or stale PROCESSING
      const claim = await db.reportDeliveryLog.updateMany({
        where: {
          id: existingLog.id,
          OR: [
            { status: DeliveryStatus.QUEUED },
            { status: DeliveryStatus.FAILED },
            { status: DeliveryStatus.PROCESSING, claimedAt: { lt: staleThreshold } },
          ],
        },
        data: {
          status: DeliveryStatus.PROCESSING,
          claimedAt: now,
          lastAttemptAt: now,
          attempts: { increment: 1 },
          error: null,
        },
      })

      if (claim.count === 0) {
        // Another concurrent worker holds the active lock or has finished sending
        skippedCount++
        results.push({
          scheduleId: report.id,
          recipient,
          status: 'SKIPPED_ALREADY_SENT',
          idempotencyKey,
          error: 'Delivery is actively being processed or claimed by another worker',
        })
        continue
      }
    } else {
      // New record: atomic insert in PROCESSING state
      try {
        await db.reportDeliveryLog.create({
          data: {
            reportId: report.id,
            orgId: report.orgId,
            businessId: report.businessId,
            recipient,
            format: report.format,
            status: DeliveryStatus.PROCESSING,
            idempotencyKey,
            reportPeriod: reportData.period.label,
            periodStart,
            periodEnd,
            attempts: 1,
            lastAttemptAt: now,
            claimedAt: now,
          },
        })
      } catch (insertErr: any) {
        if (insertErr.code === 'P2002') {
          // Unique race won by concurrent worker
          skippedCount++
          results.push({
            scheduleId: report.id,
            recipient,
            status: 'SKIPPED_ALREADY_SENT',
            idempotencyKey,
            error: 'Duplicate delivery execution prevented by database uniqueness constraint',
          })
          continue
        }
        throw insertErr
      }
    }

    // 6. Prepare Attachments
    const attachments: EmailAttachment[] = []
    if (pdfBuffer) {
      attachments.push({
        filename: `Executive-Report-${reportData.businessName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      })
    }

    // 7. Dispatch Email via Provider
    let sendResult: { success: boolean; messageId?: string; error?: string }
    try {
      sendResult = await sendEmail({
        to: recipient,
        subject: `[${report.schedule}] ${report.name} — ${reportData.businessName}`,
        html: emailHtml,
        from: reportData.branding.supportEmail
          ? `${reportData.branding.brandName} <${reportData.branding.supportEmail}>`
          : undefined,
        attachments,
      })
    } catch (providerEx: any) {
      sendResult = {
        success: false,
        error: `Email provider error: ${providerEx?.message || 'Unknown network error'}`.slice(0, 255),
      }
    }

    // 8. Finalize Delivery Status (PROCESSING -> SENT or FAILED)
    if (sendResult.success) {
      sentCount++
      await db.reportDeliveryLog.update({
        where: { idempotencyKey },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: new Date(),
          providerMessageId: sendResult.messageId || null,
          error: null,
        },
      })

      results.push({
        scheduleId: report.id,
        recipient,
        status: 'SENT',
        idempotencyKey,
        providerMessageId: sendResult.messageId,
      })
    } else {
      failedCount++
      const safeError = (sendResult.error || 'Unknown provider failure').slice(0, 255)
      await db.reportDeliveryLog.update({
        where: { idempotencyKey },
        data: {
          status: DeliveryStatus.FAILED,
          error: safeError,
        },
      })

      results.push({
        scheduleId: report.id,
        recipient,
        status: 'FAILED',
        idempotencyKey,
        error: safeError,
      })
    }
  }

  // Update ScheduledReport lastSentAt if any sent
  if (sentCount > 0) {
    await db.scheduledReport.update({
      where: { id: report.id },
      data: {
        lastSentAt: new Date(),
      },
    })
  }

  // Record audit log event
  await db.auditLog.create({
    data: {
      actorId,
      action: failedCount > 0 && sentCount === 0 ? 'report.delivery_failed' : 'report.dispatched',
      targetType: 'report',
      targetId: report.id,
      metadata: JSON.stringify({
        orgId: report.orgId,
        reportName: report.name,
        schedule: report.schedule,
        period: reportData.period.label,
        recipientsCount: recipients.length,
        sentCount,
        failedCount,
        skippedCount,
      }),
    },
  })

  return {
    success: failedCount === 0,
    processed: recipients.length,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
    results,
  }
}

/**
 * Retries a previously failed report delivery record safely.
 * CRITICAL: Preserves the exact original report period (periodStart and periodEnd),
 * never recalculating from the current date.
 */
export async function retryReportDeliveryLog(
  logId: string,
  orgId: string,
  options?: { newRecipient?: string }
): Promise<{
  success: boolean
  message: string
  log?: any
}> {
  const log = await db.reportDeliveryLog.findUnique({
    where: { id: logId },
    include: {
      report: true,
    },
  })

  if (!log || log.orgId !== orgId) {
    return { success: false, message: 'Delivery record not found or access denied' }
  }

  if (log.status === DeliveryStatus.SENT) {
    return { success: true, message: 'Report was already delivered successfully', log }
  }

  if (log.attempts >= MAX_DELIVERY_ATTEMPTS) {
    return {
      success: false,
      message: `Maximum retry attempts exceeded (${MAX_DELIVERY_ATTEMPTS} attempts max)`,
      log,
    }
  }

  const now = new Date()
  const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_THRESHOLD_MS)

  // Atomic Claim Lock for Retry
  const claim = await db.reportDeliveryLog.updateMany({
    where: {
      id: logId,
      orgId,
      OR: [
        { status: DeliveryStatus.FAILED },
        { status: DeliveryStatus.QUEUED },
        { status: DeliveryStatus.PROCESSING, claimedAt: { lt: staleThreshold } },
      ],
    },
    data: {
      status: DeliveryStatus.PROCESSING,
      claimedAt: now,
      lastAttemptAt: now,
      attempts: { increment: 1 },
      error: null,
    },
  })

  if (claim.count === 0) {
    return {
      success: false,
      message: 'Delivery record is actively being processed or was delivered by another worker',
    }
  }

  const recipientToUse = options?.newRecipient || log.recipient

  // 1. Generate Report Data REPRODUCING EXACT ORIGINAL PERIOD
  // Uses stored periodStart and periodEnd so report period NEVER shifts to current date
  const reportData = await generateExecutiveReportData({
    orgId: log.orgId,
    businessId: log.businessId,
    schedule: log.report.schedule,
    timezone: log.report.timezone,
    startDate: log.periodStart || undefined,
    endDate: log.periodEnd || undefined,
  })

  // 2. Render PDF if needed
  let pdfBuffer: Buffer | null = null
  if (log.format === ReportFormat.PDF_ATTACHMENT || log.format === ReportFormat.BOTH) {
    pdfBuffer = renderExecutiveReportPdf(reportData)
  }

  const emailHtml = generateExecutiveDigestHtml({
    reportData,
    scheduleName: log.report.name,
    frequency: log.report.schedule,
    appUrl: process.env.NEXTAUTH_URL || 'https://reviewreply.pw',
  })

  const attachments: EmailAttachment[] = []
  if (pdfBuffer) {
    attachments.push({
      filename: `Executive-Report-${reportData.businessName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    })
  }

  // 3. Re-attempt sendEmail
  let sendResult: { success: boolean; messageId?: string; error?: string }
  try {
    sendResult = await sendEmail({
      to: recipientToUse,
      subject: `[RETRY: ${log.report.schedule}] ${log.report.name} — ${reportData.businessName}`,
      html: emailHtml,
      from: reportData.branding.supportEmail
        ? `${reportData.branding.brandName} <${reportData.branding.supportEmail}>`
        : undefined,
      attachments,
    })
  } catch (providerEx: any) {
    sendResult = {
      success: false,
      error: `Email provider error: ${providerEx?.message || 'Unknown network error'}`.slice(0, 255),
    }
  }

  if (sendResult.success) {
    const updated = await db.reportDeliveryLog.update({
      where: { id: logId },
      data: {
        recipient: recipientToUse,
        status: DeliveryStatus.SENT,
        sentAt: new Date(),
        providerMessageId: sendResult.messageId || null,
        error: null,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: 'system.retry',
        action: 'report.delivery_retried',
        targetType: 'report_delivery_log',
        targetId: logId,
        metadata: JSON.stringify({
          orgId: log.orgId,
          reportId: log.reportId,
          recipient: recipientToUse,
          status: 'SENT',
          attempts: updated.attempts,
        }),
      },
    })

    return {
      success: true,
      message: 'Report delivered successfully on retry',
      log: updated,
    }
  } else {
    const safeError = (sendResult.error || 'Unknown provider failure').slice(0, 255)
    const updated = await db.reportDeliveryLog.update({
      where: { id: logId },
      data: {
        recipient: recipientToUse,
        status: DeliveryStatus.FAILED,
        error: safeError,
      },
    })

    return {
      success: false,
      message: `Retry delivery failed: ${safeError}`,
      log: updated,
    }
  }
}

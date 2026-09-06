import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ReportSchedule, ReportStatus, DeliveryStatus } from '@prisma/client'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { enforceCronAuth } from '@/lib/cron-auth'
import { executeScheduledReportDelivery } from '@/lib/reports/delivery-service'
import { calculateNextRunAt } from '@/lib/reports/timezone-scheduler'
import { escapeHtml, escapeAndTruncate } from '@/lib/reports/html-sanitizer'

export const dynamic = 'force-dynamic'

const MS_PER_HOUR = 3600 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

export function isReportDue(
  schedule: ReportSchedule,
  lastSentAt: Date | null,
  now: Date,
  nextRunAt?: Date | null
): boolean {
  // If nextRunAt is explicitly set by the timezone engine and in the future, it is not yet due
  if (nextRunAt && nextRunAt.getTime() > now.getTime()) {
    return false
  }

  if (!lastSentAt) return true

  const diffMs = now.getTime() - lastSentAt.getTime()

  switch (schedule) {
    case ReportSchedule.DAILY:
      // Due if sent more than 23 hours ago
      return diffMs >= 23 * MS_PER_HOUR
    case ReportSchedule.WEEKLY:
      // Due if sent more than 6.5 days ago
      return diffMs >= 6.5 * MS_PER_DAY
    case ReportSchedule.MONTHLY:
      // Due if sent more than 27 days ago
      return diffMs >= 27 * MS_PER_DAY
    case ReportSchedule.REALTIME_ALERT:
      // Alert check frequency: due every 15 minutes to catch fresh incoming negative reviews
      return diffMs >= 15 * 60 * 1000
    default:
      return false
  }
}

/**
 * Escaped HTML template for standard digest emails.
 */
function generateReportDigestHtml(params: {
  reportName: string
  schedule: string
  businessName: string
  avgRating: number
  totalReviews: number
  newReviewsCount: number
  pendingRepliesCount: number
  recentReviews: Array<{ author: string; rating: number; text?: string | null; createdAt: Date }>
  appUrl: string
}): string {
  const safeReportName = escapeHtml(params.reportName)
  const safeSchedule = escapeHtml(params.schedule)
  const safeBusinessName = escapeHtml(params.businessName)

  const reviewRows = params.recentReviews.length > 0
    ? params.recentReviews.map(r => {
        const safeAuthor = escapeHtml(r.author || 'Anonymous')
        const safeComment = r.text ? escapeAndTruncate(r.text, 180) : 'No comment provided'
        return `
        <div style="padding: 12px; margin-bottom: 8px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #111; font-size: 13px;">${safeAuthor}</strong>
            <span style="color: #97781B; font-weight: 600; font-size: 13px;">${'★'.repeat(Math.round(r.rating))} (${r.rating})</span>
          </div>
          <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.4;">${safeComment}</p>
        </div>`
      }).join('')
    : '<p style="font-size: 13px; color: #888; margin: 0;">No new reviews received during this period.</p>'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; background: #f4f4f5; color: #18181b;">
  <div style="background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #e4e4e7;">
    <div style="border-bottom: 1px solid #e4e4e7; padding-bottom: 16px; margin-bottom: 20px;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #97781B;">ReviewReply ${safeSchedule} Digest</span>
      <h1 style="font-size: 20px; color: #09090b; margin: 6px 0 0 0;">${safeReportName}</h1>
      <p style="font-size: 13px; color: #71717a; margin: 4px 0 0 0;">Business: <strong>${safeBusinessName}</strong></p>
    </div>

    <!-- Metrics Grid -->
    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">Average Rating</div>
        <div style="font-size: 20px; font-weight: 800; color: #97781B; margin-top: 2px;">${params.avgRating.toFixed(1)} ★</div>
      </div>
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">New Reviews</div>
        <div style="font-size: 20px; font-weight: 800; color: #09090b; margin-top: 2px;">+${params.newReviewsCount}</div>
      </div>
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">Pending Replies</div>
        <div style="font-size: 20px; font-weight: 800; color: ${params.pendingRepliesCount > 0 ? '#ea580c' : '#16a34a'}; margin-top: 2px;">${params.pendingRepliesCount}</div>
      </div>
    </div>

    <!-- Recent Reviews Section -->
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 14px; font-weight: 700; margin: 0 0 10px 0; color: #09090b;">Recent Reviews</h3>
      ${reviewRows}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${params.appUrl}/inbox" style="display: inline-block; background: #97781B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Open Inbox to Respond →
      </a>
    </div>

    <div style="border-top: 1px solid #e4e4e7; padding-top: 14px; text-align: center;">
      <p style="font-size: 11px; color: #a1a1aa; margin: 0;">
        This automated digest was generated by ReviewReply for ${safeBusinessName}. Manage schedules in <a href="${params.appUrl}/reports" style="color: #97781B; text-decoration: none;">Reports Settings</a>.
      </p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Escaped HTML template for real-time negative review alerts.
 */
function generateNegativeAlertHtml(params: {
  businessName: string
  negativeReviews: Array<{ author: string; rating: number; text?: string | null; createdAt: Date }>
  appUrl: string
}): string {
  const safeBusinessName = escapeHtml(params.businessName)

  const reviewRows = params.negativeReviews.map(r => {
    const safeAuthor = escapeHtml(r.author || 'Anonymous')
    const safeComment = r.text ? escapeAndTruncate(r.text, 250) : 'No comment text provided'
    return `
    <div style="padding: 14px; margin-bottom: 10px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <strong style="color: #991b1b; font-size: 14px;">${safeAuthor}</strong>
        <span style="color: #dc2626; font-weight: 700; font-size: 14px;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} (${r.rating}/5)</span>
      </div>
      <p style="font-size: 13px; color: #7f1d1d; margin: 6px 0 0 0; line-height: 1.5;">${safeComment}</p>
    </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; background: #f4f4f5; color: #18181b;">
  <div style="background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #fee2e2;">
    <div style="border-bottom: 1px solid #fee2e2; padding-bottom: 16px; margin-bottom: 20px;">
      <span style="display: inline-block; background: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px;">
        ⚠️ Urgent Negative Review Alert
      </span>
      <h1 style="font-size: 20px; color: #991b1b; margin: 6px 0 0 0;">Negative Review Received (≤ 2★)</h1>
      <p style="font-size: 13px; color: #71717a; margin: 4px 0 0 0;">Business: <strong>${safeBusinessName}</strong></p>
    </div>

    <p style="font-size: 14px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
      We detected <strong>${params.negativeReviews.length}</strong> new negative review(s) that require your immediate attention. Quick, thoughtful responses help retain unhappy customers and demonstrate professionalism to prospective clients.
    </p>

    <!-- Reviews Section -->
    <div style="margin-bottom: 24px;">
      ${reviewRows}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${params.appUrl}/inbox" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 700;">
        Respond in ReviewReply Inbox →
      </a>
    </div>

    <div style="border-top: 1px solid #e4e4e7; padding-top: 14px; text-align: center;">
      <p style="font-size: 11px; color: #a1a1aa; margin: 0;">
        This alert was generated in real time by ReviewReply for ${safeBusinessName}.
      </p>
    </div>
  </div>
</body>
</html>`
}

async function handleReportCron(request: NextRequest) {
  // 1. Strict Fail-Closed Cron Authentication
  const authError = enforceCronAuth(request)
  if (authError) return authError

  const startTime = Date.now()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    // 2. Stale Job Recovery: Recover delivery logs stuck in PROCESSING for > 10 minutes
    const staleThreshold = new Date(now.getTime() - STALE_JOB_THRESHOLD_MS)
    const recovered = await db.reportDeliveryLog.updateMany({
      where: {
        status: DeliveryStatus.PROCESSING,
        claimedAt: { lt: staleThreshold },
      },
      data: {
        status: DeliveryStatus.FAILED,
        error: 'Delivery worker timeout (recovered by cron engine)',
      },
    })

    if (recovered.count > 0) {
      console.log(`[ReportCron] Recovered ${recovered.count} stale PROCESSING delivery records.`)
    }

    // 3. Query all ACTIVE scheduled reports
    const activeReports = await db.scheduledReport.findMany({
      where: { status: ReportStatus.ACTIVE },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            businesses: {
              select: { id: true, name: true, avgRating: true, reviewCount: true },
            },
          },
        },
        business: {
          select: { id: true, name: true, avgRating: true, reviewCount: true },
        },
      },
    })

    let processed = 0
    let dispatched = 0
    let skipped = 0
    const errors: Array<{ reportId: string; error: string }> = []

    for (const report of activeReports) {
      // Invariant check: Ensure disabled / paused reports are never dispatched
      if (report.status !== ReportStatus.ACTIVE) {
        skipped++
        continue
      }

      processed++

      if (!isReportDue(report.schedule, report.lastSentAt, now, report.nextRunAt)) {
        skipped++
        continue
      }

      // Calculate next scheduled UTC run instant before claiming
      const nextRunAt = calculateNextRunAt({
        schedule: report.schedule,
        timezone: report.timezone,
        referenceDate: now,
      })

      // 4. Concurrency Protection: Optimistic Atomic Claim Lock
      // Only the worker that successfully claims this exact snapshot proceeds
      const claim = await db.scheduledReport.updateMany({
        where: {
          id: report.id,
          status: ReportStatus.ACTIVE,
          lastSentAt: report.lastSentAt,
        },
        data: {
          lastSentAt: now,
          nextRunAt,
        },
      })

      if (claim.count === 0) {
        // Another concurrent worker claimed or updated this report — skip cleanly
        skipped++
        continue
      }

      // Parse recipient list
      let recipientList: string[] = []
      try {
        const parsed = JSON.parse(report.recipients)
        if (Array.isArray(parsed)) recipientList = parsed
      } catch {
        recipientList = report.recipients.split(',').map(s => s.trim())
      }

      recipientList = recipientList.filter(Boolean)
      if (recipientList.length === 0) {
        skipped++
        continue
      }

      const businessId = report.businessId || report.org.businesses[0]?.id
      const businessName = report.business?.name || report.org.businesses[0]?.name || report.org.name

      // 5. Tenant Isolation: Each report runs in its own try/catch boundary
      // One failed report NEVER crashes or halts dispatch for unrelated tenants
      try {
        if (report.schedule === ReportSchedule.REALTIME_ALERT) {
          const sinceDate = report.lastSentAt || new Date(now.getTime() - MS_PER_DAY)

          const negativeReviews = businessId
            ? await db.review.findMany({
                where: {
                  businessId,
                  rating: { lte: 2 },
                  createdAt: { gte: sinceDate },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                  author: true,
                  rating: true,
                  text: true,
                  createdAt: true,
                },
              })
            : []

          if (negativeReviews.length === 0) {
            skipped++
            continue
          }

          const alertHtml = generateNegativeAlertHtml({
            businessName,
            negativeReviews,
            appUrl,
          })

          let sendFailed = false
          for (const recipient of recipientList) {
            if (isResendConfigured()) {
              const sendResult = await sendEmail({
                to: recipient,
                subject: `⚠️ [ALERT] Negative Review Received (≤ 2★) — ${businessName}`,
                html: alertHtml,
              })
              if (!sendResult.success) {
                sendFailed = true
                errors.push({ reportId: report.id, error: `Resend error for ${recipient}: ${sendResult.error}` })
              }
            }
          }

          if (sendFailed) {
            await db.scheduledReport.update({
              where: { id: report.id },
              data: { lastSentAt: report.lastSentAt },
            })
          } else {
            await db.auditLog.create({
              data: {
                actorId: 'system.cron',
                action: 'report.alert_dispatched',
                targetType: 'report',
                targetId: report.id,
                metadata: JSON.stringify({
                  orgId: report.orgId,
                  reportName: report.name,
                  negativeReviewsCount: negativeReviews.length,
                  recipientsCount: recipientList.length,
                  dispatchedAt: now.toISOString(),
                }),
              },
            })
            dispatched++
          }
        } else {
          // Periodic Digest: DAILY, WEEKLY, MONTHLY
          const deliveryResult = await executeScheduledReportDelivery({
            scheduleId: report.id,
            actorId: 'system.cron',
          })

          if (deliveryResult.sent > 0) {
            dispatched++
          }
          if (deliveryResult.failed > 0) {
            errors.push({
              reportId: report.id,
              error: `Delivery failed for ${deliveryResult.failed} recipients`,
            })
          }
        }
      } catch (reportErr: any) {
        console.error(`Error processing report ${report.id} for org ${report.orgId}:`, reportErr?.message || reportErr)
        errors.push({ reportId: report.id, error: reportErr.message || 'Unknown processing error' })

        // Revert lastSentAt on catastrophic worker failure
        await db.scheduledReport.update({
          where: { id: report.id },
          data: { lastSentAt: report.lastSentAt },
        }).catch(() => {})
      }
    }

    const durationMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      processed,
      dispatched,
      skipped,
      staleRecovered: recovered.count,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      durationMs,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('Report cron engine fatal error:', error)
    return NextResponse.json(
      { error: 'Report dispatch cron failed', details: error.message },
      { status: 500 }
    )
  }
}

// GET /api/cron/reports (Vercel Cron invokes via GET)
export async function GET(request: NextRequest) {
  return handleReportCron(request)
}

// POST /api/cron/reports (External schedulers invoke via POST)
export async function POST(request: NextRequest) {
  return handleReportCron(request)
}

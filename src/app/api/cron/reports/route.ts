import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ReportSchedule, ReportStatus } from '@prisma/client'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { enforceCronAuth } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

const MS_PER_HOUR = 3600 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

export function isReportDue(schedule: ReportSchedule, lastSentAt: Date | null, now: Date): boolean {
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
  const {
    reportName,
    schedule,
    businessName,
    avgRating,
    totalReviews,
    newReviewsCount,
    pendingRepliesCount,
    recentReviews,
    appUrl,
  } = params

  const reviewRows = recentReviews.length > 0
    ? recentReviews.map(r => `
      <div style="padding: 12px; margin-bottom: 8px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong style="color: #111; font-size: 13px;">${r.author}</strong>
          <span style="color: #97781B; font-weight: 600; font-size: 13px;">${'★'.repeat(Math.round(r.rating))} (${r.rating})</span>
        </div>
        <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.4;">${r.text ? (r.text.length > 180 ? r.text.slice(0, 180) + '…' : r.text) : 'No comment provided'}</p>
      </div>
    `).join('')
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
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #97781B;">ReviewReply ${schedule} Digest</span>
      <h1 style="font-size: 20px; color: #09090b; margin: 6px 0 0 0;">${reportName}</h1>
      <p style="font-size: 13px; color: #71717a; margin: 4px 0 0 0;">Business: <strong>${businessName}</strong></p>
    </div>

    <!-- Metrics Grid -->
    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">Average Rating</div>
        <div style="font-size: 20px; font-weight: 800; color: #97781B; margin-top: 2px;">${avgRating.toFixed(1)} ★</div>
      </div>
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">New Reviews</div>
        <div style="font-size: 20px; font-weight: 800; color: #09090b; margin-top: 2px;">+${newReviewsCount}</div>
      </div>
      <div style="flex: 1; padding: 12px; background: #fafafa; border-radius: 8px; text-align: center; border: 1px solid #f0f0f0;">
        <div style="font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600;">Pending Replies</div>
        <div style="font-size: 20px; font-weight: 800; color: ${pendingRepliesCount > 0 ? '#ea580c' : '#16a34a'}; margin-top: 2px;">${pendingRepliesCount}</div>
      </div>
    </div>

    <!-- Recent Reviews Section -->
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 14px; font-weight: 700; margin: 0 0 10px 0; color: #09090b;">Recent Reviews</h3>
      ${reviewRows}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${appUrl}/inbox" style="display: inline-block; background: #97781B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Open Inbox to Respond →
      </a>
    </div>

    <div style="border-top: 1px solid #e4e4e7; padding-top: 14px; text-align: center;">
      <p style="font-size: 11px; color: #a1a1aa; margin: 0;">
        This automated digest was generated by ReviewReply for ${businessName}. Manage schedules in <a href="${appUrl}/reports" style="color: #97781B; text-decoration: none;">Reports Settings</a>.
      </p>
    </div>
  </div>
</body>
</html>`
}

function generateNegativeAlertHtml(params: {
  businessName: string
  negativeReviews: Array<{ author: string; rating: number; text?: string | null; createdAt: Date }>
  appUrl: string
}): string {
  const { businessName, negativeReviews, appUrl } = params

  const reviewRows = negativeReviews.map(r => `
    <div style="padding: 14px; margin-bottom: 10px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <strong style="color: #991b1b; font-size: 14px;">${r.author}</strong>
        <span style="color: #dc2626; font-weight: 700; font-size: 14px;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} (${r.rating}/5)</span>
      </div>
      <p style="font-size: 13px; color: #7f1d1d; margin: 6px 0 0 0; line-height: 1.5;">${r.text || 'No comment text provided'}</p>
    </div>
  `).join('')

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
      <p style="font-size: 13px; color: #71717a; margin: 4px 0 0 0;">Business: <strong>${businessName}</strong></p>
    </div>

    <p style="font-size: 14px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
      We detected <strong>${negativeReviews.length}</strong> new negative review(s) that require your immediate attention. Quick, thoughtful responses help retain unhappy customers and demonstrate professionalism to prospective clients.
    </p>

    <!-- Reviews Section -->
    <div style="margin-bottom: 24px;">
      ${reviewRows}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${appUrl}/inbox" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 700;">
        Respond in ReviewReply Inbox →
      </a>
    </div>

    <div style="border-top: 1px solid #e4e4e7; padding-top: 14px; text-align: center;">
      <p style="font-size: 11px; color: #a1a1aa; margin: 0;">
        This alert was generated in real time by ReviewReply for ${businessName}.
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

  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    // 2. Query all ACTIVE scheduled reports
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
      processed++

      if (!isReportDue(report.schedule, report.lastSentAt, now)) {
        skipped++
        continue
      }

      // 3. Concurrency Protection: Optimistic Atomic Claim Lock
      // Only the worker that successfully updates lastSentAt proceeds
      const claim = await db.scheduledReport.updateMany({
        where: {
          id: report.id,
          status: ReportStatus.ACTIVE,
          lastSentAt: report.lastSentAt,
        },
        data: {
          lastSentAt: now,
        },
      })

      if (claim.count === 0) {
        // Another concurrent worker claimed or updated this report — skip
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

      try {
        // 4. Branch by Schedule Type: REALTIME_ALERT vs Periodic Digest
        if (report.schedule === ReportSchedule.REALTIME_ALERT) {
          // Look for reviews with rating <= 2 received since lastSentAt (or within last 24h)
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

          // If no qualifying negative reviews exist, do NOT dispatch an empty alert
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
            // Revert lastSentAt so alert can be retried on next iteration
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
          const sinceDate = report.lastSentAt || new Date(now.getTime() - 7 * MS_PER_DAY)

          const recentReviews = businessId
            ? await db.review.findMany({
                where: {
                  businessId,
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

          const totalReviewsCount = report.business?.reviewCount || report.org.businesses.reduce((sum, b) => sum + b.reviewCount, 0)
          const avgRating = report.business?.avgRating || (report.org.businesses.length > 0 ? report.org.businesses.reduce((sum, b) => sum + b.avgRating, 0) / report.org.businesses.length : 5.0)

          const pendingRepliesCount = businessId
            ? await db.review.count({
                where: {
                  businessId,
                  draftStatus: { in: ['DRAFT', 'PENDING', 'NONE'] },
                },
              })
            : 0

          const digestHtml = generateReportDigestHtml({
            reportName: report.name,
            schedule: report.schedule,
            businessName,
            avgRating,
            totalReviews: totalReviewsCount,
            newReviewsCount: recentReviews.length,
            pendingRepliesCount,
            recentReviews,
            appUrl,
          })

          let sendFailed = false
          for (const recipient of recipientList) {
            if (isResendConfigured()) {
              const sendResult = await sendEmail({
                to: recipient,
                subject: `[${report.schedule}] ${report.name} — ${businessName}`,
                html: digestHtml,
              })
              if (!sendResult.success) {
                sendFailed = true
                errors.push({ reportId: report.id, error: `Resend error for ${recipient}: ${sendResult.error}` })
              }
            }
          }

          if (sendFailed) {
            // Revert lastSentAt on failure
            await db.scheduledReport.update({
              where: { id: report.id },
              data: { lastSentAt: report.lastSentAt },
            })
          } else {
            await db.auditLog.create({
              data: {
                actorId: 'system.cron',
                action: 'report.dispatched',
                targetType: 'report',
                targetId: report.id,
                metadata: JSON.stringify({
                  orgId: report.orgId,
                  reportName: report.name,
                  schedule: report.schedule,
                  recipientsCount: recipientList.length,
                  dispatchedAt: now.toISOString(),
                }),
              },
            })
            dispatched++
          }
        }
      } catch (reportErr: any) {
        console.error(`Error processing report ${report.id}:`, reportErr)
        errors.push({ reportId: report.id, error: reportErr.message || 'Unknown processing error' })
        // Revert lastSentAt
        await db.scheduledReport.update({
          where: { id: report.id },
          data: { lastSentAt: report.lastSentAt },
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      dispatched,
      skipped,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('Report cron engine error:', error)
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

import { db } from '@/lib/db'
import { ReportSchedule } from '@prisma/client'
import { resolveCalendarReportPeriod, isValidIanaTimezone } from './timezone-scheduler'

export interface ExecutiveReportData {
  orgId: string
  businessId: string | null
  businessName: string
  period: {
    startDate: string
    endDate: string
    label: string
  }
  kpis: {
    totalReviewsPeriod: number
    totalReviewsAllTime: number
    avgRatingPeriod: number
    avgRatingAllTime: number
    repliedCount: number
    replyCoverageRate: number // 0 to 100
    pendingRepliesCount: number
    actionableCount: number // rating <= 3 without reply
  }
  ratingDistribution: {
    5: number
    4: number
    3: number
    2: number
    1: number
  }
  sentimentSummary: {
    positive: number
    neutral: number
    negative: number
  }
  recentReviews: Array<{
    id: string
    author: string
    rating: number
    text: string
    createdAt: string
    replyText: string | null
    repliedAt: string | null
    sentimentScore: number | null
  }>
  branding: {
    brandName: string
    logoUrl: string | null
    primaryColor: string
    accentColor: string
    supportEmail: string | null
    portalTitle: string | null
    hideReviewReplyBadge: boolean
  }
  generatedAt: string
}

export interface ReportPeriodOptions {
  startDate?: Date | string
  endDate?: Date | string
  schedule?: ReportSchedule | string
  timezone?: string
  useCalendarPeriod?: boolean
}

/**
 * Resolves date boundaries for a given schedule or explicit range.
 * Supports both calendar-aligned periods (with IANA timezone) and rolling window fallback.
 */
export function resolveReportPeriod(options: ReportPeriodOptions = {}): {
  start: Date
  end: Date
  label: string
} {
  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate)
    const end = new Date(options.endDate)
    const label = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
    return { start, end, label }
  }

  if (options.startDate) {
    const start = new Date(options.startDate)
    const end = options.endDate ? new Date(options.endDate) : new Date()
    const label = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
    return { start, end, label }
  }

  // If calendar period requested or timezone specified with calendar semantics
  if (options.useCalendarPeriod || (options.timezone && isValidIanaTimezone(options.timezone) && options.useCalendarPeriod !== false)) {
    return resolveCalendarReportPeriod({
      schedule: options.schedule,
      timezone: options.timezone,
    })
  }

  // Rolling window fallback for backward compatibility
  const end = options.endDate ? new Date(options.endDate) : new Date()
  const sched = (options.schedule || 'WEEKLY').toUpperCase()
  let days = 7
  if (sched === 'DAILY') days = 1
  else if (sched === 'MONTHLY') days = 30
  else if (sched === 'REALTIME_ALERT') days = 1

  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const label = `${sched} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`
  return { start, end, label }
}

/**
 * Generates an executive report strictly scoped to the tenant's orgId and optional businessId.
 * Employs bounded database aggregations (COUNT, AVG, GROUP BY) to prevent memory exhaustion.
 */
export async function generateExecutiveReportData(params: {
  orgId: string
  businessId?: string | null
  startDate?: Date | string
  endDate?: Date | string
  schedule?: ReportSchedule | string
  timezone?: string
  useCalendarPeriod?: boolean
}): Promise<ExecutiveReportData> {
  const { orgId, businessId } = params

  // 1. Resolve branding (or safe defaults)
  const brandingRecord = await db.agencyBranding.findUnique({
    where: { orgId },
  })

  const branding = {
    brandName: brandingRecord?.brandName || 'ReviewReply',
    logoUrl: brandingRecord?.logoUrl || null,
    primaryColor: brandingRecord?.primaryColor || '#1E40AF',
    accentColor: brandingRecord?.accentColor || '#3B82F6',
    supportEmail: brandingRecord?.supportEmail || null,
    portalTitle: brandingRecord?.portalTitle || 'Executive Client Portal',
    hideReviewReplyBadge: brandingRecord?.hideReviewReplyBadge ?? false,
  }

  // 2. Resolve Business / Location Name & Validate Ownership
  let businessName = 'All Locations'
  if (businessId) {
    const business = await db.business.findFirst({
      where: { id: businessId, orgId },
      select: { id: true, name: true },
    })

    if (!business) {
      throw new Error('Business not found or access denied')
    }
    businessName = business.name
  } else {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    })
    businessName = org?.name ? `${org.name} (All Locations)` : 'All Locations'
  }

  // 3. Resolve Period
  const { start, end, label } = resolveReportPeriod({
    startDate: params.startDate,
    endDate: params.endDate,
    schedule: params.schedule,
    timezone: params.timezone,
    useCalendarPeriod: params.useCalendarPeriod,
  })

  // 4. Scoped query clauses
  const periodWhere = {
    business: { orgId },
    ...(businessId ? { businessId } : {}),
    createdAt: {
      gte: start,
      lte: end,
    },
  }

  const allTimeWhere = {
    business: { orgId },
    ...(businessId ? { businessId } : {}),
  }

  // 5. Scalable Database Aggregations (replaces unbounded findMany)
  const [
    totalReviewsPeriod,
    periodAggregate,
    ratingGroups,
    repliedCount,
    actionableCount,
    positiveSentimentCount,
    negativeSentimentCount,
    totalReviewsAllTime,
    allTimeAggregate,
    recentReviewRecords,
  ] = await Promise.all([
    // A. Period Count
    db.review.count({ where: periodWhere }),
    // B. Period Average Rating
    db.review.aggregate({
      where: periodWhere,
      _avg: { rating: true },
    }),
    // C. Rating Breakdown (GROUP BY rating)
    db.review.groupBy({
      by: ['rating'],
      where: periodWhere,
      _count: { id: true },
    }),
    // D. Reply Coverage Count
    db.review.count({
      where: {
        ...periodWhere,
        OR: [
          { repliedAt: { not: null } },
          { replyText: { not: null } },
          { draftStatus: 'POSTED' },
        ],
      },
    }),
    // E. Actionable Negative / Unreplied (rating <= 3 without reply)
    db.review.count({
      where: {
        ...periodWhere,
        rating: { lte: 3 },
        repliedAt: null,
        replyText: null,
        draftStatus: { not: 'POSTED' },
      },
    }),
    // F. Positive Sentiment Count
    db.review.count({
      where: {
        ...periodWhere,
        OR: [
          { sentimentScore: { gt: 0.15 } },
          { sentimentScore: null, rating: { gte: 4 } },
        ],
      },
    }),
    // G. Negative Sentiment Count
    db.review.count({
      where: {
        ...periodWhere,
        OR: [
          { sentimentScore: { lt: -0.15 } },
          { sentimentScore: null, rating: { lte: 2 } },
        ],
      },
    }),
    // H. All-time Review Count
    db.review.count({ where: allTimeWhere }),
    // I. All-time Average Rating
    db.review.aggregate({
      where: allTimeWhere,
      _avg: { rating: true },
    }),
    // J. Bounded Recent Reviews Sample (Strict limit: 10 max)
    db.review.findMany({
      where: periodWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        author: true,
        rating: true,
        text: true,
        createdAt: true,
        replyText: true,
        repliedAt: true,
        sentimentScore: true,
      },
    }),
  ])

  // 6. Compute Metrics
  const avgRatingPeriod = periodAggregate._avg.rating
    ? Math.round(periodAggregate._avg.rating * 10) / 10
    : 0

  const avgRatingAllTime = allTimeAggregate._avg.rating
    ? Math.round(allTimeAggregate._avg.rating * 10) / 10
    : 0

  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const group of ratingGroups) {
    if (group.rating in ratingDistribution) {
      ratingDistribution[group.rating as keyof typeof ratingDistribution] = group._count.id
    }
  }

  const neutralSentimentCount = Math.max(
    0,
    totalReviewsPeriod - positiveSentimentCount - negativeSentimentCount
  )
  const sentimentSummary = {
    positive: positiveSentimentCount,
    neutral: neutralSentimentCount,
    negative: negativeSentimentCount,
  }

  const replyCoverageRate = totalReviewsPeriod > 0
    ? Math.round((repliedCount / totalReviewsPeriod) * 100)
    : 100

  const pendingRepliesCount = Math.max(0, totalReviewsPeriod - repliedCount)

  // 7. Format Bounded Recent Reviews (Sanitized & Limited)
  const recentReviews = recentReviewRecords.map((r) => ({
    id: r.id,
    author: r.author,
    rating: r.rating,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    replyText: r.replyText,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
    sentimentScore: r.sentimentScore,
  }))

  return {
    orgId,
    businessId: businessId || null,
    businessName,
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label,
    },
    kpis: {
      totalReviewsPeriod,
      totalReviewsAllTime,
      avgRatingPeriod,
      avgRatingAllTime,
      repliedCount,
      replyCoverageRate,
      pendingRepliesCount,
      actionableCount,
    },
    ratingDistribution,
    sentimentSummary,
    recentReviews,
    branding,
    generatedAt: new Date().toISOString(),
  }
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Topic frequency + average sentiment per topic
    const allReviews = await db.review.findMany({
      where: { topics: { not: null } },
      select: { topics: true, sentimentScore: true, rating: true },
    })

    const topicMap: Record<string, { count: number; sentimentSum: number; ratingSum: number }> = {}
    for (const r of allReviews) {
      if (!r.topics) continue
      try {
        const topics = JSON.parse(r.topics) as string[]
        for (const t of topics) {
          const clean = t.trim()
          if (!clean) continue
          if (!topicMap[clean]) topicMap[clean] = { count: 0, sentimentSum: 0, ratingSum: 0 }
          topicMap[clean].count++
          topicMap[clean].sentimentSum += r.sentimentScore || 0
          topicMap[clean].ratingSum += r.rating
        }
      } catch { /* skip malformed */ }
    }

    const topicAnalysis = Object.entries(topicMap)
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        avgSentiment: Math.round((data.sentimentSum / data.count) * 100) / 100,
        avgRating: Math.round((data.ratingSum / data.count) * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    // Source breakdown
    const sourceBreakdown = await db.review.groupBy({
      by: ['source'],
      _count: true,
      _avg: { rating: true },
    })

    // Sentiment distribution
    const sentimentBuckets = { positive: 0, neutral: 0, negative: 0 }
    for (const r of allReviews) {
      const s = r.sentimentScore || 0
      if (s > 0.2) sentimentBuckets.positive++
      else if (s < -0.2) sentimentBuckets.negative++
      else sentimentBuckets.neutral++
    }

    // Response time stats
    const repliedReviews = await db.review.findMany({
      where: {
        repliedAt: { not: null },
      },
      select: { createdAt: true, repliedAt: true },
    })
    const responseTimes = repliedReviews
      .map(r => (r.repliedAt!.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60)) // hours
      .filter(h => h >= 0 && h < 24 * 30) // ignore outliers
    const avgResponseHours = responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : 0

    return NextResponse.json({
      topicAnalysis,
      sourceBreakdown: sourceBreakdown.map(s => ({
        source: s.source,
        count: s._count,
        avgRating: Math.round((s._avg.rating || 0) * 10) / 10,
      })),
      sentimentDistribution: sentimentBuckets,
      avgResponseHours,
      totalReviewsAnalyzed: allReviews.length,
    })
  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: String(error) },
      { status: 500 }
    )
  }
}

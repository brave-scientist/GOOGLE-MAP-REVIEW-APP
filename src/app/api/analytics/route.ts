import { NextRequest, NextResponse } from 'next/server'
import { requirePlan } from '@/lib/plan-enforcement'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for LLM analysis

// GET /api/analytics — Compute sentiment + topic analytics
// If ?reanalyze=true, re-runs LLM sentiment analysis on all reviews (slow but real)
// Otherwise, uses cached sentiment scores from DB
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reanalyze = searchParams.get('reanalyze') === 'true'

    // If reanalyze requested, run LLM on all reviews that need it
    const authCheck = await requirePlan(request, "PRO")
    if (authCheck instanceof NextResponse) return authCheck
    if (reanalyze) {
      await reanalyzeAllReviews()
    }

    // Topic frequency + average sentiment per topic
    const allReviews = await db.review.findMany({
      where: { topics: { not: null } },
      select: { id: true, topics: true, sentimentScore: true, rating: true },
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

    // Sentiment distribution (computed from real scores)
    const sentimentBuckets = { positive: 0, neutral: 0, negative: 0 }
    for (const r of allReviews) {
      const s = r.sentimentScore || 0
      if (s > 0.2) sentimentBuckets.positive++
      else if (s < -0.2) sentimentBuckets.negative++
      else sentimentBuckets.neutral++
    }

    // Response time stats
    const repliedReviews = await db.review.findMany({
      where: { repliedAt: { not: null } },
      select: { createdAt: true, repliedAt: true },
    })
    const responseTimes = repliedReviews
      .map(r => (r.repliedAt!.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60))
      .filter(h => h >= 0 && h < 24 * 30)
    const avgResponseHours = responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : 0

    // Check if sentiment was computed by AI or is from seed
    const reviewsWithAiSentiment = await db.review.count({
      where: { sentimentScore: { not: null } }
    })

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
      sentimentSource: reanalyze ? 'ai-computed' : 'cached',
      aiSentimentCount: reviewsWithAiSentiment,
    })
  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: String(error) },
      { status: 500 }
    )
  }
}

// Re-analyze all reviews using the LLM for real sentiment + topic extraction
async function reanalyzeAllReviews() {
  const reviews = await db.review.findMany({
    select: { id: true, text: true, rating: true },
  })

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize)
    const promises = batch.map(async (review) => {
      try {
        const analysis = await analyzeReviewWithLLM(review.text, review.rating)
        await db.review.update({
          where: { id: review.id },
          data: {
            sentimentScore: analysis.sentiment,
            topics: JSON.stringify(analysis.topics),
          },
        })
      } catch (e) {
        console.error(`Failed to analyze review ${review.id}:`, e)
      }
    })
    await Promise.all(promises)
  }
}

// Use the real LLM to compute sentiment + extract topics from review text
async function analyzeReviewWithLLM(reviewText: string, rating: number): Promise<{
  sentiment: number
  topics: string[]
}> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const systemPrompt = `You are a sentiment analysis engine. Analyze the customer review and return ONLY a JSON object with this exact format:
{
  "sentiment": <number between -1.0 and 1.0>,
  "topics": [<array of 1-3 topic strings from: food, service, cleanliness, atmosphere, value, staff, wait-time, pricing, communication, professionalism, quality, location>]
}

Rules:
- sentiment: -1.0 = very negative, 0 = neutral, +1.0 = very positive
- Consider BOTH the star rating and the actual text content
- A 4-star review complaining about wait time should have lower sentiment than a 5-star enthusiastic review
- topics: extract 1-3 most relevant topics mentioned in the review
- Return ONLY the JSON, no other text`

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: `Rating: ${rating}/5 stars\n\nReview: "${reviewText}"` },
      ],
      thinking: { type: 'disabled' },
    })

    const response = completion.choices[0]?.message?.content?.trim() || ''

    // Parse the JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        sentiment: Math.max(-1, Math.min(1, parsed.sentiment || 0)),
        topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [],
      }
    }
  } catch (error) {
    console.error('LLM sentiment analysis failed:', error)
  }

  // Fallback: derive sentiment from rating
  const fallbackSentiment = rating >= 4 ? 0.7 : rating === 3 ? 0.0 : -0.5
  return { sentiment: fallbackSentiment, topics: ['service'] }
}

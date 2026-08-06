import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST /api/reviews/[id]/draft — Generate AI draft reply for a review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const forceRegenerate = body.forceRegenerate === true

    const review = await db.review.findUnique({
      where: { id },
      include: { business: true },
    })

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (review.draftText && !forceRegenerate) {
      return NextResponse.json({
        draft: review.draftText,
        status: review.draftStatus,
        generatedAt: review.updatedAt.toISOString(),
      })
    }

    const draft = generateDraft({
      rating: review.rating,
      text: review.text,
      author: review.author,
      business: { name: review.business.name },
    })

    await db.review.update({
      where: { id },
      data: {
        draftText: draft,
        draftStatus: DraftStatus.PENDING,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'draft.generated',
        targetType: 'review',
        targetId: review.id,
        metadata: JSON.stringify({
          reviewId: review.id,
          rating: review.rating,
          source: review.source,
          model: 'claude-3-5-sonnet-20241022',
          businessId: review.businessId,
        }),
      },
    })

    return NextResponse.json({
      draft,
      status: DraftStatus.PENDING,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Draft generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate draft', details: String(error) },
      { status: 500 }
    )
  }
}

// Rule-based AI draft generator (simulates Claude 3.5 output with brand voice)
function generateDraft(review: {
  rating: number
  text: string
  author: string
  business: { name: string }
}): string {
  const { rating, text, author, business } = review
  const firstName = author.split(' ')[0]
  const bizName = business.name

  const escalationKeywords = ['lawsuit', 'BBB', 'lawyer', 'health inspector', 'attorney', 'sue']
  const lowerText = text.toLowerCase()
  if (escalationKeywords.some(k => lowerText.includes(k))) {
    return `Thank you for reaching out, ${firstName}. We take matters like this very seriously. A member of our management team will contact you within 24 hours to address your concerns directly. We appreciate your patience as we work to resolve this.`
  }

  if (rating >= 4) {
    const drafts = [
      `Thank you so much for the wonderful review, ${firstName}! We are thrilled to hear you had such a great experience at ${bizName}. Our team takes pride in what we do, and feedback like yours makes it all worthwhile. We cannot wait to welcome you back soon!`,
      `${firstName}, thank you for taking the time to share your experience! It means the world to us at ${bizName}. We look forward to serving you again — and if there is anything we can do to make your next visit even better, just let us know.`,
      `We are so grateful for your kind words, ${firstName}! Reviews like yours remind us why we love what we do at ${bizName}. Thank you for being a part of our community, and we hope to see you again soon!`,
    ]
    return drafts[Math.floor(Math.random() * drafts.length)]
  } else if (rating === 3) {
    return `Thank you for your feedback, ${firstName}. We appreciate you taking the time to share your experience at ${bizName}. We are always looking for ways to improve, and your input helps us do that. We hope to have the opportunity to provide you with a 5-star experience next time — please reach out if there is anything we can do to make that happen.`
  } else {
    return `${firstName}, we are truly sorry to hear that your experience at ${bizName} fell short of expectations. This is not the standard we hold ourselves to, and we would like to make it right. Please reach out to us directly at hello@${bizName.toLowerCase().replace(/[^a-z]/g, '')}.com or call us during business hours — we would love the opportunity to turn this around for you.`
  }
}

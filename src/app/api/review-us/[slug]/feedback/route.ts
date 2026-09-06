import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { processReviewAutomations } from '@/lib/automation/rule-engine'

export const dynamic = 'force-dynamic'

// POST /api/review-us/[slug]/feedback — public, rate-limited endpoint for customer private feedback
//
// This allows customers to reach business management directly without public review gating.
// FTC Compliance: All public review links remain universally visible on the page; this is an
// additional direct channel for customer resolution.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!slug) {
    return NextResponse.json({ error: 'Invalid review link' }, { status: 400 })
  }

  // 1. Rate limiting by client IP and slug
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip'
  const rl = await rateLimit(`feedback:${slug}:${ip}`, 5, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a minute before submitting again.' },
      { status: 429 }
    )
  }

  // 2. Locate business
  const business = await db.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      reviewPagePrivateFeedbackEnabled: true,
    },
  })

  if (!business) {
    return NextResponse.json({ error: 'Review page not found' }, { status: 404 })
  }

  if (!business.reviewPagePrivateFeedbackEnabled) {
    return NextResponse.json(
      { error: 'Private feedback is currently disabled for this business' },
      { status: 403 }
    )
  }

  // 3. Parse and validate input payload
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const { customerName, customerContact, rating, message } = body || {}

  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Feedback message is required' }, { status: 400 })
  }

  const cleanName = customerName.trim().slice(0, 100)
  const cleanMessage = message.trim().slice(0, 2000)
  const cleanContact = typeof customerContact === 'string' && customerContact.trim()
    ? customerContact.trim().slice(0, 120)
    : null

  let numericRating = 3
  if (typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    numericRating = rating
  }

  // 4. Create internal review record
  try {
    const feedbackReview = await db.review.create({
      data: {
        businessId: business.id,
        source: 'INTERNAL',
        externalId: `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        author: cleanName,
        rating: numericRating,
        text: cleanContact
          ? `${cleanMessage}\n\n[Direct Contact: ${cleanContact}]`
          : cleanMessage,
        draftStatus: 'NONE',
      },
    })

    // AUTO-01: Asynchronously evaluate automations for customer feedback
    processReviewAutomations({
      reviewId: feedbackReview.id,
      businessId: business.id,
      eventSource: 'private_customer_feedback',
    }).catch((autoErr) => {
      console.error('[Private Feedback] Automation trigger non-fatal error:', autoErr)
    })

    return NextResponse.json({
      success: true,
      id: feedbackReview.id,
      message: 'Thank you for your feedback! The management team has received your message.',
    })
  } catch (error) {
    console.error('Failed to submit private customer feedback:', error)
    return NextResponse.json(
      { error: 'An error occurred while saving your feedback. Please try again.' },
      { status: 500 }
    )
  }
}

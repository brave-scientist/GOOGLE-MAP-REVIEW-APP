import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAndDeduplicateWebhook } from '@/lib/automation/webhook-security'
import { processReviewAutomations } from '@/lib/automation/rule-engine'
import { ReviewSource, DraftStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

import crypto from 'crypto'

let ephemeralWebhookSecret: string | null = null

// POST /api/webhooks/automation — Inbound cryptographically signed webhook for review events
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signatureHeader = request.headers.get('x-reviewreply-signature') || request.headers.get('x-signature')
    const timestampHeader = request.headers.get('x-reviewreply-timestamp') || request.headers.get('x-timestamp')
    const eventIdHeader = request.headers.get('x-reviewreply-event-id') || request.headers.get('x-event-id')

    // Webhook signing secret (configured in environment)
    const secret = process.env.AUTOMATION_WEBHOOK_SECRET || process.env.SESSION_SECRET
    if (process.env.NODE_ENV === 'production' && (!secret || secret.trim().length < 32)) {
      console.error('[Automation Webhook] FATAL: AUTOMATION_WEBHOOK_SECRET or SESSION_SECRET must be configured and at least 32 characters in production')
      return NextResponse.json({ error: 'Webhook service configuration error' }, { status: 500 })
    }
    if (!secret && !ephemeralWebhookSecret) {
      ephemeralWebhookSecret = crypto.randomBytes(32).toString('hex')
    }
    const effectiveSecret = secret || ephemeralWebhookSecret!

    // 1. Verify signature, timestamp expiration, and event deduplication
    const verification = await verifyAndDeduplicateWebhook({
      rawBody,
      signatureHeader,
      timestampHeader,
      eventIdHeader,
      secret: effectiveSecret,
      provider: 'automation_webhook',
    })

    if (!verification.valid) {
      const statusCode =
        verification.code === 'DUPLICATE_EVENT'
          ? 200 // Return 200 on duplicate event to prevent provider webhook retry storms
          : verification.code === 'TIMESTAMP_EXPIRED'
          ? 401
          : 400

      return NextResponse.json(
        {
          error: verification.error,
          code: verification.code,
          eventId: verification.eventId,
        },
        { status: statusCode }
      )
    }

    // 2. Parse and validate JSON payload
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload', code: 'INVALID_JSON' }, { status: 400 })
    }

    const { businessId, externalId, source = 'GOOGLE', rating, text, author, authorAvatar } = payload

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'Missing businessId in payload', code: 'MISSING_BUSINESS_ID' }, { status: 400 })
    }

    // 3. Verify business exists
    const business = await db.business.findUnique({
      where: { id: businessId },
    })

    if (!business) {
      return NextResponse.json({ error: 'Target business not found', code: 'BUSINESS_NOT_FOUND' }, { status: 404 })
    }

    const cleanRating = typeof rating === 'number' && rating >= 1 && rating <= 5 ? Math.round(rating) : 5
    const cleanText = typeof text === 'string' ? text.trim() : ''
    const cleanAuthor = typeof author === 'string' && author.trim() ? author.trim().slice(0, 100) : 'Anonymous'
    const reviewExternalId = typeof externalId === 'string' && externalId.trim() ? externalId.trim() : `wh_${verification.eventId}`

    const mappedSource =
      source === 'FACEBOOK' ? ReviewSource.FACEBOOK : source === 'INTERNAL' ? ReviewSource.INTERNAL : ReviewSource.GOOGLE

    // 4. Upsert review record idempotently
    const review = await db.review.upsert({
      where: {
        source_externalId: {
          source: mappedSource,
          externalId: reviewExternalId,
        },
      },
      create: {
        businessId,
        source: mappedSource,
        externalId: reviewExternalId,
        author: cleanAuthor,
        authorAvatar: typeof authorAvatar === 'string' ? authorAvatar : null,
        rating: cleanRating,
        text: cleanText,
        draftStatus: DraftStatus.NONE,
      },
      update: {
        rating: cleanRating,
        text: cleanText,
        author: cleanAuthor,
      },
    })

    // 5. Trigger Automation & Escalation evaluation asynchronously
    const automationResult = await processReviewAutomations({
      reviewId: review.id,
      businessId,
      eventSource: 'inbound_webhook',
    })

    return NextResponse.json({
      success: true,
      eventId: verification.eventId,
      reviewId: review.id,
      automations: {
        rulesEvaluated: automationResult.rulesEvaluated,
        matchedRules: automationResult.matchedRules,
        escalationsCreated: automationResult.escalationsCreated,
        dispatchesTriggered: automationResult.dispatchesTriggered,
        sentiment: automationResult.classification.sentiment,
        severity: automationResult.classification.severity,
      },
    })
  } catch (error: any) {
    console.error('[Automation Webhook] Processing error:', error)
    return NextResponse.json({ error: 'Internal webhook processing error' }, { status: 500 })
  }
}

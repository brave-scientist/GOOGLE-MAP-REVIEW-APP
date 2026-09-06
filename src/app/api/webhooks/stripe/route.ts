import { NextRequest, NextResponse } from 'next/server'
import { BillingService } from '@/lib/billing'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/stripe — Idempotent Stripe Webhook Ingestion & Synchronization
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  // Fail-closed: Never parse or process webhooks if secret is unconfigured
  if (!webhookSecret || webhookSecret.trim().length === 0) {
    return NextResponse.json(
      { error: 'Stripe webhooks not configured' },
      { status: 503 }
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  const bodyText = await request.text()
  let event: Stripe.Event

  // Cryptographic signature verification
  try {
    event = BillingService.verifyWebhookSignature(bodyText, signature, webhookSecret)
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    )
  }

  if (!event.id) {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 })
  }

  try {
    const result = await BillingService.handleWebhookEvent(event)

    if (result.duplicate || result.concurrent) {
      return NextResponse.json({
        received: true,
        duplicate: true,
        concurrent: !!result.concurrent,
        message: result.concurrent ? 'Event processing already in flight' : 'Event already processed',
      })
    }

    return NextResponse.json({ received: true, retried: result.retried })
  } catch (processErr: any) {
    // Sanitize error logging to ensure zero secret leakage
    const sanitizedMessage = typeof processErr?.message === 'string' ? processErr.message.slice(0, 200) : 'Unknown error'
    console.error('Failed to process Stripe webhook business mutation:', sanitizedMessage)
    return NextResponse.json({ error: 'Failed to process webhook event' }, { status: 500 })
  }
}

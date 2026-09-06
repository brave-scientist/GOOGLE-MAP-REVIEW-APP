import { NextRequest, NextResponse } from 'next/server'
import { SmsService, TwilioAdapter } from '@/lib/sms'
import { reconstructTwilioUrl } from '@/lib/integrations/twilio-webhook'

export const dynamic = 'force-dynamic'

const twilioProvider = new TwilioAdapter()

// POST /api/webhooks/twilio — Inbound SMS & Delivery Receipt Webhook for Twilio Fallback Adapter
// Handles:
// 1. Outbound status callbacks (queued, sent, delivered, undelivered, failed)
//    Updating SmsDeliveryEvent.status, ReviewRequest.deliveredAt, and ReviewUsSendRecipient.status/deliveredAt
// 2. Inbound customer keyword replies (STOP, UNSUBSCRIBE, START, HELP)
//
// SEC-03: Cryptographic HMAC-SHA1 signature verification enforced via TwilioAdapter.verifyWebhook().
// Fails closed with 403 on missing or invalid signature.
// Monotonic delivery status transitions and DB-enforced idempotency via SmsWebhookEvent.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const headers = new Headers(request.headers)
    headers.set('x-request-url', reconstructTwilioUrl(request))

    const result = await SmsService.handleWebhook(twilioProvider, rawBody, headers)

    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: result.status,
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[TWILIO-WEBHOOK-ERROR]', error)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}

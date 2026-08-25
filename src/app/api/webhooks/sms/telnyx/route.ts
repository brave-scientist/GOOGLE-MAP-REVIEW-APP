import { NextRequest, NextResponse } from 'next/server'
import { SmsService, TelnyxAdapter } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const telnyxProvider = new TelnyxAdapter()

// POST /api/webhooks/sms/telnyx — Inbound Telnyx SMS & Delivery Receipt Webhook
// Verifies Ed25519 cryptographic signature & timestamp freshness
// Idempotently ingests delivery receipts and processes STOP/START keywords
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const result = await SmsService.handleWebhook(telnyxProvider, rawBody, request.headers)

    return NextResponse.json(
      { message: result.message },
      { status: result.status }
    )
  } catch (error) {
    console.error('[TELNYX-WEBHOOK-ERROR]', error)
    return NextResponse.json(
      { error: 'Internal webhook processing error' },
      { status: 500 }
    )
  }
}

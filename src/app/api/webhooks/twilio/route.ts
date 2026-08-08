import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isStopKeyword, isStartKeyword } from '@/lib/integrations/twilio'
import {
  validateTwilioSignature,
  reconstructTwilioUrl,
} from '@/lib/integrations/twilio-webhook'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/twilio — Inbound SMS webhook
// Twilio calls this when a customer replies to an SMS
// Handles STOP/UNSUBSCRIBE/CANCEL/END/QUIT → opt out
// Handles START/YES/UNSTOP → opt back in
//
// SEC-03: Rejects unsigned requests with 403. Without this, anyone could POST
// a spoofed STOP message and unsubscribe arbitrary phone numbers.
//
// Fail-closed behavior:
//   - If TWILIO_AUTH_TOKEN is unset, ALL webhook requests are rejected (403).
//     This is correct — if Twilio isn't configured, the webhook endpoint
//     shouldn't exist anyway, and accepting unsigned requests would be a
//     security hole.
//   - If the X-Twilio-Signature header is missing, the request is rejected.
//   - If the signature doesn't match (tampered body or URL), the request is
//     rejected.
export async function POST(request: NextRequest) {
  try {
    // SEC-03: Read the raw body BEFORE parsing, so we can validate the signature
    // against the exact bytes Twilio signed. Next.js's request.formData() may
    // re-encode the body, so we read text() first and construct URLSearchParams
    // manually.
    const rawBody = await request.text()
    const formData = new URLSearchParams(rawBody)

    const from = formData.get('From') as string
    const body = (formData.get('Body') as string || '').trim()
    const messageSid = formData.get('MessageSid') as string

    // SEC-03: Validate the X-Twilio-Signature header
    const signature = request.headers.get('x-twilio-signature')
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const url = reconstructTwilioUrl(request)

    const isValid = validateTwilioSignature({
      signature,
      url,
      formData,
      authToken,
    })

    if (!isValid) {
      // Log the rejected attempt (without logging the auth token or signature)
      await db.auditLog.create({
        data: {
          action: 'sms.webhook_rejected',
          targetType: 'opt_out',
          targetId: from || 'unknown',
          metadata: JSON.stringify({
            reason: !authToken
              ? 'twilio_not_configured'
              : !signature
                ? 'missing_signature'
                : 'invalid_signature',
            from: from || null,
            bodyPreview: body.substring(0, 50),
            messageSid: messageSid || null,
            // Don't log the signature itself — it's a secret
          }),
        },
      }).catch(() => {
        // Don't let audit-log failures mask the rejection
      })

      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 403,
          headers: { 'Content-Type': 'text/xml' },
        },
      )
    }

    if (!from) {
      return new NextResponse('<Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const normalizedFrom = from.toLowerCase()

    // Check if this is an opt-out keyword
    if (isStopKeyword(body)) {
      await db.optOut.upsert({
        where: { contact: normalizedFrom },
        create: {
          contact: normalizedFrom,
          channel: 'sms',
          reason: `STOP keyword: "${body}"`,
        },
        update: {
          channel: 'sms',
          reason: `STOP keyword: "${body}"`,
        },
      })

      // Log the opt-out
      await db.auditLog.create({
        data: {
          action: 'sms.opt_out',
          targetType: 'opt_out',
          targetId: normalizedFrom,
          metadata: JSON.stringify({
            from,
            body,
            messageSid,
          }),
        },
      })

      // Respond with confirmation (Twilio expects XML)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed from ReviewReply SMS messages. You will not receive further messages. Reply START to resubscribe.</Message>
</Response>`
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Check if this is an opt-in keyword (START/YES/UNSTOP)
    if (isStartKeyword(body)) {
      await db.optOut.delete({
        where: { contact: normalizedFrom },
      }).catch(() => {})

      await db.auditLog.create({
        data: {
          action: 'sms.opt_in',
          targetType: 'opt_out',
          targetId: normalizedFrom,
          metadata: JSON.stringify({ from, body, messageSid }),
        },
      })

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been resubscribed to ReviewReply SMS messages. Reply STOP to unsubscribe at any time.</Message>
</Response>`
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // For all other messages, just acknowledge
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Twilio webhook error:', error)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
      status: 500,
    })
  }
}

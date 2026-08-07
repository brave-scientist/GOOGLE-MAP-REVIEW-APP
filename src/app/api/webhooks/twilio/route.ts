import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isStopKeyword, isStartKeyword } from '@/lib/integrations/twilio'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/twilio — Inbound SMS webhook
// Twilio calls this when a customer replies to an SMS
// Handles STOP/UNSUBSCRIBE/CANCEL/END/QUIT → opt out
// Handles START/YES/UNSTOP → opt back in
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const from = formData.get('From') as string // Customer's phone number
    const body = (formData.get('Body') as string || '').trim()
    const messageSid = formData.get('MessageSid') as string

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

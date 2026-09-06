// src/lib/sms/twilio.ts — Twilio SMS Fallback Adapter
import {
  ISmsProvider,
  SmsSendOptions,
  SmsSendResult,
  ParsedSmsWebhookEvent,
} from './types'
import { validateAndNormalizePhone } from './phone'
import { validateTwilioSignature, reconstructTwilioUrl } from '../integrations/twilio-webhook'

export class TwilioAdapter implements ISmsProvider {
  readonly name = 'twilio' as const

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = options.from || process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        provider: 'twilio',
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.',
      }
    }

    const normalizedTo = validateAndNormalizePhone(options.to)
    if (!normalizedTo.valid || !normalizedTo.e164) {
      return {
        success: false,
        provider: 'twilio',
        status: 'failed',
        errorCode: 'INVALID_DESTINATION',
        errorMessage: normalizedTo.error || 'Destination phone number is invalid.',
      }
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: normalizedTo.e164,
          From: fromNumber,
          Body: options.body,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && data.sid) {
        return {
          success: true,
          provider: 'twilio',
          providerMessageId: data.sid,
          status: 'sent',
          segments: typeof data.num_segments === 'string' ? parseInt(data.num_segments, 10) : 1,
        }
      }

      return {
        success: false,
        provider: 'twilio',
        status: 'failed',
        errorCode: String(data.code || `HTTP_${response.status}`),
        errorMessage: data.message || 'Twilio API message dispatch failed.',
      }
    } catch (err) {
      return {
        success: false,
        provider: 'twilio',
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      }
    }
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const signature = headers.get('x-twilio-signature')
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const reqUrl = headers.get('x-request-url')
    const publicUrl = process.env.NEXT_PUBLIC_APP_URL
    let url: string
    if (reqUrl) {
      url = reqUrl
    } else if (publicUrl) {
      url = `${publicUrl.replace(/\/$/, '')}/api/webhooks/twilio`
    } else {
      const host = headers.get('x-forwarded-host') || headers.get('host') || 'localhost:3000'
      const proto = headers.get('x-forwarded-proto') || 'https'
      url = `${proto}://${host}/api/webhooks/twilio`
    }
    const formData = new URLSearchParams(rawBody)

    return validateTwilioSignature({
      signature,
      url,
      formData,
      authToken,
    })
  }

  parseWebhook(rawBody: string): ParsedSmsWebhookEvent | null {
    try {
      const formData = new URLSearchParams(rawBody)
      const from = formData.get('From') || undefined
      const to = formData.get('To') || undefined
      const body = formData.get('Body') || undefined
      const messageSid = formData.get('MessageSid') || undefined
      const messageStatus = formData.get('MessageStatus')?.toLowerCase() || undefined
      const errorCode = formData.get('ErrorCode') || undefined
      const errorMessage = formData.get('ErrorMessage') || undefined

      let type: ParsedSmsWebhookEvent['type'] = 'inbound.received'
      if (messageStatus) {
        if (messageStatus === 'delivered') {
          type = 'outbound.delivered'
        } else if (messageStatus === 'failed') {
          type = 'outbound.failed'
        } else if (messageStatus === 'undelivered') {
          type = 'outbound.undelivered'
        } else if (messageStatus === 'sent' || messageStatus === 'queued' || messageStatus === 'sending') {
          type = 'outbound.sent'
        }
      }

      // Generate unique eventId per status callback so sent followed by delivered can both be ingested
      // while duplicate deliveries of the same status are caught by the idempotency gate
      const eventId = messageSid
        ? (messageStatus ? `${messageSid}_${messageStatus}` : `${messageSid}_inbound`)
        : `twilio_${Date.now()}_${Math.random().toString(36).slice(2)}`

      return {
        provider: 'twilio',
        eventId,
        providerMessageId: messageSid,
        type,
        from,
        to,
        body,
        status: messageStatus || undefined,
        errorCode: errorCode || undefined,
        errorMessage: errorMessage || undefined,
        occurredAt: new Date(),
      }
    } catch {
      return null
    }
  }
}

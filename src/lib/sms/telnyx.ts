// src/lib/sms/telnyx.ts — Telnyx SMS Adapter (REST API v2 + Ed25519 Webhook Verification)
import crypto from 'crypto'
import {
  ISmsProvider,
  SmsSendOptions,
  SmsSendResult,
  ParsedSmsWebhookEvent,
  SMS_LIMITS,
} from './types'
import { validateAndNormalizePhone } from './phone'

const TELNYX_MESSAGES_URL = 'https://api.telnyx.com/v2/messages'
// Standard 12-byte DER SPKI prefix for 32-byte raw Ed25519 public keys
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export class TelnyxAdapter implements ISmsProvider {
  readonly name = 'telnyx' as const

  /**
   * Dispatches an outbound SMS message via the Telnyx v2 Messages REST API.
   */
  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const apiKey = process.env.TELNYX_API_KEY
    const fromNumber = options.from || process.env.TELNYX_FROM_PHONE_NUMBER
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID

    if (!apiKey) {
      return {
        success: false,
        provider: 'telnyx',
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Telnyx API key not configured. Set TELNYX_API_KEY in environment.',
      }
    }

    if (!fromNumber && !messagingProfileId) {
      return {
        success: false,
        provider: 'telnyx',
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Telnyx sender number or messaging profile missing. Set TELNYX_FROM_PHONE_NUMBER in environment.',
      }
    }

    // Validate and enforce strict E.164 destination
    const normalizedTo = validateAndNormalizePhone(options.to)
    if (!normalizedTo.valid || !normalizedTo.e164) {
      return {
        success: false,
        provider: 'telnyx',
        status: 'failed',
        errorCode: 'INVALID_DESTINATION',
        errorMessage: normalizedTo.error || 'Destination phone number is invalid.',
      }
    }

    try {
      const payload: Record<string, unknown> = {
        to: normalizedTo.e164,
        text: options.body,
      }

      if (fromNumber) {
        payload.from = fromNumber
      }
      if (messagingProfileId) {
        payload.messaging_profile_id = messagingProfileId
      }

      const response = await fetch(TELNYX_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errorObj = data.errors?.[0] || {}
        return {
          success: false,
          provider: 'telnyx',
          status: 'failed',
          errorCode: errorObj.code || `HTTP_${response.status}`,
          errorMessage: errorObj.detail || errorObj.title || 'Telnyx message dispatch failed.',
        }
      }

      const msgData = data.data || {}
      return {
        success: true,
        provider: 'telnyx',
        providerMessageId: msgData.id,
        status: 'sent',
        segments: typeof msgData.parts === 'number' ? msgData.parts : 1,
      }
    } catch (err) {
      return {
        success: false,
        provider: 'telnyx',
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Verifies the cryptographic Ed25519 signature of incoming Telnyx webhook requests.
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const signature = headers.get('telnyx-signature-ed25519')
    const timestamp = headers.get('telnyx-timestamp')
    const rawPublicKey = process.env.TELNYX_PUBLIC_KEY

    // Fail closed if required headers or public key are missing
    if (!signature || !timestamp || !rawPublicKey) {
      return false
    }

    // Replay attack protection: reject events older than 300 seconds
    const eventTime = parseInt(timestamp, 10)
    const currentTime = Math.floor(Date.now() / 1000)
    if (isNaN(eventTime) || Math.abs(currentTime - eventTime) > SMS_LIMITS.WEBHOOK_REPLAY_WINDOW_SEC) {
      return false
    }

    try {
      // Decode public key and signature
      const keyBytes = Buffer.from(rawPublicKey.trim(), 'base64')
      const sigBytes = Buffer.from(signature.trim(), 'base64')

      if (keyBytes.length !== 32 || sigBytes.length !== 64) {
        return false
      }

      // Convert raw 32-byte Ed25519 public key to SPKI DER format
      const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, keyBytes])
      const publicKey = crypto.createPublicKey({
        key: spkiDer,
        format: 'der',
        type: 'spki',
      })

      // Telnyx signs: timestamp + "." + rawBody
      const signedPayload = Buffer.from(`${timestamp}.${rawBody}`, 'utf8')
      return crypto.verify(null, signedPayload, publicKey, sigBytes)
    } catch {
      return false
    }
  }

  /**
   * Normalizes incoming Telnyx webhook JSON payloads into the internal parsed format.
   */
  parseWebhook(rawBody: string): ParsedSmsWebhookEvent | null {
    try {
      const json = JSON.parse(rawBody)
      const data = json.data
      if (!data || typeof data !== 'object') {
        return null
      }

      const eventType = data.event_type as string
      const eventId = data.id as string
      const payload = data.payload || {}
      const providerMessageId = payload.id as string | undefined

      let type: ParsedSmsWebhookEvent['type']
      switch (eventType) {
        case 'message.sent':
          type = 'outbound.sent'
          break
        case 'message.delivered':
          type = 'outbound.delivered'
          break
        case 'message.undelivered':
          type = 'outbound.undelivered'
          break
        case 'message.failed':
          type = 'outbound.failed'
          break
        case 'message.received':
          type = 'inbound.received'
          break
        default:
          return null // Ignore unsupported event types
      }

      const errorObj = payload.errors?.[0]

      return {
        provider: 'telnyx',
        eventId: eventId || `telnyx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        providerMessageId,
        type,
        from: payload.from?.phone_number,
        to: payload.to?.[0]?.phone_number,
        body: payload.text,
        status: payload.to?.[0]?.status,
        errorCode: errorObj ? String(errorObj.code) : undefined,
        errorMessage: errorObj ? errorObj.title || errorObj.detail : undefined,
        occurredAt: data.occurred_at ? new Date(data.occurred_at) : new Date(),
      }
    } catch {
      return null
    }
  }
}

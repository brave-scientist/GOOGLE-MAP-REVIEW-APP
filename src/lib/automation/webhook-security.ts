/**
 * src/lib/automation/webhook-security.ts
 *
 * AUTO-01: Cryptographic webhook security & replay protection.
 *
 * Implements:
 * 1. HMAC-SHA256 signature verification
 * 2. Constant-time comparison (crypto.timingSafeEqual)
 * 3. Timestamp skew and expiration window validation (max 5 minutes)
 * 4. Durable database event ledger for replay protection
 * 5. Safe payload hashing
 */

import crypto from 'crypto'
import { db } from '@/lib/db'

export interface WebhookVerificationResult {
  valid: boolean
  error?: string
  code?: string
  eventId?: string
  timestamp?: number
}

const DEFAULT_WEBHOOK_MAX_AGE_SECONDS = 300 // 5 minutes
const MAX_FUTURE_SKEW_SECONDS = 60 // 1 minute max future clock drift

/**
 * Computes HMAC-SHA256 signature over raw payload and timestamp.
 */
export function computeWebhookSignature(payload: string, timestamp: number, secret: string): string {
  const data = `${timestamp}.${payload}`
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex')
}

/**
 * Verifies inbound webhook authenticity, timestamp validity, and replay protection.
 */
export async function verifyAndDeduplicateWebhook(params: {
  rawBody: string
  signatureHeader?: string | null
  timestampHeader?: string | null
  eventIdHeader?: string | null
  secret: string
  provider?: string
  maxAgeSeconds?: number
}): Promise<WebhookVerificationResult> {
  const {
    rawBody,
    signatureHeader,
    timestampHeader,
    eventIdHeader,
    secret,
    provider = 'generic',
    maxAgeSeconds = DEFAULT_WEBHOOK_MAX_AGE_SECONDS,
  } = params

  // 1. Signature header presence
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return {
      valid: false,
      error: 'Missing webhook signature header',
      code: 'MISSING_SIGNATURE',
    }
  }

  // 2. Timestamp header presence and numerical validation
  if (!timestampHeader) {
    return {
      valid: false,
      error: 'Missing webhook timestamp header',
      code: 'MISSING_TIMESTAMP',
    }
  }

  const timestamp = parseInt(timestampHeader, 10)
  if (isNaN(timestamp) || timestamp <= 0) {
    return {
      valid: false,
      error: 'Invalid webhook timestamp format',
      code: 'INVALID_TIMESTAMP',
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  // Handle both millisecond and second timestamps
  const tsSeconds = timestamp > 1e11 ? Math.floor(timestamp / 1000) : timestamp

  // 3. Timestamp expiration & clock drift check
  if (nowSeconds - tsSeconds > maxAgeSeconds) {
    return {
      valid: false,
      error: 'Webhook timestamp expired (replay protection window exceeded)',
      code: 'TIMESTAMP_EXPIRED',
    }
  }

  if (tsSeconds - nowSeconds > MAX_FUTURE_SKEW_SECONDS) {
    return {
      valid: false,
      error: 'Webhook timestamp is too far in the future',
      code: 'TIMESTAMP_FUTURE_SKEW',
    }
  }

  // 4. Constant-time cryptographic signature verification
  const expectedSig = computeWebhookSignature(rawBody, timestamp, secret)

  // Normalize received signature (handles "sha256=" or "v1=" prefixes)
  const receivedSig = signatureHeader.replace(/^(sha256=|v1=)/i, '').trim()

  if (expectedSig.length !== receivedSig.length) {
    return {
      valid: false,
      error: 'Invalid webhook signature',
      code: 'INVALID_SIGNATURE',
    }
  }

  const expectedBuf = Buffer.from(expectedSig, 'utf8')
  const receivedBuf = Buffer.from(receivedSig, 'utf8')

  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return {
      valid: false,
      error: 'Webhook signature verification failed',
      code: 'SIGNATURE_MISMATCH',
    }
  }

  // 5. Replay protection via durable event deduplication ledger
  const payloadHash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex')
  const eventId = eventIdHeader || `evt_${payloadHash.slice(0, 32)}_${tsSeconds}`

  try {
    const existing = await db.automationWebhookEvent.findUnique({
      where: { eventId },
    })

    if (existing) {
      return {
        valid: false,
        error: 'Duplicate webhook event already processed',
        code: 'DUPLICATE_EVENT',
        eventId,
      }
    }

    // Record webhook event in ledger atomically
    await db.automationWebhookEvent.create({
      data: {
        eventId,
        provider,
        payloadHash,
        processedAt: new Date(),
      },
    })
  } catch (dbErr: any) {
    // If unique constraint violation occurs during concurrent duplicate delivery
    if (dbErr?.code === 'P2002') {
      return {
        valid: false,
        error: 'Duplicate webhook event delivery intercepted',
        code: 'DUPLICATE_EVENT',
        eventId,
      }
    }
    console.error('[Webhook Security] Database error verifying event uniqueness:', dbErr)
    return {
      valid: false,
      error: 'Failed to verify event idempotency',
      code: 'DATABASE_ERROR',
    }
  }

  return {
    valid: true,
    eventId,
    timestamp: tsSeconds,
  }
}

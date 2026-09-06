// src/lib/sms/service.ts — Central SMS Orchestrator
// SMS-001.1 Hardened: Atomic idempotency, monotonic status, E.164 opt-out, no fake fallbacks
import { db } from '@/lib/db'
import { Prisma, RequestStatus } from '@prisma/client'
import { isOptedOut, optOutContact, optInContact } from '@/lib/opt-out'
import { isStopKeyword, isStartKeyword } from '@/lib/integrations/twilio'
import { validateAndNormalizePhone } from './phone'
import { hasValidConsent } from './consent'
import { TelnyxAdapter } from './telnyx'
import { TwilioAdapter } from './twilio'
import {
  ISmsProvider,
  SmsSendOptions,
  SmsSendResult,
  SmsStatus,
  SMS_LIMITS,
  SMS_STATUS_ORDINAL,
  isValidStatusTransition,
} from './types'

export class SmsService {
  private static telnyxProvider = new TelnyxAdapter()
  private static twilioProvider = new TwilioAdapter()

  /**
   * Resolves the active SMS provider based on the SMS_PROVIDER environment variable.
   * Defaults to Telnyx.
   */
  static getProvider(): ISmsProvider {
    const configured = process.env.SMS_PROVIDER?.toLowerCase()
    if (configured === 'twilio') {
      return this.twilioProvider
    }
    return this.telnyxProvider
  }

  /**
   * Checks if SMS is enabled globally via environment configuration.
   */
  static isSmsEnabled(): boolean {
    return process.env.FEATURE_SMS_ENABLED === 'true'
  }

  /**
   * Dispatches a single SMS through the compliance, rate limiting, and provider pipeline.
   *
   * Quota policy: Daily quota counts ALL dispatch attempts (including FAILED) to prevent
   * abuse loops where a bad actor circumvents limits by causing intentional failures.
   */
  static async sendSms(options: SmsSendOptions): Promise<SmsSendResult> {
    const { businessId, body, reviewRequestId, recipientId } = options

    // 1. Feature Flag & Kill-Switch Check
    if (!this.isSmsEnabled()) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'FEATURE_DISABLED',
        errorMessage: 'SMS functionality is currently disabled in system configuration.',
      }
    }

    // 2. Phone Number Parsing & E.164 Normalization
    const phoneResult = validateAndNormalizePhone(options.to)
    if (!phoneResult.valid || !phoneResult.e164) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'INVALID_PHONE_NUMBER',
        errorMessage: phoneResult.error || 'Destination phone number is not valid.',
      }
    }
    const toE164 = phoneResult.e164

    // 3. Opt-Out List Enforcement
    const optedOut = await isOptedOut(toE164)
    if (optedOut) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'RECIPIENT_OPTED_OUT',
        errorMessage: 'Recipient has opted out of SMS communication.',
      }
    }

    // 4. Verify Business & Tenant Plan Quota
    const business = await db.business.findUnique({
      where: { id: businessId },
      include: {
        org: {
          select: { plan: true },
        },
      },
    })

    if (!business) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'BUSINESS_NOT_FOUND',
        errorMessage: 'Associated business entity not found.',
      }
    }

    // 5. Affirmative SMS Consent Enforcement (SMS-002)
    // Commercial review-request SMS requires durable affirmative express written consent
    const hasConsent = await hasValidConsent(businessId, toE164)
    if (!hasConsent) {
      const deliveryRecord = await db.smsDeliveryEvent.create({
        data: {
          provider: this.getProvider().name,
          providerMessageId: null,
          businessId,
          reviewRequestId,
          recipientId,
          to: toE164,
          from: options.from || 'UNCONFIGURED',
          status: SmsStatus.FAILED,
          statusOrdinal: SMS_STATUS_ORDINAL[SmsStatus.FAILED] ?? 4,
          segments: 1,
          errorCode: 'CONSENT_REQUIRED',
          errorMessage: 'Affirmative express written consent (EXPRESS_WRITTEN) is required before sending SMS to this recipient.',
        },
      }).catch(() => null)

      const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
      await db.auditLog.create({
        data: {
          action: 'sms.dispatch_failed',
          targetType: 'business',
          targetId: businessId,
          metadata: JSON.stringify({
            provider: this.getProvider().name,
            dispatchId: deliveryRecord?.dispatchId || null,
            to: maskedPhone,
            success: false,
            errorCode: 'CONSENT_REQUIRED',
          }),
        },
      }).catch(() => {})

      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'CONSENT_REQUIRED',
        errorMessage: 'Affirmative express written consent (EXPRESS_WRITTEN) is required before sending SMS to this recipient.',
        dispatchId: deliveryRecord?.dispatchId,
      }
    }

    // 6. Check Daily Sending Quota (UTC Day Window)
    // Counts ALL dispatch attempts including FAILED to prevent abuse loops
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const sentTodayCount = await db.smsDeliveryEvent.count({
      where: {
        businessId,
        createdAt: { gte: todayStart },
      },
    })

    const isTrial = business.org?.plan === 'FREE' || !business.org?.plan
    const dailyLimit = isTrial ? SMS_LIMITS.TRIAL_DAILY_LIMIT : SMS_LIMITS.STANDARD_DAILY_LIMIT

    if (sentTodayCount >= dailyLimit) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'DAILY_QUOTA_EXCEEDED',
        errorMessage: `Daily SMS quota reached (${sentTodayCount}/${dailyLimit}). Upgrade or contact support for limit increases.`,
      }
    }

    // 7. Recipient Cooldown Enforcement (14 Days between review requests per business)
    // Scoped to business + E.164 normalized number
    const cooldownCutoff = new Date(Date.now() - SMS_LIMITS.RECIPIENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    const recentSend = await db.smsDeliveryEvent.findFirst({
      where: {
        businessId,
        to: toE164,
        createdAt: { gte: cooldownCutoff },
        status: { in: [SmsStatus.SENT, SmsStatus.DELIVERED, SmsStatus.QUEUED] },
      },
      select: { id: true, createdAt: true },
    })

    if (recentSend) {
      return {
        success: false,
        provider: this.getProvider().name,
        status: 'failed',
        errorCode: 'RECIPIENT_COOLDOWN_ACTIVE',
        errorMessage: `Recipient was contacted within the last ${SMS_LIMITS.RECIPIENT_COOLDOWN_DAYS} days. Cooldown active.`,
      }
    }

    // 8. Dispatch Message via Active Provider
    const provider = this.getProvider()

    // Resolve sender: explicit option > provider-specific env var. No fake fallback.
    const senderNumber = options.from || (provider.name === 'telnyx' ? process.env.TELNYX_FROM_PHONE_NUMBER : process.env.TWILIO_PHONE_NUMBER)
    const fromField = senderNumber || 'UNCONFIGURED'

    const result = await provider.send({
      ...options,
      to: toE164,
      from: senderNumber,
    })

    // 9. Persist Delivery Event Record in Database
    // providerMessageId is nullable — only store real provider IDs, never synthetic
    const mappedStatus = result.success
      ? (result.status === 'sent' ? SmsStatus.SENT : SmsStatus.QUEUED)
      : SmsStatus.FAILED

    const deliveryRecord = await db.smsDeliveryEvent.create({
      data: {
        provider: provider.name,
        providerMessageId: result.providerMessageId || null, // NULL if provider didn't return ID
        businessId,
        reviewRequestId,
        recipientId,
        to: toE164,
        from: fromField,
        status: mappedStatus,
        statusOrdinal: SMS_STATUS_ORDINAL[mappedStatus] ?? 0,
        segments: result.segments || 1,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    }).catch(err => {
      console.error('[SMS-DB] Failed to record SmsDeliveryEvent:', err)
      return null
    })

    // 10. Audit Logging (PII-masked)
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        action: result.success ? 'sms.dispatched' : 'sms.dispatch_failed',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          provider: provider.name,
          providerMessageId: result.providerMessageId || null,
          dispatchId: deliveryRecord?.dispatchId || null,
          to: maskedPhone,
          success: result.success,
          errorCode: result.errorCode,
        }),
      },
    }).catch(() => {})

    return {
      ...result,
      dispatchId: deliveryRecord?.dispatchId,
    }
  }

  /**
   * Ingests and processes incoming provider webhooks (delivery receipts and inbound replies).
   *
   * Security controls:
   * 1. Cryptographic signature verification (Ed25519 for Telnyx, HMAC-SHA1 for Twilio)
   * 2. Timestamp replay protection (300s window)
   * 3. Atomic database-enforced idempotency via unique constraint on SmsWebhookEvent.eventId
   * 4. Monotonic delivery status transitions (prevents DELIVERED→SENT regressions)
   * 5. Tenant isolation via providerMessageId→SmsDeliveryEvent→businessId lookup
   */
  static async handleWebhook(
    provider: ISmsProvider,
    rawBody: string,
    headers: Headers
  ): Promise<{ status: number; message: string }> {
    // 1. Cryptographic Signature Verification
    const isValid = provider.verifyWebhook(rawBody, headers)
    if (!isValid) {
      return { status: 403, message: 'Invalid webhook signature or expired timestamp.' }
    }

    // 2. Parse Normalized Event
    const event = provider.parseWebhook(rawBody)
    if (!event) {
      return { status: 400, message: 'Malformed webhook payload or unsupported event.' }
    }

    // 3. Atomic Idempotency Gate — use INSERT with unique constraint catch
    // Two concurrent requests with the same eventId: exactly one succeeds, the other gets P2002
    try {
      await db.smsWebhookEvent.create({
        data: {
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.type,
          payload: rawBody.slice(0, 2000),
          processedAt: new Date(),
        },
      })
    } catch (err) {
      // P2002 = Unique constraint violation → event already processed
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { status: 200, message: 'Event already processed (idempotent).' }
      }
      // Genuine database error — do not silently swallow
      console.error('[SMS-WEBHOOK] Failed to record webhook event:', err)
      return { status: 500, message: 'Database error during webhook processing.' }
    }

    // 4. Handle Outbound Delivery Receipts
    // Tenant isolation: webhook cannot supply tenant IDs. We resolve tenant from
    // providerMessageId → SmsDeliveryEvent → businessId → Business.orgId
    if (event.providerMessageId && event.type.startsWith('outbound.')) {
      let targetStatus: SmsStatus
      switch (event.type) {
        case 'outbound.delivered':
          targetStatus = SmsStatus.DELIVERED
          break
        case 'outbound.failed':
          targetStatus = SmsStatus.FAILED
          break
        case 'outbound.undelivered':
          targetStatus = SmsStatus.UNDELIVERED
          break
        case 'outbound.sent':
          targetStatus = SmsStatus.SENT
          break
        default:
          targetStatus = SmsStatus.SENT
      }

      const newOrdinal = SMS_STATUS_ORDINAL[targetStatus] ?? 0

      // Look up the delivery event by real provider message ID
      const existingDelivery = await db.smsDeliveryEvent.findUnique({
        where: { providerMessageId: event.providerMessageId },
        select: {
          id: true,
          status: true,
          statusOrdinal: true,
          reviewRequestId: true,
          recipientId: true,
          businessId: true,
        },
      })

      if (existingDelivery) {
        // Monotonic status enforcement: only allow forward transitions
        if (isValidStatusTransition(existingDelivery.status, targetStatus)) {
          await db.smsDeliveryEvent.update({
            where: { id: existingDelivery.id },
            data: {
              status: targetStatus,
              statusOrdinal: newOrdinal,
              errorCode: event.errorCode,
              errorMessage: event.errorMessage,
            },
          })
        }
        // If transition is invalid, silently ignore (delayed webhook regression)

        // Update associated ReviewRequest / ReviewUsSendRecipient if delivered
        if (event.type === 'outbound.delivered') {
          if (existingDelivery.reviewRequestId) {
            await db.reviewRequest.update({
              where: { id: existingDelivery.reviewRequestId },
              data: {
                status: RequestStatus.DELIVERED,
                deliveredAt: new Date(),
              },
            }).catch(() => {})
          }

          if (existingDelivery.recipientId) {
            await db.reviewUsSendRecipient.update({
              where: { id: existingDelivery.recipientId },
              data: {
                status: 'delivered',
                deliveredAt: new Date(),
              },
            }).catch(() => {})
          }
        }
      }
      // If no existingDelivery found for this providerMessageId, silently ignore.
      // This prevents unknown/cross-tenant providerMessageIds from creating arbitrary state.
    }

    // 5. Handle Inbound Customer Replies (STOP, START, HELP)
    if (event.type === 'inbound.received' && event.from && event.body) {
      // Normalize inbound phone to E.164 before opt-out storage
      const phoneResult = validateAndNormalizePhone(event.from)
      const normalizedFrom = phoneResult.valid && phoneResult.e164 ? phoneResult.e164 : event.from.trim()
      const bodyText = event.body.trim().toUpperCase()

      // STOP / UNSUBSCRIBE / CANCEL / QUIT / END
      if (isStopKeyword(bodyText)) {
        await optOutContact(normalizedFrom, `Inbound SMS keyword: "${bodyText}"`)
        await db.auditLog.create({
          data: {
            action: 'sms.opt_out',
            targetType: 'contact',
            targetId: normalizedFrom,
            metadata: JSON.stringify({
              provider: event.provider,
              body: bodyText,
              eventId: event.eventId,
            }),
          },
        }).catch(() => {})
      }

      // START / UNSTOP / YES
      if (isStartKeyword(bodyText)) {
        await optInContact(normalizedFrom)
        await db.auditLog.create({
          data: {
            action: 'sms.opt_in',
            targetType: 'contact',
            targetId: normalizedFrom,
            metadata: JSON.stringify({
              provider: event.provider,
              body: bodyText,
              eventId: event.eventId,
            }),
          },
        }).catch(() => {})
      }

      // HELP Keyword — log only, no opt-in/opt-out mutation
      if (bodyText === 'HELP') {
        await db.auditLog.create({
          data: {
            action: 'sms.help_requested',
            targetType: 'contact',
            targetId: normalizedFrom,
            metadata: JSON.stringify({
              provider: event.provider,
              eventId: event.eventId,
            }),
          },
        }).catch(() => {})
      }
    }

    return { status: 200, message: 'Event successfully processed.' }
  }
}

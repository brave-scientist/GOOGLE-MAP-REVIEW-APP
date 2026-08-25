// src/lib/sms/service.ts — Central SMS Orchestrator (Quota, Opt-Out, Cooldown, Dispatch, and Webhook Ingestion)
import { db } from '@/lib/db'
import { isOptedOut, optOutContact, optInContact } from '@/lib/opt-out'
import { isStopKeyword, isStartKeyword } from '@/lib/integrations/twilio'
import { validateAndNormalizePhone } from './phone'
import { TelnyxAdapter } from './telnyx'
import { TwilioAdapter } from './twilio'
import {
  ISmsProvider,
  SmsSendOptions,
  SmsSendResult,
  SmsStatus,
  SMS_LIMITS,
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

    // 5. Check Daily Sending Quota (UTC Day Window)
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

    // 6. Recipient Cooldown Enforcement (14 Days between review requests)
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

    // 7. Dispatch Message via Active Provider
    const provider = this.getProvider()
    const result = await provider.send({
      ...options,
      to: toE164,
    })

    // 8. Persist Delivery Event Record in Database
    const providerMessageId = result.providerMessageId || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const mappedStatus = result.success
      ? (result.status === 'sent' ? SmsStatus.SENT : SmsStatus.QUEUED)
      : SmsStatus.FAILED

    await db.smsDeliveryEvent.create({
      data: {
        provider: provider.name,
        providerMessageId,
        businessId,
        reviewRequestId,
        recipientId,
        to: toE164,
        from: options.from || process.env.TELNYX_FROM_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+18005550199',
        status: mappedStatus,
        segments: result.segments || 1,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    }).catch(err => {
      console.error('[SMS-DB] Failed to record SmsDeliveryEvent:', err)
    })

    // 9. Audit Logging (PII-masked)
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        action: result.success ? 'sms.dispatched' : 'sms.dispatch_failed',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          provider: provider.name,
          providerMessageId: result.providerMessageId,
          to: maskedPhone,
          success: result.success,
          errorCode: result.errorCode,
        }),
      },
    }).catch(() => {})

    return result
  }

  /**
   * Ingests and processes incoming provider webhooks (delivery receipts and inbound replies).
   * Enforces cryptographic verification, replay protection, and idempotency.
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

    // 3. Idempotency Gate (Prevent Duplicate Event Ingestion)
    const existingEvent = await db.smsWebhookEvent.findUnique({
      where: { eventId: event.eventId },
    })

    if (existingEvent) {
      return { status: 200, message: 'Event already processed (idempotent).' }
    }

    // Record Webhook Event for Idempotency
    await db.smsWebhookEvent.create({
      data: {
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.type,
        payload: rawBody.slice(0, 2000), // Persist head of payload safely
        processedAt: new Date(),
      },
    }).catch(() => {})

    // 4. Handle Outbound Delivery Receipts
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

      // Update Delivery Event
      const updatedDelivery = await db.smsDeliveryEvent.updateMany({
        where: { providerMessageId: event.providerMessageId },
        data: {
          status: targetStatus,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
        },
      })

      // Update associated ReviewRequest / ReviewUsSendRecipient if matched
      if (event.type === 'outbound.delivered') {
        const delivery = await db.smsDeliveryEvent.findUnique({
          where: { providerMessageId: event.providerMessageId },
          select: { reviewRequestId: true, recipientId: true },
        })

        if (delivery?.reviewRequestId) {
          await db.reviewRequest.update({
            where: { id: delivery.reviewRequestId },
            data: { deliveredAt: new Date() },
          }).catch(() => {})
        }

        if (delivery?.recipientId) {
          await db.reviewUsSendRecipient.update({
            where: { id: delivery.recipientId },
            data: {
              status: 'delivered',
              deliveredAt: new Date(),
            },
          }).catch(() => {})
        }
      }
    }

    // 5. Handle Inbound Customer Replies (STOP, START, HELP)
    if (event.type === 'inbound.received' && event.from && event.body) {
      const normalizedFrom = event.from.trim().toLowerCase()
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

      // HELP Keyword
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

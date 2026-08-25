// src/lib/sms/types.ts — SMS provider and service type contracts
import { SmsStatus } from '@prisma/client'

export { SmsStatus }

export interface SmsSendOptions {
  to: string
  body: string
  businessId: string
  campaignId?: string
  reviewRequestId?: string
  recipientId?: string
  from?: string
}

export interface SmsSendResult {
  success: boolean
  provider: 'telnyx' | 'twilio'
  providerMessageId?: string
  status: 'queued' | 'sent' | 'failed'
  segments?: number
  errorCode?: string
  errorMessage?: string
}

export type SmsWebhookEventType =
  | 'outbound.sent'
  | 'outbound.delivered'
  | 'outbound.failed'
  | 'outbound.undelivered'
  | 'inbound.received'

export interface ParsedSmsWebhookEvent {
  provider: 'telnyx' | 'twilio'
  eventId: string
  providerMessageId?: string
  type: SmsWebhookEventType
  from?: string
  to?: string
  body?: string
  status?: string
  errorCode?: string
  errorMessage?: string
  occurredAt?: Date
}

export interface ISmsProvider {
  readonly name: 'telnyx' | 'twilio'

  send(options: SmsSendOptions): Promise<SmsSendResult>

  verifyWebhook(rawBody: string, headers: Headers): boolean

  parseWebhook(rawBody: string): ParsedSmsWebhookEvent | null
}

// Abuse Prevention & Regulatory Threshold Constants
export const SMS_LIMITS = {
  TRIAL_DAILY_LIMIT: 100, // Max SMS/day/business for trial accounts
  STANDARD_DAILY_LIMIT: 500, // Max SMS/day/business for standard accounts
  CAMPAIGN_MAX_RECIPIENTS: 250, // Max recipients in a single campaign batch
  RECIPIENT_COOLDOWN_DAYS: 14, // Minimum days between review requests to same number
  WEBHOOK_REPLAY_WINDOW_SEC: 300, // 5-minute replay protection threshold
} as const

// Standard Review Request Template Builder
export function buildReviewRequestSms(params: {
  customerName?: string
  businessName: string
  reviewUrl: string
}): string {
  const greeting = params.customerName && params.customerName !== 'Customer'
    ? `Hi ${params.customerName.trim()}`
    : 'Hi'

  return `${greeting}, thanks for visiting ${params.businessName.trim()}! We would appreciate your honest feedback: ${params.reviewUrl}\n\nReply STOP to opt out, HELP for help.`
}

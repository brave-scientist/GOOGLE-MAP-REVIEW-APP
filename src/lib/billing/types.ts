import { Plan } from '@prisma/client'

export type BillingPlan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'AGENCY' | 'CUSTOM'
export type BillingCycle = 'monthly' | 'annual'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export type EntitlementKey =
  | 'locations'
  | 'users'
  | 'ai_replies'
  | 'automation_rules'
  | 'scheduled_reports'
  | 'report_recipients'
  | 'white_label_branding'
  | 'custom_domains'
  | 'client_portals'
  | 'competitor_tracking'

export interface EntitlementRule {
  isFeature: boolean // true for boolean flag, false for numerical limit
  defaultLimit: number // or 0 if boolean flag
  technicalCeiling?: number // immutable hard ceiling from architecture (e.g. JOB-18)
}

export interface PlanEntitlementConfig {
  locations: number
  users: number
  ai_replies: number // monthly limit
  automation_rules: number
  scheduled_reports: number
  report_recipients: number // per schedule
  white_label_branding: boolean
  custom_domains: number
  client_portals: number
  competitor_tracking: boolean
}

export interface EntitlementCheckResult {
  allowed: boolean
  current?: number
  limit?: number
  reason?: string
  code?: string
}

export interface NormalizedSubscriptionState {
  orgId: string
  plan: Plan
  status: SubscriptionStatus | string
  effectivePlan: Plan
  isPaidActive: boolean
  isTrialing: boolean
  isPastDue: boolean
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  providerCustomerId: string | null
  providerSubscriptionId: string | null
}

export type WebhookEventStatus = 'PROCESSING' | 'PROCESSED' | 'FAILED'

export interface WebhookClaimResult {
  canProcess: boolean
  duplicate?: boolean
  concurrent?: boolean
  isRetry?: boolean
  staleRecovered?: boolean
  status?: string
}

export interface WebhookHandleResult {
  received: boolean
  duplicate?: boolean
  concurrent?: boolean
  retried?: boolean
  skippedOutdated?: boolean
  error?: string
}

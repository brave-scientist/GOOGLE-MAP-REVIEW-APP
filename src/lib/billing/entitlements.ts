import { db } from '@/lib/db'
import { Plan } from '@prisma/client'
import {
  EntitlementKey,
  PlanEntitlementConfig,
  EntitlementCheckResult,
  NormalizedSubscriptionState,
} from './types'

// Technical safety ceilings established in JOB-18 (cannot be exceeded under any plan)
export const TECHNICAL_SAFETY_CEILINGS: Partial<Record<EntitlementKey, number>> = {
  scheduled_reports: 25,
  report_recipients: 10,
}

// Authoritative plan entitlement matrix
export const PLAN_CONFIGS: Record<Plan, PlanEntitlementConfig> = {
  FREE: {
    locations: 1,
    users: 1,
    ai_replies: 10,
    automation_rules: 0,
    scheduled_reports: 0,
    report_recipients: 0,
    white_label_branding: false,
    custom_domains: 0,
    client_portals: 0,
    competitor_tracking: false,
  },
  STARTER: {
    locations: 2,
    users: 3,
    ai_replies: 100,
    automation_rules: 3,
    scheduled_reports: 3,
    report_recipients: 2,
    white_label_branding: false,
    custom_domains: 0,
    client_portals: 1,
    competitor_tracking: false,
  },
  PRO: {
    locations: 10,
    users: 10,
    ai_replies: 1000,
    automation_rules: 15,
    scheduled_reports: 10,
    report_recipients: 5,
    white_label_branding: false,
    custom_domains: 1,
    client_portals: 10,
    competitor_tracking: true,
  },
  ENTERPRISE: {
    locations: 50,
    users: 50,
    ai_replies: 10000,
    automation_rules: 50,
    scheduled_reports: 25, // technical ceiling
    report_recipients: 10, // technical ceiling
    white_label_branding: true,
    custom_domains: 5,
    client_portals: 50,
    competitor_tracking: true,
  },
  AGENCY: {
    locations: 100,
    users: 100,
    ai_replies: 25000,
    automation_rules: 100,
    scheduled_reports: 25, // technical ceiling
    report_recipients: 10, // technical ceiling
    white_label_branding: true,
    custom_domains: 10,
    client_portals: 100,
    competitor_tracking: true,
  },
  CUSTOM: {
    locations: 200,
    users: 200,
    ai_replies: 50000,
    automation_rules: 200,
    scheduled_reports: 25, // technical ceiling
    report_recipients: 10, // technical ceiling
    white_label_branding: true,
    custom_domains: 20,
    client_portals: 200,
    competitor_tracking: true,
  },
}

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000 // 7-day grace period for past_due

/**
 * Resolves normalized, authoritative subscription and effective plan state for an organization.
 */
export async function getSubscriptionState(orgId: string): Promise<NormalizedSubscriptionState> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      plan: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!org) {
    return {
      orgId,
      plan: Plan.FREE,
      effectivePlan: Plan.FREE,
      status: 'no_subscription',
      isPaidActive: false,
      isTrialing: false,
      isPastDue: false,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      providerCustomerId: null,
      providerSubscriptionId: null,
    }
  }

  const latestSub = org.subscriptions[0]
  const rawStatus = latestSub?.status || org.stripeSubscriptionStatus || (org.trialEndsAt ? 'trialing' : 'active')
  const now = new Date()

  let isTrialing = false
  if (org.trialEndsAt && org.trialEndsAt > now) {
    isTrialing = true
  }

  let effectivePlan = org.plan
  let isPaidActive = false
  let isPastDue = false

  if (rawStatus === 'active') {
    isPaidActive = org.plan !== Plan.FREE
  } else if (rawStatus === 'trialing') {
    if (org.trialEndsAt && org.trialEndsAt < now && org.plan !== Plan.FREE) {
      effectivePlan = Plan.FREE
    }
  } else if (rawStatus === 'past_due') {
    isPastDue = true
    // Evaluate grace period
    const periodEnd = latestSub?.currentPeriodEnd || org.trialEndsAt
    const graceExpiry = periodEnd ? new Date(periodEnd.getTime() + GRACE_PERIOD_MS) : null
    if (graceExpiry && now > graceExpiry) {
      effectivePlan = Plan.FREE
    }
  } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(rawStatus)) {
    effectivePlan = Plan.FREE
  }

  return {
    orgId: org.id,
    plan: org.plan,
    status: rawStatus,
    effectivePlan,
    isPaidActive,
    isTrialing,
    isPastDue,
    trialEndsAt: org.trialEndsAt,
    currentPeriodStart: latestSub?.currentPeriodStart || null,
    currentPeriodEnd: latestSub?.currentPeriodEnd || null,
    cancelAtPeriodEnd: latestSub?.cancelAtPeriodEnd || false,
    providerCustomerId: latestSub?.providerCustomerId || org.stripeCustomerId || null,
    providerSubscriptionId: latestSub?.providerSubscriptionId || org.stripeSubscriptionId || null,
  }
}

/**
 * Returns all active entitlements and numeric limits for an organization.
 */
export async function getOrganizationEntitlements(orgId: string): Promise<Record<EntitlementKey, boolean | number>> {
  const state = await getSubscriptionState(orgId)
  const config = PLAN_CONFIGS[state.effectivePlan] || PLAN_CONFIGS.FREE

  return {
    locations: config.locations,
    users: config.users,
    ai_replies: config.ai_replies,
    automation_rules: config.automation_rules,
    scheduled_reports: Math.min(config.scheduled_reports, TECHNICAL_SAFETY_CEILINGS.scheduled_reports ?? Infinity),
    report_recipients: Math.min(config.report_recipients, TECHNICAL_SAFETY_CEILINGS.report_recipients ?? Infinity),
    white_label_branding: config.white_label_branding,
    custom_domains: config.custom_domains,
    client_portals: config.client_portals,
    competitor_tracking: config.competitor_tracking,
  }
}

/**
 * Resolves the numeric entitlement limit for an organization, honoring technical safety ceilings.
 */
export async function getEntitlementLimit(orgId: string, entitlement: EntitlementKey): Promise<number> {
  const state = await getSubscriptionState(orgId)
  const config = PLAN_CONFIGS[state.effectivePlan] || PLAN_CONFIGS.FREE
  const rawLimit = config[entitlement]

  if (typeof rawLimit === 'boolean') {
    return rawLimit ? 1 : 0
  }

  const ceiling = TECHNICAL_SAFETY_CEILINGS[entitlement]
  if (ceiling !== undefined) {
    return Math.min(rawLimit, ceiling)
  }

  return rawLimit
}

/**
 * Asserts whether an organization is entitled to a boolean feature.
 */
export async function assertEntitlement(
  orgId: string,
  entitlement: EntitlementKey,
): Promise<EntitlementCheckResult> {
  const state = await getSubscriptionState(orgId)
  const config = PLAN_CONFIGS[state.effectivePlan] || PLAN_CONFIGS.FREE
  const val = config[entitlement]

  if (typeof val === 'boolean') {
    if (!val) {
      await logEntitlementDenial(orgId, entitlement, 'FEATURE_NOT_IN_PLAN', state.effectivePlan)
      return {
        allowed: false,
        reason: `Feature '${entitlement}' is not available on the ${state.effectivePlan} plan. Upgrade required.`,
        code: 'PLAN_UPGRADE_REQUIRED',
      }
    }
    return { allowed: true }
  }

  // If numerical limit is 0, treat as feature denied
  if (val <= 0) {
    await logEntitlementDenial(orgId, entitlement, 'FEATURE_NOT_IN_PLAN', state.effectivePlan)
    return {
      allowed: false,
      limit: 0,
      reason: `Feature '${entitlement}' is not permitted on the ${state.effectivePlan} plan. Upgrade required.`,
      code: 'PLAN_UPGRADE_REQUIRED',
    }
  }

  return { allowed: true, limit: val }
}

/**
 * Current usage resolver by metric, supporting optional transaction client for concurrency locks.
 */
export async function getCurrentUsage(orgId: string, entitlement: EntitlementKey, client: any = db): Promise<number> {
  switch (entitlement) {
    case 'locations': {
      return await client.business.count({ where: { orgId } })
    }
    case 'users': {
      return await client.orgMember.count({ where: { orgId } })
    }
    case 'automation_rules': {
      return await client.automationRule.count({
        where: { business: { orgId } },
      })
    }
    case 'scheduled_reports': {
      return await client.scheduledReport.count({ where: { orgId } })
    }
    case 'custom_domains': {
      return await client.customDomain.count({ where: { orgId } })
    }
    case 'client_portals': {
      return await client.clientPortalShare.count({ where: { orgId } })
    }
    case 'ai_replies': {
      const period = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
      const counter = await client.usageCounter.findUnique({
        where: {
          orgId_metric_period: {
            orgId,
            metric: 'ai_replies',
            period,
          },
        },
      })
      return counter?.count ?? 0
    }
    case 'report_recipients': {
      return 0 // evaluated per schedule request
    }
    default:
      return 0
  }
}

/**
 * Asserts that current usage + requested amount does not exceed the plan limit or technical ceiling.
 * Accepts optional transaction client to support serialized quota checks.
 */
export async function assertWithinLimit(
  orgId: string,
  entitlement: EntitlementKey,
  requestedAmount = 1,
  client: any = db,
): Promise<EntitlementCheckResult> {
  const limit = await getEntitlementLimit(orgId, entitlement)
  const current = await getCurrentUsage(orgId, entitlement, client)

  if (limit <= 0) {
    const state = await getSubscriptionState(orgId)
    await logEntitlementDenial(orgId, entitlement, 'LIMIT_ZERO', state.effectivePlan)
    return {
      allowed: false,
      current,
      limit,
      reason: `Feature '${entitlement}' is not available on the ${state.effectivePlan} plan. Upgrade required.`,
      code: 'PLAN_UPGRADE_REQUIRED',
    }
  }

  if (current + requestedAmount > limit) {
    const state = await getSubscriptionState(orgId)
    await logEntitlementDenial(orgId, entitlement, 'LIMIT_EXCEEDED', state.effectivePlan, current, limit)
    return {
      allowed: false,
      current,
      limit,
      reason: `Limit for '${entitlement}' reached (${current}/${limit}). Upgrade plan or remove existing resources.`,
      code: 'LIMIT_EXCEEDED',
    }
  }

  return { allowed: true, current, limit }
}

/**
 * Concurrency-safe quota execution using PostgreSQL advisory transaction locks.
 * Serializes quota consumption for a specific (orgId, entitlement) pair within a transaction.
 */
export async function executeWithQuotaLock<T>(
  orgId: string,
  entitlement: EntitlementKey,
  requestedAmount = 1,
  action: (tx: any) => Promise<T>,
): Promise<{ success: true; result: T } | { success: false; check: EntitlementCheckResult }> {
  return await db.$transaction(async (tx) => {
    // Acquire PostgreSQL advisory transaction lock on hashtext of (orgId, entitlement).
    // Automatically releases when the transaction commits or aborts.
    const lockKey = `quota_${orgId}_${entitlement}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

    const check = await assertWithinLimit(orgId, entitlement, requestedAmount, tx)
    if (!check.allowed) {
      return { success: false, check }
    }

    const result = await action(tx)
    return { success: true, result }
  })
}

/**
 * Atomically increments usage for an organization metric.
 */
export async function incrementUsage(
  orgId: string,
  metric: string,
  amount = 1,
  period?: string,
): Promise<number> {
  const currentPeriod = period || new Date().toISOString().slice(0, 7)

  const counter = await db.usageCounter.upsert({
    where: {
      orgId_metric_period: {
        orgId,
        metric,
        period: currentPeriod,
      },
    },
    create: {
      orgId,
      metric,
      period: currentPeriod,
      count: amount,
    },
    update: {
      count: { increment: amount },
    },
  })

  return counter.count
}

async function logEntitlementDenial(
  orgId: string,
  entitlement: string,
  code: string,
  plan: Plan,
  current?: number,
  limit?: number,
) {
  try {
    await db.auditLog.create({
      data: {
        action: 'billing.entitlement_denied',
        targetType: 'organization',
        targetId: orgId,
        metadata: JSON.stringify({
          entitlement,
          code,
          plan,
          current,
          limit,
        }),
      },
    })
  } catch (err) {
    console.error('Failed to log entitlement denial audit event:', err)
  }
}

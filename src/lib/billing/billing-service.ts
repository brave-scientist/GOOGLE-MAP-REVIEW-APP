import { db } from '@/lib/db'
import { stripe, isStripeConfigured } from '@/lib/stripe'
import { Plan } from '@prisma/client'
import Stripe from 'stripe'
import { BillingCycle, BillingPlan, WebhookClaimResult, WebhookHandleResult } from './types'

export interface CreateCheckoutParams {
  orgId: string
  userId: string
  userEmail: string
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE' | 'AGENCY'
  billingCycle: BillingCycle
  returnUrl?: string
  disallowExistingSubscription?: boolean
  idempotencyKey?: string
}

export interface CreatePortalParams {
  orgId: string
  userId: string
  returnUrl?: string
}

/**
 * Server-authoritative mapping of Plan + Cycle to Stripe Price ID.
 * Client cannot supply arbitrary Price IDs.
 * AGENCY does NOT fall back to ENTERPRISE; if unconfigured, returns null (fail-closed).
 */
export function getApprovedPriceId(plan: string, cycle: BillingCycle): string | null {
  const upper = plan.toUpperCase()
  const map: Record<string, Record<BillingCycle, string | undefined>> = {
    STARTER: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    },
    PRO: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
    ENTERPRISE: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    },
    AGENCY: {
      monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY,
      annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL,
    },
  }

  return map[upper]?.[cycle] || null
}

/**
 * Maps a plan string to Plan enum.
 * Fail-closed: Returns null for missing or unknown plan strings.
 * Callers must NOT silently default to Plan.FREE when processing active subscriptions.
 */
export function mapStringToPlanEnum(planStr?: string | null): Plan | null {
  if (!planStr || typeof planStr !== 'string') return null
  const upper = planStr.trim().toUpperCase()
  if (upper === 'STARTER') return Plan.STARTER
  if (upper === 'PRO') return Plan.PRO
  if (upper === 'ENTERPRISE') return Plan.ENTERPRISE
  if (upper === 'AGENCY') return Plan.AGENCY
  if (upper === 'CUSTOM') return Plan.CUSTOM
  if (upper === 'FREE') return Plan.FREE
  return null
}

/**
 * Safely resolves the target plan from a Stripe Subscription object.
 * Reconciles metadata or Price ID reverse lookup.
 * Does NOT silently downgrade to FREE if metadata is missing/malformed; preserves fallbackPlan.
 */
export function resolvePlanFromStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackPlan: Plan = Plan.FREE
): Plan {
  // 1. Metadata check
  const metaPlan = mapStringToPlanEnum(subscription.metadata?.plan)
  if (metaPlan) return metaPlan

  // 2. Price ID reverse-lookup
  const priceId = subscription.items?.data?.[0]?.price?.id
  if (priceId) {
    if (priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY || priceId === process.env.STRIPE_PRICE_STARTER_ANNUAL) {
      return Plan.STARTER
    }
    if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) {
      return Plan.PRO
    }
    if (priceId === process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || priceId === process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL) {
      return Plan.ENTERPRISE
    }
    if (priceId === process.env.STRIPE_PRICE_AGENCY_MONTHLY || priceId === process.env.STRIPE_PRICE_AGENCY_ANNUAL) {
      return Plan.AGENCY
    }
  }

  // 3. Fail closed: preserve existing plan so active subscriptions are never downgraded
  return fallbackPlan
}

/**
 * Strict server-authoritative returnUrl sanitizer.
 * Guarantees return URL strictly matches trusted canonical application origin.
 * Rejects external redirects, javascript:, data:, protocol-relative URLs.
 */
export function sanitizeReturnUrl(returnUrl?: string | null): string {
  const defaultAppUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  if (!returnUrl || typeof returnUrl !== 'string') {
    return defaultAppUrl
  }

  const trimmed = returnUrl.trim()
  if (
    trimmed.startsWith('//') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:') ||
    trimmed.toLowerCase().startsWith('vbscript:')
  ) {
    return defaultAppUrl
  }

  try {
    const canonicalBase = new URL(defaultAppUrl)
    const parsed = new URL(trimmed, defaultAppUrl)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return defaultAppUrl
    }

    if (parsed.origin !== canonicalBase.origin) {
      return defaultAppUrl
    }

    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return defaultAppUrl
  }
}

export class BillingService {
  /**
   * Strict 3-way tenant binding verification across Customer, Subscription, and Organization.
   * Fail-closed: Throws TENANT_MISMATCH if any cross-tenant linkage is detected.
   */
  static async assertThreeWayBinding(
    tx: any,
    params: {
      customerId?: string | null
      subscriptionId?: string | null
      orgId?: string | null
      context?: string
    }
  ): Promise<{ orgId: string; customerId: string | null; subscriptionId: string | null }> {
    const { customerId, subscriptionId, orgId, context = 'webhook' } = params

    let resolvedOrgId: string | null = orgId || null

    // 1. Validate Customer -> Org binding
    if (customerId) {
      const billingCust = await tx.billingCustomer.findUnique({
        where: { providerCustomerId: customerId },
      })
      if (billingCust) {
        if (resolvedOrgId && billingCust.orgId !== resolvedOrgId) {
          throw new Error(`TENANT_MISMATCH: Customer ${customerId} belongs to org ${billingCust.orgId}, not ${resolvedOrgId} (${context})`)
        }
        resolvedOrgId = billingCust.orgId
      } else {
        const orgByCust = await tx.organization.findFirst({
          where: { stripeCustomerId: customerId },
        })
        if (orgByCust) {
          if (resolvedOrgId && orgByCust.id !== resolvedOrgId) {
            throw new Error(`TENANT_MISMATCH: Customer ${customerId} bound to org ${orgByCust.id}, not ${resolvedOrgId} (${context})`)
          }
          resolvedOrgId = orgByCust.id
        }
      }
    }

    // 2. Validate Subscription -> Org binding
    if (subscriptionId) {
      const existingSub = await tx.subscription.findUnique({
        where: { providerSubscriptionId: subscriptionId },
      })
      if (existingSub) {
        if (resolvedOrgId && existingSub.orgId !== resolvedOrgId) {
          throw new Error(`TENANT_MISMATCH: Subscription ${subscriptionId} belongs to org ${existingSub.orgId}, not ${resolvedOrgId} (${context})`)
        }
        if (customerId && existingSub.providerCustomerId && existingSub.providerCustomerId !== customerId) {
          throw new Error(`TENANT_MISMATCH: Subscription ${subscriptionId} belongs to customer ${existingSub.providerCustomerId}, not ${customerId} (${context})`)
        }
        resolvedOrgId = existingSub.orgId
      }
    }

    if (!resolvedOrgId) {
      throw new Error(`UNRESOLVABLE_TENANT: Unable to resolve organization from customer ${customerId} or subscription ${subscriptionId} (${context})`)
    }

    // Final verification that organization exists
    const org = await tx.organization.findUnique({
      where: { id: resolvedOrgId },
      select: { id: true, stripeCustomerId: true },
    })
    if (!org) {
      throw new Error(`TENANT_NOT_FOUND: Organization ${resolvedOrgId} not found (${context})`)
    }

    if (org.stripeCustomerId && customerId && org.stripeCustomerId !== customerId) {
      throw new Error(`TENANT_MISMATCH: Org ${org.id} already bound to customer ${org.stripeCustomerId}, cannot bind ${customerId} (${context})`)
    }

    return {
      orgId: resolvedOrgId,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
    }
  }

  /**
   * Retrieves or creates a Stripe Customer record transactionally and links it to the Organization.
   * Concurrency-safe: uses deterministic idempotencyKey for Stripe API and atomic database guards.
   */
  static async createOrFindCustomer(orgId: string, email: string, name?: string): Promise<string> {
    // 1. Check normalized BillingCustomer
    const existing = await db.billingCustomer.findUnique({
      where: { orgId_provider: { orgId, provider: 'stripe' } },
    })
    if (existing?.providerCustomerId) {
      return existing.providerCustomerId
    }

    // 2. Check Organization legacy stripeCustomerId
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, stripeCustomerId: true },
    })

    if (!org) {
      throw new Error('Organization not found')
    }

    let customerId = org.stripeCustomerId

    if (!customerId) {
      // Deterministic Stripe idempotency key prevents duplicate customer creation in Stripe during concurrent bursts
      const idempotencyKey = `stripe_cust_org_${orgId}`
      const customer = await stripe.customers.create(
        {
          email,
          name: name || org.name,
          metadata: {
            orgId: org.id,
          },
        },
        { idempotencyKey }
      )
      customerId = customer.id

      // Atomic update guard on Organization
      const updateResult = await db.organization.updateMany({
        where: { id: org.id, stripeCustomerId: null },
        data: { stripeCustomerId: customerId },
      })

      // If another concurrent request won the database update, reconcile to the winner
      if (updateResult.count === 0) {
        const recheck = await db.organization.findUnique({
          where: { id: org.id },
          select: { stripeCustomerId: true },
        })
        if (recheck?.stripeCustomerId) {
          customerId = recheck.stripeCustomerId
        }
      }
    }

    // Sync normalized BillingCustomer
    await db.billingCustomer.upsert({
      where: { orgId_provider: { orgId, provider: 'stripe' } },
      create: {
        orgId,
        provider: 'stripe',
        providerCustomerId: customerId,
        email,
        name: name || org.name,
      },
      update: {
        providerCustomerId: customerId,
        email,
      },
    })

    return customerId
  }

  /**
   * Initiates a secure server-authoritative checkout session.
   * Hardened: anti-tampering price mapping, double-click protection, existing active subscription protection.
   */
  static async createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string | null; sessionId: string }> {
    const { orgId, userId, userEmail, plan, billingCycle, returnUrl, disallowExistingSubscription, idempotencyKey: clientToken } = params

    if (!isStripeConfigured()) {
      throw new Error('STRIPE_NOT_CONFIGURED')
    }

    // Check existing active subscription if requested
    const activeSub = await db.subscription.findFirst({
      where: {
        orgId,
        status: { in: ['active', 'trialing'] },
      },
    })

    if (disallowExistingSubscription && activeSub && activeSub.plan === plan) {
      throw new Error(`ALREADY_SUBSCRIBED: Organization is already subscribed to the ${plan} plan`)
    }

    const priceId = getApprovedPriceId(plan, billingCycle)
    if (!priceId) {
      throw new Error(`PRICE_NOT_CONFIGURED: No approved price ID configured for ${plan} (${billingCycle})`)
    }

    const customerId = await this.createOrFindCustomer(orgId, userEmail)
    const appUrl = sanitizeReturnUrl(returnUrl)

    // Server-controlled deterministic request idempotency key
    // Accepts explicit client token or derives stable 1-hour operation identity
    const idempotencyKey = clientToken
      ? `checkout_${orgId}_${clientToken}`
      : `checkout_session_${orgId}_${plan}_${billingCycle}_${Math.floor(Date.now() / 3600000)}`

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/billing?canceled=true`,
        subscription_data: {
          metadata: {
            orgId,
            plan,
            billingCycle,
          },
        },
        metadata: {
          orgId,
          plan,
          billingCycle,
          userId,
        },
      },
      { idempotencyKey }
    )

    // Audit log (sanitized, zero secrets)
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: 'billing.checkout_initiated',
        targetType: 'organization',
        targetId: orgId,
        metadata: JSON.stringify({
          plan,
          billingCycle,
          customerId,
          sessionId: session.id,
        }),
      },
    })

    return { url: session.url, sessionId: session.id }
  }

  /**
   * Creates a customer billing portal session for authorized admins.
   * Hardened: Sanitizes returnUrl to canonical origin.
   */
  static async createPortalSession(params: CreatePortalParams): Promise<{ url: string }> {
    const { orgId, userId, returnUrl } = params

    if (!isStripeConfigured()) {
      throw new Error('STRIPE_NOT_CONFIGURED')
    }

    const billingCustomer = await db.billingCustomer.findUnique({
      where: { orgId_provider: { orgId, provider: 'stripe' } },
    })

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    })

    const customerId = billingCustomer?.providerCustomerId || org?.stripeCustomerId

    if (!customerId) {
      throw new Error('NO_CUSTOMER: No active Stripe billing customer found for this organization')
    }

    const appUrl = sanitizeReturnUrl(returnUrl)

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/billing`,
    })

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: 'billing.portal_opened',
        targetType: 'organization',
        targetId: orgId,
        metadata: JSON.stringify({
          customerId,
        }),
      },
    })

    return { url: portalSession.url }
  }

  /**
   * Cryptographically verifies Stripe webhook payload signature.
   */
  static verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): Stripe.Event {
    if (!signature) {
      throw new Error('Missing stripe-signature header')
    }
    if (!webhookSecret || webhookSecret.trim().length === 0) {
      throw new Error('Webhook secret unconfigured')
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  }

  /**
   * Safe persistent state machine for Stripe webhook claims.
   * Handles first delivery, duplicate delivery, retry after failure, and stale recovery.
   */
  static async claimWebhookEvent(
    eventId: string,
    eventType: string,
    staleThresholdMs = 300000,
  ): Promise<WebhookClaimResult> {
    const now = new Date()

    // 1. Try to atomically create a new PROCESSING record
    try {
      await db.stripeWebhookEvent.create({
        data: {
          eventId,
          eventType,
          status: 'PROCESSING',
          attempts: 1,
          createdAt: now,
          updatedAt: now,
        },
      })
      return { canProcess: true, isRetry: false, status: 'PROCESSING' }
    } catch (err: any) {
      if (err.code !== 'P2002' && !String(err).includes('Unique constraint')) {
        throw err
      }
    }

    // 2. Record already exists — check current state machine status
    const existing = await db.stripeWebhookEvent.findUnique({
      where: { eventId },
    })

    if (!existing) {
      return { canProcess: false, concurrent: true }
    }

    // If already fully processed, acknowledge idempotently without running mutations again
    if (existing.status === 'PROCESSED') {
      return { canProcess: false, duplicate: true, status: 'PROCESSED' }
    }

    // If previous attempt failed, allow retry!
    if (existing.status === 'FAILED') {
      const updated = await db.stripeWebhookEvent.updateMany({
        where: { eventId, status: 'FAILED' },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          lastError: null,
          updatedAt: now,
        },
      })
      if (updated.count > 0) {
        return { canProcess: true, isRetry: true, status: 'PROCESSING' }
      }
      return { canProcess: false, concurrent: true }
    }

    // If currently PROCESSING, check if it's a stale lock from a crashed worker
    if (existing.status === 'PROCESSING') {
      const ageMs = now.getTime() - existing.updatedAt.getTime()
      if (ageMs > staleThresholdMs) {
        const updated = await db.stripeWebhookEvent.updateMany({
          where: { eventId, status: 'PROCESSING', updatedAt: existing.updatedAt },
          data: {
            status: 'PROCESSING',
            attempts: { increment: 1 },
            updatedAt: now,
          },
        })
        if (updated.count > 0) {
          return { canProcess: true, isRetry: true, staleRecovered: true, status: 'PROCESSING' }
        }
      }
      // Active in-flight processing by another request
      return { canProcess: false, concurrent: true }
    }

    return { canProcess: false, duplicate: true, status: existing.status }
  }

  /**
   * Deterministic recovery for stale webhook records left in PROCESSING.
   * Atomically resets stale records to FAILED so retries can occur cleanly.
   */
  static async recoverStaleWebhookEvents(staleThresholdMs = 300000): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs)
    const result = await db.stripeWebhookEvent.updateMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        lastError: 'Stale in-flight processing timeout recovered',
        updatedAt: new Date(),
      },
    })
    return result.count
  }

  /**
   * Idempotently processes Stripe webhook events, syncing normalized subscriptions and organization state.
   * Architecture: At-least-once delivery with effectively-once execution.
   * Atomicity: Business state mutations and webhook status 'PROCESSED' transition commit inside
   * the EXACT SAME database transaction. Zero crash window between mutation and state marking.
   */
  static async handleWebhookEvent(
    event: Stripe.Event,
    staleThresholdMs = 300000,
  ): Promise<WebhookHandleResult> {
    const eventId = event.id
    const eventType = event.type

    if (!eventId) {
      throw new Error('Missing event ID')
    }

    // 1. Claim event via persistent state machine
    const claim = await this.claimWebhookEvent(eventId, eventType, staleThresholdMs)
    if (!claim.canProcess) {
      if (claim.duplicate) {
        return { received: true, duplicate: true }
      }
      if (claim.concurrent) {
        return { received: true, concurrent: true }
      }
      return { received: true, duplicate: true }
    }

    const eventTimestamp = new Date((event.created || Math.floor(Date.now() / 1000)) * 1000)

    // 2. Transactional business state mutation + atomic PROCESSED update
    try {
      await db.$transaction(async (tx) => {
        switch (eventType) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session
            const orgId = session.metadata?.orgId
            const planStr = session.metadata?.plan
            const customerId = session.customer ? String(session.customer) : null
            const subscriptionId = session.subscription ? String(session.subscription) : null

            // Strict 3-way binding check
            const { orgId: boundOrgId } = await this.assertThreeWayBinding(tx, {
              customerId,
              subscriptionId,
              orgId,
              context: 'checkout.session.completed',
            })

            const org = await tx.organization.findUnique({ where: { id: boundOrgId } })
            if (!org) {
              throw new Error(`TENANT_NOT_FOUND: Organization ${boundOrgId} not found`)
            }

            const plan = mapStringToPlanEnum(planStr) || org.plan || Plan.STARTER

            // Event ordering check on subscription
            if (subscriptionId) {
              const existingSub = await tx.subscription.findUnique({
                where: { providerSubscriptionId: subscriptionId },
              })
              const latestTimestamp = existingSub?.lastEventTimestamp || existingSub?.updatedAt
              if (latestTimestamp && latestTimestamp.getTime() > eventTimestamp.getTime()) {
                break
              }
            }

            // Sync BillingCustomer
            if (customerId) {
              await tx.billingCustomer.upsert({
                where: { orgId_provider: { orgId: org.id, provider: 'stripe' } },
                create: {
                  orgId: org.id,
                  provider: 'stripe',
                  providerCustomerId: customerId,
                  email: session.customer_details?.email || null,
                  name: session.customer_details?.name || null,
                },
                update: {
                  providerCustomerId: customerId,
                  email: session.customer_details?.email || undefined,
                },
              })
            }

            // Sync Subscription
            if (subscriptionId && customerId) {
              const billingCust = await tx.billingCustomer.findUnique({
                where: { providerCustomerId: customerId },
              })

              await tx.subscription.upsert({
                where: { providerSubscriptionId: subscriptionId },
                create: {
                  orgId: org.id,
                  customerId: billingCust?.id || null,
                  provider: 'stripe',
                  providerCustomerId: customerId,
                  providerSubscriptionId: subscriptionId,
                  plan,
                  status: 'active',
                  lastEventTimestamp: eventTimestamp,
                  lastEventId: eventId,
                },
                update: {
                  plan,
                  status: 'active',
                  lastEventTimestamp: eventTimestamp,
                  lastEventId: eventId,
                },
              })
            }

            // Sync Organization
            await tx.organization.update({
              where: { id: org.id },
              data: {
                plan,
                trialEndsAt: null,
                ...(customerId ? { stripeCustomerId: customerId } : {}),
                ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
                stripeSubscriptionStatus: 'active',
              },
            })

            // Audit Log
            await tx.auditLog.create({
              data: {
                action: 'billing.checkout_completed',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  plan,
                  customerId,
                  subscriptionId,
                  eventId,
                }),
              },
            })
            break
          }

          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription
            const customerId = String(subscription.customer)
            const subscriptionId = subscription.id
            const status = subscription.status
            const orgId = subscription.metadata?.orgId

            // Strict 3-way binding check
            const { orgId: boundOrgId } = await this.assertThreeWayBinding(tx, {
              customerId,
              subscriptionId,
              orgId,
              context: eventType,
            })

            const org = await tx.organization.findUnique({ where: { id: boundOrgId } })
            if (!org) {
              throw new Error(`TENANT_NOT_FOUND: Organization ${boundOrgId} not found`)
            }

            const existingSub = await tx.subscription.findUnique({
              where: { providerSubscriptionId: subscriptionId },
            })

            // Event ordering check:
            const latestTimestamp = existingSub?.lastEventTimestamp || existingSub?.updatedAt
            // A canceled subscription cannot be resurrected by a same-second or older update
            if (existingSub?.status === 'canceled' && latestTimestamp && eventTimestamp.getTime() <= latestTimestamp.getTime()) {
              break
            }
            if (latestTimestamp && latestTimestamp.getTime() > eventTimestamp.getTime()) {
              break
            }
            if (latestTimestamp && latestTimestamp.getTime() === eventTimestamp.getTime() && existingSub?.lastEventId === eventId) {
              break
            }

            // Plan resolution with fail-closed protection against accidental downgrade
            let targetPlan = org.plan
            if (status === 'active' || status === 'trialing') {
              targetPlan = resolvePlanFromStripeSubscription(subscription, org.plan)
            } else if (['unpaid', 'canceled', 'incomplete_expired'].includes(status)) {
              targetPlan = Plan.FREE
            }

            const periodStart = (subscription as any).current_period_start
              ? new Date((subscription as any).current_period_start * 1000)
              : null
            const periodEnd = (subscription as any).current_period_end
              ? new Date((subscription as any).current_period_end * 1000)
              : null
            const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end ?? false
            const canceledAt = (subscription as any).canceled_at
              ? new Date((subscription as any).canceled_at * 1000)
              : null
            const trialStart = (subscription as any).trial_start
              ? new Date((subscription as any).trial_start * 1000)
              : null
            const trialEnd = (subscription as any).trial_end
              ? new Date((subscription as any).trial_end * 1000)
              : null

            // Sync Subscription
            await tx.subscription.upsert({
              where: { providerSubscriptionId: subscriptionId },
              create: {
                orgId: org.id,
                provider: 'stripe',
                providerCustomerId: customerId,
                providerSubscriptionId: subscriptionId,
                plan: targetPlan,
                status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd,
                canceledAt,
                trialStart,
                trialEnd,
                lastEventTimestamp: eventTimestamp,
                lastEventId: eventId,
              },
              update: {
                plan: targetPlan,
                status,
                currentPeriodStart: periodStart || undefined,
                currentPeriodEnd: periodEnd || undefined,
                cancelAtPeriodEnd,
                canceledAt: canceledAt || undefined,
                trialStart: trialStart || undefined,
                trialEnd: trialEnd || undefined,
                lastEventTimestamp: eventTimestamp,
                lastEventId: eventId,
              },
            })

            // Sync Organization plan & status
            await tx.organization.update({
              where: { id: org.id },
              data: {
                plan: targetPlan,
                stripeSubscriptionId: subscriptionId,
                stripeSubscriptionStatus: status,
                ...(customerId ? { stripeCustomerId: customerId } : {}),
              },
            })

            // Audit log
            await tx.auditLog.create({
              data: {
                action: eventType === 'customer.subscription.created'
                  ? 'billing.subscription_created'
                  : 'billing.subscription_updated',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  status,
                  plan: targetPlan,
                  subscriptionId,
                  eventId,
                }),
              },
            })
            break
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription
            const customerId = String(subscription.customer)
            const subscriptionId = subscription.id
            const orgId = subscription.metadata?.orgId

            // Strict 3-way binding check
            const { orgId: boundOrgId } = await this.assertThreeWayBinding(tx, {
              customerId,
              subscriptionId,
              orgId,
              context: 'customer.subscription.deleted',
            })

            const org = await tx.organization.findUnique({ where: { id: boundOrgId } })
            if (!org) {
              throw new Error(`TENANT_NOT_FOUND: Organization ${boundOrgId} not found`)
            }

            const existingSub = await tx.subscription.findUnique({
              where: { providerSubscriptionId: subscriptionId },
            })

            const latestTimestamp = existingSub?.lastEventTimestamp || existingSub?.updatedAt
            // Deletion is terminal. Only skip if the stored record is strictly newer than the deletion event.
            if (latestTimestamp && latestTimestamp.getTime() > eventTimestamp.getTime()) {
              break
            }

            await tx.subscription.updateMany({
              where: { providerSubscriptionId: subscriptionId },
              data: {
                status: 'canceled',
                plan: Plan.FREE,
                canceledAt: new Date(),
                lastEventTimestamp: eventTimestamp,
                lastEventId: eventId,
              },
            })

            await tx.organization.update({
              where: { id: org.id },
              data: {
                plan: Plan.FREE,
                stripeSubscriptionStatus: 'canceled',
              },
            })

            await tx.auditLog.create({
              data: {
                action: 'billing.subscription_canceled',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  subscriptionId,
                  eventId,
                }),
              },
            })
            break
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice
            const customerId = invoice.customer ? String(invoice.customer) : null
            const subscriptionId = (invoice as any).subscription ? String((invoice as any).subscription) : null

            // Strict 3-way binding check
            const { orgId: boundOrgId } = await this.assertThreeWayBinding(tx, {
              customerId,
              subscriptionId,
              context: 'invoice.payment_failed',
            })

            const org = await tx.organization.findUnique({ where: { id: boundOrgId } })
            if (!org) {
              throw new Error(`TENANT_NOT_FOUND: Organization ${boundOrgId} not found`)
            }

            if (subscriptionId) {
              const existingSub = await tx.subscription.findUnique({
                where: { providerSubscriptionId: subscriptionId },
              })

              // Terminal canceled cannot be overwritten or resurrected by payment failure event
              if (existingSub?.status === 'canceled') {
                break
              }

              const latestTimestamp = existingSub?.lastEventTimestamp || existingSub?.updatedAt
              if (latestTimestamp && latestTimestamp.getTime() > eventTimestamp.getTime()) {
                break
              }

              await tx.subscription.updateMany({
                where: { providerSubscriptionId: subscriptionId },
                data: {
                  status: 'past_due',
                  lastEventTimestamp: eventTimestamp,
                  lastEventId: eventId,
                },
              })

              await tx.organization.update({
                where: { id: org.id },
                data: {
                  stripeSubscriptionStatus: 'past_due',
                },
              })
            }

            await tx.auditLog.create({
              data: {
                action: 'billing.payment_failed',
                targetType: 'organization',
                targetId: org.id,
                metadata: JSON.stringify({
                  invoiceId: invoice.id,
                  amountDue: invoice.amount_due,
                  eventId,
                }),
              },
            })
            break
          }

          default:
            break
        }

        // 3. Atomically transition webhook event to PROCESSED inside the exact same transaction!
        await tx.stripeWebhookEvent.update({
          where: { eventId },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        })
      })

      return { received: true, retried: claim.isRetry }
    } catch (mutationErr: any) {
      // 4. On mutation error, transaction rolled back. Record FAILED state so retries can occur.
      await db.stripeWebhookEvent.update({
        where: { eventId },
        data: {
          status: 'FAILED',
          lastError: mutationErr.message?.slice(0, 1000) || 'Unknown mutation error',
          updatedAt: new Date(),
        },
      })
      throw mutationErr
    }
  }
}

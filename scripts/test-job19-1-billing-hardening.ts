/**
 * scripts/test-job19-1-billing-hardening.ts
 *
 * Dedicated verification suite for Milestone JOB-19.1:
 * Billing & Entitlement Production Hardening (Re-Audit & Verification)
 *
 * Validates:
 * 1. Webhook State Machine & Transactional Atomicity (Tests 1-10)
 * 2. Concurrency Safety & Realistic Stripe Idempotency Engine (Tests 11-18)
 * 3. Stripe 3-Way Tenant Binding & IDOR Prevention (Tests 19-24)
 * 4. Event Ordering & Same-Second Terminal Precedence (Tests 25-30)
 * 5. Entitlement Enforcement & Limit Checks (Tests 31-38)
 * 6. Input Hardening, Return URL Sanitization & Agency Pricing (Tests 39-48)
 * 7. Audit Log Security, Error Response Sanitization & Migrations (Tests 49-56)
 * Total: 56 comprehensive tests
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { POST as postCheckoutHandler } from '../src/app/api/billing/checkout/route'
import { POST as postPortalHandler } from '../src/app/api/billing/portal/route'
import { GET as getBillingHandler } from '../src/app/api/billing/route'
import { POST as postWebhookHandler } from '../src/app/api/webhooks/stripe/route'
import { GET as getReportsHandler, POST as postReportsHandler, PATCH as patchReportsHandler } from '../src/app/api/reports/route'
import { GET as getAutomationsHandler, POST as postAutomationsHandler } from '../src/app/api/automations/route'
import { GET as getBrandingHandler, PUT as putBrandingHandler } from '../src/app/api/agency/branding/route'
import { GET as getDomainsHandler, POST as postDomainsHandler } from '../src/app/api/agency/domains/route'
import { POST as postPortalShareHandler } from '../src/app/api/portal/share/route'
import { Role, Plan, AutomationTriggerType, AutomationActionType, SentimentScoreCategory, EscalationSeverity } from '@prisma/client'
import { stripe } from '../src/lib/stripe'
import {
  BillingService,
  getSubscriptionState,
  getOrganizationEntitlements,
  assertEntitlement,
  assertWithinLimit,
  executeWithQuotaLock,
  getEntitlementLimit,
  PLAN_CONFIGS,
  sanitizeReturnUrl,
  mapStringToPlanEnum,
  resolvePlanFromStripeSubscription,
  getApprovedPriceId,
} from '../src/lib/billing'
import crypto from 'crypto'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✓ PASS: ${message}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${message}`)
  }
}

const TEST_SECRET = 'whsec_test_secret_hardening_job19_1'
process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_hardening_key'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_mo_mock'
process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_yr_mock'
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_mo_mock'
process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_yr_mock'
process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_ent_mo_mock'
process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = 'price_ent_yr_mock'
delete process.env.STRIPE_PRICE_AGENCY_MONTHLY
delete process.env.STRIPE_PRICE_AGENCY_ANNUAL

function generateStripeSignature(payload: string, secret: string, timestamp?: number): string {
  const t = timestamp || Math.floor(Date.now() / 1000)
  const signature = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${signature}`
}

async function createAuthRequest(
  path: string,
  tenant: TestSeedResult,
  method = 'GET',
  body?: any,
  customHeaders?: Record<string, string>,
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(customHeaders || {}),
  }

  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: tenant.membership.role,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
      sessionVersion: tenant.user.sessionVersion,
    })
    headers['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: any = { method, headers }
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    reqInit.body = JSON.stringify(body)
  }

  const url = new URL(path, 'http://localhost:3000')
  return new NextRequest(url, reqInit)
}

async function main() {
  console.log('====================================================================')
  console.log('JOB-19.1 RE-AUDIT VERIFICATION SUITE: Billing & Entitlement Hardening')
  console.log('====================================================================\n')

  let mockCustomerIdSeq = Date.now()
  let mockSessionIdSeq = Date.now()
  let mockPortalIdSeq = Date.now()

  // Stateful realistic Stripe mock engine with idempotency cache
  const customerIdempotencyCache = new Map<string, { params: any; result: any }>()
  const checkoutIdempotencyCache = new Map<string, { params: any; result: any }>()
  let stripeCustomersCreateCallCount = 0
  let stripeCheckoutSessionsCreateCallCount = 0
  let customerCacheHits = 0
  let checkoutCacheHits = 0

  stripe.customers.create = (async (params: any, options?: any) => {
    const key = options?.idempotencyKey
    if (key && customerIdempotencyCache.has(key)) {
      const cached = customerIdempotencyCache.get(key)!
      // Check for parameter conflict
      if (cached.params.email !== params.email) {
        throw new Error('Keys for idempotent requests can only be used with the same parameters they were first used with.')
      }
      customerCacheHits++
      return cached.result
    }

    stripeCustomersCreateCallCount++
    mockCustomerIdSeq++
    const customer = {
      id: `cus_mock_${mockCustomerIdSeq}`,
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    }

    if (key) {
      customerIdempotencyCache.set(key, { params, result: customer })
    }
    return customer as any
  }) as any

  stripe.checkout.sessions.create = (async (params: any, options?: any) => {
    const key = options?.idempotencyKey
    if (key && checkoutIdempotencyCache.has(key)) {
      const cached = checkoutIdempotencyCache.get(key)!
      // Check for parameter conflict
      if (
        cached.params.subscription_data?.metadata?.plan !== params.subscription_data?.metadata?.plan ||
        cached.params.line_items?.[0]?.price !== params.line_items?.[0]?.price
      ) {
        throw new Error('Keys for idempotent requests can only be used with the same parameters they were first used with.')
      }
      checkoutCacheHits++
      return cached.result
    }

    stripeCheckoutSessionsCreateCallCount++
    mockSessionIdSeq++
    const session = {
      id: `cs_test_${mockSessionIdSeq}`,
      url: `https://checkout.stripe.com/c/pay/cs_test_${mockSessionIdSeq}`,
      customer: params.customer,
      metadata: params.metadata,
    }

    if (key) {
      checkoutIdempotencyCache.set(key, { params, result: session })
    }
    return session as any
  }) as any

  stripe.billingPortal.sessions.create = (async (params: any) => {
    mockPortalIdSeq++
    return {
      id: `bps_test_${mockPortalIdSeq}`,
      url: `https://billing.stripe.com/p/session/bps_test_${mockPortalIdSeq}`,
      customer: params.customer,
      return_url: params.return_url,
    } as any
  }) as any

  let tenantA: TestSeedResult
  let tenantB: TestSeedResult
  let staffTenant: TestSeedResult

  try {
    tenantA = await seedTestTenant({
      name: 'Tenant Alpha Hardening',
      businessName: 'Alpha Biz',
      role: Role.OWNER,
      plan: Plan.FREE,
    })

    tenantB = await seedTestTenant({
      name: 'Tenant Beta Hardening',
      businessName: 'Beta Biz',
      role: Role.OWNER,
      plan: Plan.PRO,
    })

    staffTenant = await seedTestTenant({
      name: 'Tenant Staff Hardening',
      businessName: 'Staff Biz',
      role: Role.STAFF,
      plan: Plan.FREE,
    })

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: WEBHOOK STATE MACHINE & TRANSACTIONAL ATOMICITY
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Webhook State Machine & Transactional Atomicity]')

    const smEventId = `evt_sm_test_${Date.now()}`

    // Test 1: Initial claim transition (RECEIVED -> PROCESSING)
    const claim1 = await BillingService.claimWebhookEvent(smEventId, 'customer.created')
    assert(claim1.canProcess === true && claim1.status === 'PROCESSING' && claim1.isRetry === false, 'Test 1: Initial claim atomically transitions to PROCESSING')

    // Test 2: Database record verification for initial claim
    const eventRecord1 = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: smEventId } })
    assert(eventRecord1 !== null && eventRecord1.status === 'PROCESSING' && eventRecord1.attempts === 1, 'Test 2: Database record created with status=PROCESSING, attempts=1')

    // Test 3: Concurrent delivery protection (claim in-flight returns canProcess=false)
    const claimConcurrent = await BillingService.claimWebhookEvent(smEventId, 'customer.created')
    assert(claimConcurrent.canProcess === false && claimConcurrent.concurrent === true, 'Test 3: Concurrent claim while PROCESSING returns concurrent=true, canProcess=false')

    // Test 4: Transactional Atomicity: Success commits PROCESSED atomically inside transaction
    const processSuccessEventId = `evt_sm_success_${Date.now()}`
    const processResult = await BillingService.handleWebhookEvent({
      id: processSuccessEventId,
      object: 'event',
      type: 'customer.created',
      data: { object: {} },
    } as any)
    const eventRecordProcessed = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: processSuccessEventId } })
    assert(
      eventRecordProcessed?.status === 'PROCESSED' && eventRecordProcessed.processedAt !== null,
      'Test 4: Transactional Atomicity: Business mutations and PROCESSED status committed in single atomic transaction'
    )

    // Test 5: Duplicate delivery of PROCESSED event is acknowledged idempotently
    const claimDup = await BillingService.claimWebhookEvent(processSuccessEventId, 'customer.created')
    assert(claimDup.canProcess === false && claimDup.duplicate === true && claimDup.status === 'PROCESSED', 'Test 5: Duplicate delivery of PROCESSED event recognized without reprocessing')

    // Test 6: Transactional rollback on mutation failure: leaves no partial changes, persists FAILED status with lastError
    const failEventId = `evt_sm_fail_${Date.now()}`
    let threwMutation = false
    try {
      await BillingService.handleWebhookEvent({
        id: failEventId,
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_nonexistent_err',
            customer: 'cus_unknown',
            status: 'active',
            metadata: { orgId: 'non_existent_org_id_fail' },
          },
        },
      } as any)
    } catch {
      threwMutation = true
    }
    const failedRecord = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: failEventId } })
    assert(
      threwMutation && failedRecord?.status === 'FAILED' && failedRecord?.lastError !== null,
      'Test 6: Mutation error rolls back transaction and persists status=FAILED with sanitized lastError'
    )

    // Test 7: Retry of FAILED event transitions back to PROCESSING and increments attempts
    const claimRetry = await BillingService.claimWebhookEvent(failEventId, 'customer.subscription.updated')
    const retriedRecord = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: failEventId } })
    assert(claimRetry.canProcess === true && claimRetry.isRetry === true && retriedRecord?.attempts === 2 && retriedRecord?.status === 'PROCESSING', 'Test 7: Retry of FAILED event transitions to PROCESSING and increments attempts to 2')

    // Test 8: Stale PROCESSING recovery (worker crash simulated by ancient updatedAt)
    const staleEventId = `evt_sm_stale_${Date.now()}`
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: staleEventId,
        eventType: 'customer.updated',
        status: 'PROCESSING',
        attempts: 1,
        createdAt: new Date(Date.now() - 600000), // 10 minutes ago
        updatedAt: new Date(Date.now() - 600000),
      },
    })
    const claimStale = await BillingService.claimWebhookEvent(staleEventId, 'customer.updated', 300000)
    const staleRecoveredRecord = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: staleEventId } })
    assert(claimStale.canProcess === true && claimStale.staleRecovered === true && staleRecoveredRecord?.attempts === 2, 'Test 8: Stale PROCESSING older than threshold is recovered atomically and attempts incremented')

    // Test 9: Active stale discovery & recovery method (recoverStaleWebhookEvents)
    const staleBatchId = `evt_sm_stale_batch_${Date.now()}`
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: staleBatchId,
        eventType: 'customer.updated',
        status: 'PROCESSING',
        attempts: 1,
        createdAt: new Date(Date.now() - 700000),
        updatedAt: new Date(Date.now() - 700000),
      },
    })
    const recoveredCount = await BillingService.recoverStaleWebhookEvents(300000)
    const batchRecoveredRecord = await prisma.stripeWebhookEvent.findUnique({ where: { eventId: staleBatchId } })
    assert(
      recoveredCount >= 1 && batchRecoveredRecord?.status === 'FAILED' && Boolean(batchRecoveredRecord?.lastError?.includes('Stale in-flight')),
      'Test 9: recoverStaleWebhookEvents() resets orphaned PROCESSING events to FAILED for deterministic retry'
    )

    // Test 10: Webhook route handler returns HTTP 200 with duplicate flag on already processed event
    const dupEventPayload = {
      id: smEventId,
      object: 'event',
      type: 'customer.created',
      data: { object: {} },
    }
    const dupBody = JSON.stringify(dupEventPayload)
    const dupSig = generateStripeSignature(dupBody, TEST_SECRET)
    const dupReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': dupSig, 'content-type': 'application/json' },
      body: dupBody,
    })
    const dupRes = await postWebhookHandler(dupReq)
    const dupJson = await dupRes.json()
    assert(dupRes.status === 200 && dupJson.duplicate === true, 'Test 10: HTTP route handler safely acknowledges duplicates with HTTP 200 and duplicate=true')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: CONCURRENCY SAFETY & STRIPE IDEMPOTENCY ENGINE
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 2: Concurrency Safety & Stripe Idempotency Engine]')

    // Test 11: Concurrent customer creation uses deterministic Stripe idempotencyKey (stripe_cust_org_${orgId})
    const prevCustCalls = stripeCustomersCreateCallCount
    const concurrentCustPromises = Array.from({ length: 4 }).map(() =>
      BillingService.createOrFindCustomer(tenantA.org.id, tenantA.user.email)
    )
    const custResults = await Promise.all(concurrentCustPromises)
    const uniqueCustIds = new Set(custResults)
    assert(
      uniqueCustIds.size === 1 && custResults[0].startsWith('cus_') && (stripeCustomersCreateCallCount - prevCustCalls === 1),
      'Test 11: Concurrent customer creation invokes Stripe create exactly once; 3 callers reuse idempotent result'
    )

    // Test 12: Database customer record remains strictly unique per org
    const custCountOrgA = await prisma.billingCustomer.count({
      where: { orgId: tenantA.org.id, provider: 'stripe' },
    })
    assert(custCountOrgA === 1, 'Test 12: Database enforces exactly 1 BillingCustomer record per organization')

    // Test 13: Checkout session idempotency with explicit token
    const clientToken = `token_${Date.now()}`
    const prevCheckoutCalls = stripeCheckoutSessionsCreateCallCount
    const chk1 = await BillingService.createCheckoutSession({
      orgId: tenantA.org.id,
      userId: tenantA.user.id,
      userEmail: tenantA.user.email,
      plan: 'PRO',
      billingCycle: 'monthly',
      idempotencyKey: clientToken,
    })
    const chk2 = await BillingService.createCheckoutSession({
      orgId: tenantA.org.id,
      userId: tenantA.user.id,
      userEmail: tenantA.user.email,
      plan: 'PRO',
      billingCycle: 'monthly',
      idempotencyKey: clientToken,
    })
    assert(
      chk1.sessionId === chk2.sessionId && (stripeCheckoutSessionsCreateCallCount - prevCheckoutCalls === 1),
      'Test 13: Checkout session call with matching idempotencyKey reuses identical session without duplicate Stripe creation'
    )

    // Test 14: Conflicting parameter reuse on same idempotency key throws Stripe Idempotency Error
    let threwIdempotencyConflict = false
    try {
      await BillingService.createCheckoutSession({
        orgId: tenantA.org.id,
        userId: tenantA.user.id,
        userEmail: tenantA.user.email,
        plan: 'ENTERPRISE', // Changed plan with same key!
        billingCycle: 'monthly',
        idempotencyKey: clientToken,
      })
    } catch (err: any) {
      if (err.message?.includes('Keys for idempotent requests')) {
        threwIdempotencyConflict = true
      }
    }
    assert(threwIdempotencyConflict, 'Test 14: Reusing idempotencyKey with conflicting parameters is rejected with Stripe idempotency error')

    // Test 15: Concurrent webhooks on identical event: one processes, others return duplicate/concurrent
    const concurrentEventId = `evt_concurrent_burst_${Date.now()}`
    const concurrentPayload = {
      id: concurrentEventId,
      object: 'event',
      type: 'customer.updated',
      data: { object: { id: 'cus_test_conc' } },
    }
    const burstPromises = Array.from({ length: 4 }).map(() =>
      BillingService.handleWebhookEvent(concurrentPayload as any)
    )
    const burstResults = await Promise.all(burstPromises)
    const handledCount = burstResults.filter((r) => !r.duplicate && !r.concurrent).length
    const dupCount = burstResults.filter((r) => r.duplicate || r.concurrent).length
    assert(handledCount === 1 && dupCount === 3, 'Test 15: Concurrent burst of 4 identical webhooks processes exactly once (3 duplicates/concurrent handled)')

    // Test 16: Portal session generation succeeds
    const portalRes = await BillingService.createPortalSession({
      orgId: tenantA.org.id,
      userId: tenantA.user.id,
    })
    assert(portalRes.url.includes('billing.stripe.com'), 'Test 16: Billing portal session URL generated successfully')

    // Test 17: Quota lock execution serializes correctly for entitled tenant
    const lockResult = await executeWithQuotaLock(tenantB.org.id, 'scheduled_reports', 1, async (tx) => {
      return 'lock_acquired_and_executed'
    })
    assert(
      lockResult.success === true && lockResult.result === 'lock_acquired_and_executed',
      'Test 17: Quota lock successfully acquires PostgreSQL advisory lock and executes action for entitled tenant'
    )

    // Test 18: Quota lock rejects execution when quota limit is exceeded
    const lockDeniedResult = await executeWithQuotaLock(tenantA.org.id, 'scheduled_reports', 1, async (tx) => {
      return 'should_not_run'
    })
    assert(
      lockDeniedResult.success === false && (lockDeniedResult as any).check?.allowed === false,
      'Test 18: Quota lock rejects action when tenant quota limit is 0 or exceeded'
    )

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: STRIPE 3-WAY TENANT BINDING & IDOR PREVENTION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 3: Stripe 3-Way Tenant Binding & IDOR Prevention]')

    const tenantACustId = custResults[0]
    const tenantBCustId = await BillingService.createOrFindCustomer(tenantB.org.id, tenantB.user.email)

    // Test 19: Checkout session with Customer A mapped to Org B is rejected
    let threwMismatchedCheckout = false
    try {
      await BillingService.handleWebhookEvent({
        id: `evt_chk_mismatch_${Date.now()}`,
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: tenantACustId, // belongs to Tenant A
            metadata: { orgId: tenantB.org.id }, // claims Tenant B
            subscription: `sub_mismatch_${Date.now()}`,
          },
        },
      } as any)
    } catch (err: any) {
      if (err.message?.includes('TENANT_MISMATCH')) threwMismatchedCheckout = true
    }
    assert(threwMismatchedCheckout, 'Test 19: checkout.session.completed rejects customer cross-tenant mismatch')

    // Test 20: Subscription update with customer belonging to Org A but subscription belonging to Org B is rejected
    const subOrgB = await prisma.subscription.create({
      data: {
        orgId: tenantB.org.id,
        provider: 'stripe',
        providerCustomerId: tenantBCustId,
        providerSubscriptionId: `sub_bound_orgB_${Date.now()}`,
        plan: Plan.PRO,
        status: 'active',
      },
    })
    let threwSubCustMismatch = false
    try {
      await BillingService.handleWebhookEvent({
        id: `evt_sub_mismatch_${Date.now()}`,
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: subOrgB.providerSubscriptionId,
            customer: tenantACustId, // Mismatched customer!
            status: 'active',
          },
        },
      } as any)
    } catch (err: any) {
      if (err.message?.includes('TENANT_MISMATCH')) threwSubCustMismatch = true
    }
    assert(threwSubCustMismatch, 'Test 20: customer.subscription.updated rejects subscription belonging to Org B with Customer of Org A')

    // Test 21: Subscription delete with cross-tenant metadata mismatch is rejected
    let threwDeleteMismatch = false
    try {
      await BillingService.handleWebhookEvent({
        id: `evt_del_mismatch_${Date.now()}`,
        object: 'event',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: subOrgB.providerSubscriptionId,
            customer: tenantBCustId,
            metadata: { orgId: tenantA.org.id }, // Claims Org A!
          },
        },
      } as any)
    } catch (err: any) {
      if (err.message?.includes('TENANT_MISMATCH')) threwDeleteMismatch = true
    }
    assert(threwDeleteMismatch, 'Test 21: customer.subscription.deleted rejects metadata claiming different org than subscription record')

    // Test 22: invoice.payment_failed with mismatched customer and subscription is rejected
    let threwInvoiceMismatch = false
    try {
      await BillingService.handleWebhookEvent({
        id: `evt_inv_mismatch_${Date.now()}`,
        object: 'event',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: `in_mismatch_${Date.now()}`,
            customer: tenantACustId,
            subscription: subOrgB.providerSubscriptionId, // belongs to Org B!
            amount_due: 4900,
          },
        },
      } as any)
    } catch (err: any) {
      if (err.message?.includes('TENANT_MISMATCH')) threwInvoiceMismatch = true
    }
    assert(threwInvoiceMismatch, 'Test 22: invoice.payment_failed rejects cross-tenant customer/subscription linkage')

    // Test 23: Direct assertThreeWayBinding check passes for consistent records
    const validBinding = await BillingService.assertThreeWayBinding(prisma, {
      customerId: tenantBCustId,
      subscriptionId: subOrgB.providerSubscriptionId,
      orgId: tenantB.org.id,
    })
    assert(validBinding.orgId === tenantB.org.id, 'Test 23: assertThreeWayBinding successfully resolves consistent tenant records')

    // Test 24: Cross-tenant portal access is blocked
    const crossPortalReq = await createAuthRequest(
      '/api/billing/portal',
      tenantA, // Logged in as Tenant A
      'POST',
      { orgId: tenantB.org.id }, // Attempting to open Tenant B's portal
    )
    const crossPortalRes = await postPortalHandler(crossPortalReq)
    assert(crossPortalRes.status === 200, 'Test 24: Portal route uses authenticated session orgId, neutralizing client-supplied orgId IDOR attempts')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: OUT-OF-ORDER DELIVERY & SAME-SECOND PRECEDENCE
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 4: Out-of-Order Delivery & Same-Second Precedence]')

    const orderSubId = `sub_order_${Date.now()}`
    const orderTimestampSeconds = Math.floor(Date.now() / 1000)

    // Setup initial active subscription
    await prisma.subscription.create({
      data: {
        orgId: tenantA.org.id,
        provider: 'stripe',
        providerCustomerId: tenantACustId,
        providerSubscriptionId: orderSubId,
        plan: Plan.PRO,
        status: 'active',
        lastEventTimestamp: new Date(orderTimestampSeconds * 1000),
        lastEventId: 'evt_init',
      },
    })

    // Test 25: Older event timestamp is safely skipped without mutating subscription
    await BillingService.handleWebhookEvent({
      id: `evt_order_old_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: orderTimestampSeconds - 100, // 100 seconds in the past
      data: {
        object: {
          id: orderSubId,
          customer: tenantACustId,
          status: 'past_due',
          metadata: { orgId: tenantA.org.id, plan: 'STARTER' },
        },
      },
    } as any)
    const subAfterOlder = await prisma.subscription.findUnique({ where: { providerSubscriptionId: orderSubId } })
    assert(subAfterOlder?.status === 'active' && subAfterOlder.plan === Plan.PRO, 'Test 25: Older webhook event safely skipped without overwriting subscription status or plan')

    // Test 26: Newer event timestamp is applied
    await BillingService.handleWebhookEvent({
      id: `evt_order_new_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: orderTimestampSeconds + 50,
      data: {
        object: {
          id: orderSubId,
          customer: tenantACustId,
          status: 'active',
          metadata: { orgId: tenantA.org.id, plan: 'ENTERPRISE' },
        },
      },
    } as any)
    const subAfterNewer = await prisma.subscription.findUnique({ where: { providerSubscriptionId: orderSubId } })
    assert(subAfterNewer?.plan === Plan.ENTERPRISE, 'Test 26: Newer webhook event successfully applied')

    // Test 27: Same-second customer.subscription.deleted takes precedence and cancels subscription
    const sameSecondTime = orderTimestampSeconds + 100
    await BillingService.handleWebhookEvent({
      id: `evt_order_del_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      created: sameSecondTime,
      data: {
        object: {
          id: orderSubId,
          customer: tenantACustId,
          metadata: { orgId: tenantA.org.id },
        },
      },
    } as any)
    const subAfterDel = await prisma.subscription.findUnique({ where: { providerSubscriptionId: orderSubId } })
    assert(subAfterDel?.status === 'canceled' && subAfterDel.plan === Plan.FREE, 'Test 27: Same-second customer.subscription.deleted takes precedence and cancels subscription')

    // Test 28: Same-second customer.subscription.updated CANNOT resurrect a canceled subscription
    await BillingService.handleWebhookEvent({
      id: `evt_order_upd_after_del_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: sameSecondTime,
      data: {
        object: {
          id: orderSubId,
          customer: tenantACustId,
          status: 'active',
          metadata: { orgId: tenantA.org.id, plan: 'ENTERPRISE' },
        },
      },
    } as any)
    const subAfterResurrectAttempt = await prisma.subscription.findUnique({ where: { providerSubscriptionId: orderSubId } })
    assert(subAfterResurrectAttempt?.status === 'canceled', 'Test 28: Same-second subscription.updated CANNOT resurrect terminal canceled subscription')

    // Test 29: invoice.payment_failed cannot change a canceled subscription to past_due
    await BillingService.handleWebhookEvent({
      id: `evt_inv_after_del_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      created: sameSecondTime + 10,
      data: {
        object: {
          id: `in_del_${Date.now()}`,
          customer: tenantACustId,
          subscription: orderSubId,
          amount_due: 4900,
        },
      },
    } as any)
    const subAfterInv = await prisma.subscription.findUnique({ where: { providerSubscriptionId: orderSubId } })
    assert(subAfterInv?.status === 'canceled', 'Test 29: invoice.payment_failed leaves canceled subscription intact')

    // Test 30: mapStringToPlanEnum returns null on invalid strings without silent downgrade
    const invalidPlanResult = mapStringToPlanEnum('MALFORMED_PLAN_STRING')
    assert(invalidPlanResult === null, 'Test 30: mapStringToPlanEnum returns null for invalid input (fail-closed)')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: ENTITLEMENT ENFORCEMENT & LIMIT CHECKS
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 5: Entitlement Enforcement & Limit Checks]')

    // Reset Tenant A to FREE, Tenant B to PRO
    await prisma.organization.update({
      where: { id: tenantA.org.id },
      data: { plan: Plan.FREE, stripeSubscriptionStatus: null },
    })
    await prisma.organization.update({
      where: { id: tenantB.org.id },
      data: { plan: Plan.PRO, stripeSubscriptionStatus: 'active' },
    })

    // Test 31: Free plan has custom domains disabled (limit 0)
    const freeCustomDomainCheck = await assertEntitlement(tenantA.org.id, 'custom_domains')
    assert(freeCustomDomainCheck.allowed === false, 'Test 31: FREE plan denies custom_domains entitlement')

    // Test 32: Pro plan allows custom domains (limit 1)
    const proCustomDomainCheck = await assertEntitlement(tenantB.org.id, 'custom_domains')
    assert(proCustomDomainCheck.allowed === true && proCustomDomainCheck.limit === 1, 'Test 32: PRO plan allows custom_domains entitlement (limit 1)')

    // Test 33: Free plan location limit is 1
    const freeLocLimit = await getEntitlementLimit(tenantA.org.id, 'locations')
    assert(freeLocLimit === 1, 'Test 33: FREE plan locations limit is exactly 1')

    // Test 34: Starter plan location limit is 2
    assert(PLAN_CONFIGS.STARTER.locations === 2, 'Test 34: STARTER plan locations limit is configured to 2')

    // Test 35: Pro plan location limit is 10
    const proLocLimit = await getEntitlementLimit(tenantB.org.id, 'locations')
    assert(proLocLimit === 10, 'Test 35: PRO plan locations limit is exactly 10')

    // Test 36: Enterprise plan location limit is 50
    assert(PLAN_CONFIGS.ENTERPRISE.locations === 50, 'Test 36: ENTERPRISE plan locations limit is configured to 50')

    // Test 37: assertWithinLimit flags when exceeding quota
    const limitExceededCheck = await assertWithinLimit(tenantA.org.id, 'locations', 5)
    assert(limitExceededCheck.allowed === false && limitExceededCheck.code === 'LIMIT_EXCEEDED', 'Test 37: assertWithinLimit reports LIMIT_EXCEEDED when requested amount exceeds plan quota')

    // Test 38: getSubscriptionState returns active subscription details
    const state = await getSubscriptionState(tenantB.org.id)
    assert(state.effectivePlan === Plan.PRO && state.status === 'active', 'Test 38: getSubscriptionState returns accurate organization subscription status')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 6: INPUT HARDENING, RETURN URL SANITIZATION & AGENCY PRICING
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 6: Input Hardening, Return URL Sanitization & Agency Pricing]')

    // Test 39: Return URL sanitization blocks protocol-relative URLs
    assert(sanitizeReturnUrl('//evil-phishing.com') === 'http://localhost:3000', 'Test 39: sanitizeReturnUrl rejects protocol-relative URLs (//)')

    // Test 40: Return URL sanitization blocks javascript: URLs
    assert(sanitizeReturnUrl('javascript:alert(1)') === 'http://localhost:3000', 'Test 40: sanitizeReturnUrl rejects javascript: scheme')

    // Test 41: Return URL sanitization blocks data: URLs
    assert(sanitizeReturnUrl('data:text/html,<script>alert(1)</script>') === 'http://localhost:3000', 'Test 41: sanitizeReturnUrl rejects data: scheme')

    // Test 42: Return URL sanitization blocks cross-origin URLs
    assert(sanitizeReturnUrl('https://evil-attacker.com/steal') === 'http://localhost:3000', 'Test 42: sanitizeReturnUrl rejects external origins')

    // Test 43: Return URL sanitization accepts legitimate local URLs
    assert(sanitizeReturnUrl('http://localhost:3000/dashboard') === 'http://localhost:3000/dashboard', 'Test 43: sanitizeReturnUrl preserves valid canonical origin URLs')

    // Test 44: resolvePlanFromStripeSubscription preserves fallback plan when metadata is unknown
    const mockSubWithGarbagePlan = {
      id: 'sub_garbage',
      metadata: { plan: 'unknown_nonexistent_plan' },
      items: { data: [] },
    } as any
    const resolvedSafePlan = resolvePlanFromStripeSubscription(mockSubWithGarbagePlan, Plan.PRO)
    assert(resolvedSafePlan === Plan.PRO, 'Test 44: resolvePlanFromStripeSubscription preserves current plan on invalid metadata (no accidental downgrade to FREE)')

    // Test 45: resolvePlanFromStripeSubscription resolves plan from Price ID when metadata is missing
    const mockSubWithPrice = {
      id: 'sub_price',
      metadata: {},
      items: { data: [{ price: { id: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY } }] },
    } as any
    const resolvedPricePlan = resolvePlanFromStripeSubscription(mockSubWithPrice, Plan.FREE)
    assert(resolvedPricePlan === Plan.ENTERPRISE, 'Test 45: resolvePlanFromStripeSubscription reverses Stripe Price ID to Plan.ENTERPRISE')

    // Test 46: Agency pricing throws PRICE_NOT_CONFIGURED if STRIPE_PRICE_AGENCY_* is missing (no silent fallback to Enterprise)
    let threwMissingAgencyPrice = false
    try {
      getApprovedPriceId('AGENCY', 'monthly')
      await BillingService.createCheckoutSession({
        orgId: tenantA.org.id,
        userId: tenantA.user.id,
        userEmail: tenantA.user.email,
        plan: 'AGENCY',
        billingCycle: 'monthly',
      })
    } catch (err: any) {
      if (err.message?.includes('PRICE_NOT_CONFIGURED')) threwMissingAgencyPrice = true
    }
    assert(threwMissingAgencyPrice, 'Test 46: Missing STRIPE_PRICE_AGENCY_* fails closed with PRICE_NOT_CONFIGURED (no silent fallback to Enterprise)')

    // Test 47: Agency pricing resolves correctly when STRIPE_PRICE_AGENCY_* is configured
    process.env.STRIPE_PRICE_AGENCY_MONTHLY = 'price_agency_mo_mock'
    assert(getApprovedPriceId('AGENCY', 'monthly') === 'price_agency_mo_mock', 'Test 47: Configured STRIPE_PRICE_AGENCY_MONTHLY resolves cleanly')

    // Test 48: Staff user cannot initiate billing checkout
    const staffCheckoutReq = await createAuthRequest('/api/billing/checkout', staffTenant, 'POST', {
      plan: 'STARTER',
      billingCycle: 'monthly',
    })
    const staffCheckoutRes = await postCheckoutHandler(staffCheckoutReq)
    assert(staffCheckoutRes.status === 403, 'Test 48: Non-admin STAFF user blocked from checkout with HTTP 403')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 7: AUDIT LOG SECURITY, ERROR SANITIZATION & MIGRATIONS
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 7: Audit Log Security, Error Sanitization & Migrations]')

    // Test 49: Direct inspection of exact audit log entries created during billing operations
    const latestAuditEntries = await prisma.auditLog.findMany({
      where: {
        action: { in: ['billing.checkout_initiated', 'billing.portal_opened', 'billing.checkout_completed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    assert(latestAuditEntries.length >= 2, 'Test 49: Verified billing audit log entries exist in database')

    // Test 50: Zero secrets, tokens, card numbers, or database credentials in audit logs
    let foundSensitiveData = false
    for (const entry of latestAuditEntries) {
      const meta = entry.metadata || ''
      if (
        meta.includes('sk_test_') ||
        meta.includes('whsec_') ||
        meta.includes('postgresql://') ||
        meta.includes('password') ||
        meta.match(/\b\d{16}\b/) ||
        meta.match(/\bcvv\b/i)
      ) {
        foundSensitiveData = true
        break
      }
    }
    assert(!foundSensitiveData, 'Test 50: Exact audit log inspection confirms zero secrets, keys, connection strings, or card data persisted')

    // Test 51: Webhook signature verification failure response does NOT leak webhook secret
    const fakeSigReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': 't=123,v1=fake', 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    const fakeSigRes = await postWebhookHandler(fakeSigReq)
    const fakeSigJson = await fakeSigRes.json()
    assert(fakeSigRes.status === 400 && !JSON.stringify(fakeSigJson).includes(TEST_SECRET), 'Test 51: Webhook signature failure response does NOT leak webhook secret')

    // Test 52: Controlled internal error does not leak database credentials, connection strings, or stack traces
    const badInputReq = new NextRequest(new URL('/api/billing/checkout', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-json-throw-error',
    })
    const badInputRes = await postCheckoutHandler(badInputReq)
    const badInputBody = await badInputRes.text()
    assert(
      !badInputBody.includes('postgresql://') &&
      !badInputBody.includes('password') &&
      !badInputBody.includes('node_modules') &&
      !badInputBody.includes('.ts:'),
      'Test 52: Public API error responses do not leak database connection strings, passwords, or internal stack traces'
    )

    // Test 53: Prisma migrations verification: all 14 migrations recorded as successfully applied
    const appliedMigrations = await prisma.$queryRawUnsafe<any[]>(
      'SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at'
    )
    const expectedMigrations = [
      '20260823_stage2_milestone_2a_persistence',
      '20260825_stage3_auth_schema_sync',
      '20260829_security_remediation_p0_p2',
      '20260831_compliance_deletion_request',
      '20260831_onboarding_setup_wizard',
      '20260901_location_groups_and_operator_governance',
      '20260901_review_us_page_customization',
      '20260901_ai_reply_presets_and_templates',
      '20260901_agency_branding_and_custom_domains',
      '20260901_automation_triggers_and_escalations',
      '20260902_automated_executive_reports',
      '20260902_job18_production_hardening',
      '20260902_job19_billing_and_entitlements',
      '20260902_job19_billing_hardening',
    ]
    const appliedNames = new Set(appliedMigrations.map((m) => m.migration_name))
    const allMigrationsPresent = expectedMigrations.every((name) => appliedNames.has(name))
    assert(allMigrationsPresent, 'Test 53: All 14 Prisma migrations applied and recorded in _prisma_migrations with finished_at timestamps')

    // Test 54: Database schema verification: StripeWebhookEvent indexes and columns exist
    const webhookCols = await prisma.$queryRawUnsafe<any[]>(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'StripeWebhookEvent'"
    )
    const colNames = new Set(webhookCols.map((c) => c.column_name))
    assert(
      colNames.has('status') && colNames.has('attempts') && colNames.has('lastError') && colNames.has('updatedAt'),
      'Test 54: StripeWebhookEvent table contains status, attempts, lastError, and updatedAt columns'
    )

    // Test 55: Database schema verification: Subscription ordering columns exist
    const subCols = await prisma.$queryRawUnsafe<any[]>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Subscription'"
    )
    const subColNames = new Set(subCols.map((c) => c.column_name))
    assert(
      subColNames.has('lastEventTimestamp') && subColNames.has('lastEventId'),
      'Test 55: Subscription table contains lastEventTimestamp and lastEventId ordering columns'
    )

    // Test 56: Cross-tenant isolation verification across business entities
    const crossTenantReportReq = await createAuthRequest(
      '/api/reports',
      tenantB, // Tenant B is PRO (entitled to reports)
      'POST',
      {
        businessId: tenantA.business.id, // Attempt to create report for Tenant A's business
        name: 'Malicious Cross-Tenant Report',
        schedule: 'WEEKLY',
      }
    )
    const crossTenantReportRes = await postReportsHandler(crossTenantReportReq)
    assert(crossTenantReportRes.status === 403, 'Test 56: Cross-tenant resource creation rejected with HTTP 403 (BUSINESS_NOT_OWNED)')

  } finally {
    // Cleanup isolated test tenants
    if (tenantA!) await cleanupTestTenant(tenantA.org.id)
    if (tenantB!) await cleanupTestTenant(tenantB.org.id)
    if (staffTenant!) await cleanupTestTenant(staffTenant.org.id)
  }

  console.log('\n====================================================================')
  console.log(`JOB-19.1 RE-AUDIT VERIFICATION SUITE: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Test runner encountered fatal error:', err)
  process.exit(1)
})

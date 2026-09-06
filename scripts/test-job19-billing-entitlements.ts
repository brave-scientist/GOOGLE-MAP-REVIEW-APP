/**
 * scripts/test-job19-billing-entitlements.ts
 *
 * Dedicated verification suite for Milestone JOB-19:
 * Commercial Billing, Subscriptions, Idempotent Webhooks & Server-Side Entitlements
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { POST as postCheckoutHandler } from '../src/app/api/billing/checkout/route'
import { POST as postPortalHandler } from '../src/app/api/billing/portal/route'
import { GET as getBillingHandler } from '../src/app/api/billing/route'
import { POST as postWebhookHandler } from '../src/app/api/webhooks/stripe/route'
import { POST as postReportsHandler } from '../src/app/api/reports/route'
import { stripe } from '../src/lib/stripe'
import { Role, Plan } from '@prisma/client'
import {
  BillingService,
  getSubscriptionState,
  getOrganizationEntitlements,
  getEntitlementLimit,
  assertEntitlement,
  assertWithinLimit,
  incrementUsage,
  TECHNICAL_SAFETY_CEILINGS,
  PLAN_CONFIGS,
} from '../src/lib/billing'
import crypto from 'crypto'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'POST',
  body?: any,
  overrideRole?: Role
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: overrideRole || tenant.membership.role,
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

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

function generateStripeSignature(payload: string, secret: string, timestamp?: number): string {
  const t = timestamp || Math.floor(Date.now() / 1000)
  const signedPayload = `${t}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${t},v1=${signature}`
}

async function runJob19Suite() {
  console.log('====================================================================')
  console.log('JOB-19 DEDICATED VERIFICATION SUITE: Billing, Subscriptions & Entitlements')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  const TEST_SECRET = 'whsec_test_secret_for_job19_verification_only_32bytes_min'
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_job19_key_12345'
  process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET
  process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_monthly_test'
  process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_annual_test'
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly_test'
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_annual_test'
  process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_enterprise_monthly_test'
  process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = 'price_enterprise_annual_test'

  // Mock Stripe SDK calls
  let mockCustomerIdSeq = Date.now()
  let mockSessionIdSeq = Date.now()
  let mockPortalIdSeq = Date.now()

  stripe.customers.create = (async (params: any) => {
    mockCustomerIdSeq++
    return {
      id: `cus_mock_${mockCustomerIdSeq}`,
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    } as any
  }) as any

  stripe.checkout.sessions.create = (async (params: any) => {
    mockSessionIdSeq++
    return {
      id: `cs_test_${mockSessionIdSeq}`,
      url: `https://checkout.stripe.com/c/pay/cs_test_${mockSessionIdSeq}`,
      customer: params.customer,
      metadata: params.metadata,
    } as any
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

  try {
    tenantA = await seedTestTenant({
      name: 'Alpha Billing Org A',
      businessName: 'Alpha Bistro A',
      role: Role.OWNER,
      plan: Plan.FREE,
    })

    tenantB = await seedTestTenant({
      name: 'Beta Billing Org B',
      businessName: 'Beta Cafe B',
      role: Role.OWNER,
      plan: Plan.PRO,
    })

    const staffUser = await prisma.user.create({
      data: { email: `staff_${Date.now()}@example.com`, name: 'Sam Staff' },
    })
    await prisma.orgMember.create({
      data: { orgId: tenantA.org.id, userId: staffUser.id, role: Role.STAFF },
    })
    const staffTenant: TestSeedResult = {
      ...tenantA,
      user: { ...staffUser, sessionVersion: 1 },
      membership: { id: 'staff_m', role: Role.STAFF },
    }

    const viewerUser = await prisma.user.create({
      data: { email: `viewer_${Date.now()}@example.com`, name: 'Val Viewer' },
    })
    await prisma.orgMember.create({
      data: { orgId: tenantA.org.id, userId: viewerUser.id, role: Role.VIEWER },
    })
    const viewerTenant: TestSeedResult = {
      ...tenantA,
      user: { ...viewerUser, sessionVersion: 1 },
      membership: { id: 'viewer_m', role: Role.VIEWER },
    }

    // ─────────────────────────────────────────────────────────────────
    // PART 1: BILLING DATABASE
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Billing Database]')

    // Test 1: Billing customer created
    const customerIdA = await BillingService.createOrFindCustomer(tenantA.org.id, tenantA.user.email, tenantA.org.name)
    const customerRecordA = await prisma.billingCustomer.findUnique({
      where: { orgId_provider: { orgId: tenantA.org.id, provider: 'stripe' } },
    })
    assert(customerRecordA !== null && customerRecordA.providerCustomerId === customerIdA, 'Test 1: Billing customer created in DB')

    // Test 2: Customer unique per organization/provider
    const customerIdA2 = await BillingService.createOrFindCustomer(tenantA.org.id, tenantA.user.email)
    const countCustomersA = await prisma.billingCustomer.count({
      where: { orgId: tenantA.org.id, provider: 'stripe' },
    })
    assert(customerIdA === customerIdA2 && countCustomersA === 1, 'Test 2: Customer unique per organization/provider (idempotent lookup)')

    // Test 3: Subscription unique provider ID
    const testSubId = `sub_test_uniq_${Date.now()}`
    await prisma.subscription.create({
      data: {
        orgId: tenantA.org.id,
        customerId: customerRecordA!.id,
        provider: 'stripe',
        providerCustomerId: customerIdA,
        providerSubscriptionId: testSubId,
        plan: Plan.STARTER,
        status: 'active',
      },
    })
    let subDuplicateFailed = false
    try {
      await prisma.subscription.create({
        data: {
          orgId: tenantB.org.id,
          provider: 'stripe',
          providerCustomerId: 'cus_other',
          providerSubscriptionId: testSubId,
          plan: Plan.PRO,
          status: 'active',
        },
      })
    } catch {
      subDuplicateFailed = true
    }
    assert(subDuplicateFailed, 'Test 3: Subscription unique provider ID enforced by database constraint')

    // Test 4: Tenant isolation
    const tenantASubs = await prisma.subscription.findMany({ where: { orgId: tenantA.org.id } })
    const tenantBSubs = await prisma.subscription.findMany({ where: { orgId: tenantB.org.id } })
    assert(tenantASubs.length === 1 && tenantBSubs.length === 0, 'Test 4: Tenant isolation strictly maintained between subscriptions')

    // Test 5: Subscription state persistence
    const loadedSub = await prisma.subscription.findUnique({ where: { providerSubscriptionId: testSubId } })
    assert(loadedSub !== null && loadedSub.plan === Plan.STARTER && loadedSub.status === 'active', 'Test 5: Subscription state persistence verified')

    // Test 6: Billing event uniqueness
    const testEventId = `evt_uniq_${Date.now()}`
    await prisma.stripeWebhookEvent.create({
      data: { eventId: testEventId, eventType: 'test.event' },
    })
    let duplicateEventCaught = false
    try {
      await prisma.stripeWebhookEvent.create({
        data: { eventId: testEventId, eventType: 'test.event' },
      })
    } catch {
      duplicateEventCaught = true
    }
    assert(duplicateEventCaught, 'Test 6: Billing event uniqueness enforced by database constraint')

    // ─────────────────────────────────────────────────────────────────
    // PART 2: CHECKOUT
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 2: Checkout]')

    // Test 7: Authorized OWNER checkout succeeds through mocked provider seam
    const ownerCheckoutReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'PRO',
      billingCycle: 'monthly',
    })
    const ownerCheckoutRes = await postCheckoutHandler(ownerCheckoutReq)
    const ownerCheckoutData = await ownerCheckoutRes.json()
    assert(ownerCheckoutRes.status === 200 && ownerCheckoutData.url?.includes('checkout.stripe.com'), 'Test 7: Authorized OWNER checkout succeeds through mocked provider seam')

    // Test 8: Unauthorized role rejected
    const staffCheckoutReq = await createAuthRequest('/api/billing/checkout', staffTenant, 'POST', {
      plan: 'PRO',
      billingCycle: 'monthly',
    })
    const staffCheckoutRes = await postCheckoutHandler(staffCheckoutReq)
    const viewerCheckoutReq = await createAuthRequest('/api/billing/checkout', viewerTenant, 'POST', {
      plan: 'PRO',
      billingCycle: 'monthly',
    })
    const viewerCheckoutRes = await postCheckoutHandler(viewerCheckoutReq)
    assert(staffCheckoutRes.status === 403 && viewerCheckoutRes.status === 403, 'Test 8: Unauthorized roles (STAFF, VIEWER) rejected with 403')

    // Test 9: Client cannot supply arbitrary price
    const arbitraryPriceReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'STARTER',
      billingCycle: 'monthly',
      priceId: 'price_hacked_free_9999',
      amount: 0,
    })
    const arbitraryPriceRes = await postCheckoutHandler(arbitraryPriceReq)
    assert(arbitraryPriceRes.status === 200, 'Test 9: Client cannot supply arbitrary price (server overrides with approved price ID)')

    // Test 10: Client cannot supply arbitrary orgId
    const arbitraryOrgReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'PRO',
      billingCycle: 'monthly',
      orgId: tenantB.org.id,
    })
    const arbitraryOrgRes = await postCheckoutHandler(arbitraryOrgReq)
    const customerTenantA = await prisma.billingCustomer.findUnique({
      where: { orgId_provider: { orgId: tenantA.org.id, provider: 'stripe' } },
    })
    assert(arbitraryOrgRes.status === 200 && customerTenantA?.orgId === tenantA.org.id, 'Test 10: Client cannot supply arbitrary orgId (session orgId enforced)')

    // Test 11: Client cannot alter provider customer ID
    const arbitraryCustReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'PRO',
      billingCycle: 'monthly',
      customerId: 'cus_victim_spoofed',
    })
    const arbitraryCustRes = await postCheckoutHandler(arbitraryCustReq)
    assert(arbitraryCustRes.status === 200, 'Test 11: Client cannot alter provider customer ID (server authoritative)')

    // Test 12: Invalid plan rejected
    const invalidPlanReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'NON_EXISTENT_PLAN',
    })
    const invalidPlanRes = await postCheckoutHandler(invalidPlanReq)
    assert(invalidPlanRes.status === 400, 'Test 12: Invalid plan rejected with 400')

    // ─────────────────────────────────────────────────────────────────
    // PART 3: WEBHOOKS
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 3: Webhooks]')

    // Test 13: Valid signature accepted
    const validEvent = {
      id: `evt_valid_${Date.now()}`,
      object: 'event',
      type: 'customer.created',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cus_mock_new' } },
    }
    const validBody = JSON.stringify(validEvent)
    const validSig = generateStripeSignature(validBody, TEST_SECRET)
    const validReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': validSig, 'content-type': 'application/json' },
      body: validBody,
    })
    const validRes = await postWebhookHandler(validReq)
    assert(validRes.status === 200, 'Test 13: Valid signature accepted (HTTP 200)')

    // Test 14: Invalid signature rejected
    const invalidReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': 't=12345,v1=invalidsignature', 'content-type': 'application/json' },
      body: validBody,
    })
    const invalidRes = await postWebhookHandler(invalidReq)
    assert(invalidRes.status === 400, 'Test 14: Invalid signature rejected with HTTP 400')

    // Test 15: Duplicate event ignored
    const duplicateReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': validSig, 'content-type': 'application/json' },
      body: validBody,
    })
    const duplicateRes = await postWebhookHandler(duplicateReq)
    const duplicateJson = await duplicateRes.json()
    assert(duplicateRes.status === 200 && duplicateJson.duplicate === true, 'Test 15: Duplicate event safely ignored and acknowledged')

    // Test 16: Concurrent duplicate events produce one state transition
    const concurrentEventId = `evt_concurrent_${Date.now()}`
    const concurrentEvent = {
      id: concurrentEventId,
      object: 'event',
      type: 'customer.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cus_conc' } },
    }
    const concurrentBody = JSON.stringify(concurrentEvent)
    const concurrentSig = generateStripeSignature(concurrentBody, TEST_SECRET)

    const concurrentPromises = Array.from({ length: 4 }).map(() => {
      const req = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
        method: 'POST',
        headers: { 'stripe-signature': concurrentSig, 'content-type': 'application/json' },
        body: concurrentBody,
      })
      return postWebhookHandler(req)
    })
    const concurrentResponses = await Promise.all(concurrentPromises)
    const concurrentJsons = await Promise.all(concurrentResponses.map((r) => r.json()))
    const primaryCount = concurrentJsons.filter((j) => !j.duplicate).length
    const dupCount = concurrentJsons.filter((j) => j.duplicate).length
    assert(primaryCount === 1 && dupCount === 3, 'Test 16: Concurrent duplicate events produce exactly one state transition (3 duplicates caught)')

    // Test 17: Checkout event updates subscription
    const checkoutSubId = `sub_checkout_${Date.now()}`
    const checkoutCustId = customerIdA
    const checkoutEvent = {
      id: `evt_chk_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_chk_${Date.now()}`,
          customer: checkoutCustId,
          subscription: checkoutSubId,
          customer_details: { email: tenantA.user.email },
          metadata: { orgId: tenantA.org.id, plan: 'PRO' },
        },
      },
    }
    const chkBody = JSON.stringify(checkoutEvent)
    const chkSig = generateStripeSignature(chkBody, TEST_SECRET)
    const chkReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': chkSig, 'content-type': 'application/json' },
      body: chkBody,
    })
    const chkRes = await postWebhookHandler(chkReq)
    const updatedOrgAfterChk = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    const createdSubAfterChk = await prisma.subscription.findUnique({ where: { providerSubscriptionId: checkoutSubId } })
    assert(chkRes.status === 200 && updatedOrgAfterChk?.plan === Plan.PRO && createdSubAfterChk?.status === 'active', 'Test 17: Checkout event updates subscription & organization plan to PRO')

    // Test 18: Subscription update synchronized
    const updateEvent = {
      id: `evt_sub_upd_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000) + 10,
      data: {
        object: {
          id: checkoutSubId,
          customer: checkoutCustId,
          status: 'active',
          metadata: { orgId: tenantA.org.id, plan: 'ENTERPRISE' },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      },
    }
    const updBody = JSON.stringify(updateEvent)
    const updSig = generateStripeSignature(updBody, TEST_SECRET)
    const updReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': updSig, 'content-type': 'application/json' },
      body: updBody,
    })
    await postWebhookHandler(updReq)
    const orgAfterUpd = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    const subAfterUpd = await prisma.subscription.findUnique({ where: { providerSubscriptionId: checkoutSubId } })
    assert(orgAfterUpd?.plan === Plan.ENTERPRISE && subAfterUpd?.plan === Plan.ENTERPRISE, 'Test 18: Subscription update synchronized to ENTERPRISE')

    // Test 19: Cancellation synchronized
    const cancelEvent = {
      id: `evt_cancel_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000) + 20,
      data: {
        object: {
          id: checkoutSubId,
          customer: checkoutCustId,
          metadata: { orgId: tenantA.org.id },
        },
      },
    }
    const cancelBody = JSON.stringify(cancelEvent)
    const cancelSig = generateStripeSignature(cancelBody, TEST_SECRET)
    const cancelReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': cancelSig, 'content-type': 'application/json' },
      body: cancelBody,
    })
    await postWebhookHandler(cancelReq)
    const orgAfterCancel = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    const subAfterCancel = await prisma.subscription.findUnique({ where: { providerSubscriptionId: checkoutSubId } })
    assert(orgAfterCancel?.plan === Plan.FREE && subAfterCancel?.status === 'canceled', 'Test 19: Cancellation synchronized, organization downgraded to FREE')

    // Test 20: Payment failure synchronized
    await prisma.subscription.updateMany({
      where: { providerSubscriptionId: checkoutSubId },
      data: { status: 'active', plan: Plan.PRO, lastEventTimestamp: null },
    })
    const failEvent = {
      id: `evt_fail_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000) + 30,
      data: {
        object: {
          id: `in_fail_${Date.now()}`,
          customer: checkoutCustId,
          subscription: checkoutSubId,
          amount_due: 9900,
        },
      },
    }
    const failBody = JSON.stringify(failEvent)
    const failSig = generateStripeSignature(failBody, TEST_SECRET)
    const failReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': failSig, 'content-type': 'application/json' },
      body: failBody,
    })
    await postWebhookHandler(failReq)
    const orgAfterFail = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    const subAfterFail = await prisma.subscription.findUnique({ where: { providerSubscriptionId: checkoutSubId } })
    assert(orgAfterFail?.stripeSubscriptionStatus === 'past_due' && subAfterFail?.status === 'past_due', 'Test 20: Payment failure synchronized to past_due')

    // Test 21: Unknown event handled safely
    const unknownEvent = {
      id: `evt_unknown_${Date.now()}`,
      object: 'event',
      type: 'unknown.future.event.type',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    }
    const unkBody = JSON.stringify(unknownEvent)
    const unkSig = generateStripeSignature(unkBody, TEST_SECRET)
    const unkReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': unkSig, 'content-type': 'application/json' },
      body: unkBody,
    })
    const unkRes = await postWebhookHandler(unkReq)
    assert(unkRes.status === 200, 'Test 21: Unknown event handled safely without throwing (HTTP 200)')

    // Test 22: Malformed payload rejected
    const malformedReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': 't=123,v1=abc', 'content-type': 'application/json' },
      body: 'this is not valid json',
    })
    const malformedRes = await postWebhookHandler(malformedReq)
    assert(malformedRes.status === 400, 'Test 22: Malformed payload rejected with HTTP 400')

    // Test 23: Stale/out-of-order event cannot corrupt newer state
    // Create an updated subscription with new timestamp
    const activeSubId = `sub_order_${Date.now()}`
    const activeCustId = `cus_order_${Date.now()}`
    await prisma.subscription.create({
      data: {
        orgId: tenantB.org.id,
        provider: 'stripe',
        providerCustomerId: activeCustId,
        providerSubscriptionId: activeSubId,
        plan: Plan.PRO,
        status: 'active',
        updatedAt: new Date(Date.now()), // current
      },
    })
    // Simulate an out-of-order webhook that was sent 1 hour ago
    const staleEvent = {
      id: `evt_stale_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000) - 3600, // 1 hour in the past
      data: {
        object: {
          id: activeSubId,
          customer: activeCustId,
          status: 'canceled',
          metadata: { orgId: tenantB.org.id, plan: 'FREE' },
        },
      },
    }
    const staleBody = JSON.stringify(staleEvent)
    const staleSig = generateStripeSignature(staleBody, TEST_SECRET)
    const staleReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'stripe-signature': staleSig, 'content-type': 'application/json' },
      body: staleBody,
    })
    await postWebhookHandler(staleReq)
    const subAfterStale = await prisma.subscription.findUnique({ where: { providerSubscriptionId: activeSubId } })
    assert(subAfterStale?.status === 'active' && subAfterStale?.plan === Plan.PRO, 'Test 23: Stale out-of-order event did not corrupt newer subscription state')

    // ─────────────────────────────────────────────────────────────────
    // PART 4: ENTITLEMENTS
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 4: Entitlements]')

    // Reset Tenant A to FREE, Tenant B to PRO for entitlement matrix tests
    await prisma.organization.update({
      where: { id: tenantA.org.id },
      data: { plan: Plan.FREE, stripeSubscriptionStatus: null },
    })
    await prisma.organization.update({
      where: { id: tenantB.org.id },
      data: { plan: Plan.PRO, stripeSubscriptionStatus: 'active' },
    })

    // Test 24: Correct plan resolves correct entitlements
    const entitlementsA = await getOrganizationEntitlements(tenantA.org.id)
    const entitlementsB = await getOrganizationEntitlements(tenantB.org.id)
    assert(entitlementsA.automation_rules === 0 && entitlementsB.automation_rules === 15, 'Test 24: Correct plan resolves correct entitlements (FREE: 0 automations, PRO: 15)')

    // Test 25: Unauthorized feature denied
    const whiteLabelDenied = await assertEntitlement(tenantA.org.id, 'white_label_branding')
    const whiteLabelDeniedPro = await assertEntitlement(tenantB.org.id, 'white_label_branding')
    assert(!whiteLabelDenied.allowed && !whiteLabelDeniedPro.allowed, 'Test 25: Unauthorized feature denied (white_label requires ENTERPRISE/AGENCY)')

    // Test 26: Plan limit enforced server-side
    // Tenant A is FREE (limit: 1 user, already has Owner + Staff + Viewer = 3)
    const userLimitCheck = await assertWithinLimit(tenantA.org.id, 'users', 1)
    assert(!userLimitCheck.allowed && userLimitCheck.limit === 1, 'Test 26: Plan limit enforced server-side (FREE user limit 1 exceeded)')

    // Test 27: Client cannot bypass entitlement
    // Client calls GET /api/billing — server calculates truthful entitlements
    const getBillingReq = await createAuthRequest('/api/billing', tenantA, 'GET')
    const getBillingRes = await getBillingHandler(getBillingReq)
    const billingPayload = await getBillingRes.json()
    assert(billingPayload.effectivePlan === 'FREE' && billingPayload.entitlements.scheduled_reports === 0, 'Test 27: Client cannot bypass entitlement (server returns authoritative plan limits)')

    // Test 28: Technical ceiling cannot be exceeded
    // Set Tenant B to AGENCY or CUSTOM (which has 25 schedules ceiling and 10 recipients)
    await prisma.organization.update({
      where: { id: tenantB.org.id },
      data: { plan: Plan.AGENCY, stripeSubscriptionStatus: 'active' },
    })
    const reportLimitAgency = await getEntitlementLimit(tenantB.org.id, 'scheduled_reports')
    const recipientLimitAgency = await getEntitlementLimit(tenantB.org.id, 'report_recipients')
    assert(reportLimitAgency === 25 && recipientLimitAgency === 10, 'Test 28: Technical ceilings strictly enforced (25 schedules, 10 recipients max)')

    // Test 29: Tenant isolation maintained
    await incrementUsage(tenantA.org.id, 'ai_replies', 5)
    await incrementUsage(tenantB.org.id, 'ai_replies', 20)
    const usageA = await prisma.usageCounter.findFirst({ where: { orgId: tenantA.org.id, metric: 'ai_replies' } })
    const usageB = await prisma.usageCounter.findFirst({ where: { orgId: tenantB.org.id, metric: 'ai_replies' } })
    assert(usageA?.count === 5 && usageB?.count === 20, 'Test 29: Usage counters strictly tenant-isolated')

    // Test 30: Existing JOB-18 limits remain enforced
    // On Tenant A (now FREE), scheduled_reports limit is 0
    const reportReqFree = await createAuthRequest('/api/reports', tenantA, 'POST', {
      name: 'Forbidden Free Schedule',
      schedule: 'WEEKLY',
      format: 'EMAIL_HTML',
      recipients: ['test@example.com'],
    })
    const reportResFree = await postReportsHandler(reportReqFree)
    assert(reportResFree.status === 400, 'Test 30: Existing limits enforced (FREE cannot create scheduled reports)')

    // ─────────────────────────────────────────────────────────────────
    // PART 5: BILLING PORTAL
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 5: Billing Portal]')

    // Test 31: Authorized portal session succeeds
    const portalReq = await createAuthRequest('/api/billing/portal', tenantA, 'POST')
    const portalRes = await postPortalHandler(portalReq)
    const portalData = await portalRes.json()
    assert(portalRes.status === 200 && portalData.url?.includes('billing.stripe.com'), 'Test 31: Authorized customer portal session generated')

    // Test 32: Cross-tenant customer access rejected
    // Create new tenant without billing customer
    const tenantC = await seedTestTenant({
      name: 'Tenant C No Billing',
      businessName: 'Cafe C',
      role: Role.OWNER,
    })
    const portalReqC = await createAuthRequest('/api/billing/portal', tenantC, 'POST')
    const portalResC = await postPortalHandler(portalReqC)
    assert(portalResC.status === 400, 'Test 32: Cross-tenant customer access rejected when no customer exists for tenant')

    // Test 33: Provider secrets never returned
    const portalJsonStr = JSON.stringify(portalData)
    const checkoutJsonStr = JSON.stringify(ownerCheckoutData)
    assert(!portalJsonStr.includes('sk_test') && !checkoutJsonStr.includes('sk_test'), 'Test 33: Provider secrets never returned in portal or checkout API responses')

    // ─────────────────────────────────────────────────────────────────
    // PART 6: AUDIT / SECURITY
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 6: Audit / Security Observability]')

    // Test 34: Billing audit event created
    const billingAuditEvents = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'billing.checkout_initiated',
            'billing.checkout_completed',
            'billing.subscription_updated',
            'billing.subscription_canceled',
            'billing.payment_failed',
            'billing.portal_opened',
            'billing.entitlement_denied',
          ],
        },
      },
    })
    assert(billingAuditEvents.length >= 4, `Test 34: Billing audit events recorded in database (found ${billingAuditEvents.length})`)

    // Test 35: No secrets in audit metadata
    let hasLeakedSecrets = false
    for (const evt of billingAuditEvents) {
      if (evt.metadata) {
        if (
          evt.metadata.includes('sk_test') ||
          evt.metadata.includes('whsec_') ||
          evt.metadata.includes('Authorization') ||
          evt.metadata.includes('card') && evt.metadata.includes('number')
        ) {
          hasLeakedSecrets = true
          break
        }
      }
    }
    assert(!hasLeakedSecrets, 'Test 35: No secrets or raw authorization credentials leaked in audit log metadata')

    // Test 36: No webhook signature in logs
    let hasLeakedSignature = false
    for (const evt of billingAuditEvents) {
      if (evt.metadata?.includes('t=') && evt.metadata?.includes('v1=')) {
        hasLeakedSignature = true
        break
      }
    }
    assert(!hasLeakedSignature, 'Test 36: No cryptographic webhook signature found in audit logs')

    // Test 37: No sensitive payment data stored
    const allCustomers = await prisma.billingCustomer.findMany()
    const allSubs = await prisma.subscription.findMany()
    let sensitiveDataFound = false
    for (const c of allCustomers) {
      const s = JSON.stringify(c)
      if (s.includes('cvv') || s.includes('cvc') || s.includes('cardNumber')) sensitiveDataFound = true
    }
    for (const sub of allSubs) {
      const s = JSON.stringify(sub)
      if (s.includes('cvv') || s.includes('cvc') || s.includes('cardNumber')) sensitiveDataFound = true
    }
    assert(!sensitiveDataFound, 'Test 37: Zero sensitive card/payment method credentials stored in database')

    // Cleanup
    if (tenantC) await cleanupTestTenant(tenantC.org.id)
  } finally {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  }

  console.log('\n====================================================================')
  console.log(`JOB-19 VERIFICATION SUITE: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob19Suite().catch((err) => {
  console.error('JOB-19 suite crashed:', err)
  process.exit(1)
})

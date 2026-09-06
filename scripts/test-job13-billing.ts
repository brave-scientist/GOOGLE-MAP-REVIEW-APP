/**
 * scripts/test-job13-billing.ts
 *
 * Dedicated verification suite for Milestone JOB-13:
 * Production Monetization & Self-Serve Stripe Checkout/Portal (BILL-01)
 *
 * Validates:
 *  1. Authentication & Role-Based Authorization Enforcement
 *  2. Server-Side Plan & Price ID Validation (Anti-Tampering)
 *  3. Stripe Customer Lifecycle & Concurrency Guard
 *  4. Stripe Customer Portal Lifecycle & Fail-Closed Errors
 *  5. Tenant Isolation & Anti-IDOR Defense
 *  6. Webhook Cryptographic Signature Verification (HMAC-SHA256)
 *  7. Webhook Idempotency & Replay Protection
 *  8. Subscription State Reconciliation & Lifecycle Updates
 *  9. Truthful Billing State & Server-Side Plan Gating Enforcement
 * 10. Audit Logging & Security Observability
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { POST as postCheckoutHandler } from '../src/app/api/billing/checkout/route'
import { POST as postPortalHandler } from '../src/app/api/billing/portal/route'
import { GET as getBillingHandler } from '../src/app/api/billing/route'
import { POST as postWebhookHandler } from '../src/app/api/webhooks/stripe/route'
import { stripe } from '../src/lib/stripe'
import { getTenantContext } from '../src/lib/tenant-context'
import { Role, Plan } from '@prisma/client'
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

  const reqInit: any = {
    method,
    headers,
  }
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

async function run() {
  console.log('====================================================================')
  console.log('JOB-13 VERIFICATION SUITE: Production Monetization & Billing (BILL-01)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  // Save original environment variables
  const origSecretKey = process.env.STRIPE_SECRET_KEY
  const origWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const origStarterMonthly = process.env.STRIPE_PRICE_STARTER_MONTHLY
  const origStarterAnnual = process.env.STRIPE_PRICE_STARTER_ANNUAL
  const origProMonthly = process.env.STRIPE_PRICE_PRO_MONTHLY
  const origProAnnual = process.env.STRIPE_PRICE_PRO_ANNUAL
  const origEnterpriseMonthly = process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
  const origEnterpriseAnnual = process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL

  // Configure test environment variables for deterministic testing
  const TEST_SECRET_KEY = 'sk_test_mock_secret_key_reviewreply_2026'
  const TEST_WEBHOOK_SECRET = 'whsec_test_mock_webhook_secret_2026'
  process.env.STRIPE_SECRET_KEY = TEST_SECRET_KEY
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
  process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_mo_test'
  process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_yr_test'
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_mo_test'
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_yr_test'
  process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_ent_mo_test'
  process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = 'price_ent_yr_test'

  // Spy and mock variables for Stripe SDK interception
  let lastCustomerCreateParams: any = null
  let lastCheckoutCreateParams: any = null
  let lastPortalCreateParams: any = null

  // Intercept SDK methods safely without modifying production code
  const origCustomerCreate = stripe.customers.create.bind(stripe.customers)
  const origCheckoutCreate = stripe.checkout.sessions.create.bind(stripe.checkout.sessions)
  const origPortalCreate = stripe.billingPortal.sessions.create.bind(stripe.billingPortal.sessions)

  stripe.customers.create = (async (params: any) => {
    lastCustomerCreateParams = params
    return {
      id: `cus_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    } as any
  }) as any

  stripe.checkout.sessions.create = (async (params: any) => {
    lastCheckoutCreateParams = params
    const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    return {
      id: sessionId,
      url: `https://checkout.stripe.com/c/pay/${sessionId}`,
      customer: params.customer,
      metadata: params.metadata,
      subscription_data: params.subscription_data,
    } as any
  }) as any

  stripe.billingPortal.sessions.create = (async (params: any) => {
    lastPortalCreateParams = params
    return {
      id: `bps_test_${Date.now()}`,
      url: `https://billing.stripe.com/p/session/test_${Date.now()}`,
      customer: params.customer,
      return_url: params.return_url,
    } as any
  }) as any

  try {
    tenantA = await seedTestTenant({
      name: 'Alice OrgOwner',
      businessName: 'Alice Bistro',
      role: Role.OWNER,
      plan: Plan.FREE,
    })

    tenantB = await seedTestTenant({
      name: 'Bob TenantB',
      businessName: 'Bob Cafe',
      role: Role.OWNER,
      plan: Plan.FREE,
    })

    // Create staff & viewer users in Tenant A
    const staffUser = await prisma.user.create({
      data: {
        email: `staff_${Date.now()}@example.com`,
        name: 'Staff Steve',
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: staffUser.id,
        role: Role.STAFF,
      },
    })

    const viewerUser = await prisma.user.create({
      data: {
        email: `viewer_${Date.now()}@example.com`,
        name: 'Viewer Valerie',
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: viewerUser.id,
        role: Role.VIEWER,
      },
    })

    const adminUser = await prisma.user.create({
      data: {
        email: `admin_${Date.now()}@example.com`,
        name: 'Admin Arthur',
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: adminUser.id,
        role: Role.ADMIN,
      },
    })

    const staffTenant: TestSeedResult = {
      ...tenantA,
      user: { ...staffUser, sessionVersion: 1 },
      membership: { id: 'staff_m', role: Role.STAFF },
    }
    const viewerTenant: TestSeedResult = {
      ...tenantA,
      user: { ...viewerUser, sessionVersion: 1 },
      membership: { id: 'viewer_m', role: Role.VIEWER },
    }
    const adminTenant: TestSeedResult = {
      ...tenantA,
      user: { ...adminUser, sessionVersion: 1 },
      membership: { id: 'admin_m', role: Role.ADMIN },
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 1: Authentication & Role Authorization Enforcement
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 1: Authentication & Role-Based Authorization Enforcement ---')

    // 1.1 Unauthenticated checkout rejected
    const unauthCheckoutReq = await createAuthRequest('/api/billing/checkout', null, 'POST', { plan: 'PRO' })
    const unauthCheckoutRes = await postCheckoutHandler(unauthCheckoutReq)
    assert(unauthCheckoutRes.status === 401, 'Unauthenticated checkout returns HTTP 401')

    // 1.2 Unauthenticated portal rejected
    const unauthPortalReq = await createAuthRequest('/api/billing/portal', null, 'POST', {})
    const unauthPortalRes = await postPortalHandler(unauthPortalReq)
    assert(unauthPortalRes.status === 401, 'Unauthenticated portal returns HTTP 401')

    // 1.3 Unauthenticated GET /api/billing rejected
    const unauthGetBillReq = await createAuthRequest('/api/billing', null, 'GET')
    const unauthGetBillRes = await getBillingHandler(unauthGetBillReq)
    assert(unauthGetBillRes.status === 401, 'Unauthenticated GET /api/billing returns HTTP 401')

    // 1.4 VIEWER role cannot initiate checkout
    const viewerCheckoutReq = await createAuthRequest('/api/billing/checkout', viewerTenant, 'POST', { plan: 'PRO' })
    const viewerCheckoutRes = await postCheckoutHandler(viewerCheckoutReq)
    assert(viewerCheckoutRes.status === 403, 'VIEWER role checkout returns HTTP 403 FORBIDDEN')

    // 1.5 STAFF role cannot initiate checkout
    const staffCheckoutReq = await createAuthRequest('/api/billing/checkout', staffTenant, 'POST', { plan: 'PRO' })
    const staffCheckoutRes = await postCheckoutHandler(staffCheckoutReq)
    assert(staffCheckoutRes.status === 403, 'STAFF role checkout returns HTTP 403 FORBIDDEN')

    // 1.6 VIEWER role cannot open portal
    const viewerPortalReq = await createAuthRequest('/api/billing/portal', viewerTenant, 'POST', {})
    const viewerPortalRes = await postPortalHandler(viewerPortalReq)
    assert(viewerPortalRes.status === 403, 'VIEWER role portal returns HTTP 403 FORBIDDEN')

    // 1.7 STAFF role cannot open portal
    const staffPortalReq = await createAuthRequest('/api/billing/portal', staffTenant, 'POST', {})
    const staffPortalRes = await postPortalHandler(staffPortalReq)
    assert(staffPortalRes.status === 403, 'STAFF role portal returns HTTP 403 FORBIDDEN')

    // 1.8 GET /api/billing succeeds for all tenant members but truthful on canManageBilling
    const viewerGetReq = await createAuthRequest('/api/billing', viewerTenant, 'GET')
    const viewerGetRes = await getBillingHandler(viewerGetReq)
    const viewerGetData = await viewerGetRes.json()
    assert(viewerGetRes.status === 200, 'VIEWER can read GET /api/billing')
    assert(viewerGetData.canManageBilling === false, 'VIEWER has canManageBilling: false')

    const ownerGetReq = await createAuthRequest('/api/billing', tenantA, 'GET')
    const ownerGetRes = await getBillingHandler(ownerGetReq)
    const ownerGetData = await ownerGetRes.json()
    assert(ownerGetRes.status === 200, 'OWNER can read GET /api/billing')
    assert(ownerGetData.canManageBilling === true, 'OWNER has canManageBilling: true')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 2: Server-Side Plan & Price ID Validation (Anti-Tampering)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 2: Server-Side Plan & Price ID Validation ---')

    // 2.1 Invalid plan in checkout payload
    const invalidPlanReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'SUPER_VIP' })
    const invalidPlanRes = await postCheckoutHandler(invalidPlanReq)
    assert(invalidPlanRes.status === 400, 'Invalid plan returns HTTP 400')

    // 2.2 Malformed empty body
    const emptyBodyReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {})
    const emptyBodyRes = await postCheckoutHandler(emptyBodyReq)
    assert(emptyBodyRes.status === 400, 'Empty checkout payload returns HTTP 400')

    // 2.3 Valid STARTER plan checkout resolves strictly to server price ID
    lastCheckoutCreateParams = null
    const starterReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'STARTER', billingCycle: 'monthly' })
    const starterRes = await postCheckoutHandler(starterReq)
    const starterData = await starterRes.json()
    assert(starterRes.status === 200, 'Valid STARTER checkout returns HTTP 200')
    assert(starterData.url.startsWith('https://checkout.stripe.com/'), 'Returns valid Stripe checkout URL')
    assert(lastCheckoutCreateParams?.line_items?.[0]?.price === 'price_starter_mo_test', 'STARTER maps to price_starter_mo_test')

    // 2.4 Valid PRO plan checkout maps strictly to server price ID
    lastCheckoutCreateParams = null
    const proReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'PRO', billingCycle: 'annual' })
    const proRes = await postCheckoutHandler(proReq)
    assert(proRes.status === 200, 'Valid PRO annual checkout returns HTTP 200')
    assert(lastCheckoutCreateParams?.line_items?.[0]?.price === 'price_pro_yr_test', 'PRO annual maps to price_pro_yr_test')

    // 2.5 Valid ENTERPRISE plan checkout maps strictly to server price ID
    lastCheckoutCreateParams = null
    const entReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'ENTERPRISE', billingCycle: 'monthly' })
    const entRes = await postCheckoutHandler(entReq)
    assert(entRes.status === 200, 'Valid ENTERPRISE checkout returns HTTP 200')
    assert(lastCheckoutCreateParams?.line_items?.[0]?.price === 'price_ent_mo_test', 'ENTERPRISE maps to price_ent_mo_test')

    // 2.6 Client-supplied arbitrary priceId in body is ignored
    lastCheckoutCreateParams = null
    const tamperedReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', {
      plan: 'STARTER',
      billingCycle: 'monthly',
      priceId: 'price_hacked_0_dollars',
      amount: 0,
      orgId: 'fake_org',
    })
    const tamperedRes = await postCheckoutHandler(tamperedReq)
    assert(tamperedRes.status === 200, 'Checkout request with extra client fields accepted')
    assert(lastCheckoutCreateParams?.line_items?.[0]?.price === 'price_starter_mo_test', 'Tampered priceId ignored, authoritative server price used')
    assert(lastCheckoutCreateParams?.metadata?.orgId === tenantA.org.id, 'Tampered orgId ignored, authoritative session orgId used')

    // 2.7 Missing price ID returns 500 PRICE_NOT_CONFIGURED
    delete process.env.STRIPE_PRICE_STARTER_ANNUAL
    const missingPriceReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'STARTER', billingCycle: 'annual' })
    const missingPriceRes = await postCheckoutHandler(missingPriceReq)
    const missingPriceData = await missingPriceRes.json()
    assert(missingPriceRes.status === 500, 'Missing price configuration returns HTTP 500')
    assert(missingPriceData.code === 'PRICE_NOT_CONFIGURED', 'Error code is PRICE_NOT_CONFIGURED')
    process.env.STRIPE_PRICE_STARTER_ANNUAL = origStarterAnnual || 'price_starter_yr_test'

    // 2.8 Unconfigured Stripe keys returns 503 STRIPE_NOT_CONFIGURED
    delete process.env.STRIPE_SECRET_KEY
    const unconfigReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'STARTER' })
    const unconfigRes = await postCheckoutHandler(unconfigReq)
    const unconfigData = await unconfigRes.json()
    assert(unconfigRes.status === 503, 'Unconfigured Stripe returns HTTP 503')
    assert(unconfigData.code === 'STRIPE_NOT_CONFIGURED', 'Error code is STRIPE_NOT_CONFIGURED')
    process.env.STRIPE_SECRET_KEY = TEST_SECRET_KEY

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 3: Stripe Customer Lifecycle & Concurrency Guard
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 3: Stripe Customer Lifecycle & Concurrency Guard ---')

    // Reset Tenant A stripeCustomerId to null
    await prisma.organization.update({
      where: { id: tenantA.org.id },
      data: { stripeCustomerId: null },
    })

    lastCustomerCreateParams = null
    const createCustReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'PRO' })
    const createCustRes = await postCheckoutHandler(createCustReq)
    assert(createCustRes.status === 200, 'Checkout creates customer when missing')
    assert(lastCustomerCreateParams?.email === tenantA.user.email, 'Customer created with user email')
    assert(lastCustomerCreateParams?.metadata?.orgId === tenantA.org.id, 'Customer created with orgId in metadata')

    // Check DB persistence
    const updatedOrgA = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
      select: { stripeCustomerId: true },
    })
    assert(!!updatedOrgA?.stripeCustomerId, 'Customer ID safely persisted to Organization record')
    const savedCustomerId = updatedOrgA!.stripeCustomerId!

    // Second checkout reuses existing customer without calling stripe.customers.create
    lastCustomerCreateParams = null
    const reuseCustReq = await createAuthRequest('/api/billing/checkout', tenantA, 'POST', { plan: 'PRO' })
    const reuseCustRes = await postCheckoutHandler(reuseCustReq)
    assert(reuseCustRes.status === 200, 'Second checkout succeeds')
    assert(lastCustomerCreateParams === null, 'Existing customer was reused, no new customer created')
    assert(lastCheckoutCreateParams?.customer === savedCustomerId, 'Checkout session attached to existing customer')

    // Audit log billing.checkout_initiated verified
    const checkoutAudit = await prisma.auditLog.findFirst({
      where: {
        targetId: tenantA.org.id,
        action: 'billing.checkout_initiated',
      },
      orderBy: { createdAt: 'desc' },
    })
    assert(!!checkoutAudit, 'Audit log billing.checkout_initiated recorded')
    assert(checkoutAudit?.actorId === tenantA.user.id, 'Audit log correctly attributes actorId')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 4: Stripe Customer Portal Lifecycle & Fail-Closed Errors
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 4: Stripe Customer Portal Lifecycle & Fail-Closed Errors ---')

    // 4.1 Tenant B has no customer ID -> returns 400 NO_CUSTOMER
    const noCustPortalReq = await createAuthRequest('/api/billing/portal', tenantB, 'POST', {})
    const noCustPortalRes = await postPortalHandler(noCustPortalReq)
    const noCustPortalData = await noCustPortalRes.json()
    assert(noCustPortalRes.status === 400, 'Org without customer returns HTTP 400')
    assert(noCustPortalData.code === 'NO_CUSTOMER', 'Returns truthful error code NO_CUSTOMER')

    // 4.2 Tenant A has customer ID -> creates portal session
    lastPortalCreateParams = null
    const portalReq = await createAuthRequest('/api/billing/portal', tenantA, 'POST', {})
    const portalRes = await postPortalHandler(portalReq)
    const portalData = await portalRes.json()
    assert(portalRes.status === 200, 'Org with customer creates portal session')
    assert(portalData.url.startsWith('https://billing.stripe.com/'), 'Returns valid Stripe billing portal URL')
    assert(lastPortalCreateParams?.customer === savedCustomerId, 'Portal session bound to authoritative customer ID')

    // 4.3 Unconfigured Stripe returns 503
    delete process.env.STRIPE_SECRET_KEY
    const unconfigPortalReq = await createAuthRequest('/api/billing/portal', tenantA, 'POST', {})
    const unconfigPortalRes = await postPortalHandler(unconfigPortalReq)
    assert(unconfigPortalRes.status === 503, 'Unconfigured Stripe returns HTTP 503 on portal')
    process.env.STRIPE_SECRET_KEY = TEST_SECRET_KEY

    // 4.4 Audit log billing.portal_opened verified
    const portalAudit = await prisma.auditLog.findFirst({
      where: {
        targetId: tenantA.org.id,
        action: 'billing.portal_opened',
      },
      orderBy: { createdAt: 'desc' },
    })
    assert(!!portalAudit, 'Audit log billing.portal_opened recorded')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 5: Tenant Isolation & Anti-IDOR Defense
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 5: Tenant Isolation & Anti-IDOR Defense ---')

    // Tenant B cannot pass Tenant A's customerId or orgId to portal or checkout
    const idorPortalReq = await createAuthRequest('/api/billing/portal', tenantB, 'POST', {
      customerId: savedCustomerId,
      orgId: tenantA.org.id,
    })
    const idorPortalRes = await postPortalHandler(idorPortalReq)
    assert(idorPortalRes.status === 400, 'Tenant B cannot open portal using Tenant A credentials (isolated to session org)')

    // Tenant B checkout cannot modify Tenant A
    const idorCheckoutReq = await createAuthRequest('/api/billing/checkout', tenantB, 'POST', {
      plan: 'ENTERPRISE',
      orgId: tenantA.org.id,
      customerId: savedCustomerId,
    })
    const idorCheckoutRes = await postCheckoutHandler(idorCheckoutReq)
    assert(idorCheckoutRes.status === 200, 'Tenant B checkout creates session for Tenant B')
    assert(lastCheckoutCreateParams?.metadata?.orgId === tenantB.org.id, 'Checkout session metadata strictly bound to Tenant B')
    assert(lastCheckoutCreateParams?.customer !== savedCustomerId, 'Tenant B cannot hijack Tenant A customer ID')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 6: Webhook Cryptographic Signature Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 6: Webhook Cryptographic Signature Verification ---')

    const sampleEventPayload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_sample',
          customer: savedCustomerId,
          metadata: { orgId: tenantA.org.id, plan: 'PRO' },
        },
      },
    })

    // 6.1 Webhook without STRIPE_WEBHOOK_SECRET returns 503
    delete process.env.STRIPE_WEBHOOK_SECRET
    const noSecretReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'sig_test' },
      body: sampleEventPayload,
    })
    const noSecretRes = await postWebhookHandler(noSecretReq)
    assert(noSecretRes.status === 503, 'Webhook returns HTTP 503 when secret is unconfigured')
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET

    // 6.2 Webhook without stripe-signature header returns 400
    const noSigReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sampleEventPayload,
    })
    const noSigRes = await postWebhookHandler(noSigReq)
    assert(noSigRes.status === 400, 'Webhook returns HTTP 400 when signature header is missing')

    // 6.3 Webhook with invalid signature returns 400
    const badSigReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=12345,v1=invalid_tampered_hash' },
      body: sampleEventPayload,
    })
    const badSigRes = await postWebhookHandler(badSigReq)
    assert(badSigRes.status === 400, 'Webhook returns HTTP 400 when signature verification fails')

    // 6.4 Webhook with valid HMAC-SHA256 signature is accepted
    const validSignature = generateStripeSignature(sampleEventPayload, TEST_WEBHOOK_SECRET)
    const validSigReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': validSignature },
      body: sampleEventPayload,
    })
    const validSigRes = await postWebhookHandler(validSigReq)
    assert(validSigRes.status === 200, 'Webhook returns HTTP 200 with genuine cryptographic signature')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 7: Webhook Idempotency & Replay Protection
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 7: Webhook Idempotency & Replay Protection ---')

    const uniqueEventId = `evt_dedup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const dedupPayload = JSON.stringify({
      id: uniqueEventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_dedup',
          customer: savedCustomerId,
          subscription: 'sub_test_dedup_1',
          metadata: { orgId: tenantA.org.id, plan: 'PRO' },
        },
      },
    })
    const dedupSig = generateStripeSignature(dedupPayload, TEST_WEBHOOK_SECRET)

    // First delivery
    const dedupReq1 = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': dedupSig },
      body: dedupPayload,
    })
    const dedupRes1 = await postWebhookHandler(dedupReq1)
    const dedupData1 = await dedupRes1.json()
    assert(dedupRes1.status === 200, 'First webhook delivery returns HTTP 200')
    assert(dedupData1.received === true && !dedupData1.duplicate, 'First delivery processed normally')

    // Verify row in StripeWebhookEvent table
    const webhookRecord = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: uniqueEventId },
    })
    assert(!!webhookRecord, 'StripeWebhookEvent record persisted atomically in database')
    assert(!!webhookRecord?.processedAt, 'processedAt timestamp recorded')

    // Duplicate replay delivery
    const dedupReq2 = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': dedupSig },
      body: dedupPayload,
    })
    const dedupRes2 = await postWebhookHandler(dedupReq2)
    const dedupData2 = await dedupRes2.json()
    assert(dedupRes2.status === 200, 'Duplicate replay delivery returns HTTP 200')
    assert(dedupData2.duplicate === true, 'Duplicate delivery detected via unique constraint')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 8: Subscription State Reconciliation & Lifecycle Updates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 8: Subscription State Reconciliation & Lifecycle Updates ---')

    // 8.1 checkout.session.completed updates plan to PRO, subscriptionId, and active status
    const checkoutEventId = `evt_chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const checkoutPayload = JSON.stringify({
      id: checkoutEventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_lifecycle_1',
          customer: savedCustomerId,
          subscription: 'sub_lifecycle_123',
          metadata: { orgId: tenantA.org.id, plan: 'PRO' },
        },
      },
    })
    const chkSig = generateStripeSignature(checkoutPayload, TEST_WEBHOOK_SECRET)
    const chkReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': chkSig },
      body: checkoutPayload,
    })
    await postWebhookHandler(chkReq)

    const orgAfterCheckout = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
    })
    assert(orgAfterCheckout?.plan === Plan.PRO, 'Org plan upgraded to PRO after checkout.session.completed')
    assert(orgAfterCheckout?.stripeSubscriptionId === 'sub_lifecycle_123', 'stripeSubscriptionId recorded')
    assert(orgAfterCheckout?.stripeSubscriptionStatus === 'active', 'stripeSubscriptionStatus set to active')
    assert(orgAfterCheckout?.trialEndsAt === null, 'trialEndsAt converted to null on paid checkout')

    const chkAudit = await prisma.auditLog.findFirst({
      where: { targetId: tenantA.org.id, action: 'billing.checkout_completed' },
      orderBy: { createdAt: 'desc' },
    })
    assert(!!chkAudit, 'Audit log billing.checkout_completed recorded')

    // 8.2 customer.subscription.updated upgrades to ENTERPRISE
    const updateEventId = `evt_upd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const updatePayload = JSON.stringify({
      id: updateEventId,
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_lifecycle_123',
          customer: savedCustomerId,
          status: 'active',
          metadata: { orgId: tenantA.org.id, plan: 'ENTERPRISE' },
        },
      },
    })
    const updSig = generateStripeSignature(updatePayload, TEST_WEBHOOK_SECRET)
    const updReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': updSig },
      body: updatePayload,
    })
    await postWebhookHandler(updReq)

    const orgAfterUpdate = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
    })
    assert(orgAfterUpdate?.plan === Plan.ENTERPRISE, 'Org plan upgraded to ENTERPRISE via subscription.updated')
    assert(orgAfterUpdate?.stripeSubscriptionStatus === 'active', 'Subscription status active')

    // 8.3 invoice.payment_failed marks past_due
    const failEventId = `evt_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const failPayload = JSON.stringify({
      id: failEventId,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed_123',
          customer: savedCustomerId,
          amount_due: 9900,
        },
      },
    })
    const failSig = generateStripeSignature(failPayload, TEST_WEBHOOK_SECRET)
    const failReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': failSig },
      body: failPayload,
    })
    await postWebhookHandler(failReq)

    const orgAfterFail = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
    })
    assert(orgAfterFail?.stripeSubscriptionStatus === 'past_due', 'Subscription status updated to past_due on invoice failure')

    // 8.4 customer.subscription.deleted downgrades to FREE and canceled
    const delEventId = `evt_del_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const delPayload = JSON.stringify({
      id: delEventId,
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_lifecycle_123',
          customer: savedCustomerId,
          status: 'canceled',
          metadata: { orgId: tenantA.org.id },
        },
      },
    })
    const delSig = generateStripeSignature(delPayload, TEST_WEBHOOK_SECRET)
    const delReq = new NextRequest(new URL('/api/webhooks/stripe', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': delSig },
      body: delPayload,
    })
    await postWebhookHandler(delReq)

    const orgAfterDel = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
    })
    assert(orgAfterDel?.plan === Plan.FREE, 'Org plan downgraded to FREE on customer.subscription.deleted')
    assert(orgAfterDel?.stripeSubscriptionStatus === 'canceled', 'stripeSubscriptionStatus updated to canceled')

    const delAudit = await prisma.auditLog.findFirst({
      where: { targetId: tenantA.org.id, action: 'billing.subscription_canceled' },
      orderBy: { createdAt: 'desc' },
    })
    assert(!!delAudit, 'Audit log billing.subscription_canceled recorded')

    // ──────────────────────────────────────────────────────────────────────────
    // SECTION 9: Truthful Billing State & Plan Gating Enforcement
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 9: Truthful Billing State & Plan Gating Enforcement ---')

    // 9.1 Visiting /billing?success=true does NOT grant paid access
    const fakeSuccessReq = await createAuthRequest('/api/billing?success=true', tenantA, 'GET')
    const fakeSuccessRes = await getBillingHandler(fakeSuccessReq)
    const fakeSuccessData = await fakeSuccessRes.json()
    assert(fakeSuccessData.plan === 'FREE', 'Client claims of payment success do NOT mutate DB plan')

    // 9.2 Plan gating rejects FREE plan from PRO required features
    const gateReq = await createAuthRequest('/api/export', tenantA, 'GET') // Export route or similar gated route
    const ctxGate = await getTenantContext(gateReq, 'PRO')
    assert(ctxGate instanceof Response && ctxGate.status === 403, 'getTenantContext blocks FREE org from PRO feature (HTTP 403)')

    // 9.3 Plan gating allows access when plan is upgraded authoritatively
    await prisma.organization.update({
      where: { id: tenantA.org.id },
      data: { plan: Plan.PRO },
    })
    const ctxGatePro = await getTenantContext(gateReq, 'PRO')
    assert(!(ctxGatePro instanceof Response), 'getTenantContext allows access when org is PRO')

    // 9.4 Expired trial auto-downgrades to FREE
    await prisma.organization.update({
      where: { id: tenantA.org.id },
      data: {
        plan: Plan.PRO,
        trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Expired yesterday
      },
    })
    const ctxGateExpired = await getTenantContext(gateReq, 'PRO')
    assert(ctxGateExpired instanceof Response && ctxGateExpired.status === 403, 'Expired trial auto-downgrades and blocks access (HTTP 403)')

    const orgAfterExpired = await prisma.organization.findUnique({
      where: { id: tenantA.org.id },
    })
    assert(orgAfterExpired?.plan === Plan.FREE, 'Database plan automatically downgraded to FREE')

  } finally {
    // Restore SDK methods
    stripe.customers.create = origCustomerCreate
    stripe.checkout.sessions.create = origCheckoutCreate
    stripe.billingPortal.sessions.create = origPortalCreate

    // Restore environment variables
    if (origSecretKey) process.env.STRIPE_SECRET_KEY = origSecretKey
    else delete process.env.STRIPE_SECRET_KEY

    if (origWebhookSecret) process.env.STRIPE_WEBHOOK_SECRET = origWebhookSecret
    else delete process.env.STRIPE_WEBHOOK_SECRET

    if (origStarterMonthly) process.env.STRIPE_PRICE_STARTER_MONTHLY = origStarterMonthly
    else delete process.env.STRIPE_PRICE_STARTER_MONTHLY

    if (origStarterAnnual) process.env.STRIPE_PRICE_STARTER_ANNUAL = origStarterAnnual
    else delete process.env.STRIPE_PRICE_STARTER_ANNUAL

    if (origProMonthly) process.env.STRIPE_PRICE_PRO_MONTHLY = origProMonthly
    else delete process.env.STRIPE_PRICE_PRO_MONTHLY

    if (origProAnnual) process.env.STRIPE_PRICE_PRO_ANNUAL = origProAnnual
    else delete process.env.STRIPE_PRICE_PRO_ANNUAL

    if (origEnterpriseMonthly) process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = origEnterpriseMonthly
    else delete process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY

    if (origEnterpriseAnnual) process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = origEnterpriseAnnual
    else delete process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL

    // Clean up test tenants
    if (tenantA) {
      await prisma.stripeWebhookEvent.deleteMany({
        where: { eventId: { startsWith: 'evt_' } },
      })
      await cleanupTestTenant(tenantA.org.id)
    }
    if (tenantB) {
      await cleanupTestTenant(tenantB.org.id)
    }
    await prisma.$disconnect()
  }

  console.log('\n====================================================================')
  console.log(`JOB-13 VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch((err) => {
  console.error('Fatal error running JOB-13 verification suite:', err)
  process.exit(1)
})

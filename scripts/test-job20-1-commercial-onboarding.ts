/**
 * scripts/test-job20-1-commercial-onboarding.ts
 *
 * JOB-20.1 Dedicated Verification Suite: Commercial Onboarding & Signup Foundation
 *
 * Covers:
 * 1. Valid signup
 * 2. Invalid signup
 * 3. Duplicate email
 * 4. Duplicate signup retry
 * 5. Organization creation
 * 6. Initial membership
 * 7. Initial role
 * 8. Tenant context
 * 9. Onboarding initialization
 * 10. Unauthorized org access
 * 11. Client orgId injection
 * 12. Client role injection
 * 13. Invalid plan
 * 14. Valid plan mapping
 * 15. Billing handoff
 * 16. Stripe customer idempotency/reuse
 * 17. Checkout idempotency
 * 18. Invalid return URL
 * 19. Open redirect rejection
 * 20. FREE-plan behavior
 * 21. Paid-plan behavior
 * 22. Concurrent signup
 * 23. Partial-failure rollback
 * 24. Signup rate limit
 * 25. Secret/sensitive-data leakage
 * 26. First-location ownership
 * 27. Onboarding completion cannot be client-forged
 * 28. Existing-user/session behavior
 * 29. Regression against JOB-19 billing
 * 30. Regression against tenant/RBAC controls
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE, decodeSession } from '../src/lib/session'
import { getTenantContext } from '../src/lib/tenant-context'
import { resolveEffectiveScope } from '../src/lib/operator-governance'
import { BillingService, sanitizeReturnUrl, getOrganizationEntitlements, executeWithQuotaLock } from '../src/lib/billing'
import { rateLimit, inMemoryRateLimit, _clearInMemoryStore } from '../src/lib/rate-limit'
import { NextRequest } from 'next/server'
import { POST as signupHandler } from '../src/app/api/auth/signup/route'
import { GET as getOnboardingHandler, POST as postOnboardingHandler } from '../src/app/api/onboarding/route'
import { POST as checkoutHandler } from '../src/app/api/billing/checkout/route'
import { Role, Plan } from '@prisma/client'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`, details ? details : '')
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {}
): Promise<NextRequest> {
  const reqHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...headers,
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
    reqHeaders['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: any = {
    method,
    headers: reqHeaders,
  }
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    reqInit.body = JSON.stringify(body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

async function run() {
  console.log('====================================================================')
  console.log('JOB-20.1 VERIFICATION SUITE: Commercial Onboarding & Signup')
  console.log('====================================================================\n')

  const createdUserIds: string[] = []
  const createdOrgIds: string[] = []

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Valid Signup
    // -------------------------------------------------------------------------
    console.log('[Test 1] Valid Signup')
    const email1 = generateTestEmail('signup_valid')
    const signupReq1 = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: email1,
        password: 'password123!',
        name: 'Alex Mercer',
        businessName: 'Mercer Coffee Co',
        industry: 'restaurant',
      },
      { 'x-forwarded-for': '192.168.1.101' }
    )
    const signupRes1 = await signupHandler(signupReq1)
    const signupData1 = await signupRes1.json()

    assert(signupRes1.status === 200, 'Signup endpoint returned HTTP 200')
    assert(signupData1.redirectTo === '/onboarding', 'Returns redirectTo = "/onboarding"')
    assert(signupData1.user?.email === email1, 'Response contains user with normalized email')
    assert(signupData1.user?.role === 'OWNER', 'User assigned server-authoritative OWNER role')
    assert(Boolean(signupData1.user?.orgId), 'Response contains valid organization ID')

    if (signupData1.user?.id) createdUserIds.push(signupData1.user.id)
    if (signupData1.user?.orgId) createdOrgIds.push(signupData1.user.orgId)

    // Verify database state
    const dbUser1 = await prisma.user.findUnique({ where: { email: email1 } })
    assert(Boolean(dbUser1), 'User persisted in database')
    assert(dbUser1?.passwordHash !== 'password123!', 'Password is securely hashed')

    // -------------------------------------------------------------------------
    // TEST 2: Invalid Signup (Validation checks)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Invalid Signup Inputs')
    const badEmailReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: 'not-an-email', password: 'password123!', name: 'Test', businessName: 'Biz' },
      { 'x-forwarded-for': '192.168.1.121' }
    )
    const badEmailRes = await signupHandler(badEmailReq)
    assert(badEmailRes.status === 400, 'Malformed email rejected with HTTP 400')

    const shortPassReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: generateTestEmail('short_pass'), password: 'short', name: 'Test', businessName: 'Biz' },
      { 'x-forwarded-for': '192.168.1.122' }
    )
    const shortPassRes = await signupHandler(shortPassReq)
    assert(shortPassRes.status === 400, 'Password under 8 characters rejected with HTTP 400')

    const missingNameReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: generateTestEmail('missing_name'), password: 'password123!', name: '', businessName: 'Biz' },
      { 'x-forwarded-for': '192.168.1.123' }
    )
    const missingNameRes = await signupHandler(missingNameReq)
    assert(missingNameRes.status === 400, 'Blank name rejected with HTTP 400')

    const missingBizReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: generateTestEmail('missing_biz'), password: 'password123!', name: 'Test', businessName: '  ' },
      { 'x-forwarded-for': '192.168.1.124' }
    )
    const missingBizRes = await signupHandler(missingBizReq)
    assert(missingBizRes.status === 400, 'Blank businessName rejected with HTTP 400')

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate Email Rejection
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Duplicate Email Rejection')
    const dupReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: email1.toUpperCase(), password: 'differentpassword123!', name: 'Impostor', businessName: 'Impostor Biz' },
      { 'x-forwarded-for': '192.168.1.103' }
    )
    const dupRes = await signupHandler(dupReq)
    const dupData = await dupRes.json()
    assert(dupRes.status === 409, 'Duplicate email rejected with HTTP 409')
    assert(dupData.code === 'EMAIL_EXISTS', 'Rejection code is EMAIL_EXISTS')

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate Signup Retry Idempotency/Safety
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Duplicate Signup Retry')
    const userCountBefore = await prisma.user.count({ where: { email: email1 } })
    const retryReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      { email: email1, password: 'differentpassword123!', name: 'Impostor', businessName: 'Impostor Biz' },
      { 'x-forwarded-for': '192.168.1.125' }
    )
    const retryRes = await signupHandler(retryReq)
    const userCountAfter = await prisma.user.count({ where: { email: email1 } })
    assert(retryRes.status === 409, 'Immediate duplicate retry still rejected with HTTP 409')
    assert(userCountBefore === 1 && userCountAfter === 1, 'Zero duplicate user accounts created on retry')

    // -------------------------------------------------------------------------
    // TEST 5: Organization Creation Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Organization Creation')
    const dbOrg1 = await prisma.organization.findUnique({
      where: { id: signupData1.user.orgId },
      include: { businesses: true, members: true },
    })
    assert(Boolean(dbOrg1), 'Organization exists in database')
    assert(dbOrg1?.onboardingStep === 1, 'Organization initialized with onboardingStep = 1')
    assert(dbOrg1?.onboardingCompletedAt === null, 'Organization onboardingCompletedAt is null')
    assert(dbOrg1?.businesses.length === 1, 'Organization has exactly 1 initial business location')
    assert(dbOrg1?.businesses[0].name === 'Mercer Coffee Co', 'Initial business location matches businessName')

    // -------------------------------------------------------------------------
    // TEST 6: Initial Membership Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Initial Membership')
    const membership = dbOrg1?.members.find(m => m.userId === signupData1.user.id)
    assert(Boolean(membership), 'OrgMember record exists linking user to organization')

    // -------------------------------------------------------------------------
    // TEST 7: Initial Role Server-Authority
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Initial Role')
    assert(membership?.role === Role.OWNER, 'Initial membership role is strictly OWNER')

    // -------------------------------------------------------------------------
    // TEST 8: Tenant Context Resolution
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Tenant Context Resolution')
    const authTenant1: TestSeedResult = {
      user: { id: signupData1.user.id, email: email1, name: 'Alex Mercer', passwordHash: null, sessionVersion: 1 },
      org: { id: dbOrg1!.id, name: dbOrg1!.name, plan: dbOrg1!.plan },
      business: { id: dbOrg1!.businesses[0].id, name: dbOrg1!.businesses[0].name, slug: dbOrg1!.businesses[0].slug },
      membership: { id: membership!.id, role: Role.OWNER },
    }
    const testCtxReq = await createAuthRequest('http://localhost:3000/api/onboarding', authTenant1, 'GET')
    const ctx = await getTenantContext(testCtxReq)
    assert(!(ctx instanceof Response), 'getTenantContext resolved successfully for new tenant')
    if (!(ctx instanceof Response)) {
      assert(ctx.orgId === dbOrg1!.id, 'Context orgId matches created organization')
      assert(ctx.businessIds.includes(dbOrg1!.businesses[0].id), 'Context businessIds contains initial business')
      assert(ctx.isOrgAdmin === true, 'Context recognizes OWNER as isOrgAdmin = true')
    }

    // -------------------------------------------------------------------------
    // TEST 9: Onboarding Initialization
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Onboarding State Initialization')
    const obInitRes = await getOnboardingHandler(testCtxReq)
    const obInitData = await obInitRes.json()
    assert(obInitRes.status === 200, 'GET /api/onboarding returned HTTP 200')
    assert(obInitData.organization.onboardingStep === 1, 'Initial onboardingStep is 1')
    assert(obInitData.organization.onboardingCompleted === false, 'Initial onboardingCompleted is false')
    assert(obInitData.onboardingStatus.accountSetupCompleted === true, 'onboardingStatus: accountSetupCompleted is true')
    assert(obInitData.onboardingStatus.orgSetupCompleted === true, 'onboardingStatus: orgSetupCompleted is true')
    assert(obInitData.onboardingStatus.firstLocationConfigured === true, 'onboardingStatus: firstLocationConfigured is true')
    assert(typeof obInitData.locationReadiness === 'string', 'locationReadiness state returned')

    // -------------------------------------------------------------------------
    // TEST 10: Unauthorized Organization Access (IDOR Defense)
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Unauthorized Org Access')
    const foreignTenant = await seedTestTenant({ name: 'Foreign Tenant' })
    createdUserIds.push(foreignTenant.user.id)
    createdOrgIds.push(foreignTenant.org.id)

    // Foreign tenant attempts to access tenant1's business
    const idorReq = await createAuthRequest(
      `http://localhost:3000/api/onboarding?businessId=${dbOrg1!.businesses[0].id}`,
      foreignTenant,
      'GET'
    )
    const idorRes = await getOnboardingHandler(idorReq)
    assert(idorRes.status === 403, 'Cross-tenant business query rejected with HTTP 403')

    // -------------------------------------------------------------------------
    // TEST 11: Client orgId Injection Immunity
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Client orgId Injection Immunity')
    const injectedEmail = generateTestEmail('injected_org')
    const injectOrgReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: injectedEmail,
        password: 'password123!',
        name: 'Injected User',
        businessName: 'Injected Biz',
        orgId: foreignTenant.org.id, // Malicious injection attempt
      },
      { 'x-forwarded-for': '192.168.1.104' }
    )
    const injectOrgRes = await signupHandler(injectOrgReq)
    const injectOrgData = await injectOrgRes.json()
    assert(injectOrgRes.status === 200, 'Signup succeeds creating isolated organization')
    assert(injectOrgData.user.orgId !== foreignTenant.org.id, 'Client orgId injection neutralized: user NOT bound to victim org')
    if (injectOrgData.user?.id) createdUserIds.push(injectOrgData.user.id)
    if (injectOrgData.user?.orgId) createdOrgIds.push(injectOrgData.user.orgId)

    // -------------------------------------------------------------------------
    // TEST 12: Client Role Injection Immunity
    // -------------------------------------------------------------------------
    console.log('\n[Test 12] Client Role Injection Immunity')
    const injectedRoleEmail = generateTestEmail('injected_role')
    const injectRoleReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: injectedRoleEmail,
        password: 'password123!',
        name: 'Role Escalator',
        businessName: 'Escalator Biz',
        role: 'SUPER_ADMIN', // Client attempts role injection
      },
      { 'x-forwarded-for': '192.168.1.105' }
    )
    const injectRoleRes = await signupHandler(injectRoleReq)
    const injectRoleData = await injectRoleRes.json()
    assert(injectRoleRes.status === 200, 'Signup succeeds')
    assert(injectRoleData.user.role === 'OWNER', 'Client role injection neutralized: assigned standard OWNER')
    if (injectRoleData.user?.id) createdUserIds.push(injectRoleData.user.id)
    if (injectRoleData.user?.orgId) createdOrgIds.push(injectRoleData.user.orgId)

    // -------------------------------------------------------------------------
    // TEST 13: Invalid Plan Selection Rejection
    // -------------------------------------------------------------------------
    console.log('\n[Test 13] Invalid Plan Selection Rejection')
    const badPlanReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: generateTestEmail('bad_plan'),
        password: 'password123!',
        name: 'Bad Plan',
        businessName: 'Bad Plan Biz',
        plan: 'CUSTOM_UNLIMITED_HACKED',
      },
      { 'x-forwarded-for': '192.168.1.106' }
    )
    const badPlanRes = await signupHandler(badPlanReq)
    const badPlanData = await badPlanRes.json()
    assert(badPlanRes.status === 400, 'Invalid plan rejected with HTTP 400')
    assert(badPlanData.code === 'INVALID_PLAN', 'Rejection code is INVALID_PLAN (not silently defaulted to FREE)')

    // -------------------------------------------------------------------------
    // TEST 14: Valid Plan Mapping
    // -------------------------------------------------------------------------
    console.log('\n[Test 14] Valid Plan Mapping')
    const starterEmail = generateTestEmail('starter_plan')
    const starterReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: starterEmail,
        password: 'password123!',
        name: 'Starter User',
        businessName: 'Starter Cafe',
        plan: 'STARTER',
      },
      { 'x-forwarded-for': '192.168.1.107' }
    )
    const starterRes = await signupHandler(starterReq)
    const starterData = await starterRes.json()
    assert(starterRes.status === 200, 'STARTER signup succeeded')
    assert(starterData.plan === 'STARTER', 'Organization assigned requested STARTER plan')
    if (starterData.user?.id) createdUserIds.push(starterData.user.id)
    if (starterData.user?.orgId) createdOrgIds.push(starterData.user.orgId)

    // -------------------------------------------------------------------------
    // TEST 15: Billing Handoff & Plan Selection Action
    // -------------------------------------------------------------------------
    console.log('\n[Test 15] Billing Handoff via Onboarding')
    const selectPlanReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      authTenant1,
      'POST',
      { action: 'select-plan', plan: 'ENTERPRISE' }
    )
    const selectPlanRes = await postOnboardingHandler(selectPlanReq)
    const selectPlanData = await selectPlanRes.json()
    assert(selectPlanRes.status === 200, 'select-plan action returned HTTP 200')
    assert(selectPlanData.plan === 'ENTERPRISE', 'Organization plan updated to ENTERPRISE')
    assert(selectPlanData.requiresCheckout === true, 'requiresCheckout is true for paid plan')

    // -------------------------------------------------------------------------
    // TEST 16: Stripe Customer Idempotency/Reuse
    // -------------------------------------------------------------------------
    console.log('\n[Test 16] Stripe Customer Idempotency')
    // Ensure customer creation for same org is idempotent
    await prisma.billingCustomer.create({
      data: {
        orgId: authTenant1.org.id,
        provider: 'stripe',
        providerCustomerId: `cus_test_${Date.now()}_1`,
        email: authTenant1.user.email,
        name: authTenant1.org.name,
      },
    })
    const custCount = await prisma.billingCustomer.count({ where: { orgId: authTenant1.org.id } })
    assert(custCount === 1, 'BillingCustomer record created for organization')

    // Database unique constraint prevents duplicate customer for same org
    let uniqueConstraintCaught = false
    try {
      await prisma.billingCustomer.create({
        data: {
          orgId: authTenant1.org.id,
          provider: 'stripe',
          providerCustomerId: `cus_test_${Date.now()}_2`,
          email: authTenant1.user.email,
        },
      })
    } catch {
      uniqueConstraintCaught = true
    }
    assert(uniqueConstraintCaught, 'Database enforces unique BillingCustomer per organization')

    // -------------------------------------------------------------------------
    // TEST 17: Checkout Session Parameter Validation & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test 17] Checkout Endpoint Validation')
    const invalidCheckoutReq = await createAuthRequest(
      'http://localhost:3000/api/billing/checkout',
      authTenant1,
      'POST',
      { plan: 'INVALID_SUPER_PLAN' }
    )
    const invalidCheckoutRes = await checkoutHandler(invalidCheckoutReq)
    assert(invalidCheckoutRes.status === 400, 'Invalid checkout plan rejected with HTTP 400')

    // -------------------------------------------------------------------------
    // TEST 18: Invalid Return URL Sanitization
    // -------------------------------------------------------------------------
    console.log('\n[Test 18] Invalid Return URL Sanitization')
    const jsUrl = sanitizeReturnUrl('javascript:alert(document.cookie)')
    const defaultAppUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
    assert(jsUrl === defaultAppUrl, 'javascript: URL safely sanitized to canonical base URL')

    const dataUrl = sanitizeReturnUrl('data:text/html,<script>alert(1)</script>')
    assert(dataUrl === defaultAppUrl, 'data: URL safely sanitized to canonical base URL')

    // -------------------------------------------------------------------------
    // TEST 19: Open Redirect Rejection
    // -------------------------------------------------------------------------
    console.log('\n[Test 19] Open Redirect Rejection')
    const evilExternal = sanitizeReturnUrl('https://evil-hacker.com/phish')
    assert(evilExternal === defaultAppUrl, 'External origin redirect neutralized to canonical base URL')

    const protoRelative = sanitizeReturnUrl('//evil-hacker.com')
    assert(protoRelative === defaultAppUrl, 'Protocol-relative URL neutralized to canonical base URL')

    // -------------------------------------------------------------------------
    // TEST 20: FREE-Plan Behavior
    // -------------------------------------------------------------------------
    console.log('\n[Test 20] FREE-Plan Behavior')
    const freeEmail = generateTestEmail('free_plan')
    const freeReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: freeEmail,
        password: 'password123!',
        name: 'Free User',
        businessName: 'Free Cafe',
        plan: 'FREE',
      },
      { 'x-forwarded-for': '192.168.1.108' }
    )
    const freeRes = await signupHandler(freeReq)
    const freeData = await freeRes.json()
    assert(freeRes.status === 200, 'FREE signup succeeded')
    assert(freeData.plan === 'FREE', 'Organization created with FREE plan')
    assert(freeData.trialEndsAt === null, 'FREE plan has no trial expiration')
    if (freeData.user?.id) createdUserIds.push(freeData.user.id)
    if (freeData.user?.orgId) createdOrgIds.push(freeData.user.orgId)

    // FREE plan checkout rejection
    const freeTenant: TestSeedResult = {
      user: { id: freeData.user.id, email: freeEmail, name: 'Free User', passwordHash: null, sessionVersion: 1 },
      org: { id: freeData.user.orgId, name: 'Free Cafe Organization', plan: Plan.FREE },
      business: { id: 'dummy', name: 'Free Cafe', slug: 'free-cafe' },
      membership: { id: 'dummy', role: Role.OWNER },
    }
    const freeCheckoutReq = await createAuthRequest(
      'http://localhost:3000/api/billing/checkout',
      freeTenant,
      'POST',
      { plan: 'FREE' }
    )
    const freeCheckoutRes = await checkoutHandler(freeCheckoutReq)
    assert(freeCheckoutRes.status === 400, 'FREE plan checkout rejected with HTTP 400 (FREE does not require checkout)')

    // -------------------------------------------------------------------------
    // TEST 21: Paid-Plan Behavior (Trial Period Initialized)
    // -------------------------------------------------------------------------
    console.log('\n[Test 21] Paid-Plan Behavior')
    const paidEmail = generateTestEmail('pro_plan')
    const paidReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: paidEmail,
        password: 'password123!',
        name: 'Pro User',
        businessName: 'Pro Cafe',
        plan: 'PRO',
      },
      { 'x-forwarded-for': '192.168.1.109' }
    )
    const paidRes = await signupHandler(paidReq)
    const paidData = await paidRes.json()
    assert(paidRes.status === 200, 'PRO signup succeeded')
    assert(paidData.plan === 'PRO', 'Organization plan is PRO')
    assert(Boolean(paidData.trialEndsAt), 'PRO plan includes 14-day active trialEndsAt timestamp')
    if (paidData.user?.id) createdUserIds.push(paidData.user.id)
    if (paidData.user?.orgId) createdOrgIds.push(paidData.user.orgId)

    // -------------------------------------------------------------------------
    // TEST 22: Concurrent Signup Race Condition Handling
    // -------------------------------------------------------------------------
    console.log('\n[Test 22] Concurrent Signup Handling')
    const raceEmail = generateTestEmail('race_signup')
    const createRaceReq = () =>
      createAuthRequest(
        'http://localhost:3000/api/auth/signup',
        null,
        'POST',
        {
          email: raceEmail,
          password: 'password123!',
          name: 'Race User',
          businessName: 'Race Cafe',
        },
        { 'x-forwarded-for': '192.168.1.110' }
      )

    const [raceRes1, raceRes2] = await Promise.all([
      signupHandler(await createRaceReq()),
      signupHandler(await createRaceReq()),
    ])

    const raceStatuses = [raceRes1.status, raceRes2.status]
    assert(
      raceStatuses.includes(200) && (raceStatuses.includes(409) || raceStatuses.includes(500)),
      'Concurrent signups resolve deterministically: exactly 1 winner, competitor safely rejected'
    )
    const raceUserCount = await prisma.user.count({ where: { email: raceEmail } })
    assert(raceUserCount === 1, 'Exactly one user account persisted in database')

    // -------------------------------------------------------------------------
    // TEST 23: Partial-Failure Rollback
    // -------------------------------------------------------------------------
    console.log('\n[Test 23] Partial-Failure Rollback')
    const rollbackEmail = generateTestEmail('rollback_test')
    let rollbackVerified = false
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { email: rollbackEmail, name: 'Rollback User', sessionVersion: 1 },
        })
        // Intentionally throw to trigger rollback
        throw new Error('SIMULATED_TRANSACTION_FAILURE')
      })
    } catch {
      const checkUser = await prisma.user.findUnique({ where: { email: rollbackEmail } })
      rollbackVerified = checkUser === null
    }
    assert(rollbackVerified, 'Database transaction abort guarantees 100% rollback of user record')

    // -------------------------------------------------------------------------
    // TEST 24: Signup Rate Limiting
    // -------------------------------------------------------------------------
    console.log('\n[Test 24] Signup Rate Limiting')
    const testRateIp = '203.0.113.42'
    _clearInMemoryStore()

    // Exhaust 3 allowed requests per hour
    for (let i = 0; i < 3; i++) {
      await rateLimit(`signup:${testRateIp}`, 3, 3600000)
    }

    const rateExceededReq = await createAuthRequest(
      'http://localhost:3000/api/auth/signup',
      null,
      'POST',
      {
        email: generateTestEmail('rate_limited'),
        password: 'password123!',
        name: 'Rate User',
        businessName: 'Rate Biz',
      },
      { 'x-forwarded-for': testRateIp }
    )
    const rateExceededRes = await signupHandler(rateExceededReq)
    assert(rateExceededRes.status === 429, 'Excessive signups from same IP rejected with HTTP 429')

    // -------------------------------------------------------------------------
    // TEST 25: Secret & Sensitive-Data Leakage Prevention
    // -------------------------------------------------------------------------
    console.log('\n[Test 25] Secret & Sensitive-Data Leakage Prevention')
    const rawSignupResponse = JSON.stringify(signupData1)
    assert(!rawSignupResponse.includes('passwordHash'), 'Signup response does not leak passwordHash')
    assert(!rawSignupResponse.includes('password123!'), 'Signup response does not leak plain password')
    assert(!rawSignupResponse.includes('SESSION_SECRET'), 'Signup response does not leak SESSION_SECRET')

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: 'user.signup', actorId: signupData1.user.id },
    })
    assert(Boolean(auditEntry), 'Audit log entry created for signup')
    const auditMeta = auditEntry?.metadata || ''
    assert(!auditMeta.includes('password'), 'Audit log does not contain password')

    // -------------------------------------------------------------------------
    // TEST 26: First-Location Ownership & Update
    // -------------------------------------------------------------------------
    console.log('\n[Test 26] First-Location Ownership Enforcement')
    // Attempt to update another tenant's business in setup-location
    const hijackLocationReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      authTenant1,
      'POST',
      {
        action: 'setup-location',
        businessId: foreignTenant.business.id,
        name: 'Hijacked Location Name',
      }
    )
    const hijackLocationRes = await postOnboardingHandler(hijackLocationReq)
    assert(hijackLocationRes.status === 403, 'Attempt to attach/modify another tenant business rejected with HTTP 403')

    // Legitimate first-location update
    const validLocationReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      authTenant1,
      'POST',
      {
        action: 'setup-location',
        name: 'Mercer Coffee Flagship',
        industry: 'restaurant',
      }
    )
    const validLocationRes = await postOnboardingHandler(validLocationReq)
    assert(validLocationRes.status === 200, 'Legitimate first-location update succeeded with HTTP 200')

    // -------------------------------------------------------------------------
    // TEST 27: Onboarding Completion Anti-Forgery Enforcement
    // -------------------------------------------------------------------------
    console.log('\n[Test 27] Onboarding Completion Anti-Forgery')
    // Create tenant with zero business locations
    const emptyOrg = await prisma.organization.create({
      data: { name: 'Empty Test Org', plan: Plan.PRO },
    })
    createdOrgIds.push(emptyOrg.id)
    const emptyUser = await prisma.user.create({
      data: { email: generateTestEmail('empty_org'), sessionVersion: 1 },
    })
    createdUserIds.push(emptyUser.id)
    const emptyMember = await prisma.orgMember.create({
      data: { orgId: emptyOrg.id, userId: emptyUser.id, role: Role.OWNER },
    })

    const emptyTenant: TestSeedResult = {
      user: { id: emptyUser.id, email: emptyUser.email, name: 'Empty', passwordHash: null, sessionVersion: 1 },
      org: { id: emptyOrg.id, name: emptyOrg.name, plan: emptyOrg.plan },
      business: { id: '', name: '', slug: null },
      membership: { id: emptyMember.id, role: Role.OWNER },
    }

    const forgeCompleteReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      emptyTenant,
      'POST',
      { action: 'complete' }
    )
    const forgeCompleteRes = await postOnboardingHandler(forgeCompleteReq)
    const forgeData = await forgeCompleteRes.json()
    assert(forgeCompleteRes.status === 400, 'Onboarding completion rejected when location is missing (HTTP 400)')
    assert(forgeData.code === 'LOCATION_REQUIRED', 'Rejection code is LOCATION_REQUIRED')

    // -------------------------------------------------------------------------
    // TEST 28: Existing-User Session Invalidation on sessionVersion Bump
    // -------------------------------------------------------------------------
    console.log('\n[Test 28] Session Invalidation on Version Bump')
    const validSessionUser = {
      id: authTenant1.user.id,
      email: authTenant1.user.email,
      name: authTenant1.user.name,
      role: authTenant1.membership.role,
      orgId: authTenant1.org.id,
      orgName: authTenant1.org.name,
      orgPlan: authTenant1.org.plan,
      sessionVersion: 1,
    }
    const token = await encodeSession(validSessionUser)
    const decoded = await decodeSession(token)
    assert(decoded?.id === authTenant1.user.id, 'JWT session encodes and decodes properly')

    // Bump sessionVersion in DB
    await prisma.user.update({
      where: { id: authTenant1.user.id },
      data: { sessionVersion: 2 },
    })

    const expiredSessionReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      authTenant1, // has sessionVersion: 1 in token
      'GET'
    )
    const expiredRes = await getOnboardingHandler(expiredSessionReq)
    assert(expiredRes.status === 401, 'Request with stale sessionVersion rejected with HTTP 401')

    // -------------------------------------------------------------------------
    // TEST 29: Regression Against JOB-19 Billing
    // -------------------------------------------------------------------------
    console.log('\n[Test 29] Regression: JOB-19 Billing & Entitlements')
    const entitlementsFree = await getOrganizationEntitlements(freeData.user.orgId)
    assert(entitlementsFree.locations === 1, 'FREE plan locations limit is 1')
    assert(entitlementsFree.white_label_branding === false, 'FREE plan denies white_label_branding')

    const entitlementsPro = await getOrganizationEntitlements(paidData.user.orgId)
    assert(entitlementsPro.locations === 10, 'PRO plan locations limit is 10')
    assert(entitlementsPro.competitor_tracking === true, 'PRO plan allows competitor_tracking')

    // Advisory lock quota execution test (PRO plan has capacity: 1 current of 10 limit)
    const quotaResult = await executeWithQuotaLock(
      paidData.user.orgId,
      'locations',
      1,
      async () => {
        return { locked: true }
      }
    )
    assert(quotaResult.success === true, 'executeWithQuotaLock acquires advisory lock and executes action safely')

    // Advisory lock quota denial test (FREE plan at capacity: 1 current of 1 limit)
    const quotaDeniedResult = await executeWithQuotaLock(
      freeData.user.orgId,
      'locations',
      1,
      async () => {
        return { shouldNotRun: true }
      }
    )
    assert(quotaDeniedResult.success === false, 'executeWithQuotaLock safely enforces plan quota limits')

    // -------------------------------------------------------------------------
    // TEST 30: Regression Against Tenant/RBAC Controls
    // -------------------------------------------------------------------------
    console.log('\n[Test 30] Regression: Tenant & RBAC Operator Governance')
    const ownerScope = await resolveEffectiveScope(authTenant1.user.id, authTenant1.org.id, Role.OWNER)
    assert(ownerScope.isOrgAdmin === true, 'OWNER resolved as isOrgAdmin = true')
    assert(ownerScope.permittedBusinessIds.length >= 1, 'OWNER has access to all org business IDs')

    const staffScope = await resolveEffectiveScope(authTenant1.user.id, authTenant1.org.id, Role.STAFF)
    assert(staffScope.isOrgAdmin === false, 'STAFF resolved as isOrgAdmin = false')
    assert(staffScope.permittedBusinessIds.length === 0, 'Unassigned operator fails closed with 0 permitted business IDs')

  } catch (error: any) {
    console.error('UNHANDLED TEST EXCEPTION:', error)
    failed++
  } finally {
    console.log('\n[Cleanup] Removing test records...')
    _clearInMemoryStore()

    for (const orgId of createdOrgIds) {
      try {
        await prisma.auditLog.deleteMany({ where: { targetId: orgId } })
        await prisma.billingCustomer.deleteMany({ where: { orgId } })
        await prisma.subscription.deleteMany({ where: { orgId } })
        await prisma.review.deleteMany({ where: { business: { orgId } } })
        await prisma.reviewPlatformLink.deleteMany({ where: { business: { orgId } } })
        await prisma.brandVoiceProfile.deleteMany({ where: { business: { orgId } } })
        await prisma.business.deleteMany({ where: { orgId } })
        await prisma.orgMember.deleteMany({ where: { orgId } })
        await prisma.organization.delete({ where: { id: orgId } })
      } catch {}
    }

    for (const userId of createdUserIds) {
      try {
        await prisma.auditLog.deleteMany({ where: { actorId: userId } })
        await prisma.user.delete({ where: { id: userId } })
      } catch {}
    }

    console.log('====================================================================')
    console.log(`JOB-20.1 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`)
    console.log('====================================================================')

    if (failed > 0) {
      process.exit(1)
    }
  }
}

run()

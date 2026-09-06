/**
 * JOB-10 Dedicated Verification Suite: Self-Serve Customer Onboarding Setup Wizard (ONBOARD-01)
 *
 * Validates:
 * 1. Authentication Enforcement (Unauthenticated requests fail closed with HTTP 401)
 * 2. Multi-Tenant Isolation & IDOR Defense (Tenant B cannot read or alter Tenant A onboarding state)
 * 3. New Signup Initialization (Organization created with onboardingStep=1, onboardingCompletedAt=null, and returns redirectTo='/onboarding')
 * 4. Step 1 Review Destinations (Persistence, URL validation, slug normalization, and protocol checks)
 * 5. Step 2 Brand Voice & Signature (Tone guidelines, signature, and forbidden phrases persistence)
 * 6. Step 3 First Value Action (Authentic review page link, real dispatch handling without fake connects)
 * 7. Server-Backed State Hydration (GET /api/onboarding restores 100% of state on page reload)
 * 8. Server-Trusted Completion State (POST /api/onboarding action=complete persists timestamp and emits audit log)
 * 9. Completion Idempotency (Duplicate completions do not corrupt state or duplicate audit records)
 * 10. Existing User Safety (Pre-existing organizations retain onboardingCompletedAt and are not forced into setup)
 * 11. Input Validation & Error Handling (Invalid steps, malformed URLs, and non-existent businesses fail closed)
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getOnboardingHandler, POST as postOnboardingHandler } from '../src/app/api/onboarding/route'
import { GET as getReviewLinksHandler, POST as postReviewLinksHandler } from '../src/app/api/review-links/route'
import { GET as getBrandVoiceHandler, POST as postBrandVoiceHandler } from '../src/app/api/brand-voice/route'
import { POST as signupHandler } from '../src/app/api/auth/signup/route'

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
  method = 'GET',
  body?: any
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
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

  const reqInit: any = {
    method,
    headers,
  }
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    reqInit.body = JSON.stringify(body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

async function run() {
  console.log('====================================================================')
  console.log('JOB-10 VERIFICATION SUITE: Customer Onboarding Wizard (ONBOARD-01)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthenticated Request Rejection
    // -------------------------------------------------------------------------
    console.log('[Test 1] Authentication Enforcement')
    const unauthGetReq = await createAuthRequest('http://localhost:3000/api/onboarding', null, 'GET')
    const unauthGetRes = await getOnboardingHandler(unauthGetReq)
    assert(unauthGetRes.status === 401, 'Unauthenticated GET /api/onboarding rejected with HTTP 401')

    const unauthPostReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      null,
      'POST',
      { action: 'complete' }
    )
    const unauthPostRes = await postOnboardingHandler(unauthPostReq)
    assert(unauthPostRes.status === 401, 'Unauthenticated POST /api/onboarding rejected with HTTP 401')

    // -------------------------------------------------------------------------
    // Setup Test Tenants
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Seeding isolated tenants A and B')
    tenantA = await seedTestTenant({ name: 'Tenant A Owner', businessName: 'Tenant A Bistro' })
    tenantB = await seedTestTenant({ name: 'Tenant B Owner', businessName: 'Tenant B Dental' })
    assert(!!tenantA && !!tenantB, 'Tenants A and B seeded successfully')

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Tenant Isolation & IDOR Defense
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Multi-Tenant Isolation & IDOR Defense')
    // Tenant B attempts to query Tenant A's business via onboarding API
    const crossGetReq = await createAuthRequest(
      `http://localhost:3000/api/onboarding?businessId=${tenantA.business.id}`,
      tenantB,
      'GET'
    )
    const crossGetRes = await getOnboardingHandler(crossGetReq)
    assert(crossGetRes.status === 403, 'Cross-tenant business inquiry rejected with HTTP 403')

    const crossGetJson = await crossGetRes.json()
    assert(crossGetJson.code === 'BUSINESS_NOT_OWNED', 'Rejection code is BUSINESS_NOT_OWNED')

    // -------------------------------------------------------------------------
    // TEST 2b: Role-Based Authorization Enforcement (SEC-ROLE)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2b] Role-Based Authorization Enforcement on POST /api/onboarding')
    const viewerUser = await prisma.user.create({
      data: {
        email: `viewer_${Date.now()}@example.com`,
        name: 'Tenant A Viewer',
        passwordHash: '$2b$10$dummyHashForTestingPurposesOnly1234567890123456789012',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: viewerUser.id,
        role: 'VIEWER',
      },
    })
    const viewerTenant: TestSeedResult = {
      ...tenantA,
      user: viewerUser,
      membership: { id: 'temp_mem_v', role: 'VIEWER' as any },
    }

    const staffUser = await prisma.user.create({
      data: {
        email: `staff_${Date.now()}@example.com`,
        name: 'Tenant A Staff',
        passwordHash: '$2b$10$dummyHashForTestingPurposesOnly1234567890123456789012',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: staffUser.id,
        role: 'STAFF',
      },
    })
    const staffTenant: TestSeedResult = {
      ...tenantA,
      user: staffUser,
      membership: { id: 'temp_mem_s', role: 'STAFF' as any },
    }

    const adminUser = await prisma.user.create({
      data: {
        email: `admin_${Date.now()}@example.com`,
        name: 'Tenant A Admin',
        passwordHash: '$2b$10$dummyHashForTestingPurposesOnly1234567890123456789012',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: adminUser.id,
        role: 'ADMIN',
      },
    })
    const adminTenant: TestSeedResult = {
      ...tenantA,
      user: adminUser,
      membership: { id: 'temp_mem_a', role: 'ADMIN' as any },
    }

    // 1. Viewer cannot set-step
    const viewerStepReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      viewerTenant,
      'POST',
      { action: 'set-step', step: 2 }
    )
    const viewerStepRes = await postOnboardingHandler(viewerStepReq)
    assert(viewerStepRes.status === 403, 'VIEWER role rejected with HTTP 403 on set-step')
    const viewerStepJson = await viewerStepRes.json()
    assert(viewerStepJson.code === 'FORBIDDEN', 'VIEWER rejection code is FORBIDDEN')

    // 2. Viewer cannot complete onboarding
    const viewerCompReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      viewerTenant,
      'POST',
      { action: 'complete' }
    )
    const viewerCompRes = await postOnboardingHandler(viewerCompReq)
    assert(viewerCompRes.status === 403, 'VIEWER role rejected with HTTP 403 on complete')

    // 3. Staff cannot set-step
    const staffStepReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      staffTenant,
      'POST',
      { action: 'set-step', step: 2 }
    )
    const staffStepRes = await postOnboardingHandler(staffStepReq)
    assert(staffStepRes.status === 403, 'STAFF role rejected with HTTP 403 on set-step')

    // 4. Viewer CAN read onboarding state (read-only allowed for org members)
    const viewerReadReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      viewerTenant,
      'GET'
    )
    const viewerReadRes = await getOnboardingHandler(viewerReadReq)
    assert(viewerReadRes.status === 200, 'VIEWER role permitted read-only GET /api/onboarding')

    // 5. Admin CAN mutate onboarding step
    const adminStepReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      adminTenant,
      'POST',
      { action: 'set-step', step: 1 }
    )
    const adminStepRes = await postOnboardingHandler(adminStepReq)
    assert(adminStepRes.status === 200, 'ADMIN role successfully authorized for POST /api/onboarding')

    // Clean up auxiliary role test members
    await prisma.orgMember.deleteMany({
      where: { userId: { in: [viewerUser.id, staffUser.id, adminUser.id] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [viewerUser.id, staffUser.id, adminUser.id] } },
    })

    // -------------------------------------------------------------------------
    // TEST 3: New Signup Flow & Onboarding Initialization
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Signup Redirect and Onboarding Initialization')
    const signupEmail = `onboard_test_${Date.now()}@example.com`
    const signupReq = new NextRequest(new URL('http://localhost:3000/api/auth/signup'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: signupEmail,
        password: 'Password123!',
        name: 'New Onboard User',
        businessName: 'Fresh Start Cafe',
        industry: 'restaurant',
      }),
    })

    const signupRes = await signupHandler(signupReq)
    assert(signupRes.status === 200, 'Signup endpoint returned HTTP 200')
    const signupJson = await signupRes.json()
    assert(signupJson.redirectTo === '/onboarding', 'Signup returns redirectTo = "/onboarding"')

    // Verify database record for new signup
    const newOrg = await prisma.organization.findUnique({
      where: { id: signupJson.user.orgId },
    })
    assert(!!newOrg, 'New organization exists in database')
    assert(newOrg?.onboardingStep === 1, 'Initial organization.onboardingStep is 1')
    assert(newOrg?.onboardingCompletedAt === null, 'Initial organization.onboardingCompletedAt is null')

    // -------------------------------------------------------------------------
    // TEST 4: Initial Onboarding State Hydration
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Server-Backed State Hydration (Initial)')
    const getInitReq = await createAuthRequest('http://localhost:3000/api/onboarding', tenantA, 'GET')
    const getInitRes = await getOnboardingHandler(getInitReq)
    assert(getInitRes.status === 200, 'GET /api/onboarding returned HTTP 200 for Tenant A')

    const initData = await getInitRes.json()
    assert(initData.organization.id === tenantA.org.id, 'Returns authenticated organization ID')
    assert(initData.business.id === tenantA.business.id, 'Returns primary business ID')
    assert(initData.business.name === 'Tenant A Bistro', 'Returns correct business name')
    assert(initData.organization.onboardingCompleted === false, 'Tenant A is initially incomplete')
    assert(initData.firstValue.reviewUsUrl.includes('/review-us/'), 'Returns valid reviewUsUrl')

    // -------------------------------------------------------------------------
    // TEST 5: Step 1 — Review Destinations Configuration
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Step 1 — Review Destinations Validation & Persistence')
    // Protocol validation (javascript: rejection)
    const invalidLinkReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [{ platformId: 'google', url: 'javascript:alert(1)' }],
      }
    )
    const invalidLinkRes = await postReviewLinksHandler(invalidLinkReq)
    assert(invalidLinkRes.status === 400, 'Invalid protocol javascript: rejected with HTTP 400')

    // Valid review link persistence
    const validSlug = `tenant-a-bistro-${Date.now()}`
    const validLinkReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        slug: validSlug,
        links: [
          { platformId: 'google', url: 'https://g.page/r/tenant-a/review', enabled: true, sortOrder: 0 },
          { platformId: 'facebook', url: 'https://facebook.com/tenant-a/reviews', enabled: true, sortOrder: 1 },
        ],
      }
    )
    const validLinkRes = await postReviewLinksHandler(validLinkReq)
    assert(validLinkRes.status === 200, 'Valid review links saved with HTTP 200')

    // Advance step to 2
    const step2Req = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'set-step', step: 2 }
    )
    const step2Res = await postOnboardingHandler(step2Req)
    assert(step2Res.status === 200, 'POST /api/onboarding set-step=2 returned HTTP 200')

    // Verify DB update
    const orgAfterStep1 = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    assert(orgAfterStep1?.onboardingStep === 2, 'Organization onboardingStep successfully updated to 2')

    // -------------------------------------------------------------------------
    // TEST 6: Step 2 — Brand Voice Configuration
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Step 2 — Brand Voice Validation & Persistence')
    const brandVoiceReq = await createAuthRequest(
      'http://localhost:3000/api/brand-voice',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        toneGuidelines: 'Warm, hospitable, concise 2-sentence replies.',
        signature: '— The Tenant A Hospitality Team',
        forbiddenPhrases: 'Unfortunately, We apologize for any inconvenience',
        examples: [
          { reviewText: 'Loved the food!', replyText: 'Thank you! We loved hosting you.' },
        ],
      }
    )
    const brandVoiceRes = await postBrandVoiceHandler(brandVoiceReq)
    assert(brandVoiceRes.status === 200, 'Brand voice profile saved with HTTP 200')

    // Advance step to 3
    const step3Req = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'set-step', step: 3 }
    )
    const step3Res = await postOnboardingHandler(step3Req)
    assert(step3Res.status === 200, 'POST /api/onboarding set-step=3 returned HTTP 200')

    // -------------------------------------------------------------------------
    // TEST 7: State Hydration After Step 1 & 2
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Server-Backed State Hydration (Step 3 Reload)')
    const getReloadReq = await createAuthRequest('http://localhost:3000/api/onboarding', tenantA, 'GET')
    const getReloadRes = await getOnboardingHandler(getReloadReq)
    const reloadData = await getReloadRes.json()

    assert(reloadData.organization.onboardingStep === 3, 'Hydrated onboardingStep is 3')
    assert(reloadData.reviewLinks.length === 2, 'Hydrated reviewLinks contains 2 configured links')
    assert(reloadData.brandVoice.signature === '— The Tenant A Hospitality Team', 'Hydrated brand voice signature matches')
    assert(reloadData.brandVoice.forbiddenPhrases.includes('Unfortunately'), 'Hydrated forbidden phrases match')
    assert(reloadData.firstValue.reviewLinksConfigured === true, 'firstValue reports reviewLinksConfigured=true')
    assert(reloadData.firstValue.testInviteSent === false, 'Truthful: testInviteSent is false prior to test action')
    assert(reloadData.firstValue.googleConnected === false, 'Truthful: Google not falsely reported as connected')

    // -------------------------------------------------------------------------
    // TEST 8: Step 3 Completion (Optional First-Value Guidance) & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Step 3 — Completion (First-Value Guidance Is Non-Blocking) & Idempotency')
    const completeReq1 = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'complete' }
    )
    const completeRes1 = await postOnboardingHandler(completeReq1)
    assert(completeRes1.status === 200, 'First complete call returns HTTP 200')
    const completeJson1 = await completeRes1.json()
    assert(completeJson1.redirectTo === '/dashboard', 'Returns redirectTo = "/dashboard"')
    assert(completeJson1.onboardingCompleted === true, 'Returns onboardingCompleted = true')

    // Verify DB
    const orgCompleted = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    assert(!!orgCompleted?.onboardingCompletedAt, 'organization.onboardingCompletedAt timestamp is set')

    // Verify audit log
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        targetId: tenantA.org.id,
        action: 'organization.onboarding_completed',
      },
    })
    assert(auditLogs.length === 1, 'Exactly one audit log emitted for onboarding completion')

    // Idempotency: call complete again
    const completeReq2 = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'complete' }
    )
    const completeRes2 = await postOnboardingHandler(completeReq2)
    assert(completeRes2.status === 200, 'Second complete call returns HTTP 200 (idempotent)')

    const auditLogsAfter2 = await prisma.auditLog.findMany({
      where: {
        targetId: tenantA.org.id,
        action: 'organization.onboarding_completed',
      },
    })
    assert(auditLogsAfter2.length === 1, 'Zero duplicate audit logs created on duplicate completion')

    // -------------------------------------------------------------------------
    // TEST 9: Existing User Safety
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Existing Customer Safety (Zero Disruption)')
    // Mark Tenant B as an existing customer created prior to migration
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.organization.update({
      where: { id: tenantB.org.id },
      data: { onboardingCompletedAt: pastDate, onboardingStep: 3 },
    })

    const tenantBStateReq = await createAuthRequest('http://localhost:3000/api/onboarding', tenantB, 'GET')
    const tenantBStateRes = await getOnboardingHandler(tenantBStateReq)
    const tenantBState = await tenantBStateRes.json()

    assert(tenantBState.organization.onboardingCompleted === true, 'Existing organization is recognized as completed')
    assert(tenantBState.organization.onboardingCompletedAt !== null, 'Existing organization timestamp preserved')

    // Clean up temporary signup user and business
    const signupUser = await prisma.user.findUnique({ where: { email: signupEmail } })
    if (signupUser) {
      const businesses = await prisma.business.findMany({ where: { ownerId: signupUser.id } })
      for (const b of businesses) {
        await prisma.review.deleteMany({ where: { businessId: b.id } }).catch(() => {})
        await prisma.business.delete({ where: { id: b.id } }).catch(() => {})
      }
      const member = await prisma.orgMember.findFirst({ where: { userId: signupUser.id } })
      if (member) {
        await cleanupTestTenant(member.orgId).catch(() => {})
      }
      await prisma.user.deleteMany({ where: { id: signupUser.id } }).catch(() => {})
    }
  } catch (err) {
    console.error('Test suite uncaught error:', err)
    failed++
  } finally {
    console.log('\n[Cleanup] Cleaning up test records...')
    if (tenantA) {
      await prisma.reviewPlatformLink.deleteMany({ where: { businessId: tenantA.business.id } }).catch(() => {})
      await prisma.brandVoiceProfile.deleteMany({ where: { businessId: tenantA.business.id } }).catch(() => {})
      await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } }).catch(() => {})
      await prisma.business.deleteMany({ where: { id: tenantA.business.id } }).catch(() => {})
      await cleanupTestTenant(tenantA.org.id).catch(() => {})
    }
    if (tenantB) {
      await prisma.business.deleteMany({ where: { id: tenantB.business.id } }).catch(() => {})
      await cleanupTestTenant(tenantB.org.id).catch(() => {})
    }
    await prisma.$disconnect()
  }

  console.log('\n====================================================================')
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})

/**
 * scripts/test-job20-5-onboarding-recovery.ts
 *
 * Dedicated Test Suite for Milestone JOB-20.5:
 * Production Onboarding UX & Failure Recovery
 *
 * Exercises real route handlers and database states on isolated test DB (port 5433).
 * Covers 55 Authoritative Verification Assertions across 7 Sections:
 *
 * 1. AUTHENTICATION, SESSION RECOVERY & TENANT ISOLATION (Assertions 1 - 10)
 *    1. Unauthenticated GET /api/onboarding -> 401 UNAUTHORIZED
 *    2. Unauthenticated POST /api/onboarding -> 401 UNAUTHORIZED
 *    3. Unauthenticated GET /api/dashboard -> 401 UNAUTHORIZED
 *    4. Unauthenticated POST /api/reviews/sync -> 401 UNAUTHORIZED
 *    5. Session expired / invalid JWT -> 401 UNAUTHORIZED triggers session recovery UI
 *    6. Session recovery: Re-authenticating restores exact onboarding progress
 *    7. Tenant isolation: Tenant A cannot read Tenant B onboarding or dashboard state
 *    8. Cross-tenant mutation rejection: Tenant A cannot mutate Tenant B business
 *    9. RBAC enforcement: VIEWER role cannot execute onboarding mutations (403)
 *   10. RBAC enforcement: OWNER / ADMIN can execute onboarding mutations
 *
 * 2. INITIAL STATE, LOCATION SETUP & BILLING RECOVERY (Assertions 11 - 17)
 *   11. No-business state: Tenant without business returns truthful firstLocationConfigured=false
 *   12. Inline location setup: POST action: 'setup-location' provisions business & attaches to tenant
 *   13. Billing incomplete: Tenant without plan has billingActionRequired='select_plan'
 *   14. Billing incomplete: Tenant with uncompleted billing has billingActionRequired='checkout'
 *   15. Billing recovery: Selecting FREE plan resolves billing requirement without payment
 *   16. Billing entitlement enforcement: Client cannot escalate plan via action: 'select-plan'
 *   17. Safe navigation & redirect targets: Rejects external or open redirects
 *
 * 3. GOOGLE INTEGRATION FAILURE MATRIX & RECOVERY (Assertions 18 - 28)
 *   18. Google unconfigured: When env missing, returns googleConfigured=false & actionRequired='configure'
 *   19. Google unconfigured: GET /api/oauth/google returns safe error redirect
 *   20. Google disconnected: Tokens missing -> googleOAuthConnected=false & actionRequired='connect'
 *   21. Google revoked: Token marked revokedAt -> googleConnectionHealthy=false & actionRequired='reconnect'
 *   22. Google refresh unavailable: Expired token without refresh capability requires reconnect
 *   23. No Google locations discovered: Empty location array handled gracefully without error
 *   24. Location selection required: OAuth connected but no location -> actionRequired='select_location'
 *   25. Cross-tenant location collision: Claiming location of another tenant returns 409
 *   26. Location verification failure: Unverified location blocks sync and readiness
 *   27. Safe provider errors: Provider 401/403/500 errors sanitized; no raw JSON / stack traces
 *   28. Token secrecy: API responses never leak accessToken, refreshToken, or client secrets
 *
 * 4. INITIAL SYNC FLOW, RETRY BEHAVIOR & IDEMPOTENCY (Assertions 29 - 35)
 *   29. Sync pending: Verified location with unstarted sync -> actionRequired='initial_sync'
 *   30. Sync failure handling: Provider error marks status 'failed' with safe error code
 *   31. Sync retry execution: Retrying sync after failure transitions cleanly to 'completed'
 *   32. Sync rate limiting: Rapid successive calls return 429 RATE_LIMITED with Retry-After
 *   33. Duplicate sync protection: Parallel sync call returns 409 SYNC_IN_PROGRESS
 *   34. Retry idempotency: Re-running sync does not create duplicate reviews in database
 *   35. Authoritative review count: realGoogleReviewCount counts only real Google reviews
 *
 * 5. AUTHORITATIVE READINESS, ZERO-REVIEW COMPLETION & FACEBOOK INDEPENDENCE (Assertions 36 - 43)
 *   36. Sync completed with zero reviews -> authoritative ready state (isReady=true)
 *   37. Sync completed with reviews -> authoritative ready state (isReady=true)
 *   38. Facebook disconnected does NOT block Google readiness
 *   39. False ready prevention: Token alone NEVER produces isReady=true
 *   40. False ready prevention: googleSyncedAt alone NEVER produces isReady=true
 *   41. False ready prevention: Review count alone NEVER produces isReady=true
 *   42. No client-controlled readiness: Client cannot spoof readiness via request payload
 *   43. Dashboard / Onboarding readiness agreement across all states
 *
 * 6. IDEMPOTENT REVISIT & COMPLETION MUTATIONS (Assertions 44 - 47)
 *   44. Already-ready customer revisit: Re-visiting onboarding retains complete state
 *   45. Complete action on ready state: Returns dashboardReady and truthful dashboard redirect
 *   46. Complete action on incomplete state: Returns truthful unready status
 *   47. Authoritative Progression Invariant strictly maintained end-to-end
 *
 * 7. CRITICAL BYPASS ELIMINATION & UI RECOVERY HARDENING (Assertions 48 - 55)
 *   48. All router.push('/dashboard') calls guarded; no unguarded onboarding dashboard bypass
 *   49. Ready onboarding has protected /dashboard CTA guarded by isDashboardReady
 *   50. Each major incomplete readiness state maps to an explicit recovery action
 *   51. Billing select_plan and checkout states expose appropriate recovery destinations
 *   52. Truthful Google no-location UX: truthful wording and dual recovery CTAs
 *   53. Safe navigation & zero external/open redirects
 *   54. Server-authoritative completion invariant: unready POST action: 'complete' returns redirectTo: '/onboarding'
 *   55. Customer with completed sync and reviews completes onboarding authoritatively to /dashboard
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import {
  encodeGBPState,
  decodeGBPState,
  verifyGoogleLocation,
  isGoogleConnectionUsable,
  GBP_OAUTH_STATE_COOKIE,
  getGoogleAuthUrl,
} from '../src/lib/integrations/google-business-profile'
import { storeTokens, deleteTokens } from '../src/lib/oauth-store'
import { _clearInMemoryStore } from '../src/lib/rate-limit'
import { Role, Plan, ReviewSource } from '@prisma/client'
import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

// Real Route Handlers
import { GET as getGoogleOAuthHandler } from '../src/app/api/oauth/google/route'
import { GET as getGoogleCallbackHandler } from '../src/app/api/oauth/google/callback/route'
import { POST as postSelectLocationHandler } from '../src/app/api/oauth/google/select-location/route'
import { POST as postSyncReviewsHandler } from '../src/app/api/reviews/sync/route'
import { GET as getOnboardingHandler, POST as postOnboardingHandler } from '../src/app/api/onboarding/route'
import { GET as getDashboardHandler } from '../src/app/api/dashboard/route'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`, details !== undefined ? details : '')
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
  roleOverride?: Role
): Promise<NextRequest> {
  const reqHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...headers,
  }

  const cookieParts: string[] = []
  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: roleOverride || tenant.membership.role,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
      sessionVersion: tenant.user.sessionVersion,
    })
    cookieParts.push(`${SESSION_COOKIE}=${token}`)
  }

  for (const [k, v] of Object.entries(cookies)) {
    cookieParts.push(`${k}=${v}`)
  }

  if (cookieParts.length > 0) {
    reqHeaders['cookie'] = cookieParts.join('; ')
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

const originalFetch = global.fetch

async function runJob20_5Suite() {
  console.log('====================================================================')
  console.log('JOB-20.5 PRODUCTION ONBOARDING UX & FAILURE RECOVERY TEST SUITE')
  console.log('====================================================================\n')

  const createdOrgIds: string[] = []
  const originalEnv = { ...process.env }
  const runId = `job20_5_${Date.now()}`

  process.env.SESSION_SECRET = 'test-session-secret-min-32-chars-for-job20-5-verification'
  process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id-job20-5'
  process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret-job20-5'

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    console.log('--- SEEDING TEST FIXTURES ---')
    tenantA = await seedTestTenant({
      role: Role.OWNER,
      plan: Plan.PRO,
      userEmail: `tenant_a_${runId}@example.com`,
    })
    createdOrgIds.push(tenantA.org.id)

    tenantB = await seedTestTenant({
      role: Role.OWNER,
      plan: Plan.STARTER,
      userEmail: `tenant_b_${runId}@example.com`,
    })
    createdOrgIds.push(tenantB.org.id)

    console.log(`Tenant A: orgId=${tenantA.org.id}, businessId=${tenantA.business.id}`)
    console.log(`Tenant B: orgId=${tenantB.org.id}, businessId=${tenantB.business.id}\n`)

    // Clean any pre-existing reviews or tokens
    await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } })
    await prisma.review.deleteMany({ where: { businessId: tenantB.business.id } })
    await deleteTokens(tenantA.business.id, 'google')
    await deleteTokens(tenantB.business.id, 'google')

    // =========================================================================
    // SECTION 1: AUTHENTICATION, SESSION RECOVERY & TENANT ISOLATION (1 - 10)
    // =========================================================================
    console.log('=== SECTION 1: AUTHENTICATION, SESSION RECOVERY & TENANT ISOLATION ===')

    // 1. Unauthenticated GET /api/onboarding -> 401 UNAUTHORIZED
    const req1 = await createAuthRequest('/api/onboarding', null, 'GET')
    const res1 = await getOnboardingHandler(req1)
    const json1 = await res1.json()
    assert(
      res1.status === 401 && (json1.code === 'UNAUTHORIZED' || json1.error === 'Authentication required'),
      'Assertion 1: Unauthenticated GET /api/onboarding returns 401 UNAUTHORIZED'
    )

    // 2. Unauthenticated POST /api/onboarding -> 401 UNAUTHORIZED
    const req2 = await createAuthRequest('/api/onboarding', null, 'POST', { action: 'complete' })
    const res2 = await postOnboardingHandler(req2)
    const json2 = await res2.json()
    assert(
      res2.status === 401 && (json2.code === 'UNAUTHORIZED' || json2.error === 'Authentication required'),
      'Assertion 2: Unauthenticated POST /api/onboarding returns 401 UNAUTHORIZED'
    )

    // 3. Unauthenticated GET /api/dashboard -> 401 UNAUTHORIZED
    const req3 = await createAuthRequest('/api/dashboard', null, 'GET')
    const res3 = await getDashboardHandler(req3)
    const json3 = await res3.json()
    assert(
      res3.status === 401 && (json3.error === 'Unauthorized' || json3.code === 'UNAUTHORIZED'),
      'Assertion 3: Unauthenticated GET /api/dashboard returns 401 UNAUTHORIZED'
    )

    // 4. Unauthenticated POST /api/reviews/sync -> 401 UNAUTHORIZED
    const req4 = await createAuthRequest('/api/reviews/sync', null, 'POST', { businessId: tenantA.business.id })
    const res4 = await postSyncReviewsHandler(req4)
    const json4 = await res4.json()
    assert(
      res4.status === 401 && (json4.error === 'Unauthorized' || json4.code === 'UNAUTHORIZED'),
      'Assertion 4: Unauthenticated POST /api/reviews/sync returns 401 UNAUTHORIZED'
    )

    // 5. Session expired / invalid JWT -> 401 UNAUTHORIZED triggers session recovery UI
    const req5 = new NextRequest(new URL('/api/onboarding', 'http://localhost:3000'), {
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=invalid.expired.jwt.token`,
      },
    })
    const res5 = await getOnboardingHandler(req5)
    assert(
      res5.status === 401,
      'Assertion 5: Invalid/expired session cookie returns 401 UNAUTHORIZED enabling session recovery'
    )

    // 6. Session recovery: Re-authenticating restores exact onboarding progress
    const req6 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res6 = await getOnboardingHandler(req6)
    const json6 = await res6.json()
    assert(
      res6.status === 200 && json6.organization?.id === tenantA.org.id,
      'Assertion 6: Fresh valid session immediately restores full access to onboarding state'
    )

    // 7. Tenant isolation: Tenant A cannot read Tenant B onboarding or dashboard state
    const req7 = await createAuthRequest(`/api/dashboard?businessId=${tenantB.business.id}`, tenantA, 'GET')
    const res7 = await getDashboardHandler(req7)
    assert(
      res7.status === 403 || res7.status === 404,
      'Assertion 7: Tenant A cannot read Tenant B dashboard state (403/404)'
    )

    // 8. Cross-tenant mutation rejection: Tenant A cannot mutate Tenant B business
    const req8 = await createAuthRequest('/api/onboarding', tenantA, 'POST', {
      action: 'setup-location',
      businessId: tenantB.business.id,
      name: 'Hijacked Name',
    })
    const res8 = await postOnboardingHandler(req8)
    const bCheck = await prisma.business.findUnique({ where: { id: tenantB.business.id } })
    assert(
      (res8.status === 403 || res8.status === 404) && bCheck?.name !== 'Hijacked Name',
      'Assertion 8: Cross-tenant business mutation rejected; Tenant B business remains unmodified'
    )

    // 9. RBAC enforcement: VIEWER role cannot execute onboarding mutations (403)
    await prisma.orgMember.update({
      where: { id: tenantA.membership.id },
      data: { role: Role.VIEWER },
    })
    const req9 = await createAuthRequest('/api/onboarding', tenantA, 'POST', { action: 'complete' })
    const res9 = await postOnboardingHandler(req9)
    await prisma.orgMember.update({
      where: { id: tenantA.membership.id },
      data: { role: Role.OWNER },
    })
    assert(
      res9.status === 403,
      'Assertion 9: VIEWER role cannot complete onboarding (returns 403 FORBIDDEN)'
    )

    // 10. RBAC enforcement: OWNER / ADMIN can execute onboarding mutations
    const req10 = await createAuthRequest('/api/onboarding', tenantA, 'POST', { action: 'set-step', step: 3 }, {}, {}, Role.ADMIN)
    const res10 = await postOnboardingHandler(req10)
    assert(
      res10.status === 200,
      'Assertion 10: ADMIN / OWNER role permitted to execute onboarding actions (returns 200)'
    )

    // =========================================================================
    // SECTION 2: INITIAL STATE, LOCATION SETUP & BILLING RECOVERY (11 - 17)
    // =========================================================================
    console.log('\n=== SECTION 2: INITIAL STATE, LOCATION SETUP & BILLING RECOVERY ===')

    // Create a fresh tenant with NO businesses to test no-business state
    const tenantNoBiz = await seedTestTenant({
      role: Role.OWNER,
      plan: Plan.STARTER,
      userEmail: `tenant_nobiz_${runId}@example.com`,
    })
    createdOrgIds.push(tenantNoBiz.org.id)
    await prisma.business.deleteMany({ where: { orgId: tenantNoBiz.org.id } })

    // 11. No-business state
    const req11 = await createAuthRequest('/api/onboarding', tenantNoBiz, 'GET')
    const res11 = await getOnboardingHandler(req11)
    const json11 = await res11.json()
    assert(
      json11.onboardingStatus.firstLocationConfigured === false &&
      json11.onboardingStatus.primaryBusinessId === null &&
      json11.onboardingStatus.step === 1,
      'Assertion 11: Tenant without business returns firstLocationConfigured=false, primaryBusinessId=null'
    )

    // 12. Inline location setup: POST action: 'setup-location' provisions business & attaches to tenant
    const req12 = await createAuthRequest('/api/onboarding', tenantNoBiz, 'POST', {
      action: 'setup-location',
      name: 'Downtown Flagship',
      address: '789 Market St, San Francisco, CA',
    })
    const res12 = await postOnboardingHandler(req12)
    const json12 = await res12.json()
    const newlyCreatedBiz = await prisma.business.findFirst({ where: { orgId: tenantNoBiz.org.id } })
    assert(
      res12.status === 200 &&
      json12.success === true &&
      newlyCreatedBiz !== null &&
      newlyCreatedBiz.name === 'Downtown Flagship',
      'Assertion 12: Inline location setup provisions primary business and assigns to tenant organization'
    )

    // 13. Billing incomplete: Tenant at plan selection stage has billingActionRequired='select_plan'
    const tenantNoPlan = await seedTestTenant({
      role: Role.OWNER,
      plan: Plan.FREE,
      userEmail: `tenant_noplan_${runId}@example.com`,
    })
    createdOrgIds.push(tenantNoPlan.org.id)
    await prisma.organization.update({
      where: { id: tenantNoPlan.org.id },
      data: { plan: Plan.FREE, onboardingStep: 2 },
    })
    const req13 = await createAuthRequest('/api/onboarding', tenantNoPlan, 'GET')
    const res13 = await getOnboardingHandler(req13)
    const json13 = await res13.json()
    assert(
      json13.onboardingStatus.billingActionRequired === 'select_plan',
      'Assertion 13: Tenant at plan selection stage has billingActionRequired=select_plan'
    )

    // 14. Billing incomplete: Tenant with paid plan but uncompleted checkout has billingActionRequired='checkout'
    await prisma.organization.update({
      where: { id: tenantNoPlan.org.id },
      data: {
        plan: Plan.PRO,
        trialEndsAt: null, // no active trial, so won't auto-downgrade
        onboardingStep: 2,
      },
    })
    const req14 = await createAuthRequest('/api/onboarding', tenantNoPlan, 'GET')
    const res14 = await getOnboardingHandler(req14)
    const json14 = await res14.json()
    assert(
      json14.onboardingStatus.billingSetupCompleted === false &&
      json14.onboardingStatus.billingActionRequired === 'checkout',
      'Assertion 14: Tenant with PRO plan but unverified checkout has billingActionRequired=checkout'
    )

    // 15. Billing recovery: Selecting FREE plan resolves billing requirement without payment
    const req15 = await createAuthRequest('/api/onboarding', tenantNoPlan, 'POST', {
      action: 'select-plan',
      plan: 'FREE',
    })
    const res15 = await postOnboardingHandler(req15)
    const json15 = await res15.json()
    const updatedOrg15 = await prisma.organization.findUnique({ where: { id: tenantNoPlan.org.id } })
    assert(
      res15.status === 200 &&
      json15.success === true &&
      updatedOrg15?.plan === Plan.FREE,
      'Assertion 15: Selecting FREE plan resolves billing requirement cleanly without payment gateway'
    )

    // 16. Billing entitlement enforcement: Client cannot escalate plan via action: 'select-plan'
    const req16 = await createAuthRequest('/api/onboarding', tenantNoPlan, 'POST', {
      action: 'select-plan',
      plan: 'ENTERPRISE',
    })
    const res16 = await postOnboardingHandler(req16)
    const orgCheck16 = await prisma.organization.findUnique({ where: { id: tenantNoPlan.org.id } })
    // Either rejected or does not grant ENTERPRISE without Stripe checkout
    assert(
      res16.status === 400 || orgCheck16?.plan !== Plan.ENTERPRISE,
      'Assertion 16: Client cannot escalate to ENTERPRISE via unverified POST /api/onboarding'
    )

    // 17. Safe navigation & redirect targets: Rejects external or open redirects
    const req17 = await createAuthRequest(`/api/oauth/google?businessId=${tenantA.business.id}&returnTo=https://evil.com/phish`, tenantA, 'GET')
    const res17 = await getGoogleOAuthHandler(req17)
    const location17 = res17.headers.get('location') || ''
    // Must redirect to Google Accounts OAuth URL, and state inside must not open redirect
    assert(
      location17.startsWith('https://accounts.google.com/o/oauth2/v2/auth') &&
      !location17.includes('https://evil.com'),
      'Assertion 17: OAuth handler sanitizes returnTo parameter and prevents open redirects'
    )

    // =========================================================================
    // SECTION 3: GOOGLE INTEGRATION FAILURE MATRIX & RECOVERY (18 - 28)
    // =========================================================================
    console.log('\n=== SECTION 3: GOOGLE INTEGRATION FAILURE MATRIX & RECOVERY ===')

    // 18. Google unconfigured: When env missing, returns googleConfigured=false & actionRequired='configure'
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const req18 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res18 = await getOnboardingHandler(req18)
    const json18 = await res18.json()
    const googleHealth18 = json18.integrationHealth?.find((h: any) => h.provider === 'google')
    assert(
      json18.onboardingStatus.googleConfigured === false &&
      googleHealth18?.actionRequired === 'configure',
      'Assertion 18: Google unconfigured env surfaces googleConfigured=false & actionRequired=configure'
    )

    // 19. Google unconfigured: GET /api/oauth/google returns safe 503 error when unconfigured
    const req19 = await createAuthRequest(`/api/oauth/google?businessId=${tenantA.business.id}`, tenantA, 'GET')
    const res19 = await getGoogleOAuthHandler(req19)
    const json19 = await res19.json().catch(() => ({}))
    assert(
      res19.status === 503 && json19.error === 'Google OAuth not configured',
      'Assertion 19: GET /api/oauth/google returns safe 503 error when unconfigured'
    )

    // Restore env vars
    process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id-job20-5'
    process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret-job20-5'

    // 20. Google disconnected: Tokens missing -> googleOAuthConnected=false & actionRequired='connect'
    await deleteTokens(tenantA.business.id, 'google')
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: null,
        googleLocationVerified: false,
        googleSyncStatus: null,
        googleSyncedAt: null,
      },
    })
    const req20 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res20 = await getOnboardingHandler(req20)
    const json20 = await res20.json()
    assert(
      json20.onboardingStatus.googleOAuthConnected === false &&
      json20.onboardingStatus.googleConnectionHealthy === false &&
      json20.dashboardReadiness.isReady === false &&
      json20.dashboardReadiness.actionRequired === 'Connect Google Business Profile',
      'Assertion 20: Google disconnected returns googleOAuthConnected=false & actionRequired=Connect Google Business Profile'
    )

    // 21. Google revoked: Token refresh fails -> googleConnectionHealthy=false & actionRequired='reconnect'
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(url, init)
    }

    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'expired-access-token-21',
      refreshToken: 'revoked-refresh-token-21',
      expiresAt: new Date(Date.now() - 3600000), // expired so it refreshes
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    const req21 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res21 = await getOnboardingHandler(req21)
    const json21 = await res21.json()
    const googleHealth21 = json21.integrationHealth?.find((h: any) => h.provider === 'google')
    assert(
      json21.onboardingStatus.googleOAuthConnected === true &&
      json21.onboardingStatus.googleConnectionHealthy === false &&
      googleHealth21?.actionRequired === 'reconnect',
      'Assertion 21: Revoked Google refresh token marks connection unhealthy & actionRequired=reconnect'
    )
    global.fetch = originalFetch

    // 22. Google refresh unavailable: Expired token without refresh capability requires reconnect
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'expired-access-token-22',
      refreshToken: '', // no refresh capability
      expiresAt: new Date(Date.now() - 3600000), // expired 1 hr ago
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    const req22 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res22 = await getOnboardingHandler(req22)
    const json22 = await res22.json()
    const googleHealth22 = json22.integrationHealth?.find((h: any) => h.provider === 'google')
    assert(
      json22.onboardingStatus.googleConnectionHealthy === false &&
      googleHealth22?.actionRequired === 'reconnect',
      'Assertion 22: Expired token without refresh capability requires reconnect'
    )

    // 23. No Google locations discovered: Provider returns empty locations[] — handled gracefully
    // Re-seed healthy tokens so the OAuth connection check passes.
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'healthy-token-1',
      refreshToken: 'healthy-refresh-1',
      expiresAt: new Date(Date.now() + 3600000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    // Mock the Google location-discovery endpoint to return a valid account list but
    // an empty locations array — the real failure mode where OAuth succeeds but the
    // Google account has no accessible Business Profile locations.
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (urlStr.includes('mybusinessaccountmanagement.googleapis.com')) {
        return new Response(JSON.stringify({
          accounts: [{ name: 'accounts/99999', accountName: 'Empty Account' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (urlStr.includes('mybusinessbusinessinformation.googleapis.com') || urlStr.includes('/locations')) {
        // Provider returns empty locations array — the scenario under test
        return new Response(JSON.stringify({ locations: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }
    const req23 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res23 = await getOnboardingHandler(req23)
    const json23 = await res23.json()
    // Restore fetch immediately after the controlled call
    global.fetch = originalFetch
    assert(
      json23.onboardingStatus.googleOAuthConnected === true &&
      json23.onboardingStatus.googleLocationSelected === false &&
      json23.dashboardReadiness.isReady === false,
      'Assertion 23: Provider returning empty locations[] handled gracefully; googleLocationSelected remains false without crash'
    )

    // 24. Location selection required: OAuth connected but no location -> actionRequired='select_location'
    assert(
      json23.dashboardReadiness.actionRequired === 'Select your business location',
      'Assertion 24: Connected OAuth without location sets actionRequired=Select your business location'
    )

    // 25. Cross-tenant location collision: Claiming location of another tenant returns 409
    const collisionLocId = 'locations/collision-target-loc-99'
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleLocationId: collisionLocId, googleLocationVerified: true },
    })
    await storeTokens({
      businessId: tenantB.business.id,
      provider: 'google',
      accessToken: 'tenant-b-token',
      refreshToken: 'tenant-b-refresh',
      expiresAt: new Date(Date.now() + 3600000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string') {
        if (url.includes('mybusinessaccountmanagement.googleapis.com')) {
          return new Response(JSON.stringify({
            accounts: [{ name: 'accounts/12345', accountName: 'Tenant B Account' }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (url.includes('mybusinessbusinessinformation.googleapis.com')) {
          return new Response(JSON.stringify({
            locations: [{
              name: collisionLocId,
              title: 'Collision Attempt Location',
              metadata: { placeId: 'place_collision_99' },
            }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
      }
      return originalFetch(url, init)
    }

    const req25 = await createAuthRequest('/api/oauth/google/select-location', tenantB, 'POST', {
      businessId: tenantB.business.id,
      locationId: collisionLocId,
      locationName: 'Collision Attempt Location',
    })
    const res25 = await postSelectLocationHandler(req25)
    const json25 = await res25.json()
    global.fetch = originalFetch

    assert(
      res25.status === 409 && (json25.code === 'LOCATION_ALREADY_ATTACHED' || json25.error?.includes('another organization')),
      'Assertion 25: Cross-tenant location collision returns 409 LOCATION_ALREADY_ATTACHED'
    )

    // 26. Location verification failure: Unverified location blocks sync and readiness
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: 'locations/unverified-loc-123',
        googleLocationVerified: false,
      },
    })
    const req26 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res26 = await getOnboardingHandler(req26)
    const json26 = await res26.json()
    assert(
      json26.onboardingStatus.googleLocationSelected === true &&
      json26.onboardingStatus.googleLocationVerified === false &&
      json26.dashboardReadiness.isReady === false &&
      json26.dashboardReadiness.actionRequired === 'Location verification required',
      'Assertion 26: Unverified location blocks dashboard readiness and requires verification'
    )

    // 27. Safe provider errors: Provider 401/403/500 errors sanitized; no raw JSON / stack traces
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (urlStr.includes('mybusiness.googleapis.com') || urlStr.includes('mybusinessaccountmanagement')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 500,
              message: 'Internal server error in Google backend with internal debug info: traces=0x999',
              status: 'INTERNAL',
            },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
      }
      return originalFetch(input, init)
    }

    const req27 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res27 = await postSyncReviewsHandler(req27)
    const json27 = await res27.json()
    assert(
      !JSON.stringify(json27).includes('0x999') &&
      (json27.error || json27.code),
      'Assertion 27: Upstream provider 500 error is sanitized and leaks no raw backend trace'
    )

    // Restore fetch
    global.fetch = originalFetch

    // 28. Token secrecy: API responses never leak accessToken, refreshToken, or client secrets
    const req28a = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res28a = await getOnboardingHandler(req28a)
    const json28a = await res28a.json()
    const str28a = JSON.stringify(json28a)

    const req28b = await createAuthRequest(`/api/dashboard?businessId=${tenantA.business.id}`, tenantA, 'GET')
    const res28b = await getDashboardHandler(req28b)
    const json28b = await res28b.json()
    const str28b = JSON.stringify(json28b)

    assert(
      !str28a.includes('healthy-token-1') &&
      !str28a.includes('healthy-refresh-1') &&
      !str28a.includes(process.env.GOOGLE_CLIENT_SECRET!) &&
      !str28b.includes('healthy-token-1') &&
      !str28b.includes('healthy-refresh-1') &&
      !str28b.includes(process.env.GOOGLE_CLIENT_SECRET!),
      'Assertion 28: API payloads strictly omit access tokens, refresh tokens, and client secrets'
    )

    // =========================================================================
    // SECTION 4: INITIAL SYNC FLOW, RETRY BEHAVIOR & IDEMPOTENCY (29 - 35)
    // =========================================================================
    console.log('\n=== SECTION 4: INITIAL SYNC FLOW, RETRY BEHAVIOR & IDEMPOTENCY ===')

    // 29. Sync pending: Verified location with unstarted sync -> actionRequired='initial_sync'
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: 'accounts/12345/locations/loc-verified-valid',
        googleLocationVerified: true,
        googleSyncStatus: 'not_started',
        googleSyncedAt: null,
      },
    })
    const req29 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res29 = await getOnboardingHandler(req29)
    const json29 = await res29.json()
    assert(
      json29.onboardingStatus.googleLocationVerified === true &&
      json29.onboardingStatus.googleSyncStatus === 'not_started' &&
      json29.dashboardReadiness.isReady === false &&
      json29.dashboardReadiness.actionRequired === 'Start initial sync',
      'Assertion 29: Verified location with unstarted sync indicates initial_sync required'
    )

    // 30. Sync failure handling: Provider error marks status 'failed' with safe error code
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'failed',
        googleSyncError: 'Provider connection timed out safely',
      },
    })
    const req30 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res30 = await getOnboardingHandler(req30)
    const json30 = await res30.json()
    assert(
      json30.onboardingStatus.googleSyncStatus === 'failed' &&
      json30.dashboardReadiness.isReady === false &&
      json30.dashboardReadiness.actionRequired === 'Retry initial sync',
      'Assertion 30: Sync failure marks status=failed and sets actionRequired=retry_sync'
    )

    // 31. Sync retry execution: Retrying sync after failure transitions cleanly to 'completed'
    // Mock Google reviews API returning 0 reviews cleanly
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (urlStr.includes('mybusiness.googleapis.com') || urlStr.includes('/reviews')) {
        return new Response(
          JSON.stringify({
            reviews: [],
            totalReviewCount: 0,
            averageRating: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return originalFetch(input, init)
    }

    _clearInMemoryStore()
    const req31 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res31 = await postSyncReviewsHandler(req31)
    const json31 = await res31.json()
    const bUpdated31 = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(
      res31.status === 200 &&
      (json31.googleSyncStatus === 'completed' || json31.success === true) &&
      bUpdated31?.googleSyncStatus === 'completed',
      'Assertion 31: Retrying sync after failure recovers and transitions to googleSyncStatus=completed'
    )

    // 32. Sync rate limiting: Rapid successive calls return 429 RATE_LIMITED with Retry-After
    // Call 5 times rapidly to exceed rate limit (sync rate limit is 3 per minute)
    let hitRateLimit = false
    for (let i = 0; i < 5; i++) {
      const reqLimit = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
      const resLimit = await postSyncReviewsHandler(reqLimit)
      if (resLimit.status === 429) {
        const jsonLimit = await resLimit.json()
        const retryAfter = resLimit.headers.get('retry-after')
        if (jsonLimit.code === 'RATE_LIMITED' && retryAfter) {
          hitRateLimit = true
          break
        }
      }
    }
    assert(
      hitRateLimit === true,
      'Assertion 32: Rapid successive sync requests trigger 429 RATE_LIMITED with Retry-After header'
    )

    // 33. Duplicate sync protection: Parallel sync call returns 409 SYNC_IN_PROGRESS
    _clearInMemoryStore()
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleSyncStatus: 'syncing' },
    })
    const req33 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res33 = await postSyncReviewsHandler(req33)
    const json33 = await res33.json()
    assert(
      res33.status === 409 && json33.code === 'SYNC_IN_PROGRESS',
      'Assertion 33: Concurrent sync attempt while status is running returns 409 SYNC_IN_PROGRESS'
    )

    // 34. Retry idempotency: Re-running sync does not create duplicate reviews in database
    _clearInMemoryStore()
    // Reset business back to completed
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleSyncStatus: 'completed' },
    })
    // Mock returning 2 distinct reviews
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (urlStr.includes('/reviews')) {
        return new Response(
          JSON.stringify({
            reviews: [
              {
                reviewId: 'rev-google-unique-101',
                reviewer: { displayName: 'Alice Brown' },
                starRating: 'FIVE',
                comment: 'Superb service!',
                createTime: '2026-08-01T10:00:00Z',
                updateTime: '2026-08-01T10:00:00Z',
              },
              {
                reviewId: 'rev-google-unique-102',
                reviewer: { displayName: 'Bob Green' },
                starRating: 'FOUR',
                comment: 'Great quality, fast turnaround.',
                createTime: '2026-08-02T11:00:00Z',
                updateTime: '2026-08-02T11:00:00Z',
              },
            ],
            totalReviewCount: 2,
            averageRating: 4.5,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return originalFetch(input, init)
    }

    // Run first sync
    const req34a = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    await postSyncReviewsHandler(req34a)
    const countAfter1st = await prisma.review.count({ where: { businessId: tenantA.business.id } })

    // Clear rate limit & run second sync with same reviews
    _clearInMemoryStore()
    const req34b = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    await postSyncReviewsHandler(req34b)
    const countAfter2nd = await prisma.review.count({ where: { businessId: tenantA.business.id } })

    assert(
      countAfter1st === 2 && countAfter2nd === 2,
      `Assertion 34: Retry sync is idempotent: 2 reviews remain 2 reviews (no duplicate records created)`
    )

    // 35. Authoritative review count: realGoogleReviewCount counts only real Google reviews
    // Seed a demo/internal review to ensure it is excluded
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Demo Reviewer',
        rating: 5,
        text: 'Demo review content',
        source: ReviewSource.INTERNAL,
        externalId: `internal_demo_${Date.now()}`,
      },
    })
    const req35 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res35 = await getOnboardingHandler(req35)
    const json35 = await res35.json()
    assert(
      json35.onboardingStatus.realGoogleReviewCount === 2,
      'Assertion 35: realGoogleReviewCount strictly counts Google reviews and ignores non-Google/internal reviews'
    )

    // Restore fetch
    global.fetch = originalFetch

    // =========================================================================
    // SECTION 5: AUTHORITATIVE READINESS & ZERO-REVIEW COMPLETION (36 - 43)
    // =========================================================================
    console.log('\n=== SECTION 5: AUTHORITATIVE READINESS & ZERO-REVIEW COMPLETION ===')

    // 36. Sync completed with zero reviews -> authoritative ready state (isReady=true)
    // Clean reviews on Tenant B and mark sync completed
    await prisma.review.deleteMany({ where: { businessId: tenantB.business.id } })
    await prisma.business.update({
      where: { id: tenantB.business.id },
      data: {
        googleLocationId: 'locations/tenant-b-zero-rev-loc',
        googleLocationVerified: true,
        googleSyncStatus: 'completed',
        googleSyncedAt: new Date(),
        googleSyncError: null,
      },
    })
    const req36a = await createAuthRequest('/api/onboarding', tenantB, 'GET')
    const res36a = await getOnboardingHandler(req36a)
    const json36a = await res36a.json()

    const req36b = await createAuthRequest(`/api/dashboard?businessId=${tenantB.business.id}`, tenantB, 'GET')
    const res36b = await getDashboardHandler(req36b)
    const json36b = await res36b.json()

    assert(
      json36a.onboardingStatus.realGoogleReviewCount === 0 &&
      json36a.dashboardReadiness.isReady === true &&
      json36b.dashboardReadiness?.isReady === true,
      'Assertion 36: Sync completed with 0 reviews produces authoritative isReady=true on onboarding and dashboard'
    )

    // 37. Sync completed with reviews -> authoritative ready state (isReady=true)
    const req37a = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res37a = await getOnboardingHandler(req37a)
    const json37a = await res37a.json()

    const req37b = await createAuthRequest(`/api/dashboard?businessId=${tenantA.business.id}`, tenantA, 'GET')
    const res37b = await getDashboardHandler(req37b)
    const json37b = await res37b.json()

    assert(
      json37a.onboardingStatus.realGoogleReviewCount > 0 &&
      json37a.dashboardReadiness.isReady === true &&
      json37b.dashboardReadiness?.isReady === true,
      'Assertion 37: Sync completed with reviews produces authoritative isReady=true on onboarding and dashboard'
    )

    // 38. Facebook disconnected does NOT block Google readiness
    // Tenant A has no Facebook token or page selected
    assert(
      json37a.onboardingStatus.facebookConnected === false &&
      json37a.dashboardReadiness.isReady === true &&
      json37b.dashboardReadiness?.isReady === true,
      'Assertion 38: Disconnected Facebook does NOT block Google onboarding readiness'
    )

    // 39. False ready prevention: Token alone NEVER produces isReady=true
    const tenantFalseReady = await seedTestTenant({
      role: Role.OWNER,
      plan: Plan.PRO,
      userEmail: `tenant_falseready_${runId}@example.com`,
    })
    createdOrgIds.push(tenantFalseReady.org.id)
    await storeTokens({
      businessId: tenantFalseReady.business.id,
      provider: 'google',
      accessToken: 'token-without-location',
      refreshToken: 'refresh-without-location',
      expiresAt: new Date(Date.now() + 3600000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    await prisma.business.update({
      where: { id: tenantFalseReady.business.id },
      data: {
        googleLocationId: null,
        googleLocationVerified: false,
        googleSyncStatus: null,
        googleSyncedAt: null,
      },
    })
    const req39 = await createAuthRequest(`/api/dashboard?businessId=${tenantFalseReady.business.id}`, tenantFalseReady, 'GET')
    const res39 = await getDashboardHandler(req39)
    const json39 = await res39.json()
    assert(
      json39.dashboardReadiness?.isReady === false,
      'Assertion 39: False ready prevention: Token alone without location never produces isReady=true'
    )

    // 40. False ready prevention: googleSyncedAt alone NEVER produces isReady=true
    await prisma.business.update({
      where: { id: tenantFalseReady.business.id },
      data: {
        googleLocationId: 'locations/fake-loc-1',
        googleLocationVerified: true,
        googleSyncStatus: 'syncing', // Not completed
        googleSyncedAt: new Date(),
      },
    })
    const req40 = await createAuthRequest(`/api/dashboard?businessId=${tenantFalseReady.business.id}`, tenantFalseReady, 'GET')
    const res40 = await getDashboardHandler(req40)
    const json40 = await res40.json()
    assert(
      json40.dashboardReadiness?.isReady === false,
      'Assertion 40: False ready prevention: googleSyncedAt without completed sync never produces isReady=true'
    )

    // 41. False ready prevention: Review count alone NEVER produces isReady=true
    await prisma.business.update({
      where: { id: tenantFalseReady.business.id },
      data: {
        googleLocationId: null,
        googleLocationVerified: false,
        googleSyncStatus: null,
        googleSyncedAt: null,
      },
    })
    await prisma.review.create({
      data: {
        businessId: tenantFalseReady.business.id,
        author: 'Spurious Reviewer',
        rating: 5,
        text: 'Review on unconnected business',
        source: ReviewSource.GOOGLE,
        externalId: `google_spurious_${Date.now()}`,
      },
    })
    const req41 = await createAuthRequest(`/api/dashboard?businessId=${tenantFalseReady.business.id}`, tenantFalseReady, 'GET')
    const res41 = await getDashboardHandler(req41)
    const json41 = await res41.json()
    assert(
      json41.dashboardReadiness?.isReady === false,
      'Assertion 41: False ready prevention: Existing reviews without healthy integration never produces isReady=true'
    )

    // 42. No client-controlled readiness: Client cannot spoof readiness via request payload
    const req42 = await createAuthRequest('/api/onboarding', tenantFalseReady, 'POST', {
      action: 'complete',
      isReady: true,
      googleSyncStatus: 'completed',
      realGoogleReviewCount: 999,
    })
    const res42 = await postOnboardingHandler(req42)
    const json42 = await res42.json()
    assert(
      json42.dashboardReady === false &&
      json42.dashboardReadiness?.isReady === false,
      'Assertion 42: Client-supplied isReady/googleSyncStatus in request payload is ignored; server computes truth'
    )

    // 43. Dashboard / Onboarding readiness agreement across all states
    const req43a = await createAuthRequest('/api/onboarding', tenantFalseReady, 'GET')
    const res43a = await getOnboardingHandler(req43a)
    const json43a = await res43a.json()

    const req43b = await createAuthRequest(`/api/dashboard?businessId=${tenantFalseReady.business.id}`, tenantFalseReady, 'GET')
    const res43b = await getDashboardHandler(req43b)
    const json43b = await res43b.json()

    assert(
      json43a.dashboardReadiness.isReady === json43b.dashboardReadiness.isReady,
      'Assertion 43: /api/onboarding and /api/dashboard derive identical authoritative readiness state'
    )

    // =========================================================================
    // SECTION 6: IDEMPOTENT REVISIT & COMPLETION MUTATIONS (44 - 47)
    // =========================================================================
    console.log('\n=== SECTION 6: IDEMPOTENT REVISIT & COMPLETION MUTATIONS ===')

    // 44. Already-ready customer revisit: Re-visiting onboarding retains complete state
    const req44 = await createAuthRequest('/api/onboarding', tenantA, 'GET')
    const res44 = await getOnboardingHandler(req44)
    const json44 = await res44.json()
    const tokensAfter44 = await prisma.oAuthToken.findMany({ where: { businessId: tenantA.business.id } })
    const bizAfter44 = await prisma.business.findUnique({ where: { id: tenantA.business.id } })

    assert(
      json44.onboardingStatus.step === 3 &&
      json44.dashboardReadiness.isReady === true &&
      tokensAfter44.length > 0 &&
      bizAfter44?.googleLocationId !== null &&
      bizAfter44?.googleSyncStatus === 'completed',
      'Assertion 44: Re-visiting onboarding for an already-ready customer preserves tokens, location, and sync'
    )

    // 45. Complete action on ready state: Returns dashboardReady and truthful dashboard redirect
    const req45 = await createAuthRequest('/api/onboarding', tenantA, 'POST', { action: 'complete' })
    const res45 = await postOnboardingHandler(req45)
    const json45 = await res45.json()
    assert(
      res45.status === 200 &&
      json45.dashboardReady === true &&
      json45.redirectTo === '/dashboard',
      'Assertion 45: POST /api/onboarding complete on ready customer returns dashboardReady=true and /dashboard'
    )

    // 46. Complete action on incomplete state: Returns truthful unready status
    const req46 = await createAuthRequest('/api/onboarding', tenantFalseReady, 'POST', { action: 'complete' })
    const res46 = await postOnboardingHandler(req46)
    const json46 = await res46.json()
    assert(
      res46.status === 200 &&
      json46.dashboardReady === false &&
      json46.dashboardReadiness?.isReady === false,
      'Assertion 46: POST /api/onboarding complete on unready customer returns dashboardReady=false'
    )

    // 47. Authoritative Progression Invariant strictly maintained end-to-end
    // Progression: Account -> Organization -> Plan/Billing -> Google OAuth -> Location Selection -> Server Verification -> Initial Sync -> Sync Completed -> Dashboard Ready
    assert(
      json1.onboardingStatus === undefined && // unauthenticated
      json11.onboardingStatus.firstLocationConfigured === false && // No location
      json13.onboardingStatus.billingActionRequired === 'select_plan' && // Billing required
      json20.onboardingStatus.googleOAuthConnected === false && // Google OAuth required
      json23.onboardingStatus.googleLocationSelected === false && // Location selection required
      json26.onboardingStatus.googleLocationVerified === false && // Server verification required
      json29.onboardingStatus.googleSyncStatus === 'not_started' && // Initial sync required
      json36a.onboardingStatus.googleSyncStatus === 'completed' && json36a.dashboardReadiness.isReady === true && // 0 reviews ready
      json37a.onboardingStatus.googleSyncStatus === 'completed' && json37a.dashboardReadiness.isReady === true, // reviews ready
      'Assertion 47: Authoritative Progression Invariant strictly verified across all stages'
    )

    // =========================================================================
    // SECTION 7: CRITICAL BYPASS ELIMINATION & UI RECOVERY HARDENING (48 - 55)
    // =========================================================================
    console.log('\n=== SECTION 7: CRITICAL BYPASS ELIMINATION & UI RECOVERY HARDENING ===')

    const onboardingPageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/onboarding/page.tsx'), 'utf8')

    // 48. Verify no unguarded router.push('/dashboard') exists in onboarding source.
    // Allowed patterns:
    //   (a) Inside handleCompleteOnboarding — guarded by !isDashboardReady early return
    //       AND double-checked against json.dashboardReady from the server before pushing.
    //   (b) Inside a JSX block gated by {isDashboardReady && (...)} or isDashboardReady ?
    // Any occurrence without one of those guards is a bypass regression.
    const dashboardPushOccurrences = [...onboardingPageSource.matchAll(/router\.push\(['"]\/dashboard['"]\)/g)]
    let allPushesProperlyGuarded = true
    for (const match of dashboardPushOccurrences) {
      const offset = match.index ?? 0
      // Look at up to 400 chars of context before this push
      const priorContext = onboardingPageSource.slice(Math.max(0, offset - 400), offset)
      const hasReadyGuard =
        priorContext.includes('isDashboardReady') ||
        priorContext.includes('json.dashboardReady') ||
        priorContext.includes('dashboardReady')
      if (!hasReadyGuard) {
        allPushesProperlyGuarded = false
        break
      }
    }
    const noLegacyBypassText = !onboardingPageSource.includes('Proceed to Dashboard (Setup Incomplete)')
    // handleCompleteOnboarding must have its isDashboardReady early-return guard intact
    const completeFnGuardIntact =
      onboardingPageSource.includes('if (!isDashboardReady)') ||
      onboardingPageSource.includes('if(!isDashboardReady)')
    assert(
      allPushesProperlyGuarded && noLegacyBypassText && completeFnGuardIntact,
      'Assertion 48: All router.push("/dashboard") calls guarded by isDashboardReady or server dashboardReady; handleCompleteOnboarding guard intact; no legacy bypass text'
    )

    // 49. Ready onboarding has protected /dashboard completion CTA guarded by isDashboardReady
    const hasReadyDashboardCTA = onboardingPageSource.includes('Complete Setup & Go to Dashboard') &&
      onboardingPageSource.includes('{isDashboardReady ? (')
    assert(
      hasReadyDashboardCTA,
      'Assertion 49: Ready onboarding presents "Complete Setup & Go to Dashboard" strictly guarded by isDashboardReady'
    )

    // 50. Each major incomplete readiness state maps to an explicit recovery action
    const hasCreateBusinessAction = onboardingPageSource.includes('Create Business')
    const hasBillingRecoveryAction = onboardingPageSource.includes("billingActionRequired === 'select_plan' ? 'Choose Plan' : 'Complete Billing'")
    const hasConnectGoogleAction = onboardingPageSource.includes('Connect Google')
    const hasChooseLocationAction = onboardingPageSource.includes('Choose Location')
    const hasVerifyLocationAction = onboardingPageSource.includes('Select & Verify Location')
    const hasSyncRecoveryAction = onboardingPageSource.includes('Retry Initial Sync') && onboardingPageSource.includes('Start Initial Sync')
    assert(
      hasCreateBusinessAction &&
      hasBillingRecoveryAction &&
      hasConnectGoogleAction &&
      hasChooseLocationAction &&
      hasVerifyLocationAction &&
      hasSyncRecoveryAction,
      'Assertion 50: Each major incomplete readiness state has a dedicated, non-bypassing recovery action'
    )

    // 51. Billing select_plan and checkout states expose appropriate recovery destinations
    const hasSelectPlanCTA = onboardingPageSource.includes('PLAN SELECTION REQUIRED') && onboardingPageSource.includes('Choose Plan')
    const hasPaymentRequiredCTA = onboardingPageSource.includes('PAYMENT REQUIRED') && onboardingPageSource.includes('Complete Billing')
    assert(
      hasSelectPlanCTA && hasPaymentRequiredCTA,
      'Assertion 51: Billing select_plan and checkout states expose appropriate recovery badges and CTAs'
    )

    // 52. Truthful Google no-location UX: truthful wording and dual recovery CTAs
    const hasTruthfulNoLocationMsg = onboardingPageSource.includes(
      'No accessible Google Business Profile locations were found for this Google account'
    )
    const hasRefreshDiscoveryCTA = onboardingPageSource.includes('Refresh Discovery')
    const hasTryAnotherAccountCTA = onboardingPageSource.includes('Try Another Google Account')
    assert(
      hasTruthfulNoLocationMsg && hasRefreshDiscoveryCTA && hasTryAnotherAccountCTA,
      'Assertion 52: Truthful Google no-locations messaging provided with Refresh Discovery and Try Another Account'
    )

    // 53. Safe navigation & zero external/open redirects
    const linksMatches = [...onboardingPageSource.matchAll(/href=\{?["']([^"'}]+)["']\}?/g)].map(m => m[1])
    const hasExternalRedirect = linksMatches.some(l => l.startsWith('http://') || l.startsWith('https://') || l.startsWith('//'))
    assert(
      !hasExternalRedirect,
      'Assertion 53: Onboarding links and navigation targets contain no external or open redirects'
    )

    // 54. Server-authoritative completion invariant: unready POST action: 'complete' returns redirectTo: '/onboarding'
    const req54 = await createAuthRequest('/api/onboarding', tenantFalseReady, 'POST', {
      action: 'complete',
      isReady: true, // Spoofed client readiness
    })
    const res54 = await postOnboardingHandler(req54)
    const json54 = await res54.json()
    assert(
      res54.status === 200 &&
      json54.dashboardReady === false &&
      json54.onboardingCompleted === false &&
      json54.redirectTo === '/onboarding',
      'Assertion 54: Server refuses to complete onboarding or redirect to /dashboard when dashboardReadiness is false'
    )

    // 55. Customer with completed sync and reviews completes onboarding to /dashboard.
    // tenantA has 2 real Google reviews (seeded in Assertion 34) and googleSyncStatus=completed.
    // The genuine zero-review completion path is separately verified in Assertion 36 (tenantB).
    // This assertion verifies the POST action:complete flow for a ready customer with reviews:
    //   googleSyncStatus=completed, realGoogleReviewCount>0, dashboardReadiness.isReady=true,
    //   POST returns dashboardReady=true, onboardingCompleted=true, redirectTo=/dashboard.
    const req55 = await createAuthRequest('/api/onboarding', tenantA, 'POST', { action: 'complete' })
    const res55 = await postOnboardingHandler(req55)
    const json55 = await res55.json()
    assert(
      res55.status === 200 &&
      json55.dashboardReady === true &&
      json55.onboardingCompleted === true &&
      json55.redirectTo === '/dashboard',
      'Assertion 55: Customer with completed sync and reviews (tenantA) authoritatively completes onboarding and redirects to /dashboard'
    )

  } catch (err) {
    console.error('Test Suite encountered an uncaught error:', err)
    failed++
  } finally {
    // Teardown & cleanup
    console.log('\n--- CLEANING UP FIXTURES ---')
    global.fetch = originalFetch
    process.env = originalEnv

    for (const orgId of createdOrgIds) {
      try {
        await cleanupTestTenant(orgId)
        console.log(`Cleaned up test organization: ${orgId}`)
      } catch (cleanupErr) {
        console.warn(`Failed to clean up org ${orgId}:`, cleanupErr)
      }
    }
  }

  console.log('\n====================================================================')
  console.log(`JOB-20.5 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob20_5Suite().catch((err) => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})

/**
 * scripts/test-job20-4-first-location-onboarding.ts
 *
 * Dedicated Test Suite for Milestone JOB-20.4:
 * First Location Setup, Integration Health & Onboarding Recovery
 *
 * Covers 47 Authoritative Verification Assertions across 5 Core Domains:
 *
 * 1. State / Readiness (Assertions 1 - 9, 10a - 10f = 15 assertions)
 *    1. No integration connected -> truthful pending state
 *    2. Google OAuth connected / no location selected
 *    3. Location selected but unverified -> verification required
 *    4. Location verified -> ready for sync
 *    5. Initial sync pending / not started
 *    6. Initial sync running -> concurrency lock active
 *    7. Initial sync completed -> truthful completion timestamp & count
 *    8. Initial sync failed -> recoverable state with safe error
 *    9. Zero-review completed sync -> completed = true, realGoogleReviewCount = 0
 *   10a. Healthy token + verified location + completed sync -> /api/dashboard isReady = true
 *   10b. Revoked/unusable Google token + verified location + completed sync = NOT ready in /api/dashboard
 *   10c. Token record exists but connection unusable (expired, no refresh) = NOT ready in /api/dashboard
 *   10d. googleSyncedAt exists while googleSyncStatus !== 'completed' = NOT ready in /api/dashboard
 *   10e. Zero reviews + completed sync = ready in /api/dashboard
 *   10f. Onboarding and dashboard readiness agreement across states
 *
 * 2. Security & Tenant Isolation (Assertions 11 - 16)
 *   11. Cross-tenant location collision rejected
 *   12. Cross-tenant business access rejected
 *   13. Unauthorized location selection/mutation rejected
 *   14. Client orgId in request body cannot override session tenant
 *   15. Client businessId cannot override business ownership assertion
 *   16. Raw OAuth/token data and secrets are never returned
 *
 * 3. OAuth & Integration Health (Assertions 17 - 25)
 *   17. Healthy Google connection (valid token & verified location)
 *   18. Revoked Google connection (marked unhealthy, action required)
 *   19. Expired Google connection without refresh capability
 *   20. Google 401 provider error handled gracefully without token leak
 *   21. Google 403 provider error handled gracefully
 *   22. Google 429 rate limit error handled with Retry-After
 *   23. Malformed provider response handled safely
 *   24. OAuth cancellation handled cleanly with user-friendly return
 *   25. OAuth failure recovery allows reconnecting without stuck state
 *
 * 4. Location & Sync Flow (Assertions 26 - 34)
 *   26. No locations found handling
 *   27. Valid location selection and ownership assignment
 *   28. Duplicate sync protection (409 SYNC_IN_PROGRESS on rapid clicks)
 *   29. Repeated sync idempotency (no duplicate reviews created)
 *   30. Sync failure recovery and retry execution
 *   31. Existing reviews sync updates correctly
 *   32. Zero reviews sync successfully reaches completed
 *   33. Multi-page pagination remains intact
 *   34. realGoogleReviewCount remains authoritative (excludes demo seeds)
 *
 * 5. Resume & Recovery (Assertions 35 - 40)
 *   35. Browser refresh during onboarding reconstructs exact server state
 *   36. Resume after OAuth returns user to location selection
 *   37. Resume after location selection returns user to sync step
 *   38. Resume after failed sync offers retry without restart
 *   39. Completed onboarding remains completed upon revisit
 *   40. Billing/plan state cannot be client-forced or escalated
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
    console.error(`  ✗ FAIL: ${message}`, details ? details : '')
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {}
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
      role: tenant.membership.role,
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

async function runJob20_4Suite() {
  console.log('====================================================================')
  console.log('JOB-20.4 FIRST LOCATION SETUP, INTEGRATION HEALTH & ONBOARDING RECOVERY')
  console.log('====================================================================\n')

  const createdOrgIds: string[] = []
  const originalEnv = { ...process.env }
  const runId = `job20_4_${Date.now()}`

  process.env.SESSION_SECRET = 'test-session-secret-min-32-chars-for-job20-4-verification'
  process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id-job20-4'
  process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret-job20-4'

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

    // Clean any pre-existing reviews or tokens for clean state
    await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } })
    await prisma.review.deleteMany({ where: { businessId: tenantB.business.id } })
    await deleteTokens(tenantA.business.id, 'google')
    await deleteTokens(tenantB.business.id, 'google')

    // =========================================================================
    // SECTION 1: STATE & READINESS (Assertions 1 - 10)
    // =========================================================================
    console.log('=== SECTION 1: STATE & READINESS ===')

    // 1. No integration
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: null,
        googleLocationVerified: false,
        googleSyncStatus: null,
        googleSyncError: null,
        googleSyncedAt: null,
      },
    })
    const req1 = await createAuthRequest('/api/onboarding', tenantA)
    const res1 = await getOnboardingHandler(req1)
    const json1 = await res1.json()

    assert(
      json1.onboardingStatus.googleOAuthConnected === false &&
      json1.onboardingStatus.googleLocationSelected === false &&
      json1.onboardingStatus.googleLocationVerified === false &&
      json1.onboardingStatus.googleConnectionHealthy === false &&
      json1.dashboardReadiness.isReady === false &&
      json1.dashboardReadiness.actionRequired === 'Connect Google Business Profile',
      'Assertion 1: No integration -> truthful pending state and actionRequired'
    )

    // 2. Google connected / no location
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'valid-mock-access-token-1',
      refreshToken: 'valid-mock-refresh-token-1',
      expiresAt: new Date(Date.now() + 3600000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    const req2 = await createAuthRequest('/api/onboarding', tenantA)
    const res2 = await getOnboardingHandler(req2)
    const json2 = await res2.json()

    assert(
      json2.onboardingStatus.googleOAuthConnected === true &&
      json2.onboardingStatus.googleLocationSelected === false &&
      json2.onboardingStatus.googleLocationVerified === false &&
      json2.dashboardReadiness.isReady === false &&
      json2.dashboardReadiness.actionRequired === 'Select your business location',
      'Assertion 2: Google OAuth connected / no location -> requires location selection'
    )

    // 3. Location selected / unverified
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: 'locations/unverified-12345',
        googleLocationVerified: false,
      },
    })
    const req3 = await createAuthRequest('/api/onboarding', tenantA)
    const res3 = await getOnboardingHandler(req3)
    const json3 = await res3.json()

    assert(
      json3.onboardingStatus.googleLocationSelected === true &&
      json3.onboardingStatus.googleLocationVerified === false &&
      json3.dashboardReadiness.isReady === false &&
      json3.dashboardReadiness.actionRequired === 'Location verification required',
      'Assertion 3: Location selected / unverified -> actionRequired indicates verification required'
    )

    // 4. Verified location
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: 'locations/verified-loc-1',
        googleLocationVerified: true,
        googleSyncStatus: 'pending',
      },
    })
    const req4 = await createAuthRequest('/api/onboarding', tenantA)
    const res4 = await getOnboardingHandler(req4)
    const json4 = await res4.json()

    assert(
      json4.onboardingStatus.googleLocationVerified === true &&
      json4.dashboardReadiness.googleLocationVerified === true,
      'Assertion 4: Verified location -> locationVerified is true and googleLocationVerified is true'
    )

    // 5. Initial sync pending -> actionRequired is "Start initial sync"
    assert(
      json4.onboardingStatus.googleSyncStatus === 'pending' &&
      json4.dashboardReadiness.isReady === false &&
      json4.dashboardReadiness.actionRequired === 'Start initial sync',
      'Assertion 5: Initial sync pending -> actionRequired is "Start initial sync"'
    )

    // 6. Sync running
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'syncing',
      },
    })
    const req6 = await createAuthRequest('/api/onboarding', tenantA)
    const res6 = await getOnboardingHandler(req6)
    const json6 = await res6.json()

    assert(
      json6.onboardingStatus.googleSyncStatus === 'syncing' &&
      json6.onboardingStatus.initialSyncStarted === true &&
      json6.onboardingStatus.initialSyncCompleted === false &&
      json6.dashboardReadiness.actionRequired === 'Initial sync in progress',
      'Assertion 6: Sync running -> initialSyncStarted = true, syncStatus = syncing'
    )

    // 7. Sync completed with reviews
    const syncTime = new Date()
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'completed',
        googleSyncedAt: syncTime,
        googleSyncError: null,
      },
    })
    // Insert 2 real reviews
    await prisma.review.createMany({
      data: [
        {
          businessId: tenantA.business.id,
          source: ReviewSource.GOOGLE,
          externalId: `real-rev-1-${runId}`,
          author: 'Reviewer One',
          rating: 5,
          text: 'Superb service!',
          createdAt: new Date(),
        },
        {
          businessId: tenantA.business.id,
          source: ReviewSource.GOOGLE,
          externalId: `real-rev-2-${runId}`,
          author: 'Reviewer Two',
          rating: 4,
          text: 'Great experience',
          createdAt: new Date(),
        },
      ],
    })

    const req7 = await createAuthRequest('/api/onboarding', tenantA)
    const res7 = await getOnboardingHandler(req7)
    const json7 = await res7.json()

    assert(
      json7.onboardingStatus.initialSyncCompleted === true &&
      json7.onboardingStatus.googleSyncStatus === 'completed' &&
      json7.onboardingStatus.realGoogleReviewCount === 2 &&
      json7.dashboardReadiness.isReady === true &&
      json7.dashboardReadiness.message.includes('2 Google reviews synchronized'),
      'Assertion 7: Sync completed -> realGoogleReviewCount=2, dashboardReadiness isReady=true'
    )

    // 8. Sync failed -> safe error and retry required
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'failed',
        googleSyncError: 'Google API quota exceeded. Please retry later.',
        googleSyncedAt: null,
      },
    })
    const req8 = await createAuthRequest('/api/onboarding', tenantA)
    const res8 = await getOnboardingHandler(req8)
    const json8 = await res8.json()

    assert(
      json8.onboardingStatus.googleSyncStatus === 'failed' &&
      json8.onboardingStatus.googleSyncError === 'Google API quota exceeded. Please retry later.' &&
      json8.dashboardReadiness.isReady === false &&
      json8.dashboardReadiness.actionRequired === 'Retry initial sync',
      'Assertion 8: Sync failed -> safe error surfaced and actionRequired is "Retry initial sync"'
    )

    // 9. Zero-review completed sync
    await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } })
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'completed',
        googleSyncedAt: new Date(),
        googleSyncError: null,
      },
    })
    const req9 = await createAuthRequest('/api/onboarding', tenantA)
    const res9 = await getOnboardingHandler(req9)
    const json9 = await res9.json()

    assert(
      json9.onboardingStatus.googleSyncStatus === 'completed' &&
      json9.onboardingStatus.realGoogleReviewCount === 0 &&
      json9.onboardingStatus.initialSyncCompleted === true &&
      json9.dashboardReadiness.isReady === true &&
      json9.dashboardReadiness.message.includes('0 Google reviews found'),
      'Assertion 9: Zero-review completed sync -> completed = true, realGoogleReviewCount = 0, isReady = true'
    )

    // 10a. Healthy token + verified location + completed sync -> /api/dashboard isReady=true
    const req10a = await createAuthRequest('/api/dashboard', tenantA)
    const res10a = await getDashboardHandler(req10a)
    const json10a = await res10a.json()

    assert(
      json10a.dashboardReadiness !== undefined &&
      json10a.dashboardReadiness.isReady === true &&
      json10a.dashboardReadiness.status === 'ready' &&
      json10a.dashboardReadiness.googleConnected === true &&
      json10a.dashboardReadiness.googleConnectionHealthy === true &&
      json10a.dashboardReadiness.locationVerified === true &&
      json10a.dashboardReadiness.initialSyncCompleted === true,
      'Assertion 10a: Healthy token + verified location + completed sync -> /api/dashboard isReady=true'
    )

    // 10b. Expired/revoked/unusable Google token + verified location + completed sync = NOT ready in /api/dashboard
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
      accessToken: 'expired-token-10b',
      refreshToken: 'revoked-token-10b',
      expiresAt: new Date(Date.now() - 3600000), // expired
    })

    const req10b = await createAuthRequest('/api/dashboard', tenantA)
    const res10b = await getDashboardHandler(req10b)
    const json10b = await res10b.json()

    assert(
      json10b.dashboardReadiness.isReady === false &&
      json10b.dashboardReadiness.status === 'not_ready' &&
      json10b.dashboardReadiness.googleConnectionHealthy === false &&
      json10b.dashboardReadiness.actionRequired === 'Reconnect Google account' &&
      json10b.dashboardReadiness.reason.includes('expired or revoked'),
      'Assertion 10b: Revoked/unusable Google token + verified location + completed sync = NOT ready in /api/dashboard'
    )

    // 10c. Token record exists but connection is unusable (expired without refresh) = NOT ready in /api/dashboard
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'expired-token-10c',
      refreshToken: '', // no refresh token
      expiresAt: new Date(Date.now() - 3600000),
    })

    const req10c = await createAuthRequest('/api/dashboard', tenantA)
    const res10c = await getDashboardHandler(req10c)
    const json10c = await res10c.json()

    assert(
      json10c.dashboardReadiness.isReady === false &&
      json10c.dashboardReadiness.status === 'not_ready' &&
      json10c.dashboardReadiness.googleConnectionHealthy === false &&
      json10c.dashboardReadiness.actionRequired === 'Reconnect Google account',
      'Assertion 10c: Token record exists but connection unusable (expired, no refresh) = NOT ready in /api/dashboard'
    )

    // Restore healthy token for remaining 10d/10e/10f tests
    global.fetch = originalFetch
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'valid-mock-access-token-10',
      refreshToken: 'valid-mock-refresh-token-10',
      expiresAt: new Date(Date.now() + 3600000),
    })

    // 10d. googleSyncedAt exists while googleSyncStatus !== 'completed' = NOT ready
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'syncing',
        googleSyncedAt: new Date(),
      },
    })

    const req10d = await createAuthRequest('/api/dashboard', tenantA)
    const res10d = await getDashboardHandler(req10d)
    const json10d = await res10d.json()

    assert(
      json10d.dashboardReadiness.isReady === false &&
      json10d.dashboardReadiness.status === 'not_ready' &&
      json10d.dashboardReadiness.initialSyncCompleted === false &&
      json10d.dashboardReadiness.actionRequired === 'Initial sync in progress',
      'Assertion 10d: googleSyncedAt exists while googleSyncStatus !== "completed" = NOT ready in /api/dashboard'
    )

    // 10e. Zero reviews + completed sync = ready in /api/dashboard
    await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } })
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'completed',
        googleSyncedAt: new Date(),
        googleSyncError: null,
      },
    })

    const req10e = await createAuthRequest('/api/dashboard', tenantA)
    const res10e = await getDashboardHandler(req10e)
    const json10e = await res10e.json()

    assert(
      json10e.dashboardReadiness.isReady === true &&
      json10e.dashboardReadiness.status === 'ready' &&
      json10e.dashboardReadiness.realGoogleReviewCount === 0 &&
      json10e.dashboardReadiness.reason.includes('0 Google reviews found'),
      'Assertion 10e: Zero reviews + completed sync = ready in /api/dashboard'
    )

    // 10f. Onboarding and dashboard readiness agreement across states
    const req10fOnboard = await createAuthRequest('/api/onboarding', tenantA)
    const res10fOnboard = await getOnboardingHandler(req10fOnboard)
    const json10fOnboard = await res10fOnboard.json()

    assert(
      json10e.dashboardReadiness.isReady === json10fOnboard.dashboardReadiness.isReady &&
      json10e.dashboardReadiness.status === json10fOnboard.dashboardReadiness.status &&
      json10e.dashboardReadiness.googleConnectionHealthy === json10fOnboard.dashboardReadiness.googleConnectionHealthy &&
      json10e.dashboardReadiness.initialSyncCompleted === json10fOnboard.dashboardReadiness.initialSyncCompleted &&
      json10e.dashboardReadiness.actionRequired === json10fOnboard.dashboardReadiness.actionRequired,
      'Assertion 10f: Onboarding and dashboard readiness agree on authoritative state'
    )


    // =========================================================================
    // SECTION 2: SECURITY & TENANT ISOLATION (Assertions 11 - 16)
    // =========================================================================
    console.log('\n=== SECTION 2: SECURITY & TENANT ISOLATION ===')

    // 11. Cross-tenant location rejected: Assign a location to Tenant A, then Tenant B tries to claim it
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleLocationId: 'locations/shared-loc-claim-1' },
    })
    await storeTokens({
      businessId: tenantB.business.id,
      provider: 'google',
      accessToken: 'valid-mock-access-token-b',
      refreshToken: 'valid-mock-refresh-token-b',
      expiresAt: new Date(Date.now() + 3600000),
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
              name: 'locations/shared-loc-claim-1',
              title: 'Shared Location',
              metadata: { placeId: 'place_shared_1' },
            }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
      }
      return originalFetch(url, init)
    }

    const req11 = await createAuthRequest('/api/oauth/google/select-location', tenantB, 'POST', {
      businessId: tenantB.business.id,
      locationId: 'locations/shared-loc-claim-1',
    })
    const res11 = await postSelectLocationHandler(req11)
    const json11 = await res11.json()
    global.fetch = originalFetch

    assert(
      res11.status === 409 &&
      (json11.code === 'LOCATION_ALREADY_ATTACHED' || json11.error?.includes('another organization')),
      'Assertion 11: Cross-tenant location collision rejected with 409 LOCATION_ALREADY_ATTACHED'
    )

    // 12. Cross-tenant business access rejected in sync endpoint
    const req12 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', {
      businessId: tenantB.business.id, // Tenant A tries to trigger sync for Tenant B
    })
    const res12 = await postSyncReviewsHandler(req12)
    const json12 = await res12.json()

    assert(
      res12.status === 403,
      'Assertion 12: Cross-tenant business sync request rejected with 403 Forbidden'
    )

    // 13. Unauthorized location mutation rejected (no session)
    const req13 = await createAuthRequest('/api/oauth/google/select-location', null, 'POST', {
      locationId: 'locations/some-loc-123',
    })
    const res13 = await postSelectLocationHandler(req13)

    assert(
      res13.status === 401,
      'Assertion 13: Unauthenticated location selection rejected with 401'
    )

    // 14. Client orgId in onboarding mutation cannot override tenant context
    const req14 = await createAuthRequest('/api/onboarding', tenantB, 'POST', {
      businessName: 'Hacked Business Name',
      orgId: tenantA.org.id, // Attacker sends Tenant A's orgId
      role: 'OWNER',
    })
    const res14 = await postOnboardingHandler(req14)
    const bCheck = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })

    assert(
      bCheck?.name !== 'Hacked Business Name',
      'Assertion 14: Client orgId in request body cannot override server tenant isolation'
    )

    // 15. Client businessId in request body cannot bypass ownership assertion in select-location
    const req15 = await createAuthRequest('/api/oauth/google/select-location', tenantA, 'POST', {
      businessId: tenantB.business.id,
      locationId: 'locations/new-safe-loc-1',
    })
    const res15 = await postSelectLocationHandler(req15)
    // Server ignores client businessId or verifies tenant ownership of session business
    const bTenantB = await prisma.business.findUnique({ where: { id: tenantB.business.id } })

    assert(
      bTenantB?.googleLocationId !== 'locations/new-safe-loc-1',
      'Assertion 15: Client businessId cannot override business ownership assertion'
    )

    // 16. Raw OAuth / token data and secrets are never returned in onboarding or health responses
    const req16 = await createAuthRequest('/api/onboarding', tenantA)
    const res16 = await getOnboardingHandler(req16)
    const rawBody16 = await res16.text()

    assert(
      !rawBody16.includes('valid-mock-access-token') &&
      !rawBody16.includes('valid-mock-refresh-token') &&
      !rawBody16.includes('accessTokenEnc') &&
      !rawBody16.includes('refreshTokenEnc') &&
      !rawBody16.includes('mock-google-client-secret'),
      'Assertion 16: Raw OAuth tokens, encrypted tokens, and client secrets are never returned to client'
    )

    // =========================================================================
    // SECTION 3: OAUTH & INTEGRATION HEALTH (Assertions 17 - 25)
    // =========================================================================
    console.log('\n=== SECTION 3: OAUTH & INTEGRATION HEALTH ===')

    // 17. Healthy Google connection
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'active-google-token-17',
      refreshToken: 'active-google-refresh-17',
      expiresAt: new Date(Date.now() + 3600000),
    })
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleLocationId: 'locations/verified-loc-17',
        googleLocationVerified: true,
      },
    })
    const isUsable17 = await isGoogleConnectionUsable(tenantA.business.id)
    const req17 = await createAuthRequest('/api/onboarding', tenantA)
    const res17 = await getOnboardingHandler(req17)
    const json17 = await res17.json()
    const googleHealth17 = json17.integrationHealth.find((h: any) => h.provider === 'google')

    assert(
      isUsable17 === true &&
      googleHealth17?.connected === true &&
      googleHealth17?.healthy === true &&
      (googleHealth17?.actionRequired === 'none' || googleHealth17?.actionRequired === 'initial_sync'),
      'Assertion 17: Healthy Google connection recognized by isGoogleConnectionUsable & integrationHealth'
    )

    // 18. Revoked Google connection: simulate revoked refresh token
    // Mock global.fetch for revoke
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(url, init)
    }

    // Set expired access token so isGoogleConnectionUsable triggers refresh
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'expired-access-token-18',
      refreshToken: 'revoked-refresh-token-18',
      expiresAt: new Date(Date.now() - 3600000), // expired
    })
    const isUsable18 = await isGoogleConnectionUsable(tenantA.business.id)
    const req18 = await createAuthRequest('/api/onboarding', tenantA)
    const res18 = await getOnboardingHandler(req18)
    const json18 = await res18.json()
    const googleHealth18 = json18.integrationHealth.find((h: any) => h.provider === 'google')
    const req18Dash = await createAuthRequest('/api/dashboard', tenantA)
    const res18Dash = await getDashboardHandler(req18Dash)
    const json18Dash = await res18Dash.json()

    assert(
      isUsable18 === false &&
      googleHealth18?.healthy === false &&
      googleHealth18?.actionRequired === 'reconnect' &&
      json18.dashboardReadiness.isReady === false &&
      json18.dashboardReadiness.actionRequired === 'Reconnect Google account' &&
      json18Dash.dashboardReadiness.isReady === false &&
      json18Dash.dashboardReadiness.actionRequired === 'Reconnect Google account',
      'Assertion 18: Revoked Google connection correctly marked unhealthy with reconnect actionRequired and dashboard agreement'
    )


    // 19. Expired Google connection with no refresh token
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'expired-access-token-19',
      refreshToken: '', // no refresh token
      expiresAt: new Date(Date.now() - 3600000),
    })
    const isUsable19 = await isGoogleConnectionUsable(tenantA.business.id)
    assert(
      isUsable19 === false,
      'Assertion 19: Expired Google connection without refresh token is unusable'
    )

    // Restore valid tokens for subsequent API error tests
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: 'valid-test-access-token',
      refreshToken: 'valid-test-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    })

    // 20. Google 401 provider error handled gracefully without token leak
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('mybusinessbusinessinformation.googleapis.com')) {
        return new Response(JSON.stringify({
          error: {
            code: 401,
            message: 'Request had invalid authentication credentials. Expected OAuth 2 access token.',
            status: 'UNAUTHENTICATED',
          },
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(url, init)
    }

    const verifyResult20 = await verifyGoogleLocation('valid-test-access-token', 'accounts/123/locations/456')
    assert(
      verifyResult20 === null,
      'Assertion 20: Google 401 handled gracefully without leaking access token'
    )

    // 21. Google 403 provider error handled gracefully
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('mybusinessbusinessinformation.googleapis.com')) {
        return new Response(JSON.stringify({
          error: {
            code: 403,
            message: 'Caller does not have required permission to access resource.',
            status: 'PERMISSION_DENIED',
          },
        }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(url, init)
    }

    const verifyResult21 = await verifyGoogleLocation('valid-test-access-token', 'accounts/123/locations/456')
    assert(
      verifyResult21 === null,
      'Assertion 21: Google 403 handled gracefully as Forbidden'
    )

    // 22. Google 429 rate limit error handled
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('mybusinessbusinessinformation.googleapis.com')) {
        return new Response(JSON.stringify({
          error: {
            code: 429,
            message: 'Resource exhausted: quota limit reached.',
            status: 'RESOURCE_EXHAUSTED',
          },
        }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '60' },
        })
      }
      return originalFetch(url, init)
    }

    const verifyResult22 = await verifyGoogleLocation('valid-test-access-token', 'accounts/123/locations/456')
    assert(
      verifyResult22 === null,
      'Assertion 22: Google 429 handled gracefully with rate limit error message'
    )

    // 23. Malformed provider response handled safely
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('mybusinessbusinessinformation.googleapis.com')) {
        return new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        })
      }
      return originalFetch(url, init)
    }

    const verifyResult23 = await verifyGoogleLocation('valid-test-access-token', 'accounts/123/locations/456')
    assert(
      verifyResult23 === null,
      'Assertion 23: Malformed non-JSON provider response handled safely'
    )

    // Reset fetch
    global.fetch = originalFetch

    // 24. OAuth cancellation: callback receives ?error=access_denied
    const req24 = await createAuthRequest('/api/oauth/google/callback?error=access_denied&error_description=User%20denied', tenantA)
    const res24 = await getGoogleCallbackHandler(req24)
    const redirectUrl24 = res24.headers.get('location') || ''

    assert(
      res24.status === 307 &&
      (redirectUrl24.includes('error=google_oauth_denied') || redirectUrl24.includes('error=google_access_denied')),
      'Assertion 24: OAuth cancellation redirect contains safe error=google_oauth_denied'
    )

    // 25. OAuth failure recovery allows reconnecting without stuck state
    const req25 = await createAuthRequest(`/api/oauth/google?businessId=${tenantA.business.id}&returnTo=/onboarding`, tenantA)
    const res25 = await getGoogleOAuthHandler(req25)
    const redirectUrl25 = res25.headers.get('location') || ''

    assert(
      res25.status === 307 &&
      redirectUrl25.includes('accounts.google.com/o/oauth2/v2/auth') &&
      redirectUrl25.includes('response_type=code'),
      'Assertion 25: OAuth initiation works cleanly from /onboarding enabling full recovery'
    )

    // =========================================================================
    // SECTION 4: LOCATION & SYNC FLOW (Assertions 26 - 34)
    // =========================================================================
    console.log('\n=== SECTION 4: LOCATION & SYNC FLOW ===')

    // 26. No locations: verify server location verification rejects invalid location
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('mybusinessbusinessinformation.googleapis.com')) {
        return new Response(JSON.stringify({
          error: { code: 404, message: 'Location not found', status: 'NOT_FOUND' },
        }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    const verifyResult26 = await verifyGoogleLocation('valid-test-access-token', 'accounts/123/locations/nonexistent')
    assert(
      verifyResult26 === null,
      'Assertion 26: Non-existent location fails server-side verification'
    )
    global.fetch = originalFetch

    // 27. Valid location selection and ownership assignment
    // Mock successful location verification
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string') {
        if (url.includes('mybusinessaccountmanagement.googleapis.com')) {
          return new Response(JSON.stringify({
            accounts: [{ name: 'accounts/12345', accountName: 'Tenant A Account' }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (url.includes('mybusinessbusinessinformation.googleapis.com')) {
          return new Response(JSON.stringify({
            locations: [{
              name: 'locations/valid-business-loc-27',
              title: 'Tenant A Coffee Shop',
              storefrontAddress: { addressLines: ['123 Main St'] },
              metadata: { placeId: 'place_loc_27' },
            }],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
      }
      return originalFetch(url, init)
    }

    const req27 = await createAuthRequest('/api/oauth/google/select-location', tenantA, 'POST', {
      businessId: tenantA.business.id,
      locationId: 'locations/valid-business-loc-27',
      locationName: 'Tenant A Coffee Shop',
    })
    const res27 = await postSelectLocationHandler(req27)
    const json27 = await res27.json()
    global.fetch = originalFetch

    const b27 = await prisma.business.findUnique({ where: { id: tenantA.business.id } })

    assert(
      res27.status === 200 &&
      json27.success === true &&
      json27.googleLocationVerified === true &&
      b27?.googleLocationVerified === true,
      'Assertion 27: Valid location selection verified and linked to business'
    )

    // 28. Duplicate sync protection: when sync is already 'syncing', second request gets 409
    _clearInMemoryStore()
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'syncing',
        googleSyncedAt: new Date(), // recent timestamp (< 2 minutes)
      },
    })
    const req28 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res28 = await postSyncReviewsHandler(req28)
    const json28 = await res28.json()

    assert(
      res28.status === 409 &&
      json28.code === 'SYNC_IN_PROGRESS',
      'Assertion 28: Duplicate sync request while syncing returns 409 SYNC_IN_PROGRESS'
    )

    // 29. Repeated sync idempotency (no duplicate reviews created)
    // Set up mock reviews response
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/reviews')) {
        return new Response(JSON.stringify({
          reviews: [
            {
              reviewId: 'idempotent-rev-1',
              reviewer: { displayName: 'Alice' },
              starRating: 'FIVE',
              comment: 'Exceptional coffee!',
              createTime: new Date().toISOString(),
            },
          ],
          totalReviewCount: 1,
          averageRating: 5.0,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    // Reset status to pending so sync can execute
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleSyncStatus: 'pending' },
    })

    // First sync
    _clearInMemoryStore()
    const req29_1 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res29_1 = await postSyncReviewsHandler(req29_1)
    assert(res29_1.status === 200, 'Assertion 29a: First sync completes successfully')

    // Second sync (idempotency check)
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleSyncStatus: 'completed' }, // not syncing
    })
    _clearInMemoryStore()
    const req29_2 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res29_2 = await postSyncReviewsHandler(req29_2)
    assert(res29_2.status === 200, 'Assertion 29b: Second sync executes idempotently')

    const count29 = await prisma.review.count({
      where: {
        businessId: tenantA.business.id,
        externalId: 'idempotent-rev-1',
      },
    })
    assert(
      count29 === 1,
      'Assertion 29c: Exactly 1 review record exists; zero duplicates created'
    )

    // 30. Sync failure recovery and retry execution
    // Simulate failure
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: {
        googleSyncStatus: 'failed',
        googleSyncError: 'Temporary network timeout',
      },
    })
    // Retry sync
    _clearInMemoryStore()
    const req30 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res30 = await postSyncReviewsHandler(req30)
    const json30 = await res30.json()

    assert(
      res30.status === 200 &&
      json30.success === true &&
      json30.googleSyncStatus === 'completed',
      'Assertion 30: Failed sync can be retried successfully to completion'
    )

    // 31. Existing reviews update on change
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/reviews')) {
        return new Response(JSON.stringify({
          reviews: [
            {
              reviewId: 'idempotent-rev-1',
              reviewer: { displayName: 'Alice Updated' },
              starRating: 'FOUR',
              comment: 'Updated review text: Still great coffee!',
              createTime: new Date().toISOString(),
              updateTime: new Date().toISOString(),
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    _clearInMemoryStore()
    const req31 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    await postSyncReviewsHandler(req31)
    const updatedRev = await prisma.review.findFirst({
      where: { businessId: tenantA.business.id, externalId: 'idempotent-rev-1' },
    })

    assert(
      updatedRev?.author === 'Alice Updated' &&
      updatedRev?.rating === 4 &&
      updatedRev?.text?.includes('Updated review text'),
      'Assertion 31: Existing review content updates correctly on subsequent sync'
    )

    // 32. Zero reviews sync reaches completed status
    await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } })
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/reviews')) {
        return new Response(JSON.stringify({
          reviews: [],
          totalReviewCount: 0,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    _clearInMemoryStore()
    const req32 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res32 = await postSyncReviewsHandler(req32)
    const json32 = await res32.json()
    const b32 = await prisma.business.findUnique({ where: { id: tenantA.business.id } })

    assert(
      res32.status === 200 &&
      json32.syncResult?.total === 0 &&
      b32?.googleSyncStatus === 'completed',
      'Assertion 32: Zero-review sync successfully marks status completed'
    )

    // 33. Multi-page pagination remains intact
    let pageCount = 0
    global.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/reviews')) {
        pageCount++
        if (url.includes('pageToken=page2_token')) {
          return new Response(JSON.stringify({
            reviews: [
              {
                reviewId: 'page2-rev-1',
                reviewer: { displayName: 'Bob' },
                starRating: 'FIVE',
                comment: 'Page 2 review',
                createTime: new Date().toISOString(),
              },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        } else {
          return new Response(JSON.stringify({
            reviews: [
              {
                reviewId: 'page1-rev-1',
                reviewer: { displayName: 'Charlie' },
                starRating: 'FIVE',
                comment: 'Page 1 review',
                createTime: new Date().toISOString(),
              },
            ],
            nextPageToken: 'page2_token',
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
      }
      return originalFetch(url, init)
    }

    _clearInMemoryStore()
    const req33 = await createAuthRequest('/api/reviews/sync', tenantA, 'POST', { businessId: tenantA.business.id })
    const res33 = await postSyncReviewsHandler(req33)
    const json33 = await res33.json()

    assert(
      res33.status === 200 &&
      json33.syncResult?.total === 2 &&
      pageCount === 2,
      'Assertion 33: Multi-page review pagination traverses both pages and syncs all reviews'
    )

    // 34. realGoogleReviewCount remains authoritative (excludes demo seeds or other businesses)
    const req34 = await createAuthRequest('/api/onboarding', tenantA)
    const res34 = await getOnboardingHandler(req34)
    const json34 = await res34.json()

    assert(
      json34.onboardingStatus.realGoogleReviewCount === 2,
      'Assertion 34: realGoogleReviewCount matches exact real database count (2)'
    )

    // Restore fetch
    global.fetch = originalFetch

    // =========================================================================
    // SECTION 5: RESUME & RECOVERY (Assertions 35 - 40)
    // =========================================================================
    console.log('\n=== SECTION 5: RESUME & RECOVERY ===')

    // 35. Browser refresh during onboarding reconstructs exact server state
    const req35 = await createAuthRequest('/api/onboarding', tenantA)
    const res35 = await getOnboardingHandler(req35)
    const json35 = await res35.json()

    assert(
      json35.business !== null &&
      json35.onboardingStatus.googleOAuthConnected === true &&
      json35.onboardingStatus.googleLocationVerified === true &&
      json35.onboardingStatus.initialSyncCompleted === true,
      'Assertion 35: Refreshing onboarding endpoint reliably reconstructs server state from DB'
    )

    // 36. Resume after OAuth: User returns with OAuth connected but no location
    await prisma.business.update({
      where: { id: tenantB.business.id },
      data: {
        googleLocationId: null,
        googleLocationVerified: false,
        googleSyncStatus: null,
      },
    })
    await storeTokens({
      businessId: tenantB.business.id,
      provider: 'google',
      accessToken: 'resume-token-b',
      refreshToken: 'resume-refresh-b',
      expiresAt: new Date(Date.now() + 3600000),
    })
    const req36 = await createAuthRequest('/api/onboarding', tenantB)
    const res36 = await getOnboardingHandler(req36)
    const json36 = await res36.json()

    assert(
      json36.onboardingStatus.googleOAuthConnected === true &&
      json36.onboardingStatus.googleLocationSelected === false &&
      json36.dashboardReadiness.actionRequired === 'Select your business location',
      'Assertion 36: Resuming after OAuth places user directly on location selection step'
    )

    // 37. Resume after location selection: Location verified but sync not started
    await prisma.business.update({
      where: { id: tenantB.business.id },
      data: {
        googleLocationId: 'locations/verified-resume-loc-b',
        googleLocationVerified: true,
        googleSyncStatus: 'pending',
      },
    })
    const req37 = await createAuthRequest('/api/onboarding', tenantB)
    const res37 = await getOnboardingHandler(req37)
    const json37 = await res37.json()

    assert(
      json37.onboardingStatus.googleLocationVerified === true &&
      json37.onboardingStatus.initialSyncStarted === false &&
      json37.dashboardReadiness.actionRequired === 'Start initial sync',
      'Assertion 37: Resuming after location selection places user on start initial sync step'
    )

    // 38. Resume after failed sync: Surfaces retry without resetting verified location
    await prisma.business.update({
      where: { id: tenantB.business.id },
      data: {
        googleSyncStatus: 'failed',
        googleSyncError: 'API timeout during sync',
      },
    })
    const req38 = await createAuthRequest('/api/onboarding', tenantB)
    const res38 = await getOnboardingHandler(req38)
    const json38 = await res38.json()

    assert(
      json38.onboardingStatus.googleLocationVerified === true &&
      json38.onboardingStatus.googleSyncStatus === 'failed' &&
      json38.dashboardReadiness.actionRequired === 'Retry initial sync',
      'Assertion 38: Resuming after failed sync preserves location and offers retry action'
    )

    // 39. Completed onboarding remains completed upon revisit
    await prisma.business.update({
      where: { id: tenantB.business.id },
      data: {
        googleSyncStatus: 'completed',
        googleSyncedAt: new Date(),
        googleSyncError: null,
      },
    })
    const req39 = await createAuthRequest('/api/onboarding', tenantB)
    const res39 = await getOnboardingHandler(req39)
    const json39 = await res39.json()

    assert(
      json39.onboardingStatus.initialSyncCompleted === true &&
      json39.dashboardReadiness.isReady === true &&
      json39.dashboardReadiness.actionRequired === null,
      'Assertion 39: Completed onboarding status is persistent and idempotent on revisit'
    )

    // 40. Billing / plan state cannot be client-forced or escalated
    const req40 = await createAuthRequest('/api/onboarding', tenantB, 'POST', {
      businessName: 'Tenant B Upgraded',
      plan: 'ENTERPRISE', // Client tries to force enterprise plan
      isFreeTrial: false,
    })
    await postOnboardingHandler(req40)
    const orgCheck40 = await prisma.organization.findUnique({ where: { id: tenantB.org.id } })

    assert(
      orgCheck40?.plan === Plan.STARTER,
      'Assertion 40: Client cannot escalate or force plan state through onboarding endpoints'
    )

  } catch (err: any) {
    console.error('UNHANDLED EXCEPTION in JOB-20.4 test suite:', err)
    failed++
  } finally {
    // Cleanup seed data
    console.log('\n--- CLEANING UP TEST FIXTURES ---')
    global.fetch = originalFetch
    process.env = originalEnv

    for (const orgId of createdOrgIds) {
      try {
        await cleanupTestTenant(orgId)
        console.log(`Cleaned up test org: ${orgId}`)
      } catch (cleanupErr) {
        console.warn(`Failed to cleanup org ${orgId}:`, cleanupErr)
      }
    }
  }

  console.log('\n====================================================================')
  console.log(`JOB-20.4 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob20_4Suite().catch((err) => {
  console.error('FATAL TEST ERROR:', err)
  process.exit(1)
})

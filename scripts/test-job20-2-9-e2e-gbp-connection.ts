/**
 * scripts/test-job20-2-9-e2e-gbp-connection.ts
 *
 * Targeted regression and integration test suite for JOB-20.2.9:
 * END-TO-END GOOGLE BUSINESS PROFILE CONNECTION & SINGLE-LOCATION RECOVERY
 *
 * Verifies all 9 required verification domains:
 * 1. Google permission denial vs. genuine empty discovery.
 * 2. Discovery upstream errors and v4/direct verification fallback behavior.
 * 3. Existing connection status preservation after discovery failure.
 * 4. Exactly-one-location automatic selection (database persistence, verified flag, audit log).
 * 5. Zero-location and multiple-location behavior.
 * 6. Cross-tenant and unauthorized business selection / collision prevention.
 * 7. Database saturation handling (HTTP 503 DATABASE_POOL_SATURATED across all affected routes).
 * 8. Review sync single-location auto-discovery, collision check, and failure reporting.
 * 9. Frontend resilience: BusinessContext retry on 503, sole business resolution, autoSelected handling.
 */

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { db } from '../src/lib/db'
import { seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { storeTokens } from '../src/lib/oauth-store'
import { isDatabasePoolError, createDatabasePoolResponse } from '../src/lib/db-errors'
import {
  listGoogleAccounts,
  verifyGoogleLocation,
  GoogleApiError,
} from '../src/lib/integrations/google-business-profile'
import { GET as getLocationsHandler } from '../src/app/api/oauth/google/locations/route'
import { POST as selectLocationHandler } from '../src/app/api/oauth/google/select-location/route'
import { POST as syncReviewsHandler } from '../src/app/api/businesses/[id]/sync-reviews/route'
import { GET as getIntegrationsHandler } from '../src/app/api/integrations/route'
import { GET as oauthInitHandler } from '../src/app/api/oauth/google/route'

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ PASS: ${name}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function mockFetch(handler: (input: any, init?: any) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<NextRequest> {
  const reqHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {}),
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

  const init: any = {
    method: options.method || 'GET',
    headers: reqHeaders,
  }

  if (options.body) {
    init.body = JSON.stringify(options.body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

async function runTests() {
  console.log('========================================================================')
  console.log('  JOB-20.2.9: E2E GOOGLE BUSINESS PROFILE CONNECTION & RECOVERY SUITE')
  console.log('========================================================================\n')

  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret'
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-min-32-chars-for-job20-2-9-verification'

  let primaryTenant: TestSeedResult | null = null
  let secondaryTenant: TestSeedResult | null = null

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Database Pool Saturation Helpers & Invariants
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Database Pool Error Classification & 503 Invariants ---')

    const poolErrors = [
      new Error('Connection terminated due to connection limit (EMAXCONNSESSION)'),
      new Error('PrismaClientInitializationError: Timed out fetching a new connection from the pool.'),
      new Error('Timed out acquiring a connection from the pool (P2024)'),
      new Error('remaining connection slots are reserved for non-replication superuser connections'),
      new Error('too many clients already'),
    ]

    for (const err of poolErrors) {
      assert(isDatabasePoolError(err), `Correctly identifies pool error: "${err.message.slice(0, 40)}..."`)
    }

    assert(!isDatabasePoolError(new Error('Record not found')), 'Does not misclassify RecordNotFound as pool error')
    assert(!isDatabasePoolError(new Error('Foreign key constraint failed')), 'Does not misclassify FK error as pool error')
    assert(!isDatabasePoolError(null), 'Does not misclassify null as pool error')

    const poolRes = createDatabasePoolResponse('Custom retry context')
    assert(poolRes.status === 503, 'createDatabasePoolResponse returns HTTP 503')
    const poolResData = await poolRes.json()
    assert(poolResData.code === 'DATABASE_POOL_SATURATED', 'Pool response code is DATABASE_POOL_SATURATED')
    assert(poolResData.retryAfter === 3, 'Pool response contains retryAfter: 3')
    assert(poolResData.error.includes('Custom retry context'), 'Pool response contains contextual error string')

    // Verify Prisma global singleton in db.ts
    const dbFileContent = fs.readFileSync(path.resolve(__dirname, '../src/lib/db.ts'), 'utf-8')
    assert(
      dbFileContent.includes('globalForPrisma.prisma = db') && !dbFileContent.includes('if (process.env.NODE_ENV !== \'production\') globalForPrisma.prisma = db'),
      'src/lib/db.ts assigns global singleton unconditionally for serverless containers'
    )

    // -------------------------------------------------------------------------
    // SECTION 2: Google Discovery Error Categorization & v4 Fallback
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Google Discovery Upstream Error Categorization & Fallback ---')

    const originalFetch = global.fetch

    // Test 2A: Service Disabled 403 categorized as GOOGLE_API_DISABLED
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              status: 'PERMISSION_DENIED',
              message: 'Google My Business API has not been used in project 12345 before or it is disabled. Enable it by visiting...',
              details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
            },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 404 })
    })

    try {
      await listGoogleAccounts('mock-token')
      assert(false, 'Expected listGoogleAccounts to throw on 403 SERVICE_DISABLED')
    } catch (e: any) {
      assert(e instanceof GoogleApiError, 'Throws GoogleApiError on 403')
      assert(e.code === 'GOOGLE_PERMISSION_DENIED', 'Error preserves code for test assertion compatibility')
      assert(e.subcode === 'GOOGLE_API_DISABLED', 'Error subcode identifies GOOGLE_API_DISABLED')
      assert(e.message.includes('required Google Cloud APIs are disabled'), 'Message clearly advises enabling required Cloud APIs')
    }

    // Test 2B: Insufficient Scope categorized as GOOGLE_SCOPE_INSUFFICIENT
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'Request had insufficient authentication scopes.',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    })

    try {
      await listGoogleAccounts('mock-token')
      assert(false, 'Expected listGoogleAccounts to throw on scope error')
    } catch (e: any) {
      assert(e instanceof GoogleApiError, 'Throws GoogleApiError on scope error')
      assert(e.subcode === 'GOOGLE_SCOPE_INSUFFICIENT', 'Error subcode identifies GOOGLE_SCOPE_INSUFFICIENT')
      assert(e.message.includes('missing required permissions'), 'Message clearly advises reconnecting with permissions')
    }

    // Test 2C: v1 404 triggers legacy v4 fallback attempt
    let v4AccountAttempted = false
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com')) {
        return new Response('Not Found', { status: 404 })
      }
      if (url.includes('mybusiness.googleapis.com/v4/accounts')) {
        v4AccountAttempted = true
        return new Response(
          JSON.stringify({
            accounts: [{ name: 'accounts/v4-acc-1', accountName: 'V4 Test Account', type: 'PERSONAL' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 404 })
    })

    const v4Accounts = await listGoogleAccounts('mock-token')
    assert(v4AccountAttempted, 'v1 404 seamlessly triggers v4 fallback attempt')
    assert(v4Accounts.length === 1 && v4Accounts[0].name === 'accounts/v4-acc-1', 'Successfully returns accounts from v4 fallback')

    // Test 2D: Direct location verification fallback in verifyGoogleLocation
    let directLocationFallbackAttempted = false
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
        return new Response(JSON.stringify({ error: { code: 403, message: 'Permission denied on accounts' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('mybusinessbusinessinformation.googleapis.com/v1/locations/loc-direct-999')) {
        directLocationFallbackAttempted = true
        return new Response(
          JSON.stringify({
            name: 'locations/loc-direct-999',
            title: 'Direct Verified Location',
            storefrontAddress: { addressLines: ['100 Main St'] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 404 })
    })

    const directVerified = await verifyGoogleLocation('mock-token', 'loc-direct-999')
    assert(directLocationFallbackAttempted, 'verifyGoogleLocation attempts direct location resource fallback when account traversal is denied')
    assert(directVerified !== null && directVerified.id === 'loc-direct-999', 'Direct fallback successfully verifies location')

    // Restore fetch
    global.fetch = originalFetch

    // -------------------------------------------------------------------------
    // SECTION 3: DB Integration & Tenant Seed
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Seed Isolated Test Tenants ---')

    primaryTenant = await seedTestTenant({
      name: 'Primary GBP Business',
      businessName: 'Primary Test Cafe',
    })
    console.log(`  ✓ Primary tenant created: ${primaryTenant.org.id}`)

    secondaryTenant = await seedTestTenant({
      name: 'Secondary Cross-Tenant Business',
      businessName: 'Secondary Test Diner',
    })
    console.log(`  ✓ Secondary tenant created: ${secondaryTenant.org.id}`)

    // Store mock Google OAuthToken for primary tenant's business using storeTokens
    await storeTokens({
      businessId: primaryTenant.business.id,
      provider: 'google',
      accessToken: 'mock-valid-google-access-token',
      refreshToken: 'mock-valid-google-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })
    console.log('  ✓ Stored valid Google OAuthToken for primary business')

    // -------------------------------------------------------------------------
    // SECTION 4: Single-Location Automatic Selection
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Exactly-One-Location Automatic Selection ---')

    // Mock fetch returning exactly ONE location
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
        return new Response(
          JSON.stringify({
            accounts: [{ name: 'accounts/111111', accountName: 'Solo Business Account', type: 'PERSONAL' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('mybusinessbusinessinformation.googleapis.com/v1/accounts/111111/locations')) {
        return new Response(
          JSON.stringify({
            locations: [
              {
                name: 'locations/solo-loc-12345',
                title: 'Solo Market Cafe',
                storefrontAddress: { addressLines: ['789 Market St'] },
                metadata: { placeId: 'ChIJ_mock_place_solo_123' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 404 })
    })

    const autoSelectReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const autoSelectRes = await getLocationsHandler(autoSelectReq)
    assert(autoSelectRes.status === 200, 'GET /api/oauth/google/locations returns HTTP 200')
    const autoSelectData = await autoSelectRes.json()

    assert(autoSelectData.autoSelected === true, 'Response marks autoSelected: true')
    assert(autoSelectData.selectedLocation?.locationId?.includes('solo-loc-12345'), 'selectedLocation contains correct locationId')
    assert(autoSelectData.selectedLocation?.locationTitle === 'Solo Market Cafe', 'selectedLocation contains correct locationTitle')

    // Verify database state: business has googleLocationId, googlePlaceId, googleLocationVerified
    const updatedBiz = await db.business.findUnique({
      where: { id: primaryTenant.business.id },
    })
    assert(Boolean(updatedBiz?.googleLocationId?.includes('solo-loc-12345')), 'Database persisted googleLocationId on business')
    assert(updatedBiz?.googlePlaceId === 'ChIJ_mock_place_solo_123', 'Database persisted googlePlaceId')
    assert(updatedBiz?.googleLocationVerified === true, 'Database set googleLocationVerified: true')

    // Verify audit log entry
    const auditLogs = await db.auditLog.findMany({
      where: {
        targetId: primaryTenant.business.id,
        action: 'google.location_verified',
      },
    })
    assert(auditLogs.length > 0, 'Audit event google.location_verified recorded')

    // -------------------------------------------------------------------------
    // SECTION 5: Zero-Location and Multiple-Location Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Zero-Location and Multiple-Location Non-Selection ---')

    // Reset business location
    await db.business.update({
      where: { id: primaryTenant.business.id },
      data: { googleLocationId: 'google_connected', googleLocationVerified: false },
    })

    // Mock 0 locations
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
        return new Response(
          JSON.stringify({
            accounts: [{ name: 'accounts/111111', accountName: 'Empty Account', type: 'PERSONAL' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('locations')) {
        return new Response(JSON.stringify({ locations: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    })

    const zeroLocReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const zeroLocRes = await getLocationsHandler(zeroLocReq)
    const zeroLocData = await zeroLocRes.json()
    assert(zeroLocRes.status === 200, 'Zero locations returns HTTP 200 (not error)')
    assert(zeroLocData.emptyReason === 'NO_LOCATIONS', 'Zero locations returns emptyReason: NO_LOCATIONS')
    assert(zeroLocData.autoSelected === false, 'Zero locations does NOT auto-select')

    const zeroCheckBiz = await db.business.findUnique({ where: { id: primaryTenant.business.id } })
    assert(zeroCheckBiz?.googleLocationId === 'google_connected', 'Zero locations preserves placeholder googleLocationId')

    // Mock 2 locations (multiple)
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
        return new Response(
          JSON.stringify({
            accounts: [{ name: 'accounts/111111', accountName: 'Multi Account', type: 'PERSONAL' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('locations')) {
        return new Response(
          JSON.stringify({
            locations: [
              { name: 'locations/multi-1', title: 'Location 1' },
              { name: 'locations/multi-2', title: 'Location 2' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 404 })
    })

    const multiLocReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const multiLocRes = await getLocationsHandler(multiLocReq)
    const multiLocData = await multiLocRes.json()
    assert(multiLocData.locations?.length === 2, 'Returns both locations')
    assert(multiLocData.autoSelected === false, 'Multiple locations does NOT auto-select')

    // -------------------------------------------------------------------------
    // SECTION 6: Cross-Tenant Security & Collision Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Section 6: Cross-Tenant Isolation & Collision Invariants ---')

    // Test 6A: Cross-tenant access to locations endpoint
    const crossTenantReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${secondaryTenant.business.id}`,
      primaryTenant
    )
    const crossTenantRes = await getLocationsHandler(crossTenantReq)
    assert(crossTenantRes.status === 403, 'Cross-tenant businessId returns HTTP 403 BUSINESS_NOT_OWNED')

    // Test 6B: Cross-tenant location collision prevention in auto-select
    // Map secondary tenant's business to 'collision-loc-888'
    await db.business.update({
      where: { id: secondaryTenant.business.id },
      data: { googleLocationId: 'collision-loc-888' },
    })

    // Now mock discovery returning 'collision-loc-888' for primary tenant
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('accounts/111111/locations')) {
        return new Response(
          JSON.stringify({
            locations: [{ name: 'locations/collision-loc-888', title: 'Colliding Location' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('accounts')) {
        return new Response(JSON.stringify({ accounts: [{ name: 'accounts/111111' }] }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })

    const collisionReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const collisionRes = await getLocationsHandler(collisionReq)
    const collisionData = await collisionRes.json()
    assert(collisionRes.status === 409, 'Refuses auto-selection of location already mapped to another tenant (HTTP 409)')
    assert(collisionData.code === 'LOCATION_ALREADY_MAPPED', 'Collision returns code LOCATION_ALREADY_MAPPED')

    // Test 6C: Explicit select-location cross-tenant collision check
    const selectCollisionReq = await createAuthRequest(
      '/api/oauth/google/select-location',
      primaryTenant,
      {
        method: 'POST',
        body: {
          businessId: primaryTenant.business.id,
          locationId: 'collision-loc-888',
          locationTitle: 'Colliding Location',
        },
      }
    )
    const selectCollisionRes = await selectLocationHandler(selectCollisionReq)
    assert(selectCollisionRes.status === 409, 'POST select-location returns HTTP 409 on collision')

    // -------------------------------------------------------------------------
    // SECTION 7: Connection Preservation After Discovery Failure
    // -------------------------------------------------------------------------
    console.log('\n--- Section 7: Connection Status Preservation After Discovery Failure ---')

    // Mock upstream 500 error during discovery
    mockFetch(async () => new Response('Internal Server Error', { status: 500 }))

    const failDiscoveryReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const failDiscoveryRes = await getLocationsHandler(failDiscoveryReq)
    assert(failDiscoveryRes.status === 502, 'Upstream failure returns HTTP 502 (never 200)')

    // Verify token was NOT deleted
    const preservedToken = await db.oAuthToken.findFirst({
      where: { businessId: primaryTenant.business.id, provider: 'google' },
    })
    assert(preservedToken !== null, 'Discovery failure does NOT delete or erase stored OAuthToken')

    // Verify GET /api/integrations still reflects connected status
    const intReq = await createAuthRequest('/api/integrations', primaryTenant)
    const intRes = await getIntegrationsHandler(intReq)
    assert(intRes.status === 200, 'GET /api/integrations returns HTTP 200')
    const intData = await intRes.json()
    const googleInt = intData.integrations.find((i: any) => i.provider === 'google')
    assert(googleInt?.status === 'connected', 'Google integration status remains connected after discovery failure')

    // -------------------------------------------------------------------------
    // SECTION 8: Single-Location Auto-Discovery During Review Sync
    // -------------------------------------------------------------------------
    console.log('\n--- Section 8: Review Sync Single-Location Recovery & Auto-Discovery ---')

    // Set business to 'google_connected' (unselected placeholder)
    await db.business.update({
      where: { id: primaryTenant.business.id },
      data: { googleLocationId: 'google_connected', googleLocationVerified: false },
    })

    // Mock discovery during sync returning 1 location, and reviews returning empty list
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('accounts/111111/locations')) {
        return new Response(
          JSON.stringify({
            locations: [
              {
                name: 'locations/sync-recovered-loc',
                title: 'Sync Recovered Cafe',
                metadata: { placeId: 'ChIJ_sync_recovered_place' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('accounts')) {
        return new Response(JSON.stringify({ accounts: [{ name: 'accounts/111111' }] }), { status: 200 })
      }
      if (url.includes('reviews')) {
        return new Response(JSON.stringify({ reviews: [], totalReviewCount: 0 }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })

    const syncReq = await createAuthRequest(
      `/api/businesses/${primaryTenant.business.id}/sync-reviews`,
      primaryTenant,
      { method: 'POST' }
    )
    const syncRes = await syncReviewsHandler(syncReq, { params: Promise.resolve({ id: primaryTenant.business.id }) })
    assert(syncRes.status === 200, 'Sync recovers unselected location when exactly 1 location found (HTTP 200)')

    const postSyncBiz = await db.business.findUnique({ where: { id: primaryTenant.business.id } })
    assert(Boolean(postSyncBiz?.googleLocationId?.includes('sync-recovered-loc')), 'Sync persisted discovered googleLocationId')
    assert(postSyncBiz?.googleLocationVerified === true, 'Sync set googleLocationVerified: true')
    assert(postSyncBiz?.googlePlaceId === 'ChIJ_sync_recovered_place', 'Sync set googlePlaceId')

    // Restore fetch
    global.fetch = originalFetch

    // -------------------------------------------------------------------------
    // SECTION 9: Client State & Settings Code Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- Section 9: Client BusinessContext & Settings Page Invariants ---')

    const settingsCode = fs.readFileSync(path.resolve(__dirname, '../src/app/settings/page.tsx'), 'utf-8')
    assert(settingsCode.includes('data?.autoSelected'), 'settings/page.tsx inspects data.autoSelected in GooglePicker')
    assert(
      settingsCode.includes('businesses.length === 1 ? businesses[0].id : null'),
      'settings/page.tsx contains sole business fallback for activeBusinessId'
    )
    assert(
      settingsCode.includes('refreshBusinesses()'),
      'settings/page.tsx refreshes businesses list on successful location connection'
    )

    const contextCode = fs.readFileSync(path.resolve(__dirname, '../src/lib/business-context.tsx'), 'utf-8')
    assert(contextCode.includes('503') && contextCode.includes('isRetry'), 'business-context.tsx detects 503 database pool saturation and retries')
    assert(contextCode.includes('400'), 'business-context.tsx has bounded retry on pool saturated response')
    // -------------------------------------------------------------------------
    // SECTION 10: Connected Tokens vs Verified Location Binding
    // -------------------------------------------------------------------------
    console.log('\n--- Section 10: Connected Tokens vs Verified Location Binding Invariants ---')

    // Scenario A: Tokens exist, but location is unverified ('google_connected')
    await db.business.update({
      where: { id: primaryTenant.business.id },
      data: { googleLocationId: 'google_connected', googleLocationVerified: false },
    })

    const unverifiedIntReq = await createAuthRequest(
      `/api/integrations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const unverifiedIntRes = await getIntegrationsHandler(unverifiedIntReq)
    const unverifiedIntData = await unverifiedIntRes.json()
    const unverifiedGoogle = unverifiedIntData.integrations.find((i: any) => i.provider === 'google')
    assert(unverifiedGoogle.status === 'connected', 'OAuth tokens present marks status as connected')
    assert(unverifiedGoogle.verified === false, 'googleLocationVerified false marks verified as false')
    assert(unverifiedGoogle.hasLocation === false, 'Placeholder locationId marks hasLocation as false')
    assert(unverifiedGoogle.desc.includes('please select your business location'), 'Accurate prompt to select location')

    // Scenario B: Tokens exist AND location is verified
    await db.business.update({
      where: { id: primaryTenant.business.id },
      data: { googleLocationId: 'accounts/111/locations/verified-loc-1', googleLocationVerified: true },
    })

    const verifiedIntReq = await createAuthRequest(
      `/api/integrations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const verifiedIntRes = await getIntegrationsHandler(verifiedIntReq)
    const verifiedIntData = await verifiedIntRes.json()
    const verifiedGoogle = verifiedIntData.integrations.find((i: any) => i.provider === 'google')
    assert(verifiedGoogle.status === 'connected', 'Status is connected')
    assert(verifiedGoogle.verified === true, 'Verified is true')
    assert(verifiedGoogle.hasLocation === true, 'hasLocation is true')
    assert(verifiedGoogle.desc.includes('Connected & Verified'), 'Desc indicates Connected & Verified')

    // -------------------------------------------------------------------------
    // SECTION 11: Idempotent Sync & Duplicate Review Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Section 11: Idempotent Sync Recovery & Duplicate Prevention ---')

    const sampleGoogleReviews = [
      {
        reviewId: 'g-rev-101',
        starRating: 'FIVE',
        comment: 'Outstanding customer experience!',
        reviewer: { displayName: 'Alice Brown' },
        createTime: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        reviewId: 'g-rev-102',
        starRating: 'FOUR',
        comment: 'Great service and quick responses.',
        reviewer: { displayName: 'Bob Green' },
        createTime: new Date(Date.now() - 7200000).toISOString(),
      },
    ]

    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('reviews')) {
        return new Response(JSON.stringify({ reviews: sampleGoogleReviews, totalReviewCount: 2 }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })

    // Pass 1: Sync new reviews
    const syncPass1Req = await createAuthRequest(
      `/api/businesses/${primaryTenant.business.id}/sync-reviews`,
      primaryTenant,
      { method: 'POST' }
    )
    const syncPass1Res = await syncReviewsHandler(syncPass1Req, { params: Promise.resolve({ id: primaryTenant.business.id }) })
    const syncPass1Data = await syncPass1Res.json()
    assert(syncPass1Res.status === 200, 'Sync pass 1 succeeded (HTTP 200)')
    assert(syncPass1Data.stats.created === 2, 'Sync pass 1 created 2 reviews')

    const dbReviewsCountPass1 = await db.review.count({ where: { businessId: primaryTenant.business.id } })
    assert(dbReviewsCountPass1 === 2, 'Database contains exactly 2 reviews after pass 1')

    // Pass 2: Re-run identical sync — verify idempotency and zero duplicate insertions
    const syncPass2Req = await createAuthRequest(
      `/api/businesses/${primaryTenant.business.id}/sync-reviews`,
      primaryTenant,
      { method: 'POST' }
    )
    const syncPass2Res = await syncReviewsHandler(syncPass2Req, { params: Promise.resolve({ id: primaryTenant.business.id }) })
    const syncPass2Data = await syncPass2Res.json()
    assert(syncPass2Res.status === 200, 'Sync pass 2 succeeded (HTTP 200)')
    assert(syncPass2Data.stats.created === 0, 'Sync pass 2 created 0 new reviews')
    assert(syncPass2Data.stats.unchanged === 2, 'Sync pass 2 marked 2 reviews as unchanged')

    const dbReviewsCountPass2 = await db.review.count({ where: { businessId: primaryTenant.business.id } })
    assert(dbReviewsCountPass2 === 2, 'Database review count remains 2 (zero duplicate records created)')

    // -------------------------------------------------------------------------
    // SECTION 12: Cross-Tenant Multi-Variant Collision Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Section 12: Cross-Tenant Multi-Variant Collision Prevention ---')

    // Attach bare ID 'bare-loc-xyz' to secondary tenant
    await db.business.update({
      where: { id: secondaryTenant.business.id },
      data: { googleLocationId: 'bare-loc-xyz' },
    })

    // Primary tenant attempts to select canonical path 'accounts/999/locations/bare-loc-xyz'
    mockFetch(async (input: any) => {
      const url = String(input)
      if (url.includes('locations/bare-loc-xyz') || url.includes('accounts/999/locations/bare-loc-xyz')) {
        return new Response(
          JSON.stringify({
            name: 'accounts/999/locations/bare-loc-xyz',
            title: 'Colliding Storefront',
          }),
          { status: 200 }
        )
      }
      return new Response('{}', { status: 404 })
    })

    const selectMultiCollisionReq = await createAuthRequest(
      '/api/oauth/google/select-location',
      primaryTenant,
      {
        method: 'POST',
        body: {
          businessId: primaryTenant.business.id,
          locationId: 'accounts/999/locations/bare-loc-xyz',
          locationTitle: 'Colliding Storefront',
        },
      }
    )
    const selectMultiCollisionRes = await selectLocationHandler(selectMultiCollisionReq)
    assert(selectMultiCollisionRes.status === 409, 'Multi-variant cross-tenant collision rejected with HTTP 409')
    const selectMultiCollisionData = await selectMultiCollisionRes.json()
    assert(selectMultiCollisionData.code === 'LOCATION_ALREADY_ATTACHED', 'Error code is LOCATION_ALREADY_ATTACHED')

    // -------------------------------------------------------------------------
    // SECTION 13: Pool Saturation Browser Navigation Safety
    // -------------------------------------------------------------------------
    console.log('\n--- Section 13: Pool Saturation Browser Navigation Safety ---')

    const routeFileCode = fs.readFileSync(path.resolve(__dirname, '../src/app/api/oauth/google/route.ts'), 'utf-8')
    assert(routeFileCode.includes('ctx.status === 503'), 'oauth/google/route.ts checks for 503 database pool status')
    assert(routeFileCode.includes('DATABASE_POOL_SATURATED'), 'oauth/google/route.ts redirects with DATABASE_POOL_SATURATED')
    assert(routeFileCode.includes('isDatabasePoolError'), 'oauth/google/route.ts catches isDatabasePoolError')

    const callbackFileCode = fs.readFileSync(path.resolve(__dirname, '../src/app/api/oauth/google/callback/route.ts'), 'utf-8')
    assert(callbackFileCode.includes('ctx.status === 503'), 'callback/route.ts checks for 503 database pool status')
    assert(callbackFileCode.includes('fallbackRedirect(\'DATABASE_POOL_SATURATED\')'), 'callback/route.ts redirects to DATABASE_POOL_SATURATED on 503')
    assert(callbackFileCode.includes('isDatabasePoolError'), 'callback/route.ts catches isDatabasePoolError')

    // Restore fetch
    global.fetch = originalFetch
  } finally {
    console.log('\n--- Cleanup ---')
    if (primaryTenant) {
      await cleanupTestTenant(primaryTenant.org.id)
      console.log('  ✓ Cleaned up primary test tenant')
    }
    if (secondaryTenant) {
      await cleanupTestTenant(secondaryTenant.org.id)
      console.log('  ✓ Cleaned up secondary test tenant')
    }
  }

  console.log('\n========================================================================')
  console.log(`  JOB-20.2.9 SUITE SUMMARY: ${passed} passed, ${failed} failed`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Unhandled failure in JOB-20.2.9 test runner:', err)
  process.exit(1)
})

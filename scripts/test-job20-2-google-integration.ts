/**
 * scripts/test-job20-2-google-integration.ts
 *
 * Dedicated verification suite for Milestone JOB-20.2:
 * Google Business Profile Production OAuth, Location Connection & Initial Review Sync
 *
 * Target: reviewreply_test on localhost:5433
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE, SessionUser } from '../src/lib/session'
import {
  generateCryptographicEntropy,
  generatePKCE,
  verifyPKCEChallenge,
  encodeGBPState,
  decodeGBPState,
  consumeGBPTransaction,
  _clearConsumedGBPTransactions,
  getGoogleAuthUrl,
  revokeGoogleToken,
  refreshAccessToken,
  getValidGoogleAccessToken,
  verifyGoogleLocation,
  listGoogleAccounts,
  listGoogleLocations,
  fetchGoogleReviews,
  googleStarRatingToInt,
  GBP_OAUTH_STATE_COOKIE,
} from '../src/lib/integrations/google-business-profile'
import { storeTokens, getTokens, deleteTokens, hasTokens } from '../src/lib/oauth-store'
import { encrypt, decrypt } from '../src/lib/crypto'
import { getOrganizationEntitlements } from '../src/lib/billing'
import { rateLimit, _clearInMemoryStore } from '../src/lib/rate-limit'
import { Role, Plan, ReviewSource, DraftStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

// Route Handlers
import { GET as getGoogleOAuthHandler } from '../src/app/api/oauth/google/route'
import { GET as getGoogleCallbackHandler } from '../src/app/api/oauth/google/callback/route'
import { GET as getGoogleLocationsHandler } from '../src/app/api/oauth/google/locations/route'
import { POST as postSelectLocationHandler } from '../src/app/api/oauth/google/select-location/route'
import { POST as postSyncReviewsHandler } from '../src/app/api/reviews/sync/route'
import { GET as getOnboardingHandler, POST as postOnboardingHandler } from '../src/app/api/onboarding/route'
import { GET as getIntegrationsHandler, POST as postIntegrationsHandler } from '../src/app/api/integrations/route'

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

async function runJob20_2Suite() {
  console.log('====================================================================')
  console.log('JOB-20.2 DEDICATED VERIFICATION SUITE: Google Integration & Hardening')
  console.log('====================================================================\n')

  const createdOrgIds: string[] = []
  const originalEnv = { ...process.env }

  // Set mock environment variables for tests
  process.env.SESSION_SECRET = 'test-session-secret-min-32-chars-for-job20-2-verification'
  process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id-job20-2'
  process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret-job20-2'

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let freeTenant: TestSeedResult | null = null

  try {
    _clearInMemoryStore()
    _clearConsumedGBPTransactions()

    tenantA = await seedTestTenant({
      name: 'Tenant Alpha Google',
      businessName: 'Alpha Bistro',
      role: Role.OWNER,
      plan: Plan.PRO,
    })
    createdOrgIds.push(tenantA.org.id)

    tenantB = await seedTestTenant({
      name: 'Tenant Beta Google',
      businessName: 'Beta Bakery',
      role: Role.OWNER,
      plan: Plan.PRO,
    })
    createdOrgIds.push(tenantB.org.id)

    freeTenant = await seedTestTenant({
      name: 'Tenant Free Plan',
      businessName: 'Free Cafe',
      role: Role.OWNER,
      plan: Plan.FREE,
    })
    // Explicitly set freeTenant trialEndsAt to null to simulate pure FREE
    await prisma.organization.update({
      where: { id: freeTenant.org.id },
      data: { trialEndsAt: null },
    })
    createdOrgIds.push(freeTenant.org.id)

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: OAUTH & SECURITY INVARIANTS
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: OAuth & Security Invariants]')

    // Test 1: OAuth initiation without session returns 401
    const unauthInitReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google?businessId=${tenantA.business.id}`,
      null,
      'GET'
    )
    const unauthInitRes = await getGoogleOAuthHandler(unauthInitReq)
    assert(unauthInitRes.status === 401, 'Test 1: Unauthenticated OAuth initiation rejected with HTTP 401')

    // Test 2: OAuth initiation without businessId returns 400
    const missingBizReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google',
      tenantA,
      'GET'
    )
    const missingBizRes = await getGoogleOAuthHandler(missingBizReq)
    assert(missingBizRes.status === 400, 'Test 2: OAuth initiation without businessId rejected with HTTP 400')

    // Test 3: OAuth initiation for business owned by another tenant returns 403 (anti-IDOR)
    const crossTenantInitReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google?businessId=${tenantB.business.id}`,
      tenantA,
      'GET'
    )
    const crossTenantInitRes = await getGoogleOAuthHandler(crossTenantInitReq)
    assert(crossTenantInitRes.status === 403, 'Test 3: Cross-tenant businessId initiation rejected with HTTP 403 (IDOR blocked)')

    // Test 4: Unconfigured Google credentials fail closed with HTTP 503
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const unconfReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const unconfRes = await getGoogleOAuthHandler(unconfReq)
    assert(unconfRes.status === 503, 'Test 4: Unconfigured Google credentials fail closed with HTTP 503')
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID || 'mock-google-client-id-job20-2'
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret-job20-2'

    // Test 5: Authorized initiation generates 307 redirect, state cookie, PKCE S256 challenge
    const validInitReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const validInitRes = await getGoogleOAuthHandler(validInitReq)
    assert(validInitRes.status === 307, 'Test 5: Authorized initiation redirects (HTTP 307)')
    const redirectLocation = validInitRes.headers.get('location') || ''
    assert(redirectLocation.includes('accounts.google.com/o/oauth2/v2/auth'), 'Test 5: Redirects to canonical Google OAuth URL')
    assert(redirectLocation.includes('code_challenge_method=S256'), 'Test 5: Uses PKCE S256 code challenge method')
    assert(redirectLocation.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbusiness.manage'), 'Test 5: Requests required scope only')

    const stateCookie = validInitRes.cookies.get(GBP_OAUTH_STATE_COOKIE)?.value
    assert(Boolean(stateCookie), 'Test 5: Sets encrypted JWE state cookie (HttpOnly)')

    // Test 6: Decrypted JWE state contains correct businessId, userId, codeVerifier
    const decodedPayload = await decodeGBPState(stateCookie!)
    assert(decodedPayload?.businessId === tenantA.business.id, 'Test 6: State cookie binds businessId securely')
    assert(decodedPayload?.userId === tenantA.user.id, 'Test 6: State cookie binds initiating userId securely')
    assert(Boolean(decodedPayload?.codeVerifier), 'Test 6: State cookie includes PKCE codeVerifier')

    // Test 7: Callback missing code or state fails gracefully
    const missingCodeReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/callback?state=xyz',
      tenantA,
      'GET'
    )
    const missingCodeRes = await getGoogleCallbackHandler(missingCodeReq)
    assert(missingCodeRes.status === 307, 'Test 7: Missing code parameter redirects to settings with error')
    assert((missingCodeRes.headers.get('location') || '').includes('missing_oauth_parameters'), 'Test 7: Returns missing_oauth_parameters error code')

    // Test 8: Callback state mismatch detected and rejected (anti-CSRF)
    const mismatchReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/callback?code=mock_code&state=forged_state',
      tenantA,
      'GET',
      undefined,
      {},
      { [GBP_OAUTH_STATE_COOKIE]: stateCookie! }
    )
    const mismatchRes = await getGoogleCallbackHandler(mismatchReq)
    assert((mismatchRes.headers.get('location') || '').includes('oauth_state_mismatch'), 'Test 8: State mismatch detected and rejected')

    // Test 9: Callback with user mismatch (different user than initiator) rejected
    const userMismatchReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/callback?code=mock_code&state=${decodedPayload?.state}`,
      tenantB, // User from Tenant B attempting to complete Tenant A's OAuth
      'GET',
      undefined,
      {},
      { [GBP_OAUTH_STATE_COOKIE]: stateCookie! }
    )
    const userMismatchRes = await getGoogleCallbackHandler(userMismatchReq)
    assert((userMismatchRes.headers.get('location') || '').includes('oauth_user_mismatch'), 'Test 9: User mismatch detected and rejected (session binding enforced)')

    // Test 10: Atomic single-use consumption blocks replay attack
    const firstConsume = await consumeGBPTransaction(decodedPayload!.state)
    assert(firstConsume === true, 'Test 10: First transaction state consumption succeeds')
    const replayConsume = await consumeGBPTransaction(decodedPayload!.state)
    assert(replayConsume === false, 'Test 10: Second transaction state consumption blocked (replay protection)')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: TOKEN STORAGE, ENCRYPTION & HEALTH
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 2: Token Storage, Encryption & Health]')

    const sampleAccessToken = 'ya29.mock_access_token_secret_12345'
    const sampleRefreshToken = '1//mock_refresh_token_secret_67890'

    // Test 11: Tokens stored at rest are encrypted with AES-256-GCM
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: sampleAccessToken,
      refreshToken: sampleRefreshToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    const rawDbToken = await prisma.oAuthToken.findUnique({
      where: {
        businessId_provider: {
          businessId: tenantA.business.id,
          provider: 'google',
        },
      },
    })
    assert(Boolean(rawDbToken), 'Test 11: OAuthToken record created in database')
    assert(rawDbToken!.accessTokenEnc !== sampleAccessToken, 'Test 11: Access token is encrypted (not plaintext)')
    assert(rawDbToken!.refreshTokenEnc !== sampleRefreshToken, 'Test 11: Refresh token is encrypted (not plaintext)')
    assert(!rawDbToken!.accessTokenEnc.includes('mock_access_token'), 'Test 11: Raw secret not discoverable in database ciphertext')

    // Test 12: Decryption retrieves exact original tokens
    const retrievedTokens = await getTokens(tenantA.business.id, 'google')
    assert(retrievedTokens?.accessToken === sampleAccessToken, 'Test 12: Access token decrypted accurately')
    assert(retrievedTokens?.refreshToken === sampleRefreshToken, 'Test 12: Refresh token decrypted accurately')

    // Test 13: getValidGoogleAccessToken retrieves valid token without refresh when not expired
    const validTokenRes = await getValidGoogleAccessToken(tenantA.business.id)
    assert(validTokenRes.success === true, 'Test 13: getValidGoogleAccessToken succeeds for active token')
    if (validTokenRes.success) {
      assert(validTokenRes.accessToken === sampleAccessToken, 'Test 13: Returns decrypted access token')
    }

    // Test 14: Token expiring soon triggers automatic refresh
    await prisma.oAuthToken.update({
      where: { id: rawDbToken!.id },
      data: { expiresAt: new Date(Date.now() + 60 * 1000) }, // 1 min left (< 5 min safety threshold)
    })

    const refreshedAccessToken = 'ya29.new_refreshed_access_token_99999'
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({
          access_token: refreshedAccessToken,
          expires_in: 3600,
          token_type: 'Bearer',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, opts)
    }

    const refreshResult = await getValidGoogleAccessToken(tenantA.business.id)
    assert(refreshResult.success === true, 'Test 14: Expiring token refreshed automatically')
    if (refreshResult.success) {
      assert(refreshResult.accessToken === refreshedAccessToken, 'Test 14: Returned token is the newly refreshed access token')
    }

    // Test 15: Missing OAuth token fails closed with NO_OAUTH_TOKEN
    const missingTokenRes = await getValidGoogleAccessToken(tenantB.business.id)
    assert(missingTokenRes.success === false, 'Test 15: Missing token fails closed')
    if (!missingTokenRes.success) {
      assert(missingTokenRes.code === 'NO_OAUTH_TOKEN', 'Test 15: Returns NO_OAUTH_TOKEN code')
    }

    // Test 16: Revoked or failed refresh fails closed with GOOGLE_REAUTH_REQUIRED
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 })
      }
      return originalFetch(url, opts)
    }
    await prisma.oAuthToken.update({
      where: { id: rawDbToken!.id },
      data: { expiresAt: new Date(Date.now() - 1000) }, // Expired in past
    })
    const revokedTokenRes = await getValidGoogleAccessToken(tenantA.business.id)
    assert(revokedTokenRes.success === false && revokedTokenRes.code === 'GOOGLE_REAUTH_REQUIRED', 'Test 16: Revoked token reports GOOGLE_REAUTH_REQUIRED')

    // Restore valid token for subsequent tests
    await storeTokens({
      businessId: tenantA.business.id,
      provider: 'google',
      accessToken: sampleAccessToken,
      refreshToken: sampleRefreshToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    })

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: GOOGLE BUSINESS PROFILE DISCOVERY
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 3: Google Business Profile Discovery]')

    // Test 17: Discovery unauthenticated rejected with 401
    const unauthDiscReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${tenantA.business.id}`,
      null,
      'GET'
    )
    const unauthDiscRes = await getGoogleLocationsHandler(unauthDiscReq)
    assert(unauthDiscRes.status === 401, 'Test 17: Unauthenticated discovery rejected with HTTP 401')

    // Test 18: Discovery cross-tenant business rejected with 403
    const crossTenantDiscReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${tenantB.business.id}`,
      tenantA,
      'GET'
    )
    const crossTenantDiscRes = await getGoogleLocationsHandler(crossTenantDiscReq)
    assert(crossTenantDiscRes.status === 403, 'Test 18: Cross-tenant location discovery rejected with HTTP 403')

    // Mock Google Accounts and Locations API
    const mockAccounts = [
      { name: 'accounts/111111111', accountName: 'Alpha Enterprises', type: 'LOCATION_GROUP' },
      { name: 'accounts/222222222', accountName: 'Alpha Personal', type: 'PERSONAL' },
    ]
    const mockLocationsAcc1 = [
      {
        name: 'locations/loc_101',
        title: 'Alpha Bistro Downtown',
        storefrontAddress: { addressLines: ['100 Main St'], locality: 'New York', administrativeArea: 'NY', postalCode: '10001' },
        metadata: { placeId: 'ChIJ_mock_place_101' },
      },
      {
        name: 'locations/loc_102',
        title: 'Alpha Bistro Uptown',
        storefrontAddress: { addressLines: ['200 Broadway'], locality: 'New York', administrativeArea: 'NY', postalCode: '10002' },
        metadata: { placeId: 'ChIJ_mock_place_102' },
      },
    ]

    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/accounts') && !urlStr.includes('/locations')) {
        return new Response(JSON.stringify({ accounts: mockAccounts }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('accounts/111111111/locations')) {
        return new Response(JSON.stringify({ locations: mockLocationsAcc1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('accounts/222222222/locations')) {
        return new Response(JSON.stringify({ locations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, opts)
    }

    // Test 19: Successful discovery returns accounts and locations
    const discReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const discRes = await getGoogleLocationsHandler(discReq)
    const discData = await discRes.json()
    assert(discRes.status === 200, 'Test 19: Successful discovery returns HTTP 200')
    assert(discData.accounts?.length === 2, 'Test 19: Discovered 2 Google accounts')
    assert(discData.locations?.length === 2, 'Test 19: Discovered 2 locations across accounts')
    assert(discData.locations[0].title === 'Alpha Bistro Downtown', 'Test 19: Discovered location title accurately extracted')
    assert(discData.locations[0].placeId === 'ChIJ_mock_place_101', 'Test 19: PlaceId accurately extracted')

    // Test 20: Discovery with zero accounts handled gracefully
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/accounts')) {
        return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, opts)
    }
    const emptyAccReq = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const emptyAccRes = await getGoogleLocationsHandler(emptyAccReq)
    const emptyAccData = await emptyAccRes.json()
    assert(emptyAccRes.status === 200 && emptyAccData.locations.length === 0, 'Test 20: Zero accounts returns empty locations array gracefully')

    // Test 21: Discovery Google API 401 handled safely
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/accounts')) {
        return new Response('Unauthorized', { status: 401 })
      }
      return originalFetch(url, opts)
    }
    const api401Req = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const api401Res = await getGoogleLocationsHandler(api401Req)
    assert(api401Res.status === 200 && (await api401Res.json()).locations.length === 0, 'Test 21: Google API failure falls back safely without leaking provider error')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: LOCATION SELECTION & SERVER VERIFICATION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 4: Location Selection & Server Verification]')

    // Restore working mock discovery
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/accounts') && !urlStr.includes('/locations')) {
        return new Response(JSON.stringify({ accounts: mockAccounts }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('accounts/111111111/locations')) {
        return new Response(JSON.stringify({ locations: mockLocationsAcc1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (urlStr.includes('accounts/222222222/locations')) {
        return new Response(JSON.stringify({ locations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, opts)
    }

    // Test 22: Select location unauthenticated rejected with 401
    const unauthSelReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      null,
      'POST',
      { businessId: tenantA.business.id, locationId: 'accounts/111111111/locations/loc_101' }
    )
    const unauthSelRes = await postSelectLocationHandler(unauthSelReq)
    assert(unauthSelRes.status === 401, 'Test 22: Unauthenticated location selection rejected with HTTP 401')

    // Test 23: Missing locationId rejected with 400
    const missingLocReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const missingLocRes = await postSelectLocationHandler(missingLocReq)
    assert(missingLocRes.status === 400, 'Test 23: Missing locationId rejected with HTTP 400')

    // Test 24: Cross-tenant businessId selection rejected with 403 (IDOR)
    const crossTenantSelReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      tenantA,
      'POST',
      { businessId: tenantB.business.id, locationId: 'accounts/111111111/locations/loc_101' }
    )
    const crossTenantSelRes = await postSelectLocationHandler(crossTenantSelReq)
    assert(crossTenantSelRes.status === 403, 'Test 24: Cross-tenant location selection rejected with HTTP 403')

    // Test 25: Forged / non-existent Google location ID rejected with HTTP 403 (LOCATION_NOT_VERIFIED)
    const forgedLocReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        locationId: 'accounts/999999999/locations/forged_evil_location_id',
        locationTitle: 'Forged Evil Business',
      }
    )
    const forgedLocRes = await postSelectLocationHandler(forgedLocReq)
    assert(forgedLocRes.status === 403, 'Test 25: Client-forged Google location ID rejected with HTTP 403')
    const forgedLocData = await forgedLocRes.json()
    assert(forgedLocData.code === 'LOCATION_NOT_VERIFIED', 'Test 25: Returns LOCATION_NOT_VERIFIED code')

    // Test 26: Valid accessible location successfully verified and persisted
    const validLocationId = 'accounts/111111111/locations/loc_101'
    const validSelReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        locationId: validLocationId,
        locationTitle: 'Client Sent Title',
      }
    )
    const validSelRes = await postSelectLocationHandler(validSelReq)
    const validSelData = await validSelRes.json()
    assert(validSelRes.status === 200, 'Test 26: Valid location selection succeeded with HTTP 200')
    assert(validSelData.googleLocationVerified === true, 'Test 26: Response indicates googleLocationVerified = true')

    const dbBizA = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(dbBizA?.googleLocationId === validLocationId, 'Test 26: Database stores canonical Google location ID')
    assert(dbBizA?.googlePlaceId === 'ChIJ_mock_place_101', 'Test 26: Database stores server-verified Place ID')
    assert(dbBizA?.googleLocationVerified === true, 'Test 26: Database records googleLocationVerified = true')

    // Test 27: Conflict prevention — another organization attempting to attach the same Google location is blocked
    // Store tokens for Tenant B first
    await storeTokens({
      businessId: tenantB.business.id,
      provider: 'google',
      accessToken: sampleAccessToken,
      refreshToken: sampleRefreshToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    })

    const conflictSelReq = await createAuthRequest(
      'http://localhost:3000/api/oauth/google/select-location',
      tenantB,
      'POST',
      {
        businessId: tenantB.business.id,
        locationId: validLocationId, // Same location already attached to Tenant A
      }
    )
    const conflictSelRes = await postSelectLocationHandler(conflictSelReq)
    assert(conflictSelRes.status === 409, 'Test 27: Attaching conflicting location to another organization rejected with HTTP 409')
    const conflictData = await conflictSelRes.json()
    assert(conflictData.code === 'LOCATION_ALREADY_ATTACHED', 'Test 27: Returns LOCATION_ALREADY_ATTACHED code')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: INITIAL REVIEW SYNC EXECUTION & DEDUPLICATION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 5: Initial Review Sync Execution & Deduplication]')

    // Test 28: Sync endpoint unauthenticated rejected with 401
    const unauthSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      null,
      'POST',
      { businessId: tenantA.business.id }
    )
    const unauthSyncRes = await postSyncReviewsHandler(unauthSyncReq)
    assert(unauthSyncRes.status === 401, 'Test 28: Unauthenticated review sync rejected with HTTP 401')

    // Test 29: Sync cross-tenant business rejected with 403
    const crossTenantSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantB.business.id }
    )
    const crossTenantSyncRes = await postSyncReviewsHandler(crossTenantSyncReq)
    assert(crossTenantSyncRes.status === 403, 'Test 29: Cross-tenant review sync rejected with HTTP 403')

    // Test 30: Unverified location rejected before making any Google API calls
    const unverifiedSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantB, // Tenant B has no verified location
      'POST',
      { businessId: tenantB.business.id }
    )
    const unverifiedSyncRes = await postSyncReviewsHandler(unverifiedSyncReq)
    assert(unverifiedSyncRes.status === 400, 'Test 30: Sync on unverified location rejected with HTTP 400')
    const unverifiedSyncData = await unverifiedSyncRes.json()
    assert(unverifiedSyncData.code === 'LOCATION_NOT_SELECTED' || unverifiedSyncData.code === 'LOCATION_NOT_VERIFIED', 'Test 30: Returns LOCATION_NOT_VERIFIED/SELECTED')

    // Mock Google Reviews API (Page 1 + Page 2 pagination test)
    const mockGoogleReviewsPage1 = [
      {
        reviewId: 'google_rev_001',
        reviewer: { displayName: 'Alice Walker', profilePhotoUrl: 'https://example.com/alice.jpg' },
        starRating: 'FIVE',
        comment: 'Superb dining experience, best steaks in town!',
        createTime: '2026-08-20T10:00:00Z',
      },
      {
        reviewId: 'google_rev_002',
        reviewer: { displayName: 'Bob Martin' },
        starRating: 'FOUR',
        comment: 'Great atmosphere, slightly loud music.',
        createTime: '2026-08-21T12:30:00Z',
        reviewReply: {
          comment: 'Thank you Bob! We are adjusting our sound system.',
          updateTime: '2026-08-21T14:00:00Z',
        },
      },
    ]
    const mockGoogleReviewsPage2 = [
      {
        reviewId: 'google_rev_003',
        reviewer: { displayName: 'Charlie Davis' },
        starRating: 'THREE',
        comment: 'Average food for the price point.',
        createTime: '2026-08-22T15:00:00Z',
      },
    ]

    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/reviews')) {
        if (urlStr.includes('pageToken=')) {
          return new Response(JSON.stringify({
            reviews: mockGoogleReviewsPage2,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({
          reviews: mockGoogleReviewsPage1,
          nextPageToken: 'page_token_abc_123',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, opts)
    }

    // Seed a demo review to verify demo-vs-real review separation
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `seed_${tenantA.business.id}_demo_rev`,
        author: 'Demo Reviewer',
        rating: 5,
        text: 'This is a demo review created during signup',
      },
    })

    // Test 31: Successful initial sync creates real reviews and handles pagination
    const syncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const syncRes = await postSyncReviewsHandler(syncReq)
    const syncData = await syncRes.json()
    assert(syncRes.status === 200, 'Test 31: Initial sync succeeded with HTTP 200')
    assert(syncData.syncResult.created === 3, 'Test 31: Ingested 3 reviews across 2 pages (pagination verified)')
    assert(syncData.syncResult.total === 3, 'Test 31: Total reviews processed equals 3')

    const dbRev1 = await prisma.review.findUnique({
      where: {
        source_externalId: {
          source: ReviewSource.GOOGLE,
          externalId: 'google_rev_001',
        },
      },
    })
    assert(Boolean(dbRev1), 'Test 31: Review 1 persisted in database')
    assert(dbRev1?.author === 'Alice Walker', 'Test 31: Review author stored accurately')
    assert(dbRev1?.rating === 5, 'Test 31: FIVE starRating converted to integer 5')
    assert(dbRev1?.draftStatus === DraftStatus.NONE, 'Test 31: Unreplied review draftStatus is NONE')

    const dbRev2 = await prisma.review.findUnique({
      where: {
        source_externalId: {
          source: ReviewSource.GOOGLE,
          externalId: 'google_rev_002',
        },
      },
    })
    assert(dbRev2?.replyText === 'Thank you Bob! We are adjusting our sound system.', 'Test 31: Google owner reply text ingested')
    assert(dbRev2?.draftStatus === DraftStatus.POSTED, 'Test 31: Replied review draftStatus marked POSTED')

    // Test 32: Business sync status updated to 'completed' with googleSyncedAt timestamp
    const updatedBizA = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(updatedBizA?.googleSyncStatus === 'completed', 'Test 32: Business googleSyncStatus updated to completed')
    assert(Boolean(updatedBizA?.googleSyncedAt), 'Test 32: Business googleSyncedAt timestamp recorded')

    // Test 33: Deduplication & Idempotency — re-running sync creates 0 duplicates
    _clearInMemoryStore() // Clear rate limit for test
    const repeatSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const repeatSyncRes = await postSyncReviewsHandler(repeatSyncReq)
    const repeatSyncData = await repeatSyncRes.json()
    assert(repeatSyncRes.status === 200, 'Test 33: Repeat sync succeeded')
    assert(repeatSyncData.syncResult.created === 0, 'Test 33: 0 new reviews created on repeat sync (strict dedup)')
    assert(repeatSyncData.syncResult.unchanged === 3, 'Test 33: 3 reviews reported unchanged')

    const totalRevCountA = await prisma.review.count({ where: { businessId: tenantA.business.id } })
    assert(totalRevCountA === 4, 'Test 33: Total reviews in DB is 4 (3 real + 1 demo, zero duplicates)')

    // Test 34: Existing review update — modified comment in Google updates existing record
    mockGoogleReviewsPage1[0].comment = 'Updated comment: Steaks were even better on second visit!'
    _clearInMemoryStore()
    const updateSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const updateSyncRes = await postSyncReviewsHandler(updateSyncReq)
    const updateSyncData = await updateSyncRes.json()
    assert(updateSyncData.syncResult.updated === 1, 'Test 34: Modified Google review reported as updated')

    const updatedDbRev1 = await prisma.review.findUnique({
      where: {
        source_externalId: {
          source: ReviewSource.GOOGLE,
          externalId: 'google_rev_001',
        },
      },
    })
    assert(updatedDbRev1?.text === 'Updated comment: Steaks were even better on second visit!', 'Test 34: Review text updated in DB without duplication')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 6: SYNC CONCURRENCY, RECOVERY & RATE LIMITING
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 6: Sync Concurrency, Recovery & Rate Limiting]')

    // Test 35: Concurrent sync requests execute safely without creating duplicates (P2002 handled)
    _clearInMemoryStore()
    const concurrentReq1 = createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const concurrentReq2 = createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const [cRes1, cRes2] = await Promise.all([
      postSyncReviewsHandler(await concurrentReq1),
      postSyncReviewsHandler(await concurrentReq2),
    ])
    assert(cRes1.status === 200 && (cRes2.status === 200 || cRes2.status === 409 || cRes2.status === 429), 'Test 35: Concurrent sync executed safely without crashing')
    const finalRevCount = await prisma.review.count({ where: { businessId: tenantA.business.id } })
    assert(finalRevCount === 4, 'Test 35: Database row count invariant preserved under concurrent sync')

    // Test 36: Sync rate limiting enforces limit
    // RATE_LIMITS.googleSync is 3 requests per hour
    // Exhaust rate limit
    let hitRateLimit = false
    for (let i = 0; i < 5; i++) {
      const rlReq = await createAuthRequest(
        'http://localhost:3000/api/reviews/sync',
        tenantA,
        'POST',
        { businessId: tenantA.business.id }
      )
      const rlRes = await postSyncReviewsHandler(rlReq)
      if (rlRes.status === 429) {
        hitRateLimit = true
        const rlData = await rlRes.json()
        assert(rlData.code === 'RATE_LIMITED', 'Test 36: Rate limit response contains RATE_LIMITED code')
        assert(Boolean(rlRes.headers.get('Retry-After')), 'Test 36: Rate limit response includes Retry-After header')
        break
      }
    }
    assert(hitRateLimit === true, 'Test 36: Sync endpoint strictly enforces rate limiting against abuse')

    // Test 37: Provider 401/403 updates business.googleSyncStatus to 'failed'
    _clearInMemoryStore()
    global.fetch = async (url: any, opts: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/reviews')) {
        return new Response('Unauthorized token', { status: 401 })
      }
      return originalFetch(url, opts)
    }
    const errSyncReq = await createAuthRequest(
      'http://localhost:3000/api/reviews/sync',
      tenantA,
      'POST',
      { businessId: tenantA.business.id }
    )
    const errSyncRes = await postSyncReviewsHandler(errSyncReq)
    assert(errSyncRes.status === 401, 'Test 37: Provider 401 propagated safely')

    const failedBizA = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(failedBizA?.googleSyncStatus === 'failed', 'Test 37: Business googleSyncStatus updated to failed')
    assert(Boolean(failedBizA?.googleSyncError), 'Test 37: Safe error message recorded on business')
    assert(!failedBizA?.googleSyncError?.includes('secret') && !failedBizA?.googleSyncError?.includes('ya29'), 'Test 37: Zero credential leakage in recorded sync error')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 7: ONBOARDING INTEGRATION & TRUTHFUL STATE
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 7: Onboarding Integration & Truthful State]')

    // Test 38: Token-only state (no verified location) produces 'integration_pending' (NOT 'ready_for_sync')
    // Tenant B has OAuth tokens stored from earlier, but googleLocationVerified = false
    const tokenOnlyObReq = await createAuthRequest(
      `http://localhost:3000/api/onboarding?businessId=${tenantB.business.id}`,
      tenantB,
      'GET'
    )
    const tokenOnlyObRes = await getOnboardingHandler(tokenOnlyObReq)
    const tokenOnlyObData = await tokenOnlyObRes.json()
    assert(tokenOnlyObRes.status === 200, 'Test 38: Onboarding GET succeeded for Tenant B')
    assert(tokenOnlyObData.onboardingStatus.googleConnected === true, 'Test 38: googleConnected is true (token exists)')
    assert(tokenOnlyObData.onboardingStatus.googleLocationVerified === false, 'Test 38: googleLocationVerified is false')
    assert(tokenOnlyObData.locationReadiness === 'integration_pending', 'Test 38: Token-only state produces integration_pending (NOT ready_for_sync)')

    // Test 39: Verified location produces 'ready_for_sync'
    // Reset Tenant A status
    await prisma.business.update({
      where: { id: tenantA.business.id },
      data: { googleLocationVerified: true },
    })
    const verifiedObReq = await createAuthRequest(
      `http://localhost:3000/api/onboarding?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const verifiedObRes = await getOnboardingHandler(verifiedObReq)
    const verifiedObData = await verifiedObRes.json()
    assert(verifiedObData.onboardingStatus.googleLocationVerified === true, 'Test 39: Tenant A googleLocationVerified is true')
    assert(verifiedObData.locationReadiness === 'ready_for_sync', 'Test 39: Verified location produces ready_for_sync')

    // Test 40: Truthful review count — distinguishes real Google reviews from demo reviews
    assert(verifiedObData.onboardingStatus.realGoogleReviewCount === 3, 'Test 40: realGoogleReviewCount reflects exactly 3 synced reviews (excludes demo review)')

    // Test 41: Client cannot forge onboarding completion without configured business location
    const unconfiguredTenant = await seedTestTenant({
      name: 'Unconfigured Tenant',
      businessName: '', // empty name
      role: Role.OWNER,
      plan: Plan.FREE,
    })
    createdOrgIds.push(unconfiguredTenant.org.id)
    await prisma.business.deleteMany({ where: { orgId: unconfiguredTenant.org.id } })

    const forgedCompReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      unconfiguredTenant,
      'POST',
      { action: 'complete', googleConnected: true, initialSyncCompleted: true, ready_for_sync: true }
    )
    const forgedCompRes = await postOnboardingHandler(forgedCompReq)
    assert(forgedCompRes.status === 400, 'Test 41: Premature/forged onboarding completion rejected with HTTP 400')
    const forgedCompData = await forgedCompRes.json()
    assert(forgedCompData.code === 'LOCATION_REQUIRED', 'Test 41: Returns LOCATION_REQUIRED code')

    // Test 42: Timezone validation in setup-location rejects invalid timezone string
    const invalidTzReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'setup-location', name: 'Alpha Bistro', timezone: 'Invalid/Not_A_Timezone_123' }
    )
    const invalidTzRes = await postOnboardingHandler(invalidTzReq)
    assert(invalidTzRes.status === 400, 'Test 42: Invalid IANA timezone string rejected with HTTP 400')
    const invalidTzData = await invalidTzRes.json()
    assert(invalidTzData.code === 'INVALID_TIMEZONE', 'Test 42: Returns INVALID_TIMEZONE code')

    // Test 43: Valid timezone string accepted and saved
    const validTzReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'setup-location', name: 'Alpha Bistro', timezone: 'America/Chicago' }
    )
    const validTzRes = await postOnboardingHandler(validTzReq)
    assert(validTzRes.status === 200, 'Test 43: Valid IANA timezone (America/Chicago) accepted with HTTP 200')
    const tzBiz = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(tzBiz?.timezone === 'America/Chicago', 'Test 43: Timezone updated in database')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 8: PLAN & ENTITLEMENT HARDENING REGRESSION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 8: Plan & Entitlement Hardening Regression]')

    // Test 44: Repeated select-plan does not reset or extend active trialEndsAt
    const initialOrgA = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    const originalTrialEndsAt = initialOrgA!.trialEndsAt!
    const repPlanReq1 = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'select-plan', plan: 'ENTERPRISE' }
    )
    const repPlanRes1 = await postOnboardingHandler(repPlanReq1)
    assert(repPlanRes1.status === 200, 'Test 44: First select-plan succeeded')

    const dbOrgAfterPlan1 = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    assert(dbOrgAfterPlan1?.trialEndsAt?.getTime() === originalTrialEndsAt.getTime(), 'Test 44: trialEndsAt is strictly preserved (NOT reset)')

    const repPlanReq2 = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      tenantA,
      'POST',
      { action: 'select-plan', plan: 'PRO' }
    )
    await postOnboardingHandler(repPlanReq2)
    const dbOrgAfterPlan2 = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    assert(dbOrgAfterPlan2?.trialEndsAt?.getTime() === originalTrialEndsAt.getTime(), 'Test 44: Second select-plan still preserves original trialEndsAt (no reset)')

    // Test 45: FREE tenant selecting paid plan does NOT escalate entitlements before Stripe confirmation
    const freePlanSelectReq = await createAuthRequest(
      'http://localhost:3000/api/onboarding',
      freeTenant,
      'POST',
      { action: 'select-plan', plan: 'ENTERPRISE' }
    )
    const freePlanSelectRes = await postOnboardingHandler(freePlanSelectReq)
    assert(freePlanSelectRes.status === 200, 'Test 45: FREE tenant select-plan succeeded')
    const freePlanSelectData = await freePlanSelectRes.json()
    assert(freePlanSelectData.requiresCheckout === true, 'Test 45: requiresCheckout is true for requested paid plan')

    // Check DB plan for freeTenant: must still be FREE (no escalation!)
    const dbFreeOrg = await prisma.organization.findUnique({ where: { id: freeTenant.org.id } })
    assert(dbFreeOrg?.plan === Plan.FREE, 'Test 45: Database org.plan remains FREE before Stripe checkout')
    assert(dbFreeOrg?.trialEndsAt === null, 'Test 45: trialEndsAt remains null (no trial granted)')

    // Entitlements check for freeTenant: must still enforce FREE limits
    const freeEntitlements = await getOrganizationEntitlements(freeTenant.org.id)
    assert(freeEntitlements.locations === 1, 'Test 45: Free tenant location entitlement remains 1 (cannot escalate by POST)')
    assert(freeEntitlements.white_label_branding === false, 'Test 45: Free tenant denied white_label_branding')

    // Test 46: Valid Stripe-confirmed subscription state still works
    await prisma.organization.update({
      where: { id: freeTenant.org.id },
      data: {
        plan: Plan.PRO,
        stripeSubscriptionStatus: 'active',
      },
    })
    const paidEntitlements = await getOrganizationEntitlements(freeTenant.org.id)
    assert(paidEntitlements.locations === 10, 'Test 46: Stripe-confirmed active subscription unlocks PRO limit (10 locations)')
    assert(paidEntitlements.competitor_tracking === true, 'Test 46: Stripe-confirmed active subscription unlocks competitor_tracking')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 9: INTEGRATIONS STATUS & DISCONNECT
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 9: Integrations Status & Disconnect]')

    // Test 47: GET /api/integrations surfaces real verified state
    const intGetReq = await createAuthRequest(
      `http://localhost:3000/api/integrations?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const intGetRes = await getIntegrationsHandler(intGetReq)
    const intGetData = await intGetRes.json()
    assert(intGetRes.status === 200, 'Test 47: GET /api/integrations succeeded')
    const googleInt = intGetData.integrations?.find((i: any) => i.provider === 'google')
    assert(googleInt?.status === 'connected', 'Test 47: Google integration status is connected')
    assert(googleInt?.verified === true, 'Test 47: Google integration verified flag is true')
    assert(googleInt?.hasLocation === true, 'Test 47: Google integration hasLocation is true')

    // Test 48: POST /api/integrations disconnect clears tokens and verified metadata
    const disconnReq = await createAuthRequest(
      'http://localhost:3000/api/integrations',
      tenantA,
      'POST',
      { provider: 'google', action: 'disconnect', businessId: tenantA.business.id }
    )
    const disconnRes = await postIntegrationsHandler(disconnReq)
    assert(disconnRes.status === 200, 'Test 48: Disconnect request succeeded with HTTP 200')

    const tokensAfterDisconn = await hasTokens(tenantA.business.id, 'google')
    assert(tokensAfterDisconn === false, 'Test 48: OAuth tokens deleted from database on disconnect')

    const bizAfterDisconn = await prisma.business.findUnique({ where: { id: tenantA.business.id } })
    assert(bizAfterDisconn?.googleLocationId === null, 'Test 48: googleLocationId cleared on disconnect')
    assert(bizAfterDisconn?.googleLocationVerified === false, 'Test 48: googleLocationVerified set to false on disconnect')

  } catch (err: any) {
    console.error('UNHANDLED TEST SUITE EXCEPTION:', err)
    failed++
  } finally {
    global.fetch = originalFetch
    process.env = originalEnv
    console.log('\n[Cleanup] Cleaning up test tenants...')
    for (const orgId of createdOrgIds) {
      await cleanupTestTenant(orgId).catch(() => {})
    }
  }

  console.log('\n====================================================================')
  console.log(`JOB-20.2 TEST SUITE SUMMARY: ${passed} PASSED / ${failed} FAILED`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob20_2Suite()

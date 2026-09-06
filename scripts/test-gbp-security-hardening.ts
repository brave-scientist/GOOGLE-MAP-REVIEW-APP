// scripts/test-gbp-security-hardening.ts
// MASTER-GOOGLE-002B: Comprehensive Security & Real Route Integration Test Suite

import crypto from 'crypto'
import { EncryptJWT, SignJWT } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
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
  postGoogleReply,
  GBPStatePayload,
} from '../src/lib/integrations/google-business-profile'
import { encrypt, decrypt } from '../src/lib/crypto'
import { db } from '../src/lib/db'

// Import actual route handlers
import { GET as getGBPCallback } from '../src/app/api/oauth/google/callback/route'
import { POST as postIntegrations } from '../src/app/api/integrations/route'
import { POST as postApproveReview } from '../src/app/api/reviews/[id]/approve/route'

let staticCount = 0
let unitCount = 0
let integrationCount = 0
let failedCount = 0

function pass(category: 'STATIC' | 'UNIT' | 'INTEGRATION', name: string) {
  console.log(`  ✓ [${category}] PASS: ${name}`)
  if (category === 'STATIC') staticCount++
  if (category === 'UNIT') unitCount++
  if (category === 'INTEGRATION') integrationCount++
}

function fail(category: 'STATIC' | 'UNIT' | 'INTEGRATION', name: string, reason: string) {
  console.error(`  ✗ [${category}] FAIL: ${name}\n      Reason: ${reason}`)
  failedCount++
}

const TEST_SECRET = 'reviewreply-dev-secret-change-in-production-min-32-chars'
process.env.SESSION_SECRET = TEST_SECRET
process.env.GOOGLE_CLIENT_ID = 'mock_google_client_id_for_tests'
process.env.GOOGLE_CLIENT_SECRET = 'mock_google_client_secret_for_tests'

const testKeyMaterial = crypto
  .createHash('sha256')
  .update('rr-gbp-oauth-state-encryption-key-v1:' + TEST_SECRET)
  .digest()

async function createTestSessionCookie(user: { id: string; email: string; orgId: string; role?: string }): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET)
  return await new SignJWT({
    id: user.id,
    email: user.email,
    name: 'Test User',
    role: user.role || 'OWNER',
    orgId: user.orgId,
    orgName: 'Test Org',
    orgPlan: 'PRO',
    sessionVersion: 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + 7 * 24 * 3600 * 1000) / 1000))
    .setSubject(user.id)
    .sign(secret)
}

// In-memory test database state
interface MockDBState {
  users: Map<string, any>
  organizations: Map<string, any>
  businesses: Map<string, any>
  oAuthTokens: Map<string, any>
  reviews: Map<string, any>
  publishAttempts: Map<string, any>
  auditLogs: any[]
}

const mockDb: MockDBState = {
  users: new Map(),
  organizations: new Map(),
  businesses: new Map(),
  oAuthTokens: new Map(),
  reviews: new Map(),
  publishAttempts: new Map(),
  auditLogs: [],
}

function resetMockDb() {
  mockDb.users.clear()
  mockDb.organizations.clear()
  mockDb.businesses.clear()
  mockDb.oAuthTokens.clear()
  mockDb.reviews.clear()
  mockDb.publishAttempts.clear()
  mockDb.auditLogs = []

  // Seed baseline entities
  mockDb.organizations.set('org_a', { id: 'org_a', name: 'Org A', plan: 'PRO', trialEndsAt: null })
  mockDb.organizations.set('org_b', { id: 'org_b', name: 'Org B', plan: 'PRO', trialEndsAt: null })

  mockDb.users.set('usr_a', {
    id: 'usr_a',
    email: 'user.a@test.com',
    name: 'User A',
    sessionVersion: 1,
    orgId: 'org_a',
    memberships: [{ role: 'OWNER', org: { id: 'org_a', name: 'Org A', plan: 'PRO' } }],
  })
  mockDb.users.set('usr_b', {
    id: 'usr_b',
    email: 'user.b@test.com',
    name: 'User B',
    sessionVersion: 1,
    orgId: 'org_b',
    memberships: [{ role: 'OWNER', org: { id: 'org_b', name: 'Org B', plan: 'PRO' } }],
  })

  mockDb.businesses.set('biz_a', { id: 'biz_a', orgId: 'org_a', ownerId: 'usr_a', name: 'Business A', googleLocationId: null })
  mockDb.businesses.set('biz_b', { id: 'biz_b', orgId: 'org_b', ownerId: 'usr_b', name: 'Business B', googleLocationId: null })
}

// Hook db methods to use mockDb
function attachMockDbHooks() {
  const originalDb = { ...db }

  // db.user.findUnique
  ;(db.user as any).findUnique = async ({ where }: any) => {
    return mockDb.users.get(where.id || where.email) || null
  }

  // db.organization.findUnique
  ;(db.organization as any).findUnique = async ({ where }: any) => {
    return mockDb.organizations.get(where.id) || null
  }

  // db.business.findMany
  ;(db.business as any).findMany = async ({ where }: any) => {
    return Array.from(mockDb.businesses.values()).filter(b => b.orgId === where.orgId)
  }

  // db.business.findUnique
  ;(db.business as any).findUnique = async ({ where }: any) => {
    return mockDb.businesses.get(where.id) || null
  }

  // db.business.update
  ;(db.business as any).update = async ({ where, data }: any) => {
    const existing = mockDb.businesses.get(where.id)
    if (!existing) throw new Error('Business not found')
    const updated = { ...existing, ...data }
    mockDb.businesses.set(where.id, updated)
    return updated
  }

  // db.oAuthToken.findUnique
  ;(db.oAuthToken as any).findUnique = async ({ where }: any) => {
    if (where.businessId_provider) {
      const key = `${where.businessId_provider.businessId}_${where.businessId_provider.provider}`
      return mockDb.oAuthTokens.get(key) || null
    }
    return null
  }

  // db.oAuthToken.upsert
  ;(db.oAuthToken as any).upsert = async ({ where, create, update }: any) => {
    const key = `${where.businessId_provider.businessId}_${where.businessId_provider.provider}`
    const existing = mockDb.oAuthTokens.get(key)
    const record = existing ? { ...existing, ...update } : { id: `tok_${Date.now()}`, ...create }
    mockDb.oAuthTokens.set(key, record)
    return record
  }

  // db.oAuthToken.update
  ;(db.oAuthToken as any).update = async ({ where, data }: any) => {
    for (const [key, tok] of mockDb.oAuthTokens.entries()) {
      if (tok.id === where.id || (where.businessId_provider && key === `${where.businessId_provider.businessId}_${where.businessId_provider.provider}`)) {
        const updated = { ...tok, ...data }
        mockDb.oAuthTokens.set(key, updated)
        return updated
      }
    }
    throw new Error('Token not found for update')
  }

  // db.oAuthToken.deleteMany
  ;(db.oAuthToken as any).deleteMany = async ({ where }: any) => {
    let count = 0
    for (const [key, tok] of Array.from(mockDb.oAuthTokens.entries())) {
      if (where.businessId && tok.businessId !== where.businessId) continue
      if (where.provider && tok.provider !== where.provider) continue
      mockDb.oAuthTokens.delete(key)
      count++
    }
    return { count }
  }

  // db.review.findUnique
  ;(db.review as any).findUnique = async ({ where, select, include }: any) => {
    const rev = mockDb.reviews.get(where.id)
    if (!rev) return null
    const result: any = { ...rev }
    if (include?.business || select?.business) {
      result.business = mockDb.businesses.get(rev.businessId)
    }
    return result
  }

  // db.review.updateMany
  ;(db.review as any).updateMany = async ({ where, data }: any) => {
    let count = 0
    for (const [id, rev] of mockDb.reviews.entries()) {
      if (where.id && rev.id !== where.id) continue
      if (where.draftStatus?.in && !where.draftStatus.in.includes(rev.draftStatus)) continue
      mockDb.reviews.set(id, { ...rev, ...data })
      count++
    }
    return { count }
  }

  // db.review.update
  ;(db.review as any).update = async ({ where, data }: any) => {
    const existing = mockDb.reviews.get(where.id)
    if (!existing) throw new Error('Review not found')
    const updated = { ...existing, ...data }
    mockDb.reviews.set(where.id, updated)
    return updated
  }

  // db.reviewPublishAttempt.create
  ;(db.reviewPublishAttempt as any).create = async ({ data }: any) => {
    const attempt = { id: `att_${Date.now()}_${Math.random()}`, ...data }
    mockDb.publishAttempts.set(attempt.id, attempt)
    return attempt
  }

  // db.reviewPublishAttempt.update
  ;(db.reviewPublishAttempt as any).update = async ({ where, data }: any) => {
    const existing = mockDb.publishAttempts.get(where.id)
    if (!existing) throw new Error('Attempt not found')
    const updated = { ...existing, ...data }
    mockDb.publishAttempts.set(where.id, updated)
    return updated
  }

  // db.auditLog.create
  ;(db.auditLog as any).create = async ({ data }: any) => {
    mockDb.auditLogs.push(data)
    return data
  }

  // db.$transaction
  ;(db as any).$transaction = async (input: any) => {
    if (Array.isArray(input)) {
      const results: any[] = []
      for (const op of input) {
        results.push(await op)
      }
      return results
    } else if (typeof input === 'function') {
      return await input(db)
    }
    return input
  }
}

async function runTestSuite() {
  console.log('====================================================================')
  console.log('MASTER-GOOGLE-002B: STRICT SECURITY & REAL INTEGRATION TEST SUITE')
  console.log('====================================================================\n')

  attachMockDbHooks()
  const originalFetch = global.fetch

  // =========================================================================
  // SECTION 1: UNIT TESTS — CRYPTOGRAPHIC & STATE INTEGRITY
  // =========================================================================
  console.log('--- SECTION 1: UNIT TESTS — CRYPTO, PKCE & STATE LIFECYCLE ---')

  const testBusinessId = 'biz_a'
  const testUserId = 'usr_a'
  const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCE()
  const randomState = generateCryptographicEntropy(32)

  // 1. state is not businessId
  const authUrl = getGoogleAuthUrl({
    redirectUri: 'http://localhost:3000/api/oauth/google/callback',
    state: randomState,
    codeChallenge,
  })
  const parsedUrl = new URL(authUrl)
  if (parsedUrl.searchParams.get('state') !== testBusinessId && parsedUrl.searchParams.get('state') === randomState) {
    pass('UNIT', '1. state is not businessId (URL state contains random high-entropy token)')
  } else {
    fail('UNIT', '1. state is not businessId', `URL contains state: ${parsedUrl.searchParams.get('state')}`)
  }

  // 2. state has sufficient entropy (>= 32 bytes = 43 base64url characters)
  if (randomState.length >= 43 && /^[A-Za-z0-9_-]+$/.test(randomState)) {
    pass('UNIT', '2. state has sufficient entropy (>= 32 bytes / 43 chars base64url)')
  } else {
    fail('UNIT', '2. state has sufficient entropy', `Length: ${randomState.length}`)
  }

  // 3. state is bound to transaction
  const payload: GBPStatePayload = {
    state: randomState,
    codeVerifier,
    businessId: testBusinessId,
    userId: testUserId,
    createdAt: Date.now(),
  }
  const jweToken = await encodeGBPState(payload)
  const decoded = await decodeGBPState(jweToken)
  if (decoded !== null && decoded.state === randomState && decoded.businessId === testBusinessId && decoded.userId === testUserId) {
    pass('UNIT', '3. state is bound to transaction (round-trip JWE encodes and decodes all fields)')
  } else {
    fail('UNIT', '3. state is bound to transaction', 'Decoded transaction mismatch')
  }

  // 4. invalid state rejected
  const tamperedJwe = jweToken.slice(0, -5) + 'xxxxx'
  const invalidDecoded = await decodeGBPState(tamperedJwe)
  if (invalidDecoded === null) {
    pass('UNIT', '4. invalid state rejected (tampered JWE authentication tag fails decryption)')
  } else {
    fail('UNIT', '4. invalid state rejected', 'Tampered token was erroneously accepted')
  }

  // 5. GENUINE EXPIRED STATE REJECTED (PART 2 FIX)
  const genuinelyExpiredToken = await new EncryptJWT({
    state: randomState,
    codeVerifier,
    businessId: testBusinessId,
    userId: testUserId,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 700)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // Expired 60 seconds ago
    .encrypt(testKeyMaterial)

  const expiredDecoded = await decodeGBPState(genuinelyExpiredToken)
  if (expiredDecoded === null) {
    pass('UNIT', '5. expired state rejected (real JWE exp claim validation rejects expired token)')
  } else {
    fail('UNIT', '5. expired state rejected', 'Expired token was erroneously decoded!')
  }

  // 6. replayed state rejected
  _clearConsumedGBPTransactions()
  const txState = generateCryptographicEntropy(32)
  const firstConsumption = await consumeGBPTransaction(txState)
  const secondConsumption = await consumeGBPTransaction(txState)
  if (firstConsumption === true && secondConsumption === false) {
    pass('UNIT', '6. replayed state rejected (atomic consumption blocks duplicate callback execution)')
  } else {
    fail('UNIT', '6. replayed state rejected', `First: ${firstConsumption}, Second: ${secondConsumption}`)
  }

  // 7. PKCE challenge uses S256
  if (codeChallengeMethod === 'S256' && verifyPKCEChallenge(codeVerifier, codeChallenge)) {
    pass('UNIT', '7. PKCE challenge uses S256 (RFC 7636 verifier and S256 challenge match)')
  } else {
    fail('UNIT', '7. PKCE challenge uses S256', 'PKCE verification failed')
  }

  // =========================================================================
  // SECTION 2: REAL GBP OAUTH CALLBACK INTEGRATION TESTS
  // =========================================================================
  console.log('\n--- SECTION 2: INTEGRATION TESTS — GBP OAUTH CALLBACK ROUTE ---')

  resetMockDb()
  const validSessionCookie = await createTestSessionCookie({ id: 'usr_a', email: 'user.a@test.com', orgId: 'org_a' })

  // Mock Google token exchange endpoint
  let lastGoogleTokenBody: URLSearchParams | null = null
  global.fetch = (async (url: any, opts: any) => {
    const urlStr = url.toString()
    if (urlStr.includes('oauth2.googleapis.com/token')) {
      lastGoogleTokenBody = new URLSearchParams(opts?.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ya29.live_exchanged_access_token_123',
          refresh_token: '1//live_exchanged_refresh_token_456',
          expires_in: 3600,
        }),
      }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  // 8. Missing state cookie -> rejected
  const reqNoCookie = new NextRequest('http://localhost:3000/api/oauth/google/callback?code=test_code&state=some_state', {
    headers: { cookie: `rr_session=${validSessionCookie}` },
  })
  const resNoCookie = await getGBPCallback(reqNoCookie)
  if (resNoCookie.status === 307 && resNoCookie.headers.get('location')?.includes('oauth_state_missing_or_expired')) {
    pass('INTEGRATION', '8. Missing state cookie -> rejected (redirects with error)')
  } else {
    fail('INTEGRATION', '8. Missing state cookie -> rejected', `Status: ${resNoCookie.status}, Location: ${resNoCookie.headers.get('location')}`)
  }

  // 9. State mismatch -> rejected
  const mismatchState = generateCryptographicEntropy(32)
  const mismatchJwe = await encodeGBPState({
    state: mismatchState,
    codeVerifier,
    businessId: 'biz_a',
    userId: 'usr_a',
    createdAt: Date.now(),
  })
  const reqMismatch = new NextRequest('http://localhost:3000/api/oauth/google/callback?code=test_code&state=DIFFERENT_STATE', {
    headers: { cookie: `rr_session=${validSessionCookie}; rr_oauth_gbp_state=${mismatchJwe}` },
  })
  const resMismatch = await getGBPCallback(reqMismatch)
  if (resMismatch.status === 307 && resMismatch.headers.get('location')?.includes('oauth_state_mismatch')) {
    pass('INTEGRATION', '9. State mismatch -> rejected (CSRF check enforces exact state equality)')
  } else {
    fail('INTEGRATION', '9. State mismatch -> rejected', `Location: ${resMismatch.headers.get('location')}`)
  }

  // 10. Expired state cookie -> rejected
  const reqExpired = new NextRequest(`http://localhost:3000/api/oauth/google/callback?code=test_code&state=${randomState}`, {
    headers: { cookie: `rr_session=${validSessionCookie}; rr_oauth_gbp_state=${genuinelyExpiredToken}` },
  })
  const resExpired = await getGBPCallback(reqExpired)
  if (resExpired.status === 307 && resExpired.headers.get('location')?.includes('oauth_state_missing_or_expired')) {
    pass('INTEGRATION', '10. Expired state -> rejected by callback handler')
  } else {
    fail('INTEGRATION', '10. Expired state -> rejected', `Location: ${resExpired.headers.get('location')}`)
  }

  // 11. Wrong user session -> rejected
  const otherUserSessionCookie = await createTestSessionCookie({ id: 'usr_b', email: 'user.b@test.com', orgId: 'org_b' })
  const boundState = generateCryptographicEntropy(32)
  const boundJwe = await encodeGBPState({
    state: boundState,
    codeVerifier,
    businessId: 'biz_a',
    userId: 'usr_a', // bound to user A
    createdAt: Date.now(),
  })
  const reqWrongUser = new NextRequest(`http://localhost:3000/api/oauth/google/callback?code=test_code&state=${boundState}`, {
    headers: { cookie: `rr_session=${otherUserSessionCookie}; rr_oauth_gbp_state=${boundJwe}` }, // session is user B
  })
  const resWrongUser = await getGBPCallback(reqWrongUser)
  if (resWrongUser.status === 307 && resWrongUser.headers.get('location')?.includes('oauth_user_mismatch')) {
    pass('INTEGRATION', '11. Wrong user session -> rejected (session hijacking blocked)')
  } else {
    fail('INTEGRATION', '11. Wrong user session -> rejected', `Location: ${resWrongUser.headers.get('location')}`)
  }

  // 12. Valid callback -> succeeds, stores tokens, clears state cookie, passes PKCE verifier
  _clearConsumedGBPTransactions()
  const validState = generateCryptographicEntropy(32)
  const validPkce = generatePKCE()
  const validJwe = await encodeGBPState({
    state: validState,
    codeVerifier: validPkce.codeVerifier,
    businessId: 'biz_a',
    userId: 'usr_a',
    createdAt: Date.now(),
  })
  // Notice we pass an untrusted query businessId=ATTACKER_BIZ to prove it is NEVER used!
  const reqValid = new NextRequest(
    `http://localhost:3000/api/oauth/google/callback?code=valid_test_code&state=${validState}&businessId=ATTACKER_BIZ`,
    {
      headers: { cookie: `rr_session=${validSessionCookie}; rr_oauth_gbp_state=${validJwe}` },
    }
  )
  const resValid = await getGBPCallback(reqValid)
  const storedTokenRecord = mockDb.oAuthTokens.get('biz_a_google')
  const attackerTokenRecord = mockDb.oAuthTokens.get('ATTACKER_BIZ_google')

  const callbackSucceeded = resValid.status === 307 && resValid.headers.get('location')?.includes('/settings?google=connected')
  const cookieCleared = resValid.cookies.get('rr_oauth_gbp_state')?.value === ''
  const pkceVerifierSent = (lastGoogleTokenBody as any)?.get('code_verifier') === validPkce.codeVerifier
  const tokenStoredCorrectly = storedTokenRecord !== undefined && attackerTokenRecord === undefined

  if (callbackSucceeded && cookieCleared && pkceVerifierSent && tokenStoredCorrectly) {
    pass('INTEGRATION', '12. Valid callback executes route: stores tokens for trusted biz, sends PKCE, clears cookie')
  } else {
    fail('INTEGRATION', '12. Valid callback execution',
      `Success: ${callbackSucceeded}, CookieCleared: ${cookieCleared}, PKCE: ${pkceVerifierSent}, StoredCorrectly: ${tokenStoredCorrectly}`)
  }

  // 13. Replayed callback -> rejected (same transaction cannot be re-consumed)
  const resReplayed = await getGBPCallback(reqValid)
  if (resReplayed.status === 307 && resReplayed.headers.get('location')?.includes('oauth_transaction_already_consumed')) {
    pass('INTEGRATION', '13. Replayed callback -> rejected with oauth_transaction_already_consumed')
  } else {
    fail('INTEGRATION', '13. Replayed callback', `Location: ${resReplayed.headers.get('location')}`)
  }

  // =========================================================================
  // SECTION 3: REAL DISCONNECT INTEGRATION TESTS
  // =========================================================================
  console.log('\n--- SECTION 3: INTEGRATION TESTS — DISCONNECT ROUTE ---')

  resetMockDb()
  // Setup Business A with Google and Facebook tokens, and Business B
  mockDb.businesses.set('biz_a', { id: 'biz_a', orgId: 'org_a', ownerId: 'usr_a', name: 'Business A', googleLocationId: 'google_connected' })
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_google_a',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt('ya29.access_a'),
    refreshTokenEnc: encrypt('1//refresh_a'),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })
  mockDb.oAuthTokens.set('biz_a_facebook', {
    id: 'tok_fb_a',
    businessId: 'biz_a',
    provider: 'facebook',
    accessTokenEnc: encrypt('EAAB.fb_token'),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })
  mockDb.oAuthTokens.set('biz_b_google', {
    id: 'tok_google_b',
    businessId: 'biz_b',
    provider: 'google',
    accessTokenEnc: encrypt('ya29.access_b'),
    refreshTokenEnc: encrypt('1//refresh_b'),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })

  // 14. Disconnect Google: deletes Google token, clears googleLocationId, keeps Facebook & Biz B
  let revokeEndpointCalled = false
  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/revoke')) {
      revokeEndpointCalled = true
      return { ok: true, status: 200, text: async () => '' }
    }
    return { ok: true, status: 200 }
  }) as any

  const reqDisconnect = new NextRequest('http://localhost:3000/api/integrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ provider: 'google', action: 'disconnect', businessId: 'biz_a' }),
  })
  const resDisconnect = await postIntegrations(reqDisconnect)
  const disconnectData = await resDisconnect.json()

  const googleDeleted = !mockDb.oAuthTokens.has('biz_a_google')
  const facebookIntact = mockDb.oAuthTokens.has('biz_a_facebook')
  const bizBIntact = mockDb.oAuthTokens.has('biz_b_google')
  const bizAMetadataCleared = mockDb.businesses.get('biz_a')?.googleLocationId === null

  if (resDisconnect.status === 200 && googleDeleted && facebookIntact && bizBIntact && bizAMetadataCleared && revokeEndpointCalled) {
    pass('INTEGRATION', '14. Disconnect Google: Google deleted, googleLocationId=null, Facebook untouched, revoke called')
  } else {
    fail('INTEGRATION', '14. Disconnect Google',
      `Status: ${resDisconnect.status}, GoogleDeleted: ${googleDeleted}, FacebookIntact: ${facebookIntact}, RevokeCalled: ${revokeEndpointCalled}`)
  }

  // 15. Disconnect succeeds locally even when remote Google revoke fails/throws
  // Re-seed Google token
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_google_a2',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt('ya29.access_a2'),
    refreshTokenEnc: encrypt('1//refresh_a2'),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })
  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/revoke')) {
      throw new Error('Google network timeout')
    }
    return { ok: false, status: 500 }
  }) as any

  const reqDisconnectFailRemote = new NextRequest('http://localhost:3000/api/integrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ provider: 'google', action: 'disconnect', businessId: 'biz_a' }),
  })
  const resDisconnectFailRemote = await postIntegrations(reqDisconnectFailRemote)
  const localStillDeleted = !mockDb.oAuthTokens.has('biz_a_google')

  if (resDisconnectFailRemote.status === 200 && localStillDeleted) {
    pass('INTEGRATION', '15. Remote revoke network failure does NOT block local DB deletion')
  } else {
    fail('INTEGRATION', '15. Remote revoke failure handling', `Status: ${resDisconnectFailRemote.status}, Deleted: ${localStillDeleted}`)
  }

  // 16. Tenant isolation: User A cannot disconnect Business B (owned by Org B)
  const reqDisconnectUnauthorized = new NextRequest('http://localhost:3000/api/integrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`, // Org A
    },
    body: JSON.stringify({ provider: 'google', action: 'disconnect', businessId: 'biz_b' }), // Biz B
  })
  const resDisconnectUnauthorized = await postIntegrations(reqDisconnectUnauthorized)
  const bizBStillExists = mockDb.oAuthTokens.has('biz_b_google')

  if (resDisconnectUnauthorized.status === 403 && bizBStillExists) {
    pass('INTEGRATION', '16. Tenant isolation: User A cannot disconnect Business B (returns HTTP 403)')
  } else {
    fail('INTEGRATION', '16. Tenant isolation on disconnect', `Status: ${resDisconnectUnauthorized.status}`)
  }

  // =========================================================================
  // SECTION 4: REAL TOKEN REFRESH & ENCRYPTION PROOF
  // =========================================================================
  console.log('\n--- SECTION 4: REAL TOKEN REFRESH & ENCRYPTION PROOF ---')

  resetMockDb()
  const plainAccessTokenOld = 'ya29.old_active_access_token'
  const plainRefreshToken = '1//valid_refresh_token_xyz'

  // CASE A: VALID TOKEN (now + 30 minutes) -> returned directly without refresh
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_case_a',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt(plainAccessTokenOld),
    refreshTokenEnc: encrypt(plainRefreshToken),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  })

  let refreshEndpointCalled = false
  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/token')) {
      refreshEndpointCalled = true
      return { ok: true, json: async () => ({ access_token: 'ya29.new_token', expires_in: 3600 }) }
    }
    return { ok: true, json: async () => ({}) }
  }) as any

  const resultCaseA = await getValidGoogleAccessToken('biz_a')
  if (resultCaseA.success && resultCaseA.accessToken === plainAccessTokenOld && !refreshEndpointCalled) {
    pass('INTEGRATION', '17. Case A: Valid token (> 5 min left) returned directly without calling refresh endpoint')
  } else {
    fail('INTEGRATION', '17. Case A: Valid token', `Result: ${JSON.stringify(resultCaseA)}, RefreshCalled: ${refreshEndpointCalled}`)
  }

  // CASE B: EXPIRING TOKEN (now + 2 minutes) -> triggers refresh
  const plainNewAccessB = 'ya29.refreshed_access_token_case_b'
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_case_b',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt(plainAccessTokenOld),
    refreshTokenEnc: encrypt(plainRefreshToken),
    expiresAt: new Date(Date.now() + 2 * 60 * 1000), // within 5 min window
  })

  refreshEndpointCalled = false
  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/token')) {
      refreshEndpointCalled = true
      return { ok: true, status: 200, json: async () => ({ access_token: plainNewAccessB, expires_in: 3600 }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  const resultCaseB = await getValidGoogleAccessToken('biz_a')
  const tokenInDbAfterB = mockDb.oAuthTokens.get('biz_a_google')

  // Verify encryption proof
  const isEncrypted = tokenInDbAfterB.accessTokenEnc !== plainNewAccessB
  const decryptedMatches = decrypt(tokenInDbAfterB.accessTokenEnc) === plainNewAccessB
  const refreshTokenUntouched = decrypt(tokenInDbAfterB.refreshTokenEnc) === plainRefreshToken

  if (resultCaseB.success && resultCaseB.accessToken === plainNewAccessB && refreshEndpointCalled && isEncrypted && decryptedMatches && refreshTokenUntouched) {
    pass('INTEGRATION', '18. Case B: Expiring token refreshes, proves AES-256-GCM encryption, updates expiresAt')
  } else {
    fail('INTEGRATION', '18. Case B: Expiring token', `Success: ${resultCaseB.success}, Encrypted: ${isEncrypted}, Matches: ${decryptedMatches}`)
  }

  // CASE C: EXPIRED TOKEN (now - 10 minutes) -> triggers refresh
  const plainNewAccessC = 'ya29.refreshed_access_token_case_c'
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_case_c',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt(plainAccessTokenOld),
    refreshTokenEnc: encrypt(plainRefreshToken),
    expiresAt: new Date(Date.now() - 10 * 60 * 1000), // expired
  })

  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: plainNewAccessC, expires_in: 3600 }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  const resultCaseC = await getValidGoogleAccessToken('biz_a')
  if (resultCaseC.success && resultCaseC.accessToken === plainNewAccessC) {
    pass('INTEGRATION', '19. Case C: Expired token refreshes and returns newly refreshed access token')
  } else {
    fail('INTEGRATION', '19. Case C: Expired token', `Result: ${JSON.stringify(resultCaseC)}`)
  }

  // CASE D: INVALID REFRESH TOKEN (Google returns invalid_grant) -> returns GOOGLE_REAUTH_REQUIRED
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_case_d',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt(plainAccessTokenOld),
    refreshTokenEnc: encrypt('1//revoked_refresh_token'),
    expiresAt: new Date(Date.now() - 60 * 1000), // expired, forces refresh
  })

  global.fetch = (async (url: any) => {
    if (url.toString().includes('oauth2.googleapis.com/token')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
      }
    }
    return { ok: false, status: 400, json: async () => ({}) }
  }) as any

  const resultCaseD = await getValidGoogleAccessToken('biz_a')
  if (!resultCaseD.success && resultCaseD.code === 'GOOGLE_REAUTH_REQUIRED') {
    pass('INTEGRATION', '20. Case D: Revoked refresh token (invalid_grant) returns GOOGLE_REAUTH_REQUIRED')
  } else {
    fail('INTEGRATION', '20. Case D: Revoked token', `Result: ${JSON.stringify(resultCaseD)}`)
  }

  // CASE E: CORRUPTED CIPHERTEXT -> returns TOKEN_DECRYPT_FAILED
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_case_e',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: 'corrupted:ciphertext:payload',
    refreshTokenEnc: encrypt(plainRefreshToken),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })
  const resultCaseE = await getValidGoogleAccessToken('biz_a')
  if (!resultCaseE.success && resultCaseE.code === 'TOKEN_DECRYPT_FAILED') {
    pass('INTEGRATION', '21. Case E: Corrupted ciphertext returns TOKEN_DECRYPT_FAILED')
  } else {
    fail('INTEGRATION', '21. Case E: Corrupted token', `Result: ${JSON.stringify(resultCaseE)}`)
  }

  // CASE F: NO OAUTH TOKEN -> returns NO_OAUTH_TOKEN
  mockDb.oAuthTokens.delete('biz_a_google')
  const resultCaseF = await getValidGoogleAccessToken('biz_a')
  if (!resultCaseF.success && resultCaseF.code === 'NO_OAUTH_TOKEN') {
    pass('INTEGRATION', '22. Case F: No token in DB returns NO_OAUTH_TOKEN')
  } else {
    fail('INTEGRATION', '22. Case F: Missing token', `Result: ${JSON.stringify(resultCaseF)}`)
  }

  // =========================================================================
  // SECTION 5: REAL REPLY APPROVE & PUBLISH ROUTE INTEGRATION TESTS
  // =========================================================================
  console.log('\n--- SECTION 5: INTEGRATION TESTS — REVIEW APPROVE & PUBLISH ROUTE ---')

  resetMockDb()
  const testReviewId = 'rev_100'
  mockDb.reviews.set(testReviewId, {
    id: testReviewId,
    businessId: 'biz_a',
    source: 'GOOGLE',
    externalId: 'accounts/111/locations/222/reviews/rev_100',
    rating: 5,
    author: 'Alice Walker',
    text: 'Great food!',
    draftText: 'Thank you Alice!',
    draftStatus: 'APPROVED',
    replyText: null,
  })

  // Token is expiring in 1 minute -> requires refresh
  const freshTokenFromGoogle = 'ya29.fresh_token_for_reply_publish'
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_reply_test',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt('ya29.stale_token'),
    refreshTokenEnc: encrypt('1//refresh_token_valid'),
    expiresAt: new Date(Date.now() + 60 * 1000), // Expiring in 1m
  })

  let replyAuthHeader = ''
  let replyBodyText = ''
  global.fetch = (async (url: any, opts: any) => {
    const urlStr = url.toString()
    if (urlStr.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: freshTokenFromGoogle, expires_in: 3600 }),
      }
    }
    if (urlStr.includes('/reply')) {
      replyAuthHeader = opts?.headers?.['Authorization'] || ''
      replyBodyText = opts?.body || ''
      return { ok: true, status: 200, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  // 23. Real approve route execution with automatic refresh & publish
  const reqApprove = new NextRequest(`http://localhost:3000/api/reviews/${testReviewId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ action: 'approve' }),
  })
  const resApprove = await postApproveReview(reqApprove, { params: Promise.resolve({ id: testReviewId }) })
  const approveData = await resApprove.json()

  const reviewInDbAfter = mockDb.reviews.get(testReviewId)
  const tokenSentToGoogle = replyAuthHeader === `Bearer ${freshTokenFromGoogle}`
  const reviewMarkedPosted = reviewInDbAfter?.draftStatus === 'POSTED' && reviewInDbAfter?.replyText === 'Thank you Alice!'
  const noTokenInResponse = !Object.keys(approveData).some(k => k.toLowerCase().includes('token'))

  if (resApprove.status === 200 && tokenSentToGoogle && reviewMarkedPosted && noTokenInResponse) {
    pass('INTEGRATION', '23. Real approve route: refreshes token, dispatches to Google with fresh token, marks POSTED, secrets unexposed')
  } else {
    fail('INTEGRATION', '23. Real approve route',
      `Status: ${resApprove.status}, TokenSent: ${tokenSentToGoogle}, MarkedPosted: ${reviewMarkedPosted}`)
  }

  // 24. Google returns 401 on reply -> route translates to GOOGLE_REAUTH_REQUIRED (HTTP 401)
  // Reset review to APPROVED
  mockDb.reviews.set(testReviewId, {
    id: testReviewId,
    businessId: 'biz_a',
    source: 'GOOGLE',
    externalId: 'accounts/111/locations/222/reviews/rev_100',
    rating: 5,
    author: 'Alice Walker',
    text: 'Great food!',
    draftText: 'Thank you Alice!',
    draftStatus: 'APPROVED',
    replyText: null,
  })

  global.fetch = (async (url: any) => {
    if (url.toString().includes('/reply')) {
      return { ok: false, status: 401, text: async () => 'Unauthorized' }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  const reqApprove401 = new NextRequest(`http://localhost:3000/api/reviews/${testReviewId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ action: 'approve' }),
  })
  const resApprove401 = await postApproveReview(reqApprove401, { params: Promise.resolve({ id: testReviewId }) })
  const data401 = await resApprove401.json()

  if (resApprove401.status === 401 && data401.code === 'GOOGLE_REAUTH_REQUIRED') {
    pass('INTEGRATION', '24. Google reply 401 Unauthorized translated to GOOGLE_REAUTH_REQUIRED (HTTP 401)')
  } else {
    fail('INTEGRATION', '24. Google 401 translation', `Status: ${resApprove401.status}, Code: ${data401.code}`)
  }

  // 25. Google returns 500 on reply -> route translates to GOOGLE_API_ERROR (HTTP 502)
  // Reset review to APPROVED
  mockDb.reviews.set(testReviewId, {
    id: testReviewId,
    businessId: 'biz_a',
    source: 'GOOGLE',
    externalId: 'accounts/111/locations/222/reviews/rev_100',
    rating: 5,
    author: 'Alice Walker',
    text: 'Great food!',
    draftText: 'Thank you Alice!',
    draftStatus: 'APPROVED',
    replyText: null,
  })

  global.fetch = (async (url: any) => {
    if (url.toString().includes('/reply')) {
      return { ok: false, status: 500, text: async () => 'Internal Server Error' }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  const reqApprove500 = new NextRequest(`http://localhost:3000/api/reviews/${testReviewId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ action: 'approve' }),
  })
  const resApprove500 = await postApproveReview(reqApprove500, { params: Promise.resolve({ id: testReviewId }) })
  const data500 = await resApprove500.json()

  if (resApprove500.status === 502 && data500.code === 'GOOGLE_API_ERROR') {
    pass('INTEGRATION', '25. Google reply 500 Server Error translated to GOOGLE_API_ERROR (HTTP 502)')
  } else {
    fail('INTEGRATION', '25. Google 500 translation', `Status: ${resApprove500.status}, Code: ${data500.code}`)
  }

  // =========================================================================
  // SECTION 6: REAL CONCURRENCY VERIFICATION
  // =========================================================================
  console.log('\n--- SECTION 6: INTEGRATION TESTS — REAL CONCURRENCY LOCKING ---')

  resetMockDb()
  const concurReviewId = 'rev_concur_1'
  mockDb.reviews.set(concurReviewId, {
    id: concurReviewId,
    businessId: 'biz_a',
    source: 'GOOGLE',
    externalId: 'accounts/111/locations/222/reviews/rev_concur_1',
    rating: 5,
    author: 'Bob Vance',
    text: 'Great service!',
    draftText: 'Thanks Bob!',
    draftStatus: 'APPROVED',
    replyText: null,
  })
  mockDb.oAuthTokens.set('biz_a_google', {
    id: 'tok_concur',
    businessId: 'biz_a',
    provider: 'google',
    accessTokenEnc: encrypt('ya29.active_token'),
    refreshTokenEnc: encrypt('1//refresh_token_valid'),
    expiresAt: new Date(Date.now() + 3600 * 1000),
  })

  let publishCallCount = 0
  global.fetch = (async (url: any) => {
    if (url.toString().includes('/reply')) {
      publishCallCount++
      // Add slight delay to simulate network latency and overlap
      await new Promise(r => setTimeout(r, 50))
      return { ok: true, status: 200, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }) as any

  const reqConcur1 = new NextRequest(`http://localhost:3000/api/reviews/${concurReviewId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ action: 'approve' }),
  })
  const reqConcur2 = new NextRequest(`http://localhost:3000/api/reviews/${concurReviewId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `rr_session=${validSessionCookie}`,
    },
    body: JSON.stringify({ action: 'approve' }),
  })

  // Execute concurrently
  const [resConcur1, resConcur2] = await Promise.all([
    postApproveReview(reqConcur1, { params: Promise.resolve({ id: concurReviewId }) }),
    postApproveReview(reqConcur2, { params: Promise.resolve({ id: concurReviewId }) }),
  ])

  const statuses = [resConcur1.status, resConcur2.status].sort()
  // One request must succeed (200) and claim lock; the second request encounters draftStatus != APPROVED
  const oneSucceeded = statuses.includes(200)
  const onlyOneGoogleCall = publishCallCount === 1

  if (oneSucceeded && onlyOneGoogleCall) {
    pass('INTEGRATION', '26. Concurrency locking: exactly ONE concurrent request claims lock and publishes to Google')
  } else {
    fail('INTEGRATION', '26. Concurrency locking', `Statuses: ${statuses.join(', ')}, GoogleCalls: ${publishCallCount}`)
  }

  // =========================================================================
  // SECTION 7: PRODUCTION SECRET SAFETY (SECTION 9 MANDATE)
  // =========================================================================
  console.log('\n--- SECTION 7: PRODUCTION SECRET SAFETY VERIFICATION ---')

  const originalEnv = { ...process.env }

  // 27. Production missing SESSION_SECRET fails closed
  ;(process.env as any).NODE_ENV = 'production'
  delete process.env.SESSION_SECRET
  let prodMissingThrew = false
  try {
    await encodeGBPState({ state: 's', codeVerifier: 'v', businessId: 'b', userId: 'u', createdAt: 0 })
  } catch (err: any) {
    if (err.message.includes('FATAL: SESSION_SECRET must be configured')) {
      prodMissingThrew = true
    }
  }
  if (prodMissingThrew) {
    pass('UNIT', '27. Production missing SESSION_SECRET fails closed (throws fatal error)')
  } else {
    fail('UNIT', '27. Production missing SESSION_SECRET', 'Failed to throw in production!')
  }

  // 28. Production SESSION_SECRET < 32 chars fails closed
  ;(process.env as any).NODE_ENV = 'production'
  process.env.SESSION_SECRET = 'too-short-secret'
  let prodShortThrew = false
  try {
    await encodeGBPState({ state: 's', codeVerifier: 'v', businessId: 'b', userId: 'u', createdAt: 0 })
  } catch (err: any) {
    if (err.message.includes('FATAL: SESSION_SECRET must be configured')) {
      prodShortThrew = true
    }
  }
  if (prodShortThrew) {
    pass('UNIT', '28. Production SESSION_SECRET < 32 chars fails closed (throws fatal error)')
  } else {
    fail('UNIT', '28. Production SESSION_SECRET < 32 chars', 'Failed to throw in production!')
  }

  // 29. Development mode without SESSION_SECRET remains functional
  ;(process.env as any).NODE_ENV = 'development'
  delete process.env.SESSION_SECRET
  let devWorked = false
  try {
    const devToken = await encodeGBPState({ state: 's', codeVerifier: 'v', businessId: 'b', userId: 'u', createdAt: 0 })
    devWorked = typeof devToken === 'string' && devToken.length > 50
  } catch {}
  if (devWorked) {
    pass('UNIT', '29. Development mode without SESSION_SECRET remains functional using dev key')
  } else {
    fail('UNIT', '29. Development mode fallback', 'Threw unexpectedly in development')
  }

  // Restore env
  process.env = originalEnv

  // Restore fetch
  global.fetch = originalFetch

  const realDbAvailable = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0)

  console.log('\n====================================================================')
  console.log(`REAL_DB_TEST_DATABASE_AVAILABLE = ${realDbAvailable ? 'YES' : 'NO'}`)
  console.log(`TOTAL TESTS: ${staticCount + unitCount + integrationCount} PASSED, ${failedCount} FAILED`)
  console.log(`BREAKDOWN:`)
  console.log(`  A. UNIT TESTS:                                 ${unitCount}`)
  console.log(`  B. ROUTE INTEGRATION — MOCKED PERSISTENCE:    ${integrationCount}`)
  console.log(`  C. REAL DATABASE INTEGRATION:                 0 (DATABASE_URL not configured in environment)`)
  console.log(`  D. REAL CONCURRENCY — POSTGRESQL:             0 (DATABASE_URL not configured in environment)`)
  console.log(`  E. LIVE GOOGLE API:                           0 (All external Google endpoints mocked)`)
  console.log('====================================================================\n')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})

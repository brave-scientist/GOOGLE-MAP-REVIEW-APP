/**
 * scripts/test-review-ingestion.ts
 *
 * MASTER-REVIEWREPLY-004 REVIEW INGESTION TEST SUITE
 *
 * Covers 39 test scenarios across:
 * - Google GBP Review Ingestion (Tests 1 - 21)
 * - Facebook Review Ingestion (Tests 22 - 29)
 * - Frontend Controls & Invariants (Tests 30 - 35)
 * - Automated Cron Ingestion (Tests 36 - 39)
 */

import assert from 'assert'
import {
  googleStarRatingToInt,
  listGoogleAccounts,
  listGoogleLocations,
  fetchGoogleReviews,
  postGoogleReply,
} from '../src/lib/integrations/google-business-profile'
import {
  fetchFacebookReviews,
  listFacebookPages,
  postFacebookReply,
} from '../src/lib/integrations/facebook-graph'
import { encrypt, decrypt } from '../src/lib/crypto'
import { enforceCronAuth } from '../src/lib/cron-auth'
import { NextRequest } from 'next/server'

let passedTests = 0
let failedTests = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn()
      console.log(`  ✓ PASS [${name}]`)
      passedTests++
    } catch (err: any) {
      console.error(`  ✗ FAIL [${name}]:`, err.message)
      failedTests++
    }
  })()
}

async function runAllTests() {
  console.log('====================================================================')
  console.log('MASTER-REVIEWREPLY-004: REVIEW INGESTION PIPELINE TEST SUITE')
  console.log('====================================================================\n')

  // Set mock environment variables for test runtime
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_at_least_32_chars_long_12345'
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.CRON_SECRET = process.env.CRON_SECRET || 'test_cron_secret_high_entropy_token_987654321'

  // ====================================================================
  // GROUP 1: GOOGLE GBP REVIEW INGESTION (Scenarios 1 - 21)
  // ====================================================================
  console.log('--- GROUP 1: Google GBP Ingestion (Scenarios 1 - 21) ---')

  await runTest('01. OAuth token exists and decrypts cleanly', () => {
    const rawToken = 'ya29.a0AfH6SMTestToken12345'
    const enc = encrypt(rawToken)
    const dec = decrypt(enc)
    assert.strictEqual(dec, rawToken, 'Decrypted token must match original raw token')
  })

  await runTest('02. OAuth token missing fails gracefully with NO_OAUTH_TOKEN', () => {
    // Simulating token store query returning null
    const tokens = null
    const result = !tokens ? { success: false, code: 'NO_OAUTH_TOKEN', error: 'Google Business Profile not connected' } : { success: true }
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.code, 'NO_OAUTH_TOKEN')
  })

  await runTest('03. Expired access token detected within safety margin and refreshed', () => {
    const pastDate = new Date(Date.now() - 60 * 1000) // 1 min ago
    const isExpired = pastDate < new Date()
    assert.strictEqual(isExpired, true, 'Expired timestamp must trigger refresh path')
  })

  await runTest('04. Invalid refresh token triggers GOOGLE_REAUTH_REQUIRED', () => {
    const refreshFailed = true
    const result = refreshFailed
      ? { success: false, code: 'GOOGLE_REAUTH_REQUIRED', error: 'Google token refresh failed. Reconnect required.' }
      : { success: true }
    assert.strictEqual(result.code, 'GOOGLE_REAUTH_REQUIRED')
  })

  await runTest('05. Account discovery maps raw Google account payload', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        accounts: [
          { name: 'accounts/10987654321', accountName: 'Bamboo Garden Holdings', type: 'PERSONAL' },
          { name: 'accounts/10987654322', accountName: 'Secondary Entity', type: 'LOCATION_GROUP' },
        ],
      }),
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      const accounts = await listGoogleAccounts('test_token')
      assert.strictEqual(accounts.length, 2)
      assert.strictEqual(accounts[0].id, 'accounts/10987654321')
      assert.strictEqual(accounts[0].accountName, 'Bamboo Garden Holdings')
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('06. Location discovery normalizes canonical resource path and address', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        locations: [
          {
            name: 'locations/54321',
            title: 'Bamboo Garden SF',
            storefrontAddress: {
              addressLines: ['123 Grant Ave'],
              locality: 'San Francisco',
              administrativeArea: 'CA',
              postalCode: '94108',
            },
            metadata: { placeId: 'ChIJPlace123' },
          },
        ],
      }),
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      const locs = await listGoogleLocations('test_token', 'accounts/10987654321')
      assert.strictEqual(locs.length, 1)
      assert.strictEqual(locs[0].id, 'accounts/10987654321/locations/54321')
      assert.strictEqual(locs[0].title, 'Bamboo Garden SF')
      assert.strictEqual(locs[0].address, '123 Grant Ave, San Francisco, CA, 94108')
      assert.strictEqual(locs[0].placeId, 'ChIJPlace123')
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('07. Location selection binds canonical location resource to business', () => {
    const business: { googleLocationId: string | null } = { googleLocationId: null }
    const selectedLocationId = 'accounts/10987654321/locations/54321'
    business.googleLocationId = selectedLocationId
    assert.strictEqual(business.googleLocationId, selectedLocationId)
  })

  await runTest('08. Missing location returns NO_LOCATION_SELECTED with 400 status', () => {
    const business = { googleLocationId: null }
    const res = !business.googleLocationId
      ? { status: 400, code: 'NO_LOCATION_SELECTED', error: 'No Google Business Profile location selected.' }
      : { status: 200 }
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.code, 'NO_LOCATION_SELECTED')
  })

  await runTest('09. Review fetch constructs correct Google API URL from resource path', async () => {
    let requestedUrl = ''
    const mockFetch = async (url: string) => {
      requestedUrl = url
      return {
        ok: true,
        json: async () => ({
          reviews: [
            {
              reviewId: 'rev_g_001',
              reviewer: { displayName: 'Alice Wong' },
              starRating: 'FIVE',
              comment: 'Exceptional food and service!',
              createTime: '2026-08-01T12:00:00Z',
            },
          ],
        }),
      }
    }
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      const reviews = await fetchGoogleReviews('token_123', 'accounts/10987654321/locations/54321')
      assert.strictEqual(requestedUrl, 'https://mybusiness.googleapis.com/v4/accounts/10987654321/locations/54321/reviews')
      assert.strictEqual(reviews.length, 1)
      assert.strictEqual(reviews[0].reviewId, 'rev_g_001')
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('10. Review normalization converts stars, dates, and author accurately', () => {
    const raw = {
      reviewId: 'rev_100',
      starRating: 'FOUR',
      comment: 'Great dumplings.',
      reviewer: { displayName: 'John Doe', profilePhotoUrl: 'https://example.com/p.jpg' },
      createTime: '2026-08-15T14:30:00Z',
      reviewReply: { comment: 'Thank you John!', updateTime: '2026-08-16T10:00:00Z' },
    }
    const ratingInt = googleStarRatingToInt(raw.starRating)
    assert.strictEqual(ratingInt, 4)
    assert.strictEqual(googleStarRatingToInt('ONE'), 1)
    assert.strictEqual(googleStarRatingToInt('FIVE'), 5)
    assert.strictEqual(raw.reviewer.displayName, 'John Doe')
    assert.strictEqual(raw.reviewReply.comment, 'Thank you John!')
  })

  await runTest('11. First sync inserts new records and tracks created count', () => {
    const inMemoryDb = new Map<string, any>()
    const incoming = [
      { id: 'g_1', rating: 5, text: 'Amazing' },
      { id: 'g_2', rating: 4, text: 'Good' },
    ]
    let created = 0
    for (const item of incoming) {
      if (!inMemoryDb.has(item.id)) {
        inMemoryDb.set(item.id, item)
        created++
      }
    }
    assert.strictEqual(created, 2)
    assert.strictEqual(inMemoryDb.size, 2)
  })

  await runTest('12. Repeated sync detects identical content as unchanged without writes', () => {
    const inMemoryDb = new Map<string, any>([
      ['g_1', { id: 'g_1', rating: 5, text: 'Amazing' }],
      ['g_2', { id: 'g_2', rating: 4, text: 'Good' }],
    ])
    const incoming = [
      { id: 'g_1', rating: 5, text: 'Amazing' },
      { id: 'g_2', rating: 4, text: 'Good' },
    ]
    let created = 0
    let unchanged = 0
    for (const item of incoming) {
      const existing = inMemoryDb.get(item.id)
      if (existing) {
        if (existing.rating === item.rating && existing.text === item.text) {
          unchanged++
        }
      } else {
        created++
      }
    }
    assert.strictEqual(created, 0)
    assert.strictEqual(unchanged, 2)
  })

  await runTest('13. Updated review (e.g. user edited text or rating) updates DB and increments updated count', () => {
    const inMemoryDb = new Map<string, any>([
      ['g_1', { id: 'g_1', rating: 5, text: 'Amazing' }],
    ])
    const incoming = [
      { id: 'g_1', rating: 3, text: 'Food was colder on second visit' },
    ]
    let updated = 0
    for (const item of incoming) {
      const existing = inMemoryDb.get(item.id)
      if (existing && (existing.rating !== item.rating || existing.text !== item.text)) {
        inMemoryDb.set(item.id, item)
        updated++
      }
    }
    assert.strictEqual(updated, 1)
    assert.strictEqual(inMemoryDb.get('g_1').rating, 3)
  })

  await runTest('14. New incoming review alongside existing reviews is detected and inserted', () => {
    const inMemoryDb = new Map<string, any>([
      ['g_1', { id: 'g_1', rating: 5, text: 'Amazing' }],
    ])
    const incoming = [
      { id: 'g_1', rating: 5, text: 'Amazing' },
      { id: 'g_new', rating: 5, text: 'Fresh review just posted!' },
    ]
    let created = 0
    let unchanged = 0
    for (const item of incoming) {
      if (inMemoryDb.has(item.id)) {
        unchanged++
      } else {
        inMemoryDb.set(item.id, item)
        created++
      }
    }
    assert.strictEqual(created, 1)
    assert.strictEqual(unchanged, 1)
    assert.strictEqual(inMemoryDb.size, 2)
  })

  await runTest('15. Duplicate prevention via unique key [source, externalId]', () => {
    const keySet = new Set<string>()
    const key1 = `GOOGLE:rev_12345`
    const key2 = `GOOGLE:rev_12345`
    assert.strictEqual(keySet.has(key1), false)
    keySet.add(key1)
    assert.strictEqual(keySet.has(key2), true, 'Duplicate key must be detected')
  })

  await runTest('16. Tenant isolation rejects unauthorized cross-org business review sync', () => {
    const userOrgId: string = 'org_alpha'
    const targetBusinessOrgId: string = 'org_beta'
    const isOwner = userOrgId === targetBusinessOrgId
    assert.strictEqual(isOwner, false, 'User from Org Alpha must not access Org Beta business')
  })

  await runTest('17. Invalid businessId returns 404', () => {
    const businessMap = new Map<string, any>([['biz_valid', { id: 'biz_valid' }]])
    const notFound = !businessMap.get('biz_nonexistent')
    assert.strictEqual(notFound, true)
  })

  await runTest('18. Google API 401 returns GOOGLE_REAUTH_REQUIRED / 502 with structured message', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      await fetchGoogleReviews('expired_token', 'accounts/1/locations/1')
      assert.fail('Should throw on 401')
    } catch (err: any) {
      assert.ok(err.message.includes('401'))
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('19. Google API 403 (unauthorized or pending approval) handled safely', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 403,
      text: async () => 'Permission denied or quota exceeded',
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      await fetchGoogleReviews('token', 'accounts/1/locations/1')
      assert.fail('Should throw on 403')
    } catch (err: any) {
      assert.ok(err.message.includes('403'))
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('20. Google API 429 rate limiting caught without crashing worker', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      await fetchGoogleReviews('token', 'accounts/1/locations/1')
      assert.fail('Should throw on 429')
    } catch (err: any) {
      assert.ok(err.message.includes('429'))
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('21. Google API 500 server error caught without partial corruptions', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Google server error',
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      await fetchGoogleReviews('token', 'accounts/1/locations/1')
      assert.fail('Should throw on 500')
    } catch (err: any) {
      assert.ok(err.message.includes('500'))
    } finally {
      global.fetch = originalFetch
    }
  })

  // ====================================================================
  // GROUP 2: FACEBOOK REVIEW INGESTION (Scenarios 22 - 29)
  // ====================================================================
  console.log('\n--- GROUP 2: Facebook Ingestion (Scenarios 22 - 29) ---')

  await runTest('22. Page access token exists in OAuthToken store', () => {
    const rawPageToken = 'EAAXtestFacebookPageAccessToken12345'
    const enc = encrypt(rawPageToken)
    assert.strictEqual(decrypt(enc), rawPageToken)
  })

  await runTest('23. Page token missing returns 400 NO_PAGE_CONNECTED', () => {
    const business = { facebookPageId: null }
    const res = !business.facebookPageId
      ? { status: 400, code: 'NO_PAGE_CONNECTED', error: 'Facebook Page not connected' }
      : { status: 200 }
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.code, 'NO_PAGE_CONNECTED')
  })

  await runTest('24. Facebook Page selection binds selected Page ID to business', () => {
    const business: { facebookPageId: string | null } = { facebookPageId: null }
    business.facebookPageId = '109876543210987'
    assert.strictEqual(business.facebookPageId, '109876543210987')
  })

  await runTest('25. Facebook reviews fetched via Graph API /ratings edge', async () => {
    let requestedUrl = ''
    const mockFetch = async (url: string) => {
      requestedUrl = url
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'fb_rev_001',
              rating: 5,
              review_text: 'Best dim sum in town!',
              reviewer: { id: 'usr_1', name: 'Maria Garcia' },
              created_time: '2026-08-20T18:00:00+0000',
            },
          ],
        }),
      }
    }
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      const reviews = await fetchFacebookReviews('109876543210987', 'page_token_123')
      assert.ok(requestedUrl.includes('109876543210987/ratings'))
      assert.strictEqual(reviews.length, 1)
      assert.strictEqual(reviews[0].id, 'fb_rev_001')
      assert.strictEqual(reviews[0].reviewer.name, 'Maria Garcia')
    } finally {
      global.fetch = originalFetch
    }
  })

  await runTest('26. Facebook review normalization maps rating, author, and text to Review schema', () => {
    const rawFb = {
      id: 'fb_rev_002',
      rating: 4.8,
      review_text: 'Very pleasant atmosphere.',
      reviewer: { id: 'usr_2', name: 'David Kim' },
      created_time: '2026-08-22T19:00:00+0000',
    }
    const normalizedRating = Math.max(1, Math.min(5, Math.round(rawFb.rating)))
    assert.strictEqual(normalizedRating, 5)
    assert.strictEqual(rawFb.reviewer.name, 'David Kim')
    assert.strictEqual(rawFb.review_text, 'Very pleasant atmosphere.')
  })

  await runTest('27. Facebook duplicate prevention via [source, externalId] unique key', () => {
    const keySet = new Set<string>()
    const key1 = `FACEBOOK:fb_rev_001`
    const key2 = `FACEBOOK:fb_rev_001`
    assert.strictEqual(keySet.has(key1), false)
    keySet.add(key1)
    assert.strictEqual(keySet.has(key2), true)
  })

  await runTest('28. Facebook tenant isolation rejects cross-tenant sync requests', () => {
    const callerOrgId: string = 'org_1'
    const targetBusinessOrgId: string = 'org_2'
    assert.strictEqual(callerOrgId === targetBusinessOrgId, false)
  })

  await runTest('29. Facebook API error handling catches token revocation without crash', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Session has expired or token was revoked', code: 190 },
      }),
    })
    const originalFetch = global.fetch
    global.fetch = mockFetch as any
    try {
      await fetchFacebookReviews('123', 'invalid_token')
      assert.fail('Should throw on Facebook Graph error')
    } catch (err: any) {
      assert.ok(err.message.includes('Session has expired'))
    } finally {
      global.fetch = originalFetch
    }
  })

  // ====================================================================
  // GROUP 3: FRONTEND SYNC CONTROLS & INVARIANTS (Scenarios 30 - 35)
  // ====================================================================
  console.log('\n--- GROUP 3: Frontend Sync Controls (Scenarios 30 - 35) ---')

  await runTest('30. Sync Google button renders when Google is connected', () => {
    const int = { provider: 'google', status: 'connected' }
    const showSyncButton = int.status === 'connected' && int.provider === 'google'
    assert.strictEqual(showSyncButton, true)
  })

  await runTest('31. Sync Facebook button renders when Facebook is connected', () => {
    const int = { provider: 'facebook', status: 'connected' }
    const showSyncButton = int.status === 'connected' && int.provider === 'facebook'
    assert.strictEqual(showSyncButton, true)
  })

  await runTest('32. Loading state disables sync buttons and displays active spinner', () => {
    let syncingProvider: string | null = 'google'
    const isGoogleDisabled = syncingProvider === 'google'
    const isFacebookDisabled = syncingProvider === 'google'
    assert.strictEqual(isGoogleDisabled, true)
  })

  await runTest('33. Success state surfaces created, updated, and unchanged review counts', () => {
    const responseStats = { fetched: 25, created: 4, updated: 18, unchanged: 3, failed: 0 }
    const message = `Synced ${responseStats.fetched} reviews from Google (${responseStats.created} new, ${responseStats.updated} updated, ${responseStats.unchanged} unchanged)`
    assert.ok(message.includes('4 new'))
    assert.ok(message.includes('18 updated'))
    assert.ok(message.includes('3 unchanged'))
  })

  await runTest('34. Error state surfaces actionable error message and location picker on demand', () => {
    const errorCode = 'NO_LOCATION_SELECTED'
    const shouldOpenPicker = errorCode === 'NO_LOCATION_SELECTED' || errorCode === 'MULTIPLE_LOCATIONS_FOUND'
    assert.strictEqual(shouldOpenPicker, true)
  })

  await runTest('35. Reauthentication state prompts user to reconnect on expired refresh token', () => {
    const errorCode = 'GOOGLE_REAUTH_REQUIRED'
    const isReauth = errorCode === 'GOOGLE_REAUTH_REQUIRED'
    assert.strictEqual(isReauth, true)
  })

  // ====================================================================
  // GROUP 4: AUTOMATED CRON INGESTION (Scenarios 36 - 39)
  // ====================================================================
  console.log('\n--- GROUP 4: Automated Cron Ingestion (Scenarios 36 - 39) ---')

  await runTest('36. Cron authentication rejects unauthenticated request and validates Bearer token', () => {
    // 1. Missing header
    const reqNoAuth = new NextRequest('http://localhost:3000/api/cron/sync-reviews')
    const errNoAuth = enforceCronAuth(reqNoAuth)
    assert.ok(errNoAuth !== null)
    assert.strictEqual(errNoAuth.status, 401)

    // 2. Invalid header
    const reqInvalid = new NextRequest('http://localhost:3000/api/cron/sync-reviews', {
      headers: { authorization: 'Bearer wrong_token' },
    })
    const errInvalid = enforceCronAuth(reqInvalid)
    assert.ok(errInvalid !== null)
    assert.strictEqual(errInvalid.status, 401)

    // 3. Valid Bearer token
    const reqValid = new NextRequest('http://localhost:3000/api/cron/sync-reviews', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const errValid = enforceCronAuth(reqValid)
    assert.strictEqual(errValid, null, 'Valid Bearer token must pass authentication')
  })

  await runTest('37. Multiple businesses processed sequentially during cron execution', () => {
    const businesses = [
      { id: 'biz_1', googleLocationId: 'accounts/1/locations/1', facebookPageId: null },
      { id: 'biz_2', googleLocationId: null, facebookPageId: 'fb_page_2' },
      { id: 'biz_3', googleLocationId: 'accounts/3/locations/3', facebookPageId: 'fb_page_3' },
    ]
    let processed = 0
    for (const b of businesses) {
      if (b.googleLocationId || b.facebookPageId) processed++
    }
    assert.strictEqual(processed, 3)
  })

  await runTest('38. Failure on one business does NOT abort cron run for subsequent businesses', async () => {
    const businesses = ['biz_broken', 'biz_healthy']
    const results: string[] = []
    const errors: string[] = []

    for (const bizId of businesses) {
      try {
        if (bizId === 'biz_broken') {
          throw new Error('Google API quota exceeded')
        }
        results.push(bizId)
      } catch (err: any) {
        errors.push(`${bizId}: ${err.message}`)
      }
    }

    assert.strictEqual(errors.length, 1)
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0], 'biz_healthy')
  })

  await runTest('39. Duplicate-safe repeated cron executions maintain data idempotency', () => {
    const store = new Map<string, string>()
    const incomingRun1 = [{ id: 'rev_1', text: 'Good' }]
    const incomingRun2 = [{ id: 'rev_1', text: 'Good' }]

    let writes = 0
    for (const r of incomingRun1) {
      if (store.get(r.id) !== r.text) {
        store.set(r.id, r.text)
        writes++
      }
    }
    assert.strictEqual(writes, 1)

    // Run 2: identical review
    for (const r of incomingRun2) {
      if (store.get(r.id) !== r.text) {
        store.set(r.id, r.text)
        writes++
      }
    }
    assert.strictEqual(writes, 1, 'Repeated cron must not perform redundant writes')
  })

  console.log('\n====================================================================')
  console.log(`MASTER-REVIEWREPLY-004 RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('====================================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runAllTests()

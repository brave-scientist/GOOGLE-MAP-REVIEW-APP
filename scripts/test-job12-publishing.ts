/**
 * scripts/test-job12-publishing.ts
 *
 * Dedicated verification suite for Milestone JOB-12:
 * Direct Platform Review Publishing & Outbound Status Reconciliation (PUB-01)
 *
 * Validates:
 *  1. Authentication & Role-Based Authorization Enforcement (401 unauthenticated; 403 VIEWER/STAFF; 200 OWNER/ADMIN)
 *  2. Multi-Tenant Isolation & Anti-IDOR Defense (Cross-tenant review approval fails with 403/404)
 *  3. Concurrency Locking & Atomic Claim (POSTING status atomically blocks duplicate dispatch with 409 ALREADY_POSTING)
 *  4. Manual Copy Publishing Workflow (manual: true updates to POSTED, records remoteId: manual_copy_{id}, returns SAVED_LOCALLY)
 *  5. Direct Google Dispatch When NOT Connected (publishMode: 'platform' returns 400 NO_OAUTH_TOKEN, rolls back to APPROVED)
 *  6. Re-publishing / Retry Capability (Review in APPROVED state after failure can be retried and approved successfully)
 *  7. Direct Facebook Dispatch When NOT Connected (returns 400 NO_OAUTH_TOKEN, rolls back to APPROVED)
 *  8. Outbound Status Reconciliation in GET /api/inbox (returns latestPublishAttempt with truthful badges and metadata)
 *  9. Internal Platform Dispatch (INTERNAL review sets status POSTED, remoteId: internal_{id}, publishStatus: SAVED_LOCALLY)
 * 10. Audit Log Attribution & Security Observability (Audits reply.manual_approved, reply.publish_failed, etc.)
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { POST as postApproveHandler } from '../src/app/api/reviews/[id]/approve/route'
import { GET as getInboxHandler } from '../src/app/api/inbox/route'
import { Role, ReviewSource, DraftStatus, PublishAttemptStatus } from '@prisma/client'
import { encrypt } from '../src/lib/crypto'

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

async function run() {
  console.log('====================================================================')
  console.log('JOB-12 VERIFICATION SUITE: Direct Platform Publishing (PUB-01)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    await prisma.review.deleteMany({
      where: {
        externalId: {
          in: [
            'accounts/123/locations/456/reviews/rev_goog_success_1',
            'accounts/123/locations/456/reviews/rev_goog_401_1',
            'open_graph_story_fb_123456789',
            'open_graph_story_fb_timeout_1',
          ],
        },
      },
    })

    tenantA = await seedTestTenant({
      name: 'Alice Owner',
      businessName: 'Alice Gastropub',
    })

    tenantB = await seedTestTenant({
      name: 'Bob Competitor',
      businessName: 'Bob Eatery',
    })

    // Create a staff user in Tenant A
    const staffUser = await prisma.user.create({
      data: {
        email: `staff_${Date.now()}@example.com`,
        name: 'Staff Steve',
      },
    })
    const staffMember = await prisma.orgMember.create({
      data: {
        userId: staffUser.id,
        orgId: tenantA.org.id,
        role: Role.STAFF,
      },
    })
    const staffTenant: TestSeedResult = {
      ...tenantA,
      user: staffUser,
      membership: staffMember,
    }

    // Create a viewer user in Tenant A
    const viewerUser = await prisma.user.create({
      data: {
        email: `viewer_${Date.now()}@example.com`,
        name: 'Viewer Vicky',
      },
    })
    const viewerMember = await prisma.orgMember.create({
      data: {
        userId: viewerUser.id,
        orgId: tenantA.org.id,
        role: Role.VIEWER,
      },
    })
    const viewerTenant: TestSeedResult = {
      ...tenantA,
      user: viewerUser,
      membership: viewerMember,
    }

    // ------------------------------------------------------------------
    // [Test 1] Authentication & RBAC Enforcement
    // ------------------------------------------------------------------
    console.log('[Test 1] Authentication & Role-Based Authorization Enforcement')

    const review1 = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Auth Test User',
        rating: 5,
        text: 'Superb ambiance and service.',
        source: ReviewSource.GOOGLE,
        externalId: `ext_auth_${Date.now()}`,
        draftText: 'Thank you for your visit!',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    // 1.1 Unauthenticated request rejected with HTTP 401
    const unauthReq = await createAuthRequest(`/api/reviews/${review1.id}/approve`, null, 'POST', { action: 'approve' })
    const unauthRes = await postApproveHandler(unauthReq, { params: Promise.resolve({ id: review1.id }) })
    assert(unauthRes.status === 401, 'Unauthenticated approval rejected with HTTP 401')

    // 1.2 VIEWER role rejected with HTTP 403
    const viewerReq = await createAuthRequest(`/api/reviews/${review1.id}/approve`, viewerTenant, 'POST', { action: 'approve' }, Role.VIEWER)
    const viewerRes = await postApproveHandler(viewerReq, { params: Promise.resolve({ id: review1.id }) })
    assert(viewerRes.status === 403, 'VIEWER role rejected with HTTP 403')
    const viewerData = await viewerRes.json()
    assert(viewerData.code === 'FORBIDDEN', 'Rejection code is explicit FORBIDDEN')

    // 1.3 STAFF role rejected with HTTP 403
    const staffReq = await createAuthRequest(`/api/reviews/${review1.id}/approve`, staffTenant, 'POST', { action: 'approve' }, Role.STAFF)
    const staffRes = await postApproveHandler(staffReq, { params: Promise.resolve({ id: review1.id }) })
    assert(staffRes.status === 403, 'STAFF role rejected with HTTP 403')

    // ------------------------------------------------------------------
    // [Test 2] Multi-Tenant Isolation & Anti-IDOR Defense
    // ------------------------------------------------------------------
    console.log('\n[Test 2] Multi-Tenant Isolation & Anti-IDOR Defense')

    // Tenant B attempts to approve Tenant A's review
    const idorReq = await createAuthRequest(`/api/reviews/${review1.id}/approve`, tenantB, 'POST', { action: 'approve' })
    const idorRes = await postApproveHandler(idorReq, { params: Promise.resolve({ id: review1.id }) })
    assert(idorRes.status === 404 || idorRes.status === 403, `Cross-tenant approval attempt rejected with HTTP ${idorRes.status}`)

    // ------------------------------------------------------------------
    // [Test 3] Concurrency Locking & Atomic Claim (HTTP 409)
    // ------------------------------------------------------------------
    console.log('\n[Test 3] Concurrency Locking & Atomic Claim (HTTP 409)')

    const reviewConcurrency = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Concurrent Customer',
        rating: 4,
        text: 'Fast coffee.',
        source: ReviewSource.GOOGLE,
        externalId: `ext_conc_${Date.now()}`,
        draftText: 'Thank you!',
        draftStatus: DraftStatus.POSTING, // Simulate in-flight claim
      },
    })

    const concurReq = await createAuthRequest(`/api/reviews/${reviewConcurrency.id}/approve`, tenantA, 'POST', { action: 'approve' })
    const concurRes = await postApproveHandler(concurReq, { params: Promise.resolve({ id: reviewConcurrency.id }) })
    assert(concurRes.status === 409, 'Concurrent approval on POSTING review rejected with HTTP 409 Conflict')
    const concurData = await concurRes.json()
    assert(concurData.code === 'ALREADY_POSTING', 'Response contains explicit ALREADY_POSTING code')

    // ------------------------------------------------------------------
    // [Test 4] Manual Publishing Workflow (Approve & Copy)
    // ------------------------------------------------------------------
    console.log('\n[Test 4] Manual Publishing Workflow (Approve & Copy)')

    const reviewManual = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Manual Customer',
        rating: 5,
        text: 'Delicious brunch!',
        source: ReviewSource.GOOGLE,
        externalId: `ext_manual_${Date.now()}`,
        draftText: 'Default draft text',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const manualReq = await createAuthRequest(`/api/reviews/${reviewManual.id}/approve`, tenantA, 'POST', {
      action: 'approve',
      manual: true,
      editedText: 'Approved manual reply text for customer.',
    })
    const manualRes = await postApproveHandler(manualReq, { params: Promise.resolve({ id: reviewManual.id }) })
    assert(manualRes.status === 200, 'Manual approve returns HTTP 200')
    const manualData = await manualRes.json()
    assert(manualData.status === 'POSTED', 'Returned status is POSTED')
    assert(manualData.manual === true, 'Response flags manual: true')
    assert(manualData.publishStatus === 'SAVED_LOCALLY', 'publishStatus is SAVED_LOCALLY')
    assert(manualData.publishedLive === false, 'publishedLive is false')
    assert(manualData.replyText === 'Approved manual reply text for customer.', 'replyText is updated')

    const dbManualReview = await prisma.review.findUnique({ where: { id: reviewManual.id } })
    assert(dbManualReview?.draftStatus === DraftStatus.POSTED, 'DB review draftStatus is POSTED')
    assert(dbManualReview?.replyText === 'Approved manual reply text for customer.', 'DB review replyText persisted')
    assert(dbManualReview?.repliedAt !== null, 'repliedAt timestamp is recorded')

    const manualAttempt = await prisma.reviewPublishAttempt.findFirst({
      where: { reviewId: reviewManual.id },
      orderBy: { createdAt: 'desc' },
    })
    assert(manualAttempt?.status === PublishAttemptStatus.SUCCESS, 'Attempt status is SUCCESS')
    assert(manualAttempt?.remoteId?.startsWith('manual_copy_') === true, 'remoteId is manual_copy_{id}')

    // ------------------------------------------------------------------
    // [Test 5] Direct Platform Dispatch When NOT Connected (publishMode: platform)
    // ------------------------------------------------------------------
    console.log('\n[Test 5] Direct Platform Dispatch When NOT Connected (publishMode: platform)')

    const reviewUnconnected = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Unconnected Customer',
        rating: 4,
        text: 'Great pasta.',
        source: ReviewSource.GOOGLE,
        externalId: `ext_unconn_${Date.now()}`,
        draftText: 'Thank you for trying our pasta!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const unconnectedReq = await createAuthRequest(`/api/reviews/${reviewUnconnected.id}/approve`, tenantA, 'POST', {
      action: 'approve',
      publishMode: 'platform',
    })
    const unconnectedRes = await postApproveHandler(unconnectedReq, { params: Promise.resolve({ id: reviewUnconnected.id }) })
    assert(unconnectedRes.status === 400, 'Direct publish without token returns HTTP 400')
    const unconnectedData = await unconnectedRes.json()
    assert(unconnectedData.code === 'NO_OAUTH_TOKEN', 'Response returns code NO_OAUTH_TOKEN')
    assert(unconnectedData.status === 'APPROVED', 'Response returns status APPROVED (draft preserved)')
    assert(unconnectedData.publishStatus === 'FAILED', 'publishStatus is FAILED')
    assert(unconnectedData.publishedLive === false, 'publishedLive is false')

    const dbUnconnectedReview = await prisma.review.findUnique({ where: { id: reviewUnconnected.id } })
    assert(dbUnconnectedReview?.draftStatus === DraftStatus.APPROVED, 'DB review rolled back to APPROVED (not lost in POSTING)')

    const failedAttempt = await prisma.reviewPublishAttempt.findFirst({
      where: { reviewId: reviewUnconnected.id },
      orderBy: { createdAt: 'desc' },
    })
    assert(failedAttempt?.status === PublishAttemptStatus.FAILED, 'Attempt status is FAILED')
    assert(failedAttempt?.errorMessage?.includes('Google account not connected') === true, 'errorMessage explains missing account')

    // ------------------------------------------------------------------
    // [Test 6] Re-publishing / Retry Capability
    // ------------------------------------------------------------------
    console.log('\n[Test 6] Re-publishing / Retry Capability')

    // Review is in APPROVED state after failure. Retry via manual copy:
    const retryReq = await createAuthRequest(`/api/reviews/${reviewUnconnected.id}/approve`, tenantA, 'POST', {
      action: 'approve',
      manual: true,
    })
    const retryRes = await postApproveHandler(retryReq, { params: Promise.resolve({ id: reviewUnconnected.id }) })
    assert(retryRes.status === 200, 'Retrying previously failed review with manual copy succeeds with HTTP 200')
    const retryData = await retryRes.json()
    assert(retryData.status === 'POSTED', 'Review successfully transitions to POSTED on retry')

    // ------------------------------------------------------------------
    // [Test 7] Direct Facebook Dispatch When NOT Connected
    // ------------------------------------------------------------------
    console.log('\n[Test 7] Direct Facebook Dispatch When NOT Connected')

    const fbReview = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Facebook Diner',
        rating: 5,
        text: 'Loved the cocktails!',
        source: ReviewSource.FACEBOOK,
        externalId: `ext_fb_${Date.now()}`,
        draftText: 'Cheers!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const fbReq = await createAuthRequest(`/api/reviews/${fbReview.id}/approve`, tenantA, 'POST', {
      action: 'approve',
      publishMode: 'platform',
    })
    const fbRes = await postApproveHandler(fbReq, { params: Promise.resolve({ id: fbReview.id }) })
    assert(fbRes.status === 400, 'Facebook direct publish without token returns HTTP 400')
    const fbData = await fbRes.json()
    assert(fbData.code === 'NO_OAUTH_TOKEN', 'Response returns code NO_OAUTH_TOKEN')
    assert(fbData.status === 'APPROVED', 'Response status is APPROVED')

    // ------------------------------------------------------------------
    // [Test 8] Outbound Status Reconciliation in GET /api/inbox
    // ------------------------------------------------------------------
    console.log('\n[Test 8] Outbound Status Reconciliation in GET /api/inbox')

    const inboxReq = await createAuthRequest(`/api/inbox?businessId=${tenantA.business.id}`, tenantA, 'GET')
    const inboxRes = await getInboxHandler(inboxReq)
    assert(inboxRes.status === 200, 'GET /api/inbox returns HTTP 200')
    const inboxData = await inboxRes.json()
    assert(Array.isArray(inboxData.reviews), 'inbox reviews is an array')

    // Check the manual review
    const inboxManualReview = inboxData.reviews.find((r: any) => r.id === reviewManual.id)
    assert(!!inboxManualReview, 'Manual review is present in inbox')
    assert(inboxManualReview.draftStatus === 'POSTED', 'inbox review draftStatus is POSTED')
    assert(!!inboxManualReview.latestPublishAttempt, 'latestPublishAttempt is hydrated on manual review')
    assert(inboxManualReview.latestPublishAttempt.status === 'SUCCESS', 'latestPublishAttempt status is SUCCESS')
    assert(inboxManualReview.latestPublishAttempt.remoteId?.startsWith('manual_copy_') === true, 'latestPublishAttempt remoteId is manual_copy_')

    // Check the failed attempt on the Facebook review
    const inboxFbReview = inboxData.reviews.find((r: any) => r.id === fbReview.id)
    assert(!!inboxFbReview, 'Facebook review is present in inbox')
    assert(inboxFbReview.draftStatus === 'APPROVED', 'Facebook review draftStatus is APPROVED')
    assert(!!inboxFbReview.latestPublishAttempt, 'latestPublishAttempt is hydrated on failed review')
    assert(inboxFbReview.latestPublishAttempt.status === 'FAILED', 'latestPublishAttempt status is FAILED')

    // ------------------------------------------------------------------
    // [Test 9] Internal Platform Dispatch (INTERNAL Reviews)
    // ------------------------------------------------------------------
    console.log('\n[Test 9] Internal Platform Dispatch (INTERNAL Reviews)')

    const internalReview = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Private Customer',
        rating: 5,
        text: 'Wonderful manager outreach.',
        source: ReviewSource.INTERNAL,
        externalId: `ext_internal_${Date.now()}`,
        draftText: 'Thank you for your direct feedback.',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    const internalReq = await createAuthRequest(`/api/reviews/${internalReview.id}/approve`, tenantA, 'POST', { action: 'approve' })
    const internalRes = await postApproveHandler(internalReq, { params: Promise.resolve({ id: internalReview.id }) })
    assert(internalRes.status === 200, 'Internal review approve returns HTTP 200')
    const internalData = await internalRes.json()
    assert(internalData.status === 'POSTED', 'Internal review status is POSTED')
    assert(internalData.publishStatus === 'SAVED_LOCALLY', 'publishStatus is SAVED_LOCALLY')

    // ------------------------------------------------------------------
    // [Test 10] Audit Log Attribution & Security Observability
    // ------------------------------------------------------------------
    console.log('\n[Test 10] Audit Log Attribution & Security Observability')

    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: tenantA.user.id },
      orderBy: { createdAt: 'desc' },
    })
    assert(auditLogs.length >= 3, `Audit logs captured for user actions (found ${auditLogs.length})`)
    const actions = auditLogs.map(l => l.action)
    assert(actions.includes('reply.manual_approved'), 'Captured reply.manual_approved audit action')
    assert(actions.includes('reply.publish_failed'), 'Captured reply.publish_failed audit action')

    // ------------------------------------------------------------------
    // [Test 11] Google Direct Publishing — Mock Provider Success Path
    // ------------------------------------------------------------------
    console.log('\n[Test 11] Google Direct Publishing — Mock Provider Success Path')

    await prisma.oAuthToken.upsert({
      where: { businessId_provider: { businessId: tenantA.business.id, provider: 'google' } },
      create: {
        businessId: tenantA.business.id,
        provider: 'google',
        accessTokenEnc: encrypt('mock_valid_google_access_token_12345'),
        refreshTokenEnc: encrypt('mock_refresh_token_abc'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
      update: {
        accessTokenEnc: encrypt('mock_valid_google_access_token_12345'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    })

    const googleReviewSuccess = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Google Happy Customer',
        rating: 5,
        text: 'Unbelievable steak and wine pairing.',
        source: ReviewSource.GOOGLE,
        externalId: 'accounts/123/locations/456/reviews/rev_goog_success_1',
        draftText: 'Thank you for dining with us at Alice Gastropub!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const originalFetch = globalThis.fetch
    let capturedGoogleCall: { url: string; method: string; body: any } | null = null

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/reply') && url.includes('mybusiness.googleapis.com')) {
        capturedGoogleCall = {
          url,
          method: init?.method || 'GET',
          body: init?.body ? JSON.parse(init.body) : null,
        }
        return new Response(JSON.stringify({ comment: 'Thank you for dining with us at Alice Gastropub!' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const googSuccessReq = await createAuthRequest(`/api/reviews/${googleReviewSuccess.id}/approve`, tenantA, 'POST', {
        action: 'approve',
        publishMode: 'platform',
      })
      const googSuccessRes = await postApproveHandler(googSuccessReq, { params: Promise.resolve({ id: googleReviewSuccess.id }) })
      assert(googSuccessRes.status === 200, 'Google direct publish with mock provider returns HTTP 200')
      const googSuccessData = await googSuccessRes.json()
      assert(googSuccessData.status === 'POSTED', 'Google review status is POSTED')
      assert(googSuccessData.publishedLive === true, 'publishedLive is true')
      assert(googSuccessData.publishStatus === 'LIVE', 'publishStatus is LIVE')
      assert(capturedGoogleCall !== null, 'External request to Google Business Profile API was made')
      assert((capturedGoogleCall as any)?.method === 'PUT', 'Google GBP dispatch used HTTP PUT')
      assert((capturedGoogleCall as any)?.url.includes('rev_goog_success_1/reply') === true, 'URL contains target review resource name')
      assert((capturedGoogleCall as any)?.body?.comment === 'Thank you for dining with us at Alice Gastropub!', 'Correct reply text was dispatched')

      const dbGoogReview = await prisma.review.findUnique({ where: { id: googleReviewSuccess.id } })
      assert(dbGoogReview?.draftStatus === DraftStatus.POSTED, 'DB review draftStatus is POSTED')

      const dbGoogAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: googleReviewSuccess.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(dbGoogAttempt?.status === PublishAttemptStatus.SUCCESS, 'ReviewPublishAttempt status is SUCCESS')
      assert(dbGoogAttempt?.remoteId === googleReviewSuccess.externalId, 'remoteId matches external review identifier')
    } finally {
      globalThis.fetch = originalFetch
    }

    // ------------------------------------------------------------------
    // [Test 12] Google Direct Publishing — Mock Provider 401 Reauth Path
    // ------------------------------------------------------------------
    console.log('\n[Test 12] Google Direct Publishing — Mock Provider 401 Reauth Path')

    const googleReview401 = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Google Expired Token Customer',
        rating: 4,
        text: 'Great dessert.',
        source: ReviewSource.GOOGLE,
        externalId: 'accounts/123/locations/456/reviews/rev_goog_401_1',
        draftText: 'Glad you enjoyed our dessert!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/reply') && url.includes('mybusiness.googleapis.com')) {
        return new Response(JSON.stringify({ error: { code: 401, message: 'Request had invalid authentication credentials.' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const goog401Req = await createAuthRequest(`/api/reviews/${googleReview401.id}/approve`, tenantA, 'POST', {
        action: 'approve',
        publishMode: 'platform',
      })
      const goog401Res = await postApproveHandler(goog401Req, { params: Promise.resolve({ id: googleReview401.id }) })
      assert(goog401Res.status === 401, 'Google 401 reauth returns HTTP 401')
      const goog401Data = await goog401Res.json()
      assert(goog401Data.code === 'GOOGLE_REAUTH_REQUIRED', 'Response returns code GOOGLE_REAUTH_REQUIRED')
      assert(goog401Data.status === 'APPROVED', 'Response review status remains APPROVED (safe for retry)')
      assert(goog401Data.publishedLive === false, 'publishedLive is false (no false success)')
      assert(goog401Data.publishStatus === 'FAILED', 'publishStatus is FAILED')

      const dbGoog401 = await prisma.review.findUnique({ where: { id: googleReview401.id } })
      assert(dbGoog401?.draftStatus === DraftStatus.APPROVED, 'DB review rolled back to APPROVED')

      const dbGoog401Attempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: googleReview401.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(dbGoog401Attempt?.status === PublishAttemptStatus.FAILED, 'ReviewPublishAttempt status is FAILED')
      assert(dbGoog401Attempt?.errorMessage?.includes('Google authorization has expired') === true, 'errorMessage informs user of expired auth')
    } finally {
      globalThis.fetch = originalFetch
    }

    // ------------------------------------------------------------------
    // [Test 13] Facebook Direct Publishing — Mock Provider Success Path
    // ------------------------------------------------------------------
    console.log('\n[Test 13] Facebook Direct Publishing — Mock Provider Success Path')

    await prisma.oAuthToken.upsert({
      where: { businessId_provider: { businessId: tenantA.business.id, provider: 'facebook' } },
      create: {
        businessId: tenantA.business.id,
        provider: 'facebook',
        accessTokenEnc: encrypt('mock_valid_fb_page_token_xyz987'),
        refreshTokenEnc: encrypt('mock_fb_refresh_token'),
      },
      update: {
        accessTokenEnc: encrypt('mock_valid_fb_page_token_xyz987'),
      },
    })

    const fbReviewSuccess = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Facebook Happy Patron',
        rating: 5,
        text: 'Loved the live acoustic music on Friday!',
        source: ReviewSource.FACEBOOK,
        externalId: 'open_graph_story_fb_123456789',
        draftText: 'Thank you for rocking with us!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    let capturedFacebookCall: { url: string; method: string; body: any } | null = null

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('graph.facebook.com') && url.includes('/comments')) {
        capturedFacebookCall = {
          url,
          method: init?.method || 'GET',
          body: init?.body ? JSON.parse(init.body) : null,
        }
        return new Response(JSON.stringify({ id: 'fb_comment_remote_id_778899' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const fbSuccessReq = await createAuthRequest(`/api/reviews/${fbReviewSuccess.id}/approve`, tenantA, 'POST', {
        action: 'approve',
        publishMode: 'platform',
      })
      const fbSuccessRes = await postApproveHandler(fbSuccessReq, { params: Promise.resolve({ id: fbReviewSuccess.id }) })
      assert(fbSuccessRes.status === 200, 'Facebook direct publish with mock provider returns HTTP 200')
      const fbSuccessData = await fbSuccessRes.json()
      assert(fbSuccessData.status === 'POSTED', 'Facebook review status is POSTED')
      assert(fbSuccessData.publishedLive === true, 'publishedLive is true')
      assert(fbSuccessData.publishStatus === 'LIVE', 'publishStatus is LIVE')
      assert(capturedFacebookCall !== null, 'External request to Facebook Graph API was made')
      assert((capturedFacebookCall as any)?.method === 'POST', 'Facebook dispatch used HTTP POST')
      assert((capturedFacebookCall as any)?.url.includes('open_graph_story_fb_123456789/comments') === true, 'URL contains target story ID')
      assert((capturedFacebookCall as any)?.body?.message === 'Thank you for rocking with us!', 'Correct message was dispatched')

      const dbFbReview = await prisma.review.findUnique({ where: { id: fbReviewSuccess.id } })
      assert(dbFbReview?.draftStatus === DraftStatus.POSTED, 'DB review draftStatus is POSTED')

      const dbFbAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: fbReviewSuccess.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(dbFbAttempt?.status === PublishAttemptStatus.SUCCESS, 'ReviewPublishAttempt status is SUCCESS')
      assert(dbFbAttempt?.remoteId === 'fb_comment_remote_id_778899', 'remoteId matches Facebook comment identifier')
    } finally {
      globalThis.fetch = originalFetch
    }

    // ------------------------------------------------------------------
    // [Test 14] Facebook Direct Publishing — Ambiguous Network Failure (UNCONFIRMED)
    // ------------------------------------------------------------------
    console.log('\n[Test 14] Facebook Direct Publishing — Ambiguous Network Failure (UNCONFIRMED)')

    const fbReviewTimeout = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Facebook Timeout Patron',
        rating: 4,
        text: 'Great burger.',
        source: ReviewSource.FACEBOOK,
        externalId: 'open_graph_story_fb_timeout_1',
        draftText: 'Thank you for the burger feedback!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('graph.facebook.com') && url.includes('/comments')) {
        throw new Error('ETIMEDOUT: Connection socket closed unexpectedly after dispatch')
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const fbTimeoutReq = await createAuthRequest(`/api/reviews/${fbReviewTimeout.id}/approve`, tenantA, 'POST', {
        action: 'approve',
        publishMode: 'platform',
      })
      const fbTimeoutRes = await postApproveHandler(fbTimeoutReq, { params: Promise.resolve({ id: fbReviewTimeout.id }) })
      assert(fbTimeoutRes.status === 502, 'Facebook network timeout returns HTTP 502 Bad Gateway')
      const fbTimeoutData = await fbTimeoutRes.json()
      assert(fbTimeoutData.code === 'AMBIGUOUS_PUBLISH', 'Response returns code AMBIGUOUS_PUBLISH')
      assert(fbTimeoutData.status === 'UNCONFIRMED', 'Response status is UNCONFIRMED')
      assert(fbTimeoutData.publishStatus === 'UNCONFIRMED', 'publishStatus is UNCONFIRMED')
      assert(fbTimeoutData.publishedLive === false, 'publishedLive is false (prevents false claim)')

      const dbFbTimeout = await prisma.review.findUnique({ where: { id: fbReviewTimeout.id } })
      assert(dbFbTimeout?.draftStatus === DraftStatus.APPROVED, 'DB review rolled back to APPROVED')

      const dbFbTimeoutAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: fbReviewTimeout.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(dbFbTimeoutAttempt?.status === PublishAttemptStatus.UNCONFIRMED, 'ReviewPublishAttempt status is UNCONFIRMED')
    } finally {
      globalThis.fetch = originalFetch
    }

    // ------------------------------------------------------------------
    // [Test 15] Repeated Approval on Already POSTED Review (Idempotency Guard)
    // ------------------------------------------------------------------
    console.log('\n[Test 15] Repeated Approval on Already POSTED Review (Idempotency Guard)')

    const attemptsBefore = await prisma.reviewPublishAttempt.count({
      where: { reviewId: googleReviewSuccess.id },
    })

    let externalCallsDuringRepeat = 0
    globalThis.fetch = (async (input: any, init?: any) => {
      externalCallsDuringRepeat++
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const repeatReq = await createAuthRequest(`/api/reviews/${googleReviewSuccess.id}/approve`, tenantA, 'POST', {
        action: 'approve',
        publishMode: 'platform',
      })
      const repeatRes = await postApproveHandler(repeatReq, { params: Promise.resolve({ id: googleReviewSuccess.id }) })
      assert(repeatRes.status === 409, 'Re-approval on already POSTED review rejected with HTTP 409 Conflict')
      const repeatData = await repeatRes.json()
      assert(repeatData.code === 'ALREADY_POSTING', 'Response returns code ALREADY_POSTING')
      assert(externalCallsDuringRepeat === 0, 'Zero external HTTP requests attempted on already posted review')

      const attemptsAfter = await prisma.reviewPublishAttempt.count({
        where: { reviewId: googleReviewSuccess.id },
      })
      assert(attemptsAfter === attemptsBefore, 'Zero duplicate publish attempt records created')
    } finally {
      globalThis.fetch = originalFetch
    }

  } finally {
    console.log('\nCleaning up test tenants...')
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  }

  console.log('\n====================================================================')
  console.log(`JOB-12 VERIFICATION SUMMARY: ${passed} passed / ${failed} failed`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})

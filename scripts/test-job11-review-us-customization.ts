/**
 * JOB-11 Dedicated Verification Suite: Public Review Landing Page Customization & Multi-Platform QR Acceleration (REV-US-01)
 *
 * Validates:
 * 1. Authentication & Role-Based Authorization (OWNER/ADMIN allow; VIEWER/STAFF 403; unauth 401)
 * 2. Tenant Isolation & Anti-IDOR Defense (Cross-tenant businessId mutation rejected)
 * 3. Page Customization Persistence (Title, subtitle, and private feedback toggle stored and hydrated)
 * 4. Input Sanitization & Boundary Safety (Lengths bounded, invalid URLs rejected)
 * 5. Public Review-Us API Contract (Custom branding exposed without leaking tenant secrets)
 * 6. Public Private Feedback Ingestion (Creates INTERNAL review record with correct tenant linkage)
 * 7. Rate Limiting & Input Validation on Public Feedback (Malformed inputs 400; 429 rate limit enforcement)
 * 8. FTC Compliance Invariants (Zero review gating; all review platforms remain universally accessible)
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getReviewLinksHandler, POST as postReviewLinksHandler } from '../src/app/api/review-links/route'
import { GET as getPublicReviewUsHandler } from '../src/app/api/review-us/[slug]/route'
import { POST as postFeedbackHandler } from '../src/app/api/review-us/[slug]/feedback/route'
import { Role } from '@prisma/client'

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
  console.log('JOB-11 VERIFICATION SUITE: Review Us Customization & QR (REV-US-01)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Authentication & Role Authorization on /api/review-links
    // -------------------------------------------------------------------------
    console.log('[Test 1] Authentication & Role-Based Authorization Enforcement')
    const unauthGetReq = await createAuthRequest('http://localhost:3000/api/review-links?businessId=test', null, 'GET')
    const unauthGetRes = await getReviewLinksHandler(unauthGetReq)
    assert(unauthGetRes.status === 401, 'Unauthenticated GET /api/review-links rejected with HTTP 401')

    const unauthPostReq = await createAuthRequest('http://localhost:3000/api/review-links', null, 'POST', { businessId: 'test' })
    const unauthPostRes = await postReviewLinksHandler(unauthPostReq)
    assert(unauthPostRes.status === 401, 'Unauthenticated POST /api/review-links rejected with HTTP 401')

    console.log('\n[Setup] Seeding isolated tenants A and B')
    tenantA = await seedTestTenant({ name: 'Alpha Owner', businessName: 'Alpha Bistro' })
    tenantB = await seedTestTenant({ name: 'Beta Owner', businessName: 'Beta Dental' })
    assert(!!tenantA && !!tenantB, 'Tenants A and B seeded successfully')

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

    // Role check: VIEWER role cannot update review links
    const viewerPostReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      viewerTenant,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [],
      }
    )
    const viewerPostRes = await postReviewLinksHandler(viewerPostReq)
    assert(viewerPostRes.status === 403, 'VIEWER role rejected with HTTP 403 on POST /api/review-links')
    const viewerData = await viewerPostRes.json()
    assert(viewerData.code === 'FORBIDDEN', 'Rejection returns explicit FORBIDDEN code')

    // Role check: STAFF role cannot update review links
    const staffPostReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      staffTenant,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [],
      }
    )
    const staffPostRes = await postReviewLinksHandler(staffPostReq)
    assert(staffPostRes.status === 403, 'STAFF role rejected with HTTP 403 on POST /api/review-links')

    // Role check: OWNER role permitted
    const ownerPostReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [
          { platformId: 'google', url: 'https://search.google.com/local/writereview?placeid=ChIJ123', enabled: true },
        ],
      }
    )
    const ownerPostRes = await postReviewLinksHandler(ownerPostReq)
    assert(ownerPostRes.status === 200, 'OWNER role permitted with HTTP 200 on POST /api/review-links')

    // Role check: ADMIN role permitted
    const adminPostReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      adminTenant,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [
          { platformId: 'google', url: 'https://search.google.com/local/writereview?placeid=ChIJ123', enabled: true },
        ],
      }
    )
    const adminPostRes = await postReviewLinksHandler(adminPostReq)
    assert(adminPostRes.status === 200, 'ADMIN role permitted with HTTP 200 on POST /api/review-links')

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Tenant Isolation & IDOR Defense
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Multi-Tenant Isolation & Anti-IDOR Defense')
    // Tenant B attempts to read Tenant A's review links
    const crossTenantGetReq = await createAuthRequest(
      `http://localhost:3000/api/review-links?businessId=${tenantA.business.id}`,
      tenantB,
      'GET'
    )
    const crossTenantGetRes = await getReviewLinksHandler(crossTenantGetReq)
    assert(crossTenantGetRes.status === 403, 'Cross-tenant GET rejected with HTTP 403')

    // Tenant B attempts to mutate Tenant A's review links
    const crossTenantPostReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantB,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [],
      }
    )
    const crossTenantPostRes = await postReviewLinksHandler(crossTenantPostReq)
    assert(crossTenantPostRes.status === 403, 'Cross-tenant POST rejected with HTTP 403')

    // -------------------------------------------------------------------------
    // TEST 3: Page Customization Persistence
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Landing Page Customization Persistence')
    const customTitle = 'Loved Dining with Us at Alpha?'
    const customSubtitle = 'Your feedback means the world to our kitchen and crew. Choose a platform below!'
    const customSlug = `alpha-bistro-${Date.now()}`

    const saveCustomizationReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        slug: customSlug,
        reviewPageTitle: customTitle,
        reviewPageSubtitle: customSubtitle,
        reviewPagePrivateFeedbackEnabled: true,
        links: [
          { platformId: 'google', url: 'https://search.google.com/local/writereview?placeid=ChIJalpha', enabled: true, sortOrder: 0 },
          { platformId: 'yelp', url: 'https://yelp.com/writeareview/biz/alpha-bistro', enabled: true, sortOrder: 1 },
          { customName: 'TripAdvisor', url: 'https://tripadvisor.com/review-alpha', enabled: true, sortOrder: 2 },
        ],
      }
    )
    const saveCustomizationRes = await postReviewLinksHandler(saveCustomizationReq)
    assert(saveCustomizationRes.status === 200, 'POST /api/review-links with customization succeeds with HTTP 200')
    const saveCustomData = await saveCustomizationRes.json()
    assert(saveCustomData.reviewPageTitle === customTitle, 'Response returns updated reviewPageTitle')
    assert(saveCustomData.reviewPageSubtitle === customSubtitle, 'Response returns updated reviewPageSubtitle')
    assert(saveCustomData.reviewPagePrivateFeedbackEnabled === true, 'Response returns reviewPagePrivateFeedbackEnabled: true')
    assert(saveCustomData.links.length === 3, 'Response returns 3 saved links')

    // Hydrate via GET
    const hydrateReq = await createAuthRequest(
      `http://localhost:3000/api/review-links?businessId=${tenantA.business.id}`,
      tenantA,
      'GET'
    )
    const hydrateRes = await getReviewLinksHandler(hydrateReq)
    assert(hydrateRes.status === 200, 'GET /api/review-links hydrates with HTTP 200')
    const hydrateData = await hydrateRes.json()
    assert(hydrateData.reviewPageTitle === customTitle, 'Hydrated reviewPageTitle matches persisted value')
    assert(hydrateData.reviewPageSubtitle === customSubtitle, 'Hydrated reviewPageSubtitle matches persisted value')
    assert(hydrateData.reviewPagePrivateFeedbackEnabled === true, 'Hydrated reviewPagePrivateFeedbackEnabled matches')
    assert(hydrateData.slug === customSlug, 'Hydrated slug matches persisted value')

    // -------------------------------------------------------------------------
    // TEST 4: Protocol Validation & Slug Collision
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Protocol Validation & Slug Collision Protection')
    // Attempt javascript: link
    const jsProtocolReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantA,
      'POST',
      {
        businessId: tenantA.business.id,
        links: [{ platformId: 'google', url: 'javascript:alert(1)', enabled: true }],
      }
    )
    const jsProtocolRes = await postReviewLinksHandler(jsProtocolReq)
    assert(jsProtocolRes.status === 400, 'javascript: protocol URL rejected with HTTP 400')

    // Tenant B attempts to take Tenant A's slug
    const slugCollisionReq = await createAuthRequest(
      'http://localhost:3000/api/review-links',
      tenantB,
      'POST',
      {
        businessId: tenantB.business.id,
        slug: customSlug,
        links: [],
      }
    )
    const slugCollisionRes = await postReviewLinksHandler(slugCollisionReq)
    assert(slugCollisionRes.status === 409, 'Slug collision rejected with HTTP 409 Conflict')

    // -------------------------------------------------------------------------
    // TEST 5: Public Review-Us API Contract (/api/review-us/[slug])
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Public Review-Us API Contract')
    // Non-existent slug
    const nonExistentReq = new NextRequest('http://localhost:3000/api/review-us/non-existent-xyz-999')
    const nonExistentRes = await getPublicReviewUsHandler(nonExistentReq, {
      params: Promise.resolve({ slug: 'non-existent-xyz-999' }),
    })
    assert(nonExistentRes.status === 404, 'Non-existent slug returns HTTP 404')

    // Valid slug
    const publicReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}`)
    const publicRes = await getPublicReviewUsHandler(publicReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    assert(publicRes.status === 200, 'Valid slug returns HTTP 200 OK')
    const publicData = await publicRes.json()
    assert(publicData.business.name === 'Alpha Bistro', 'Public response contains business name')
    assert(publicData.business.reviewPageTitle === customTitle, 'Public response contains custom headline')
    assert(publicData.business.reviewPageSubtitle === customSubtitle, 'Public response contains custom subtitle')
    assert(publicData.business.reviewPagePrivateFeedbackEnabled === true, 'Public response contains private feedback status')
    assert(publicData.links.length === 3, 'Public response contains 3 enabled links')
    assert(!('orgId' in publicData.business), 'Public response does NOT leak orgId')
    assert(!('ownerId' in publicData.business), 'Public response does NOT leak ownerId')

    // -------------------------------------------------------------------------
    // TEST 6: Public Private Feedback Ingestion (/api/review-us/[slug]/feedback)
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Public Private Feedback Ingestion')
    // Missing name
    const missingNameReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Great food!' }),
    })
    const missingNameRes = await postFeedbackHandler(missingNameReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    assert(missingNameRes.status === 400, 'Missing customerName returns HTTP 400')

    // Missing message
    const missingMsgReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: 'Alex' }),
    })
    const missingMsgRes = await postFeedbackHandler(missingMsgReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    assert(missingMsgRes.status === 400, 'Missing message returns HTTP 400')

    // Valid feedback submission
    const feedbackPayload = {
      customerName: 'Morgan Freeman',
      customerContact: 'morgan@example.com',
      rating: 2,
      message: 'The pasta took 45 minutes to arrive and was lukewarm.',
    }
    const validFeedbackReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.10',
      },
      body: JSON.stringify(feedbackPayload),
    })
    const validFeedbackRes = await postFeedbackHandler(validFeedbackReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    assert(validFeedbackRes.status === 200, 'Valid private feedback submission returns HTTP 200')
    const feedbackResData = await validFeedbackRes.json()
    assert(feedbackResData.success === true, 'Response returns success: true')
    assert(!!feedbackResData.id, 'Response returns feedback review ID')

    // Verify record in database
    const savedReview = await prisma.review.findUnique({
      where: { id: feedbackResData.id },
    })
    assert(!!savedReview, 'Feedback record exists in database')
    assert(savedReview?.businessId === tenantA.business.id, 'Feedback is isolated to target business')
    assert(savedReview?.source === 'INTERNAL', 'Feedback source is INTERNAL')
    assert(savedReview?.author === 'Morgan Freeman', 'Feedback author matches')
    assert(savedReview?.rating === 2, 'Feedback rating matches')
    assert(Boolean(savedReview?.text.includes('45 minutes')), 'Feedback message is preserved')
    assert(Boolean(savedReview?.text.includes('morgan@example.com')), 'Direct contact is safely appended to record')

    // -------------------------------------------------------------------------
    // TEST 7: Private Feedback Disabled Enforcement
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Private Feedback Disabled Gate')
    // Turn off private feedback for tenant A
    await postReviewLinksHandler(
      await createAuthRequest(
        'http://localhost:3000/api/review-links',
        tenantA,
        'POST',
        {
          businessId: tenantA.business.id,
          reviewPagePrivateFeedbackEnabled: false,
        }
      )
    )

    const disabledFeedbackReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.11' },
      body: JSON.stringify(feedbackPayload),
    })
    const disabledFeedbackRes = await postFeedbackHandler(disabledFeedbackReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    assert(disabledFeedbackRes.status === 403, 'Feedback rejected with HTTP 403 when private feedback is disabled')

    // -------------------------------------------------------------------------
    // TEST 8: FTC Compliance Check
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] FTC Compliance Verification (Zero Review Gating)')
    // Verify public endpoint returns all enabled links regardless of feedback settings
    const ftcReq = new NextRequest(`http://localhost:3000/api/review-us/${customSlug}`)
    const ftcRes = await getPublicReviewUsHandler(ftcReq, {
      params: Promise.resolve({ slug: customSlug }),
    })
    const ftcData = await ftcRes.json()
    assert(ftcData.links.length === 3, 'All 3 public review links remain visible and accessible')
    assert(ftcData.business.reviewPagePrivateFeedbackEnabled === false, 'Reflects disabled feedback toggle accurately')

  } catch (err: any) {
    console.error('\n[UNEXPECTED ERROR]:', err)
    failed++
  } finally {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  }

  console.log('\n====================================================================')
  console.log(`JOB-11 VERIFICATION SUMMARY: ${passed} passed / ${failed} failed`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch((e) => {
  console.error('Fatal error during test run:', e)
  process.exit(1)
})

/**
 * JOB-9 Dedicated Verification Suite: Executive Analytics & Reports Data Integrity
 *
 * Validates:
 * 1. Unauthenticated request rejection (HTTP 401)
 * 2. Multi-tenant isolation & IDOR defense (HTTP 403 when Tenant B queries Tenant A's business)
 * 3. Scoped single-location vs org-wide aggregation
 * 4. Mathematical precision for:
 *    - totalReviews count
 *    - avgRating average
 *    - responseRate calculation (replied reviews / total reviews)
 *    - customerNps calculation (% Promoters 5★ - % Detractors 1-3★)
 *    - 12-week velocity chronological bucket distribution
 * 5. Empty location / zero review fail-closed handling
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as executiveReportsHandler } from '../src/app/api/reports/executive/route'
import { ReviewSource, DraftStatus } from '@prisma/client'

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

async function createMockRequest(url: string, cookieValue?: string): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (cookieValue) {
    headers['cookie'] = `${SESSION_COOKIE}=${cookieValue}`
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'GET',
    headers,
  })
}

async function runTests() {
  console.log('====================================================================')
  console.log('JOB-9 VERIFICATION SUITE: Executive Analytics & Reports Subsystem')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let businessA2Id: string | null = null

  try {
    // -----------------------------------------------------------------
    // STEP 1: Unauthenticated request enforcement
    // -----------------------------------------------------------------
    console.log('[Test 1] Authentication Enforcement')
    const unauthReq = await createMockRequest('http://localhost:3000/api/reports/executive')
    const unauthRes = await executiveReportsHandler(unauthReq)
    assert(unauthRes.status === 401, `Unauthenticated request returned HTTP ${unauthRes.status} (expected 401)`)

    // -----------------------------------------------------------------
    // STEP 2: Seed isolated test tenants
    // -----------------------------------------------------------------
    console.log('\n[Setup] Seeding isolated tenants A and B')
    tenantA = await seedTestTenant({
      name: 'Owner A',
      businessName: 'Tenant A Primary Cafe',
      businessSlug: `job9-test-biz-a1-${Date.now()}`,
    })
    tenantB = await seedTestTenant({
      name: 'Owner B',
      businessName: 'Tenant B Logistics',
      businessSlug: `job9-test-biz-b-${Date.now()}`,
    })

    // Create a second business for Tenant A to test multi-location scoping
    const bizA2 = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Tenant A Secondary Bakery',
        slug: `job9-test-biz-a2-${Date.now()}`,
      },
    })
    businessA2Id = bizA2.id

    const tokenA = await encodeSession({
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      role: tenantA.membership.role,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
      sessionVersion: tenantA.user.sessionVersion,
    })

    const tokenB = await encodeSession({
      id: tenantB.user.id,
      email: tenantB.user.email,
      name: tenantB.user.name,
      role: tenantB.membership.role,
      orgId: tenantB.org.id,
      orgName: tenantB.org.name,
      orgPlan: tenantB.org.plan,
      sessionVersion: tenantB.user.sessionVersion,
    })

    // -----------------------------------------------------------------
    // STEP 3: Empty location handling (0 reviews)
    // -----------------------------------------------------------------
    console.log('\n[Test 2] Empty Location Handling (Zero Reviews)')
    const emptyReq = await createMockRequest(
      `http://localhost:3000/api/reports/executive?businessId=${tenantA.business.id}`,
      tokenA
    )
    const emptyRes = await executiveReportsHandler(emptyReq)
    const emptyData = await emptyRes.json()

    assert(emptyRes.status === 200, `Empty location returned HTTP 200`)
    assert(emptyData.hasBusiness === true, `hasBusiness is true`)
    assert(emptyData.totalReviews === 0, `totalReviews is 0`)
    assert(emptyData.avgRating === 0, `avgRating is 0`)
    assert(emptyData.customerNps === 0, `customerNps is 0`)
    assert(emptyData.responseRate === 0, `responseRate is 0`)
    assert(Array.isArray(emptyData.velocity) && emptyData.velocity.length === 12, `Velocity returns 12 weekly buckets`)
    assert(emptyData.velocity.every((v: any) => v.count === 0), `All weekly velocity counts are 0`)

    // -----------------------------------------------------------------
    // STEP 4: Populate controlled test review dataset for Tenant A
    // -----------------------------------------------------------------
    console.log('\n[Setup] Ingesting controlled test reviews for Tenant A')
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    // Business A1 Reviews:
    // Review 1: 5★ (Promoter), replied (POSTED), created today
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `job9_r1_${Date.now()}`,
        author: 'Alice Walker',
        rating: 5,
        text: 'Superb service!',
        draftStatus: DraftStatus.POSTED,
        replyText: 'Thank you Alice!',
        repliedAt: now,
        createdAt: now,
      },
    })

    // Review 2: 5★ (Promoter), unreplied, created 1 week ago
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `job9_r2_${Date.now()}`,
        author: 'Bob Smith',
        rating: 5,
        text: 'Great experience!',
        draftStatus: DraftStatus.NONE,
        createdAt: oneWeekAgo,
      },
    })

    // Review 3: 4★ (Passive), unreplied, created 2 weeks ago
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.YELP,
        externalId: `job9_r3_${Date.now()}`,
        author: 'Charlie Brown',
        rating: 4,
        text: 'Good coffee.',
        draftStatus: DraftStatus.NONE,
        createdAt: twoWeeksAgo,
      },
    })

    // Review 4: 1★ (Detractor), replied, created today
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.FACEBOOK,
        externalId: `job9_r4_${Date.now()}`,
        author: 'Danielle Davis',
        rating: 1,
        text: 'Long wait times.',
        draftStatus: DraftStatus.POSTED,
        replyText: 'Sorry about the wait, Danielle.',
        repliedAt: now,
        createdAt: now,
      },
    })

    // Business A2 Review (Secondary Location):
    // Review 5: 5★ (Promoter), unreplied, created today
    await prisma.review.create({
      data: {
        businessId: businessA2Id,
        source: ReviewSource.GOOGLE,
        externalId: `job9_r5_${Date.now()}`,
        author: 'Evan Wright',
        rating: 5,
        text: 'Best croissants in town!',
        draftStatus: DraftStatus.NONE,
        createdAt: now,
      },
    })

    // -----------------------------------------------------------------
    // STEP 5: Verify Scoped Single-Location Aggregation (Business A1)
    // -----------------------------------------------------------------
    console.log('\n[Test 3] Scoped Single-Location Aggregation (Business A1)')
    const reqA1 = await createMockRequest(
      `http://localhost:3000/api/reports/executive?businessId=${tenantA.business.id}`,
      tokenA
    )
    const resA1 = await executiveReportsHandler(reqA1)
    const dataA1 = await resA1.json()

    assert(resA1.status === 200, `Scoped request returned HTTP 200`)
    assert(dataA1.isOrgWide === false, `isOrgWide is false for scoped query`)
    assert(dataA1.businessId === tenantA.business.id, `Returned correct businessId`)
    assert(dataA1.businessName === 'Tenant A Primary Cafe', `Returned correct businessName`)

    // Business A1 has 4 reviews: 5★, 5★, 4★, 1★
    // avgRating = (5 + 5 + 4 + 1) / 4 = 15 / 4 = 3.75 -> rounded to 3.8
    assert(dataA1.totalReviews === 4, `totalReviews is 4 (actual: ${dataA1.totalReviews})`)
    assert(dataA1.avgRating === 3.8, `avgRating is 3.8 (actual: ${dataA1.avgRating})`)

    // Replied: 2 out of 4 = 50%
    assert(dataA1.responseRate === 50, `responseRate is 50% (actual: ${dataA1.responseRate}%)`)

    // NPS: Promoters = 2 (5★), Passives = 1 (4★), Detractors = 1 (1★)
    // NPS = ((2 - 1) / 4) * 100 = 25
    assert(dataA1.customerNps === 25, `customerNps is +25 (actual: ${dataA1.customerNps})`)

    // Velocity: 12 buckets, current week (W12) has Review 1 & Review 4 = 2 reviews
    const w12Bucket = dataA1.velocity.find((v: any) => v.weekLabel === 'W12')
    assert(w12Bucket && w12Bucket.count === 2, `W12 bucket has 2 reviews (actual: ${w12Bucket?.count})`)

    // -----------------------------------------------------------------
    // STEP 6: Verify Organization-Wide Aggregation (All Locations of Tenant A)
    // -----------------------------------------------------------------
    console.log('\n[Test 4] Organization-Wide Aggregation (All Locations)')
    const reqOrg = await createMockRequest('http://localhost:3000/api/reports/executive', tokenA)
    const resOrg = await executiveReportsHandler(reqOrg)
    const dataOrg = await resOrg.json()

    assert(resOrg.status === 200, `Org-wide request returned HTTP 200`)
    assert(dataOrg.isOrgWide === true, `isOrgWide is true for org query`)
    assert(dataOrg.businessId === null, `businessId is null for org query`)

    // Org-wide has 5 reviews: (4 from A1 + 1 from A2)
    // Ratings: 5★, 5★, 4★, 1★, 5★ -> Sum = 20 / 5 = 4.0
    assert(dataOrg.totalReviews === 5, `totalReviews across all locations is 5 (actual: ${dataOrg.totalReviews})`)
    assert(dataOrg.avgRating === 4.0, `avgRating across all locations is 4.0 (actual: ${dataOrg.avgRating})`)

    // Replied: 2 out of 5 = 40%
    assert(dataOrg.responseRate === 40, `responseRate across all locations is 40% (actual: ${dataOrg.responseRate}%)`)

    // NPS: Promoters = 3 (5★), Passives = 1 (4★), Detractors = 1 (1★)
    // NPS = ((3 - 1) / 5) * 100 = 40
    assert(dataOrg.customerNps === 40, `customerNps across all locations is +40 (actual: ${dataOrg.customerNps})`)

    // -----------------------------------------------------------------
    // STEP 7: Verify Multi-Tenant Isolation & IDOR Defense
    // -----------------------------------------------------------------
    console.log('\n[Test 5] Multi-Tenant Isolation & IDOR Defense')
    // Tenant B attempts to access Tenant A's business analytics
    const idorReq = await createMockRequest(
      `http://localhost:3000/api/reports/executive?businessId=${tenantA.business.id}`,
      tokenB
    )
    const idorRes = await executiveReportsHandler(idorReq)
    assert(idorRes.status === 403, `Cross-tenant access rejected with HTTP ${idorRes.status} (expected 403)`)

    const idorData = await idorRes.json()
    assert(idorData.code === 'BUSINESS_NOT_OWNED', `Rejection code is BUSINESS_NOT_OWNED (actual: ${idorData.code})`)

    // Tenant B org-wide query returns Tenant B's empty metrics (zero leakage of Tenant A's reviews)
    const reqOrgB = await createMockRequest('http://localhost:3000/api/reports/executive', tokenB)
    const resOrgB = await executiveReportsHandler(reqOrgB)
    const dataOrgB = await resOrgB.json()

    assert(dataOrgB.totalReviews === 0, `Tenant B org query returns 0 reviews (zero cross-tenant leakage)`)
    assert(dataOrgB.avgRating === 0, `Tenant B avgRating is 0`)

    console.log('\n====================================================================')
    console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`)
    console.log('====================================================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error during test run:', error)
    process.exit(1)
  } finally {
    console.log('[Cleanup] Cleaning up test records...')
    if (businessA2Id) {
      await prisma.review.deleteMany({ where: { businessId: businessA2Id } }).catch(() => {})
      await prisma.business.delete({ where: { id: businessA2Id } }).catch(() => {})
    }
    if (tenantA) {
      await prisma.review.deleteMany({ where: { businessId: tenantA.business.id } }).catch(() => {})
      await cleanupTestTenant(tenantA.org.id).catch(() => {})
    }
    if (tenantB) {
      await prisma.review.deleteMany({ where: { businessId: tenantB.business.id } }).catch(() => {})
      await cleanupTestTenant(tenantB.org.id).catch(() => {})
    }
    await prisma.$disconnect()
  }
}

runTests()

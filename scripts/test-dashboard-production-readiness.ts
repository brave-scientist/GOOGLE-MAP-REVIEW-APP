/**
 * scripts/test-dashboard-production-readiness.ts
 * Rigorous production-readiness verification for Dashboard API & Query Layer
 * Target: reviewreply_test on localhost:5433
 */

import { PrismaClient, Plan, Role, ReviewSource, DraftStatus } from '@prisma/client'
import { encodeSession } from '../src/lib/session'
import { NextRequest, NextResponse } from 'next/server'
import { GET as getDashboardHandler } from '../src/app/api/dashboard/route'

import crypto from 'crypto'
import { validateE2EDatabaseUrl } from '../e2e/fixtures/db-guard'

// DB isolation guard
const E2E_DB_URL = validateE2EDatabaseUrl(process.env.E2E_DATABASE_URL || process.env.DATABASE_URL)
process.env.DATABASE_URL = E2E_DB_URL
process.env.SESSION_SECRET = process.env.TEST_SESSION_SECRET || crypto.randomBytes(32).toString('hex')

const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } })

async function makeSessionCookie(user: {
  id: string
  email: string
  name: string | null
  role: Role
  orgId: string | null
  orgName: string | null
  orgPlan: string | null
  sessionVersion?: number
}): Promise<string> {
  const token = await encodeSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
    orgName: user.orgName,
    orgPlan: user.orgPlan,
    sessionVersion: user.sessionVersion ?? 1,
  })
  return `rr_session=${token}`
}

let reqCount = 0
function makeRequest(url: string, cookie?: string): NextRequest {
  reqCount++
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie || '',
      'x-forwarded-for': `127.0.0.${reqCount % 250 + 1}`,
    },
  })
}

let passed = 0
let failed = 0
function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  [PASS] ${name}`)
  } else {
    failed++
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runTests() {
  console.log('================================================================')
  console.log(' STARTING DASHBOARD PRODUCTION READINESS VERIFICATION')
  console.log(` DB: ${E2E_DB_URL}`)
  console.log('================================================================\n')

  const testRunId = `dash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Test Primitives: check Prisma campaign aggregate behavior with 0 rows
  console.log('-- SECTION 0: Prisma Low-Level Aggregation Invariants --')
  const dummyBizId = `nonexistent_${testRunId}`
  const zeroCampaignAggregate = await prisma.campaign.aggregate({
    _sum: { sentCount: true, conversionCount: true },
    where: { businessId: { in: [dummyBizId] } },
  })
  console.log('  zeroCampaignAggregate raw result:', JSON.stringify(zeroCampaignAggregate))
  assert(
    zeroCampaignAggregate !== null && typeof zeroCampaignAggregate === 'object',
    'zeroCampaignAggregate returns an object'
  )
  assert(
    zeroCampaignAggregate._sum !== undefined,
    'zeroCampaignAggregate has _sum property'
  )
  if (zeroCampaignAggregate._sum) {
    assert(
      zeroCampaignAggregate._sum.sentCount === null,
      'zeroCampaignAggregate._sum.sentCount is null for 0 rows'
    )
  }

  const zeroReviewAggregate = await prisma.review.aggregate({
    _avg: { rating: true },
    where: { businessId: { in: [dummyBizId] } },
  })
  console.log('  zeroReviewAggregate raw result:', JSON.stringify(zeroReviewAggregate))
  assert(
    zeroReviewAggregate._avg?.rating === null,
    'zeroReviewAggregate._avg.rating is null for 0 rows'
  )

  const zeroReviewGroupBy = await prisma.review.groupBy({
    by: ['rating'],
    _count: true,
    orderBy: { rating: 'asc' },
    where: { businessId: { in: [dummyBizId] } },
  })
  console.log('  zeroReviewGroupBy raw result:', JSON.stringify(zeroReviewGroupBy))
  assert(
    Array.isArray(zeroReviewGroupBy) && zeroReviewGroupBy.length === 0,
    'zeroReviewGroupBy returns empty array for 0 rows'
  )

  // Setup Tenant 1: Single Business, 0 reviews initially
  console.log('\n-- SECTION 1: Tenant Setup & 0-Review Loading --')
  const user1 = await prisma.user.create({
    data: {
      email: `${testRunId}_t1@example.com`,
      name: 'Tenant 1 Owner',
      sessionVersion: 1,
    },
  })
  const org1 = await prisma.organization.create({
    data: {
      name: `${testRunId} Org 1`,
      plan: Plan.PRO,
    },
  })
  await prisma.orgMember.create({
    data: {
      userId: user1.id,
      orgId: org1.id,
      role: Role.OWNER,
    },
  })
  const biz1 = await prisma.business.create({
    data: {
      orgId: org1.id,
      ownerId: user1.id,
      name: `${testRunId} Bakery Alpha`,
      industry: 'food',
      timezone: 'America/New_York',
    },
  })

  const cookie1 = await makeSessionCookie({
    id: user1.id,
    email: user1.email,
    name: user1.name,
    role: Role.OWNER,
    orgId: org1.id,
    orgName: org1.name,
    orgPlan: org1.plan,
  })

  // 1. Authenticated user can load dashboard with 0 reviews
  const res1 = await getDashboardHandler(makeRequest('/api/dashboard', cookie1))
  assert(res1.status === 200, 'GET /api/dashboard returns 200 OK for authenticated user with 0 reviews')
  const data1 = await res1.json()
  assert(Array.isArray(data1.businesses) && data1.businesses.length === 1, 'Returns exactly 1 business')
  assert(data1.businesses[0].id === biz1.id, 'Business ID matches biz1')
  assert(data1.stats.totalReviews === 0, 'Stats totalReviews is 0')
  assert(data1.stats.avgRating === 0, 'Stats avgRating is 0')
  assert(data1.stats.pendingReplies === 0, 'Stats pendingReplies is 0')
  assert(data1.stats.conversionRate === 0, 'Stats conversionRate is 0')
  assert(Array.isArray(data1.recentReviews) && data1.recentReviews.length === 0, 'recentReviews is empty array')
  assert(Array.isArray(data1.ratingDistribution) && data1.ratingDistribution.length === 5, 'ratingDistribution has 5 tiers')
  assert(data1.ratingDistribution.every((r: any) => r.count === 0), 'All rating counts are 0')
  assert(Array.isArray(data1.sentimentTrend) && data1.sentimentTrend.length === 8, 'sentimentTrend has 8 weeks')
  assert(data1.sentimentTrend.every((w: any) => w.avgSentiment === 0 && w.reviewCount === 0), 'All weeks have 0 sentiment/count')
  assert(data1.dashboardReadiness !== undefined, 'dashboardReadiness is returned')

  // Setup Tenant 2: Multi-Business & Reviews
  console.log('\n-- SECTION 2: Multi-Business, Normal Review Data & Scoping --')
  const user2 = await prisma.user.create({
    data: {
      email: `${testRunId}_t2@example.com`,
      name: 'Tenant 2 Owner',
      sessionVersion: 1,
    },
  })
  const org2 = await prisma.organization.create({
    data: {
      name: `${testRunId} Org 2 Multi`,
      plan: Plan.PRO,
    },
  })
  await prisma.orgMember.create({
    data: {
      userId: user2.id,
      orgId: org2.id,
      role: Role.OWNER,
    },
  })
  const biz2A = await prisma.business.create({
    data: {
      orgId: org2.id,
      ownerId: user2.id,
      name: `${testRunId} Coffee Downtown`,
      industry: 'cafe',
      timezone: 'America/New_York',
    },
  })
  const biz2B = await prisma.business.create({
    data: {
      orgId: org2.id,
      ownerId: user2.id,
      name: `${testRunId} Coffee Uptown`,
      industry: 'cafe',
      timezone: 'America/New_York',
    },
  })

  // Create reviews for biz2A: 3 reviews (5, 4, 1 star), 1 PENDING
  await prisma.review.createMany({
    data: [
      {
        businessId: biz2A.id,
        source: ReviewSource.GOOGLE,
        externalId: `${testRunId}_rev_2a_1`,
        author: 'Alice Wonderland',
        rating: 5,
        text: 'Superb espresso and friendly staff.',
        sentimentScore: 0.9,
        draftStatus: DraftStatus.NONE,
      },
      {
        businessId: biz2A.id,
        source: ReviewSource.GOOGLE,
        externalId: `${testRunId}_rev_2a_2`,
        author: 'Bob Builder',
        rating: 4,
        text: 'Good coffee, a bit crowded.',
        sentimentScore: 0.5,
        draftStatus: DraftStatus.PENDING,
      },
      {
        businessId: biz2A.id,
        source: ReviewSource.GOOGLE,
        externalId: `${testRunId}_rev_2a_3`,
        author: 'Charlie Brown',
        rating: 1,
        text: 'Cold latte and long wait.',
        sentimentScore: -0.8,
        draftStatus: DraftStatus.NONE,
      },
    ],
  })

  // Create reviews for biz2B: 2 reviews (4, 4 star)
  await prisma.review.createMany({
    data: [
      {
        businessId: biz2B.id,
        source: ReviewSource.GOOGLE,
        externalId: `${testRunId}_rev_2b_1`,
        author: 'Dave Miller',
        rating: 4,
        text: 'Nice uptown branch.',
        sentimentScore: 0.6,
        draftStatus: DraftStatus.NONE,
      },
      {
        businessId: biz2B.id,
        source: ReviewSource.GOOGLE,
        externalId: `${testRunId}_rev_2b_2`,
        author: 'Eve Adams',
        rating: 4,
        text: 'Quiet place to work.',
        sentimentScore: 0.7,
        draftStatus: DraftStatus.NONE,
      },
    ],
  })

  const cookie2 = await makeSessionCookie({
    id: user2.id,
    email: user2.email,
    name: user2.name,
    role: Role.OWNER,
    orgId: org2.id,
    orgName: org2.name,
    orgPlan: org2.plan,
  })

  // 2. Multi-business aggregation: default (all businesses in org2)
  const res2All = await getDashboardHandler(makeRequest('/api/dashboard', cookie2))
  assert(res2All.status === 200, 'GET /api/dashboard for multi-business org returns 200 OK')
  const data2All = await res2All.json()
  assert(data2All.businesses.length === 2, 'Returns both businesses for org2')
  assert(data2All.stats.totalReviews === 5, 'Total reviews across org2 is 5 (3 in 2A + 2 in 2B)')
  // Ratings: (5 + 4 + 1 + 4 + 4) / 5 = 18 / 5 = 3.6
  assert(data2All.stats.avgRating === 3.6, `Avg rating across org2 is 3.6 (got ${data2All.stats.avgRating})`)
  assert(data2All.stats.pendingReplies === 1, 'Pending replies is 1 (from biz2A)')
  assert(data2All.recentReviews.length === 5, 'recentReviews returns 5 reviews')

  // 3. Scoped query: ?businessId=biz2A
  const res2A = await getDashboardHandler(makeRequest(`/api/dashboard?businessId=${biz2A.id}`, cookie2))
  assert(res2A.status === 200, 'GET /api/dashboard?businessId=biz2A returns 200 OK')
  const data2A = await res2A.json()
  assert(data2A.stats.totalReviews === 3, 'Scoped totalReviews for biz2A is 3')
  // Ratings: (5 + 4 + 1) / 3 = 3.333 -> 3.3
  assert(data2A.stats.avgRating === 3.3, `Scoped avgRating for biz2A is 3.3 (got ${data2A.stats.avgRating})`)
  assert(data2A.stats.pendingReplies === 1, 'Scoped pendingReplies for biz2A is 1')
  assert(data2A.recentReviews.length === 3, 'Scoped recentReviews for biz2A returns 3')
  assert(data2A.recentReviews.every((r: any) => r.businessName === biz2A.name), 'All returned reviews belong to biz2A')

  // 4. Scoped query: ?businessId=biz2B
  const res2B = await getDashboardHandler(makeRequest(`/api/dashboard?businessId=${biz2B.id}`, cookie2))
  assert(res2B.status === 200, 'GET /api/dashboard?businessId=biz2B returns 200 OK')
  const data2B = await res2B.json()
  assert(data2B.stats.totalReviews === 2, 'Scoped totalReviews for biz2B is 2')
  assert(data2B.stats.avgRating === 4.0, `Scoped avgRating for biz2B is 4.0 (got ${data2B.stats.avgRating})`)
  assert(data2B.stats.pendingReplies === 0, 'Scoped pendingReplies for biz2B is 0')
  assert(data2B.recentReviews.length === 2, 'Scoped recentReviews for biz2B returns 2')
  assert(data2B.recentReviews.every((r: any) => r.businessName === biz2B.name), 'All returned reviews belong to biz2B')

  // Cross-Tenant Security & RBAC
  console.log('\n-- SECTION 3: Cross-Tenant Isolation & Failure Modes --')

  // 5. Tenant 1 tries to access Tenant 2's business -> 403 BUSINESS_NOT_OWNED
  const resCross = await getDashboardHandler(makeRequest(`/api/dashboard?businessId=${biz2A.id}`, cookie1))
  assert(resCross.status === 403, 'Cross-tenant businessId query returns 403 Forbidden')
  const crossErr = await resCross.json()
  assert(crossErr.code === 'BUSINESS_NOT_OWNED', 'Returns code BUSINESS_NOT_OWNED')

  // 6. Tenant 2 tries to access Tenant 1's business -> 403 BUSINESS_NOT_OWNED
  const resCross2 = await getDashboardHandler(makeRequest(`/api/dashboard?businessId=${biz1.id}`, cookie2))
  assert(resCross2.status === 403, 'Cross-tenant businessId query from Tenant 2 returns 403 Forbidden')

  // 7. Verify no data leakage: Tenant 1's general dashboard has NO data from Tenant 2
  const resLeakCheck = await getDashboardHandler(makeRequest('/api/dashboard', cookie1))
  const dataLeakCheck = await resLeakCheck.json()
  assert(!dataLeakCheck.businesses.some((b: any) => b.id === biz2A.id || b.id === biz2B.id), 'Tenant 1 dashboard contains no Tenant 2 businesses')
  assert(!dataLeakCheck.recentReviews.some((r: any) => r.businessName.includes('Coffee')), 'Tenant 1 dashboard contains no Tenant 2 reviews')

  // 8. Unauthenticated request -> 401 UNAUTHORIZED
  const resUnauth = await getDashboardHandler(makeRequest('/api/dashboard'))
  assert(resUnauth.status === 401, 'Unauthenticated GET /api/dashboard returns 401 UNAUTHORIZED')
  const unauthErr = await resUnauth.json()
  assert(unauthErr.code === 'UNAUTHORIZED', 'Unauthenticated returns code UNAUTHORIZED')

  // 9. Session with non-existent user -> 401
  const fakeUserCookie = await makeSessionCookie({
    id: `fake_user_${testRunId}`,
    email: 'fake@example.com',
    name: 'Fake',
    role: Role.OWNER,
    orgId: `fake_org_${testRunId}`,
    orgName: 'Fake',
    orgPlan: Plan.PRO,
  })
  const resFakeUser = await getDashboardHandler(makeRequest('/api/dashboard', fakeUserCookie))
  assert(resFakeUser.status === 401, 'Session with non-existent DB user returns 401 UNAUTHORIZED')

  // 10. User without org -> 403 NO_ORG
  const userNoOrg = await prisma.user.create({
    data: {
      email: `${testRunId}_noorg@example.com`,
      name: 'No Org User',
      sessionVersion: 1,
    },
  })
  const noOrgCookie = await makeSessionCookie({
    id: userNoOrg.id,
    email: userNoOrg.email,
    name: userNoOrg.name,
    role: Role.VIEWER,
    orgId: null,
    orgName: null,
    orgPlan: null,
  })
  const resNoOrg = await getDashboardHandler(makeRequest('/api/dashboard', noOrgCookie))
  assert(resNoOrg.status === 403, 'User with no org returns 403 Forbidden')
  const noOrgErr = await resNoOrg.json()
  assert(noOrgErr.code === 'NO_ORG', 'Returns code NO_ORG')

  // 11. User with 0 businesses in org -> 200 with empty lists
  const userEmptyOrg = await prisma.user.create({
    data: {
      email: `${testRunId}_emptyorg@example.com`,
      name: 'Empty Org User',
      sessionVersion: 1,
    },
  })
  const emptyOrg = await prisma.organization.create({
    data: {
      name: `${testRunId} Empty Org`,
      plan: Plan.PRO,
    },
  })
  await prisma.orgMember.create({
    data: {
      userId: userEmptyOrg.id,
      orgId: emptyOrg.id,
      role: Role.OWNER,
    },
  })
  const emptyOrgCookie = await makeSessionCookie({
    id: userEmptyOrg.id,
    email: userEmptyOrg.email,
    name: userEmptyOrg.name,
    role: Role.OWNER,
    orgId: emptyOrg.id,
    orgName: emptyOrg.name,
    orgPlan: emptyOrg.plan,
  })
  const resEmptyOrg = await getDashboardHandler(makeRequest('/api/dashboard', emptyOrgCookie))
  assert(resEmptyOrg.status === 200, 'User with 0 businesses in org returns 200 OK')
  const emptyData = await resEmptyOrg.json()
  assert(emptyData.businesses.length === 0, 'Businesses is empty array')
  assert(emptyData.stats.totalReviews === 0, 'Total reviews is 0')
  assert(emptyData.dashboardReadiness.isReady === false, 'Readiness isReady is false for 0 businesses')

  // Operator Scoping (RBAC)
  console.log('\n-- SECTION 4: Operator Role Location Scoping --')
  const operatorUser = await prisma.user.create({
    data: {
      email: `${testRunId}_operator@example.com`,
      name: 'Operator User',
      sessionVersion: 1,
    },
  })
  await prisma.orgMember.create({
    data: {
      userId: operatorUser.id,
      orgId: org2.id,
      role: Role.CLIENT_STAFF, // Non-admin operator
    },
  })
  // Explicitly assign ONLY biz2A to this operator
  await prisma.operatorLocationAssignment.create({
    data: {
      orgId: org2.id,
      userId: operatorUser.id,
      businessId: biz2A.id,
    },
  })
  const operatorCookie = await makeSessionCookie({
    id: operatorUser.id,
    email: operatorUser.email,
    name: operatorUser.name,
    role: Role.CLIENT_STAFF,
    orgId: org2.id,
    orgName: org2.name,
    orgPlan: org2.plan,
  })

  // 12. Operator sees only biz2A in dashboard
  const resOp = await getDashboardHandler(makeRequest('/api/dashboard', operatorCookie))
  assert(resOp.status === 200, 'Operator GET /api/dashboard returns 200 OK')
  const dataOp = await resOp.json()
  assert(dataOp.businesses.length === 1, 'Operator only sees 1 business')
  assert(dataOp.businesses[0].id === biz2A.id, 'Operator sees only assigned biz2A')
  assert(dataOp.stats.totalReviews === 3, 'Operator stats only count biz2A reviews (3, not 5)')

  // 13. Operator attempts to query unassigned biz2B -> 403 BUSINESS_NOT_OWNED
  const resOpDenied = await getDashboardHandler(makeRequest(`/api/dashboard?businessId=${biz2B.id}`, operatorCookie))
  assert(resOpDenied.status === 403, 'Operator querying unassigned business returns 403 Forbidden')

  // Clean up test data
  console.log('\n-- SECTION 5: Cleanup --')
  await prisma.review.deleteMany({
    where: {
      businessId: { in: [biz1.id, biz2A.id, biz2B.id] },
    },
  })
  await prisma.operatorLocationAssignment.deleteMany({
    where: { orgId: { in: [org1.id, org2.id, emptyOrg.id] } },
  })
  await prisma.business.deleteMany({
    where: { id: { in: [biz1.id, biz2A.id, biz2B.id] } },
  })
  await prisma.orgMember.deleteMany({
    where: { orgId: { in: [org1.id, org2.id, emptyOrg.id] } },
  })
  await prisma.organization.deleteMany({
    where: { id: { in: [org1.id, org2.id, emptyOrg.id] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id, userNoOrg.id, userEmptyOrg.id, operatorUser.id] } },
  })
  console.log('  Cleaned up all isolated test entities.')

  console.log('\n================================================================')
  console.log(` DASHBOARD VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('================================================================\n')

  await prisma.$disconnect()
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch(async (e) => {
  console.error('Unhandled error in test runner:', e)
  await prisma.$disconnect()
  process.exit(1)
})

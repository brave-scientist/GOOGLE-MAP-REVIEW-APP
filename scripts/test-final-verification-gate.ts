/**
 * scripts/test-final-verification-gate.ts
 *
 * Independent verification suite for:
 * 1. Auth performance & session revocation
 * 2. Analytics API verification
 * 3. Audit Log scoping & pagination
 * 4. Team API verification
 * 5. Agency API verification
 * 6. Demo review lifecycle, idempotency & provider safety
 * 7. Widget embed snippets & layout verification (Carousel, Grid, Badge, Slider)
 */

import { PrismaClient, Plan, Role, ReviewSource, DraftStatus } from '@prisma/client'
import { encodeSession } from '../src/lib/session'
import { getCurrentUser } from '../src/lib/auth'
import { NextRequest } from 'next/server'
import { GET as getAnalyticsHandler } from '../src/app/api/analytics/route'
import { GET as getAuditLogHandler } from '../src/app/api/audit-log/route'
import { GET as getTeamMembersHandler } from '../src/app/api/team/members/route'
import { GET as getAgencyHandler } from '../src/app/api/agency/route'
import { GET as getWidgetJsHandler } from '../src/app/widget.js/route'

import crypto from 'crypto'
import { validateE2EDatabaseUrl } from '../e2e/fixtures/db-guard'

const E2E_DB_URL = validateE2EDatabaseUrl(process.env.E2E_DATABASE_URL || process.env.DATABASE_URL)
process.env.DATABASE_URL = E2E_DB_URL
process.env.SESSION_SECRET = process.env.TEST_SESSION_SECRET || crypto.randomBytes(32).toString('hex')

const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } })

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

function makeRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie || '',
      'x-forwarded-for': '127.0.0.1',
    },
  })
}

async function run() {
  console.log('\n================================================================')
  console.log(' FINAL VERIFICATION GATE — COMPREHENSIVE SUITE')
  console.log(` DB: ${E2E_DB_URL}`)
  console.log('================================================================\n')

  const runId = `gate_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  let userA: any = null
  let userB: any = null
  let orgA: any = null
  let orgB: any = null
  let bizA1: any = null
  let bizA2: any = null
  let bizB1: any = null

  try {
    // -------------------------------------------------------------
    // SETUP TEST DATA
    // -------------------------------------------------------------
    console.log('-- Setting up Test Tenants A and B --')

    // Tenant A: Org A, User A, Biz A1, Biz A2
    userA = await prisma.user.create({
      data: {
        email: `${runId}_userA@example.com`,
        name: 'User A',
      sessionVersion: 1,
    },
  })
    orgA = await prisma.organization.create({
      data: {
        name: `${runId} Org A`,
        plan: Plan.AGENCY,
      },
    })
  await prisma.orgMember.create({
    data: {
      orgId: orgA.id,
      userId: userA.id,
      role: Role.OWNER,
    },
  })
    bizA1 = await prisma.business.create({
    data: {
      orgId: orgA.id,
      ownerId: userA.id,
      name: `${runId} Biz A1`,
      slug: `${runId}-biz-a1`,
      avgRating: 4.5,
      reviewCount: 3,
    },
  })
    bizA2 = await prisma.business.create({
    data: {
      orgId: orgA.id,
      ownerId: userA.id,
      name: `${runId} Biz A2`,
      slug: `${runId}-biz-a2`,
      avgRating: 4.0,
      reviewCount: 2,
    },
  })

  // Reviews for Biz A1
  await prisma.review.createMany({
    data: [
      {
        businessId: bizA1.id,
        author: 'Reviewer A1',
        rating: 5,
        text: 'Superb service and food',
        source: ReviewSource.GOOGLE,
        externalId: `rev_${runId}_a1`,
        sentimentScore: 0.9,
        topics: JSON.stringify(['service', 'food']),
        draftStatus: DraftStatus.POSTED,
        repliedAt: new Date(Date.now() - 3600000), // 1 hour ago
        createdAt: new Date(Date.now() - 7200000), // 2 hours ago
      },
      {
        businessId: bizA1.id,
        author: 'Reviewer A2',
        rating: 4,
        text: 'Good atmosphere',
        source: ReviewSource.GOOGLE,
        externalId: `rev_${runId}_a2`,
        sentimentScore: 0.6,
        topics: JSON.stringify(['atmosphere']),
        draftStatus: DraftStatus.PENDING,
        createdAt: new Date(Date.now() - 86400000),
      },
      {
        businessId: bizA1.id,
        author: 'Demo Reviewer',
        rating: 5,
        text: 'This is a demo review for Biz A1',
        source: ReviewSource.INTERNAL,
        externalId: `seed_${bizA1.id}_0`,
        sentimentScore: 0.8,
        topics: JSON.stringify(['demo']),
        draftStatus: DraftStatus.NONE,
        createdAt: new Date(Date.now() - 172800000),
      },
    ],
  })

  // Tenant B: Org B, User B, Biz B1
  userB = await prisma.user.create({
    data: {
      email: `${runId}_userB@example.com`,
      name: 'User B',
      sessionVersion: 1,
    },
  })
  orgB = await prisma.organization.create({
    data: {
      name: `${runId} Org B`,
      plan: Plan.STARTER,
    },
  })
  await prisma.orgMember.create({
    data: {
      orgId: orgB.id,
      userId: userB.id,
      role: Role.OWNER,
    },
  })
  bizB1 = await prisma.business.create({
    data: {
      orgId: orgB.id,
      ownerId: userB.id,
      name: `${runId} Biz B1`,
      slug: `${runId}-biz-b1`,
      avgRating: 3.0,
      reviewCount: 1,
    },
  })
  await prisma.review.create({
    data: {
      businessId: bizB1.id,
      author: 'Reviewer B1',
      rating: 3,
      text: 'Tenant B secret review text',
      source: ReviewSource.GOOGLE,
      externalId: `rev_${runId}_b1`,
      sentimentScore: 0.1,
      createdAt: new Date(),
    },
  })

  // Audit logs for Org A and Org B
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: userA.id,
        action: 'user.login',
        targetType: 'user',
        targetId: userA.id,
        metadata: JSON.stringify({ method: 'password' }),
      },
      {
        actorId: userA.id,
        action: 'template.created',
        targetType: 'reply_template',
        targetId: `tpl_${runId}_1`,
        metadata: JSON.stringify({ businessId: bizA1.id, title: 'Welcome Template' }),
      },
      {
        actorId: userA.id,
        action: 'org.settings_updated',
        targetType: 'organization',
        targetId: orgA.id,
        metadata: JSON.stringify({ key: 'notifications' }),
      },
      {
        actorId: userB.id,
        action: 'org.settings_updated',
        targetType: 'organization',
        targetId: orgB.id,
        metadata: JSON.stringify({ key: 'billing' }),
      },
    ],
  })

  const cookieA = await makeSessionCookie({
    id: userA.id,
    email: userA.email,
    name: userA.name,
    role: Role.OWNER,
    orgId: orgA.id,
    orgName: orgA.name,
    orgPlan: orgA.plan,
    sessionVersion: 1,
  })

  const cookieB = await makeSessionCookie({
    id: userB.id,
    email: userB.email,
    name: userB.name,
    role: Role.OWNER,
    orgId: orgB.id,
    orgName: orgB.name,
    orgPlan: orgB.plan,
    sessionVersion: 1,
  })

  // -------------------------------------------------------------
  // 1. AUTH PERFORMANCE & REVOCATION (SECTION 4)
  // -------------------------------------------------------------
  console.log('\n-- GATE 1: Auth Performance & Session Invalidation --')
  {
    // Valid session
    const req = makeRequest('/api/dashboard', cookieA)
    const authedUser = await getCurrentUser(req)
    assert(authedUser !== null, 'Valid session returns authenticated user')
    assert(authedUser?.id === userA.id, 'Authenticated user ID matches userA')
    assert(authedUser?.email === userA.email, 'Authenticated user email matches userA')
    assert(authedUser?.orgId === orgA.id, 'JWT orgId is preserved in session')

    // Session revocation check: Bump userA.sessionVersion in DB
    await prisma.user.update({
      where: { id: userA.id },
      data: { sessionVersion: 2 },
    })

    const revokedReq = makeRequest('/api/dashboard', cookieA)
    const revokedUser = await getCurrentUser(revokedReq)
    assert(revokedUser === null, 'Revoked session (sessionVersion mismatch) returns null')

    // Restore sessionVersion
    await prisma.user.update({
      where: { id: userA.id },
      data: { sessionVersion: 1 },
    })

    // Missing user check
    const fakeUserCookie = await makeSessionCookie({
      id: `nonexistent_${runId}`,
      email: 'ghost@example.com',
      name: 'Ghost',
      role: Role.VIEWER,
      orgId: orgA.id,
      orgName: orgA.name,
      orgPlan: orgA.plan,
      sessionVersion: 1,
    })
    const ghostReq = makeRequest('/api/dashboard', fakeUserCookie)
    const ghostUser = await getCurrentUser(ghostReq)
    assert(ghostUser === null, 'Session for non-existent user returns null')
  }

  // -------------------------------------------------------------
  // 2. ANALYTICS VERIFICATION (SECTION 6)
  // -------------------------------------------------------------
  console.log('\n-- GATE 2: Analytics API Verification --')
  {
    // Unauthenticated
    const unauthReq = makeRequest('/api/analytics')
    const unauthRes = await getAnalyticsHandler(unauthReq)
    assert(unauthRes.status === 401, 'Unauthenticated /api/analytics returns 401')

    // Authenticated Tenant A
    const reqA = makeRequest('/api/analytics', cookieA)
    const resA = await getAnalyticsHandler(reqA)
    assert(resA.status === 200, 'Authenticated Tenant A /api/analytics returns 200')
    const dataA = await resA.json()
    assert(Array.isArray(dataA.topicAnalysis), 'topicAnalysis is an array')
    assert(dataA.topicAnalysis.length > 0, 'topicAnalysis returned topics')
    assert(Array.isArray(dataA.sourceBreakdown), 'sourceBreakdown is an array')
    assert(typeof dataA.avgResponseHours === 'number', 'avgResponseHours is a number')
    assert(dataA.avgResponseHours > 0, `avgResponseHours computed correctly: ${dataA.avgResponseHours} hrs`)
    assert(dataA.aiSentimentCount >= 1, `aiSentimentCount returned: ${dataA.aiSentimentCount}`)

    // Tenant B isolation: Tenant B has no response time records
    const reqB = makeRequest('/api/analytics', cookieB)
    const resB = await getAnalyticsHandler(reqB)
    assert(resB.status === 200, 'Tenant B /api/analytics returns 200')
    const dataB = await resB.json()
    assert(dataB.avgResponseHours === 0, 'Tenant B with no replies returns avgResponseHours = 0')
    assert(!JSON.stringify(dataB).includes('Reviewer A1'), 'Tenant B analytics does not leak Tenant A reviews')
  }

  // -------------------------------------------------------------
  // 3. AUDIT LOG VERIFICATION (SECTION 7)
  // -------------------------------------------------------------
  console.log('\n-- GATE 3: Audit Log API & Pagination --')
  {
    // Unauthenticated
    const unauthReq = makeRequest('/api/audit-log')
    const unauthRes = await getAuditLogHandler(unauthReq)
    assert(unauthRes.status === 401, 'Unauthenticated /api/audit-log returns 401')

    // Tenant A audit log
    const reqA = makeRequest('/api/audit-log?limit=10&page=1', cookieA)
    const resA = await getAuditLogHandler(reqA)
    assert(resA.status === 200, 'Tenant A /api/audit-log returns 200')
    const dataA = await resA.json()
    assert(Array.isArray(dataA.entries), 'entries is an array')
    assert(dataA.pagination !== undefined, 'pagination metadata is present')
    assert(dataA.pagination.page === 1, 'pagination page is 1')
    assert(dataA.pagination.limit === 10, 'pagination limit is 10')
    assert(dataA.entries.length > 0, `Tenant A has ${dataA.entries.length} audit logs`)

    // Verify member actions appear (user.login, template.created, org.settings_updated)
    const actions = dataA.entries.map((l: any) => l.action)
    assert(actions.includes('user.login'), 'Audit log contains user.login event')
    assert(actions.includes('template.created'), 'Audit log contains template.created event')
    assert(actions.includes('org.settings_updated'), 'Audit log contains org.settings_updated event')

    // Verify Tenant B's org settings update is NOT visible to Tenant A
    const targets = dataA.entries.map((l: any) => l.targetId)
    assert(!targets.includes(orgB.id), 'Tenant A audit log strictly excludes Tenant B org events')

    // Tenant B audit log
    const reqB = makeRequest('/api/audit-log?limit=10&page=1', cookieB)
    const resB = await getAuditLogHandler(reqB)
    assert(resB.status === 200, 'Tenant B /api/audit-log returns 200')
    const dataB = await resB.json()
    const targetsB = dataB.entries.map((l: any) => l.targetId)
    assert(!targetsB.includes(orgA.id), 'Tenant B audit log strictly excludes Tenant A org events')
  }

  // -------------------------------------------------------------
  // 4. TEAM API VERIFICATION (SECTION 8)
  // -------------------------------------------------------------
  console.log('\n-- GATE 4: Team Members API --')
  {
    // Unauthenticated
    const unauthReq = makeRequest('/api/team/members')
    const unauthRes = await getTeamMembersHandler(unauthReq)
    assert(unauthRes.status === 401, 'Unauthenticated /api/team/members returns 401')

    // Tenant A
    const reqA = makeRequest('/api/team/members', cookieA)
    const resA = await getTeamMembersHandler(reqA)
    assert(resA.status === 200, 'Tenant A /api/team/members returns 200')
    const dataA = await resA.json()
    assert(Array.isArray(dataA.members), 'members is an array')
    assert(dataA.members.length === 1, 'Tenant A has 1 member')
    assert(dataA.members[0].email === userA.email, 'Member email matches userA')
    assert(dataA.members[0].role === Role.OWNER, 'Member role is OWNER')
    assert(dataA.seatsUsed === 1, 'seatsUsed is 1')
    assert(dataA.canInvite === true, 'canInvite is true')

    // Tenant B isolation
    const reqB = makeRequest('/api/team/members', cookieB)
    const resB = await getTeamMembersHandler(reqB)
    const dataB = await resB.json()
    assert(dataB.members[0].email === userB.email, 'Tenant B member list contains userB')
    assert(!JSON.stringify(dataB).includes(userA.email), 'Tenant B does not see Tenant A members')
  }

  // -------------------------------------------------------------
  // 5. AGENCY API VERIFICATION (SECTION 9)
  // -------------------------------------------------------------
  console.log('\n-- GATE 5: Agency API Verification --')
  {
    // Unauthenticated
    const unauthReq = makeRequest('/api/agency')
    const unauthRes = await getAgencyHandler(unauthReq)
    assert(unauthRes.status === 401, 'Unauthenticated /api/agency returns 401')

    // Tenant B (STARTER plan) — rejected with 403 PLAN_UPGRADE_REQUIRED
    const reqB = makeRequest('/api/agency', cookieB)
    const resB = await getAgencyHandler(reqB)
    assert(resB.status === 403, 'Tenant B (STARTER plan) /api/agency rejected with 403 Plan Upgrade Required')
    const dataB = await resB.json()
    assert(dataB.code === 'PLAN_UPGRADE_REQUIRED', 'Error code is PLAN_UPGRADE_REQUIRED')

    // Tenant A (AGENCY plan) — returns 200 OK
    const reqA = makeRequest('/api/agency', cookieA)
    const resA = await getAgencyHandler(reqA)
    assert(resA.status === 200, 'Tenant A (AGENCY plan) /api/agency returns 200')
    const dataA = await resA.json()
    assert(Array.isArray(dataA.clients), 'clients is an array')
    assert(dataA.clients.length === 2, `Tenant A has 2 client businesses (Biz A1 and Biz A2)`)
    assert(dataA.stats !== undefined, 'stats object is present')
    assert(dataA.stats.totalClients === 2, 'stats.totalClients is 2')

    // Isolation: Tenant B business should not appear in Tenant A agency
    const bizNames = dataA.clients.map((c: any) => c.name)
    assert(!bizNames.includes(bizB1.name), 'Tenant A agency clients does NOT contain Tenant B business')
  }

  // -------------------------------------------------------------
  // 6. DEMO REVIEWS LIFECYCLE & INTEGRATION SAFETY (SECTION 10)
  // -------------------------------------------------------------
  console.log('\n-- GATE 6: Demo Reviews Lifecycle & Safety --')
  {
    // Inspect seeded demo review
    const demoRev = await prisma.review.findFirst({
      where: { businessId: bizA1.id, source: ReviewSource.INTERNAL },
    })
    assert(demoRev !== null, 'Demo review exists in DB with source: INTERNAL')
    assert(demoRev?.externalId.startsWith('seed_') === true, 'Demo review has deterministic seed_ prefix')
    assert(demoRev?.source === 'INTERNAL', 'Demo review source is strictly INTERNAL (never GOOGLE)')

    // Public widget test: Demo review must NEVER appear in public widget.js
    const widgetReq = makeRequest(`/widget.js?businessId=${bizA1.id}&limit=10`)
    const widgetRes = await getWidgetJsHandler(widgetReq)
    assert(widgetRes.status === 200, 'Public /widget.js returns 200')
    const jsContent = await widgetRes.text()
    assert(!jsContent.includes('This is a demo review for Biz A1'), 'Demo review is strictly excluded from public widget')
    assert(jsContent.includes('Reviewer A1'), 'Real Google review appears in public widget')
  }

  // -------------------------------------------------------------
  // 7. WIDGET EMBED SNIPPET & RUNTIME VARIATIONS (SECTION 11 & 12)
  // -------------------------------------------------------------
  console.log('\n-- GATE 7: Widget Embed Snippet & Layout Renders --')
  {
    // 1. Carousel
    const resCarousel = await getWidgetJsHandler(makeRequest(`/widget.js?businessId=${bizA1.id}&type=carousel&theme=brass&minRating=4&limit=5`))
    const jsCarousel = await resCarousel.text()
    assert(resCarousel.headers.get('cache-control') === 'no-store', 'Widget response has Cache-Control: no-store')
    assert(jsCarousel.includes('var type = "carousel";'), 'Carousel type is "carousel"')
    assert(jsCarousel.includes('#97781B'), 'Brass theme includes brass accent color (#97781B)')

    // 2. Grid
    const resGrid = await getWidgetJsHandler(makeRequest(`/widget.js?businessId=${bizA1.id}&type=grid&theme=dark&minRating=3&limit=10`))
    const jsGrid = await resGrid.text()
    assert(jsGrid.includes('var type = "grid";'), 'Grid type is "grid"')
    assert(jsGrid.includes('display:grid;grid-template-columns:1fr 1fr'), 'Grid generates 2-column grid CSS')
    assert(jsGrid.includes('#22c55e') || jsGrid.includes('#0A0A0B'), 'Dark theme applies correct colors')

    // 3. Floating Badge
    const resBadge = await getWidgetJsHandler(makeRequest(`/widget.js?businessId=${bizA1.id}&type=badge&theme=blue&minRating=4&limit=3`))
    const jsBadge = await resBadge.text()
    assert(jsBadge.includes('var type = "badge";'), 'Badge type is "badge"')
    assert(jsBadge.includes('Rated by'), 'Badge contains "Rated by ... customers" summary')

    // 4. Slider
    const resSlider = await getWidgetJsHandler(makeRequest(`/widget.js?businessId=${bizA1.id}&type=slider&theme=rose&minRating=2&limit=5`))
    const jsSlider = await resSlider.text()
    assert(jsSlider.includes('var type = "slider";'), 'Slider type is "slider"')
    assert(jsSlider.includes('reviewreplySlide'), 'Slider contains reviewreplySlide navigation script')
    assert(jsSlider.includes('data-slide='), 'Slider generates data-slide markup')

    // Differentiation proofs
    assert(jsCarousel !== jsGrid, 'Carousel JS != Grid JS')
    assert(jsGrid !== jsBadge, 'Grid JS != Badge JS')
    assert(jsBadge !== jsSlider, 'Badge JS != Slider JS')

    // Rating filter test: minRating=5 should return 5-star reviews, not 4-star
    const resRating5 = await getWidgetJsHandler(makeRequest(`/widget.js?businessId=${bizA1.id}&type=carousel&minRating=5&limit=10`))
    const jsRating5 = await resRating5.text()
    assert(jsRating5.includes('Reviewer A1'), 'minRating=5 includes 5-star review (Reviewer A1)')
    assert(!jsRating5.includes('Reviewer A2'), 'minRating=5 excludes 4-star review (Reviewer A2)')
  }
} finally {
    // -------------------------------------------------------------
    // CLEANUP (Guaranteed to execute even on assertion failure)
    // -------------------------------------------------------------
    console.log('\n-- Cleanup --')
    const bizIds = [bizA1?.id, bizA2?.id, bizB1?.id].filter(Boolean)
    const userIds = [userA?.id, userB?.id].filter(Boolean)
    const orgIds = [orgA?.id, orgB?.id].filter(Boolean)

    if (bizIds.length > 0) {
      await prisma.review.deleteMany({ where: { businessId: { in: bizIds } } }).catch(() => {})
      await prisma.business.deleteMany({ where: { id: { in: bizIds } } }).catch(() => {})
    }
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => {})
      await prisma.orgMember.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {})
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {})
    }
    if (orgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } }).catch(() => {})
    }
    console.log('  Cleaned up all isolated gate test data.')
  }

  console.log('\n================================================================')
  console.log(` GATE VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

run()
  .catch(err => {
    console.error('Gate test error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

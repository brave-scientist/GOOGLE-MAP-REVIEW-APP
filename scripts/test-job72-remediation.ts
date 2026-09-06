/**
 * JOB-7.2 Remediation Verification Test Suite
 *
 * Comprehensive verification for DEF-02: Competitor Intelligence & Strategy Data Integrity
 *
 * Verifies:
 *  1. Multi-Tenant Isolation: Tenant A cannot read, modify, or delete Tenant B competitors.
 *  2. Business-Level Scoping: Active business determines competitor list (Business A1 vs Business A2).
 *  3. Parameter Spoofing Prevention: ?businessId=<foreign-business> fails closed (403).
 *  4. Data Authenticity & No Fakes: Dynamic alerts & strategy recommendations are computed from
 *     real metric differentials; no static "Golden Dragon", fake restrooms, or mock arrays.
 *  5. Honest Empty & Error States: Empty business returns empty competitors, null alerts, empty suggestions.
 *  6. Mutation & Cascade Persistence: Adding, updating, and deleting competitors updates DB,
 *     records snapshots, cascades deletion, and writes to audit logs.
 *  7. Plan Authorization: Requires PRO tier.
 *  8. UI Contract Integrity: Checks src/app/competitors/page.tsx for useActiveBusiness, absence of
 *     demo strings, and preservation of Playwright test IDs.
 */

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { prisma, seedTestTenant, seedTestCompetitor, cleanupTestTenant } from '../e2e/fixtures/db-seed'
import { encodeSession } from '../src/lib/session'
import { GET as competitorsGetHandler, POST as competitorsPostHandler, PATCH as competitorsPatchHandler, DELETE as competitorsDeleteHandler } from '../src/app/api/competitors/route'
import { Role } from '@prisma/client'

async function runJob72Verification() {
  console.log('=================================================================')
  console.log('JOB-7.2 — DEF-02 COMPETITOR INTELLIGENCE FORENSIC TEST SUITE')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn()
      console.log(`  ✓ PASS: ${name}`)
      passed++
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`)
      console.error(`    Error: ${err.message}`)
      failed++
    }
  }

  // Setup test tenants in local database
  console.log('--- Setting up isolated test fixtures in PostgreSQL (port 5433) ---')
  const tenantA = await seedTestTenant({
    name: 'Competitor Intel Org A',
    businessName: 'Alpha Bistro (Location 1)',
    email: `alpha-owner-${Date.now()}@example.com`,
  })

  // Ensure Tenant A has PRO plan
  await prisma.organization.update({
    where: { id: tenantA.org.id },
    data: { plan: 'PRO' },
  })

  // Create Business A2 under Tenant A
  const businessA2 = await prisma.business.create({
    data: {
      orgId: tenantA.org.id,
      ownerId: tenantA.user.id,
      name: 'Alpha Bistro (Location 2)',
      avgRating: 4.1,
      reviewCount: 30,
    },
  })

  // Setup Tenant B (Competitor Org)
  const tenantB = await seedTestTenant({
    name: 'Competitor Intel Org B',
    businessName: 'Beta Diner',
    email: `beta-owner-${Date.now()}@example.com`,
  })
  await prisma.organization.update({
    where: { id: tenantB.org.id },
    data: { plan: 'PRO' },
  })

  // Setup Tenant C (Empty Business, PRO plan)
  const tenantC = await seedTestTenant({
    name: 'Empty Competitor Org C',
    businessName: 'Gamma Cafe (Empty)',
    email: `gamma-owner-${Date.now()}@example.com`,
  })
  await prisma.organization.update({
    where: { id: tenantC.org.id },
    data: { plan: 'PRO' },
  })

  // Setup Tenant Free (FREE plan)
  const tenantFree = await seedTestTenant({
    name: 'Free Org',
    businessName: 'Free Spot',
    email: `free-owner-${Date.now()}@example.com`,
  })
  await prisma.organization.update({
    where: { id: tenantFree.org.id },
    data: { plan: 'FREE' },
  })

  // Seed Competitors for Business A1:
  // Comp A1_1: Higher rating, higher velocity
  const compA1_1 = await seedTestCompetitor(tenantA.business.id, {
    name: 'Rival Bakery A1',
    rating: 4.8,
    reviewCount: 140,
    responseRate: 95,
    sentimentScore: 0.85,
  })
  // Add a second snapshot to Comp A1_1 to establish a positive trend & velocity
  await prisma.competitorSnapshot.create({
    data: {
      competitorId: compA1_1.id,
      rating: 4.7,
      reviewCount: 125,
      sentimentScore: 0.82,
      capturedAt: new Date(Date.now() - 7 * 86400000),
    },
  })

  // Comp A1_2: Lower rating, lower reviews
  const compA1_2 = await seedTestCompetitor(tenantA.business.id, {
    name: 'Corner Deli A1',
    rating: 3.9,
    reviewCount: 45,
    responseRate: 50,
    sentimentScore: 0.45,
  })

  // Seed Competitors for Business A2:
  const compA2_1 = await seedTestCompetitor(businessA2.id, {
    name: 'Subway Spot A2',
    rating: 4.2,
    reviewCount: 90,
    responseRate: 70,
  })

  // Seed Competitors for Business B1:
  const compB1_1 = await seedTestCompetitor(tenantB.business.id, {
    name: 'Confidential Rival B1',
    rating: 4.9,
    reviewCount: 500,
    responseRate: 99,
  })

  // Helper to construct authenticated NextRequest
  async function makeAuthRequest(
    url: string,
    user: { id: string; email: string; name: string | null; sessionVersion?: number | null },
    org: { id: string; name: string; plan: string },
    method = 'GET',
    body?: any
  ) {
    const sessionToken = await encodeSession({
      id: user.id,
      email: user.email,
      name: user.name || 'Test User',
      orgId: org.id,
      orgName: org.name,
      orgPlan: org.plan,
      role: Role.OWNER,
      sessionVersion: user.sessionVersion ?? 1,
    })

    const headers: Record<string, string> = {
      cookie: `rr_session=${sessionToken}`,
    }
    if (body) {
      headers['content-type'] = 'application/json'
    }

    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: MULTI-TENANT ISOLATION & BUSINESS SCOPING
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 1: Tenant & Business Isolation ---')

    await test('DEF-02.1: Business A1 query returns only Business A1 competitors', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantA.business.id}`, tenantA.user, { ...tenantA.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)
      const data = await res.json()

      assert(Array.isArray(data.competitors), 'competitors should be an array')
      assert.strictEqual(data.competitors.length, 2, 'Should return exactly 2 competitors for A1')
      const names = data.competitors.map((c: any) => c.name)
      assert(names.includes('Rival Bakery A1'), 'Should include Rival Bakery A1')
      assert(names.includes('Corner Deli A1'), 'Should include Corner Deli A1')
      assert(!names.includes('Subway Spot A2'), 'Must not leak Business A2 competitor')
      assert(!names.includes('Confidential Rival B1'), 'Must not leak Tenant B competitor')
    })

    await test('DEF-02.2: Business A2 query returns only Business A2 competitors', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${businessA2.id}`, tenantA.user, { ...tenantA.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      assert.strictEqual(res.status, 200)
      const data = await res.json()

      assert.strictEqual(data.competitors.length, 1)
      assert.strictEqual(data.competitors[0].name, 'Subway Spot A2')
    })

    await test('DEF-02.3: Tenant B cannot access Business A1 (?businessId=A1 is rejected with 403)', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantA.business.id}`, tenantB.user, { ...tenantB.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-tenant query, got ${res.status}`)
    })

    await test('DEF-02.4: Tenant A cannot access Business B1 (?businessId=B1 is rejected with 403)', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantB.business.id}`, tenantA.user, { ...tenantA.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-tenant query, got ${res.status}`)
    })

    await test('DEF-02.5: Plan Gate: FREE tier is blocked from /api/competitors with 403', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantFree.business.id}`, tenantFree.user, { ...tenantFree.org, plan: 'FREE' })
      const res = await competitorsGetHandler(req)
      assert.strictEqual(res.status, 403, `Expected 403 for FREE plan, got ${res.status}`)
    })

    // -------------------------------------------------------------------------
    // TEST GROUP 2: MUTATION INTEGRITY, AUDIT LOGGING & CASCADE DELETION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Mutation Integrity & Persistence ---')

    let createdCompId = ''

    await test('DEF-02.6: POST /api/competitors creates competitor & snapshot and logs audit event', async () => {
      const req = await makeAuthRequest('/api/competitors', tenantA.user, { ...tenantA.org, plan: 'PRO' }, 'POST', {
        name: 'New Test Competitor A1',
        businessId: tenantA.business.id,
        googleMapsUrl: 'https://maps.google.com/?cid=11223344',
        rating: 4.4,
        reviewCount: 88,
      })
      const res = await competitorsPostHandler(req)
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert(data.success, 'Expected success: true')
      assert.strictEqual(data.competitor.name, 'New Test Competitor A1')
      assert.strictEqual(data.competitor.rating, 4.4)
      assert.strictEqual(data.competitor.reviews, 88)
      createdCompId = data.competitor.id

      // Verify DB record and initial snapshot
      const dbComp = await prisma.competitor.findUnique({
        where: { id: createdCompId },
        include: { snapshots: true },
      })
      assert(dbComp !== null, 'Competitor must exist in database')
      assert.strictEqual(dbComp.snapshots.length, 1, 'Initial snapshot must be created')
      assert.strictEqual(dbComp.snapshots[0].rating, 4.4)
      assert.strictEqual(dbComp.snapshots[0].reviewCount, 88)

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: createdCompId, action: 'competitor.created' },
      })
      assert(audit !== null, 'Audit log event competitor.created must be recorded')
    })

    await test('DEF-02.7: PATCH /api/competitors updates metrics and appends snapshot delta', async () => {
      const req = await makeAuthRequest('/api/competitors', tenantA.user, { ...tenantA.org, plan: 'PRO' }, 'PATCH', {
        id: createdCompId,
        rating: 4.6,
        reviewCount: 95,
      })
      const res = await competitorsPatchHandler(req)
      assert.strictEqual(res.status, 200)

      const dbComp = await prisma.competitor.findUnique({
        where: { id: createdCompId },
        include: { snapshots: true },
      })
      assert.strictEqual(dbComp?.rating, 4.6)
      assert.strictEqual(dbComp?.reviewCount, 95)
      assert.strictEqual(dbComp?.snapshots.length, 2, 'Snapshot delta must be recorded on update')
    })

    await test('DEF-02.8: Cross-tenant modification rejection: Tenant B cannot PATCH Tenant A competitor', async () => {
      const req = await makeAuthRequest('/api/competitors', tenantB.user, { ...tenantB.org, plan: 'PRO' }, 'PATCH', {
        id: createdCompId,
        rating: 1.0,
      })
      const res = await competitorsPatchHandler(req)
      assert.strictEqual(res.status, 404, 'Must return 404 for competitor not in caller businesses')
    })

    await test('DEF-02.9: Cross-tenant deletion rejection: Tenant B cannot DELETE Tenant A competitor', async () => {
      const req = await makeAuthRequest(`/api/competitors?id=${createdCompId}`, tenantB.user, { ...tenantB.org, plan: 'PRO' }, 'DELETE')
      const res = await competitorsDeleteHandler(req)
      assert.strictEqual(res.status, 404, 'Must return 404 for competitor not in caller businesses')

      // Confirm record was NOT deleted
      const check = await prisma.competitor.findUnique({ where: { id: createdCompId } })
      assert(check !== null, 'Competitor must not be deleted by unauthorized tenant')
    })

    await test('DEF-02.10: DELETE /api/competitors deletes competitor and cascades to all snapshots', async () => {
      const req = await makeAuthRequest(`/api/competitors?id=${createdCompId}`, tenantA.user, { ...tenantA.org, plan: 'PRO' }, 'DELETE')
      const res = await competitorsDeleteHandler(req)
      assert.strictEqual(res.status, 200)

      const checkComp = await prisma.competitor.findUnique({ where: { id: createdCompId } })
      assert.strictEqual(checkComp, null, 'Competitor record must be deleted')

      const checkSnaps = await prisma.competitorSnapshot.findMany({ where: { competitorId: createdCompId } })
      assert.strictEqual(checkSnaps.length, 0, 'Snapshots must be cascade deleted')

      const audit = await prisma.auditLog.findFirst({
        where: { targetId: createdCompId, action: 'competitor.deleted' },
      })
      assert(audit !== null, 'Audit log event competitor.deleted must be recorded')
    })

    // -------------------------------------------------------------------------
    // TEST GROUP 3: DATA AUTHENTICITY & STRATEGY ENGINE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Data Authenticity & Strategy Engine ---')

    await test('DEF-02.11: Dynamic alerts are calculated from actual competitor velocity', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantA.business.id}`, tenantA.user, { ...tenantA.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      const data = await res.json()

      assert(data.alert !== null, 'Should generate an alert when competitor velocity outpaces business')
      assert.strictEqual(data.alert.competitorName, 'Rival Bakery A1')
      assert(data.alert.title.includes('Rival Bakery A1'), 'Alert title should reference the actual rival')
      assert(data.alert.message.includes('15 reviews/week'), 'Alert message should compute real review velocity delta (140 - 125 = 15)')
      assert(!data.alert.title.includes('Golden Dragon'), 'Must not reference hardcoded Golden Dragon')
    })

    await test('DEF-02.12: Dynamic strategy suggestions are grounded in real metrics', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantA.business.id}`, tenantA.user, { ...tenantA.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      const data = await res.json()

      assert(Array.isArray(data.suggestions), 'suggestions must be an array')
      assert(data.suggestions.length > 0, 'Should return strategy suggestions for business with competitor gaps')

      const titles = data.suggestions.map((s: any) => s.title)
      const descs = data.suggestions.map((s: any) => s.desc)

      assert(titles.some((t: string) => t.includes('Rival Bakery A1')), 'Suggestions must target actual rival Rival Bakery A1')
      assert(!descs.some((d: string) => d.includes('Golden Dragon')), 'No suggestion may reference hardcoded Golden Dragon')
      assert(!descs.some((d: string) => d.includes('cleanliness') && d.includes('restroom')), 'No static restroom mock allowed')
    })

    await test('DEF-02.13: Honest Empty State: Business with 0 competitors returns empty data', async () => {
      const req = await makeAuthRequest(`/api/competitors?businessId=${tenantC.business.id}`, tenantC.user, { ...tenantC.org, plan: 'PRO' })
      const res = await competitorsGetHandler(req)
      const data = await res.json()

      assert.strictEqual(data.competitors.length, 0, 'Competitor list must be empty')
      assert.strictEqual(data.alert, null, 'Alert must be null for empty business')
      assert.strictEqual(data.suggestions.length, 0, 'Suggestions must be empty for business with no competitors')
      assert.strictEqual(data.benchmark, null, 'Benchmark must be null')
    })

    // -------------------------------------------------------------------------
    // TEST GROUP 4: UI STATIC SOURCE INSPECTION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: UI Contract & Source Code Integrity ---')

    await test('DEF-02.14: src/app/competitors/page.tsx integrates useActiveBusiness', () => {
      const uiPath = path.join(process.cwd(), 'src/app/competitors/page.tsx')
      const source = fs.readFileSync(uiPath, 'utf8')

      assert(source.includes('useActiveBusiness'), 'UI must import and use useActiveBusiness')
      assert(source.includes('activeBusinessId'), 'UI must scope requests to activeBusinessId')
      assert(source.includes('activeBusiness'), 'UI must reference activeBusiness')
    })

    await test('DEF-02.15: src/app/competitors/page.tsx contains NO hardcoded "Golden Dragon" or "demo data"', () => {
      const uiPath = path.join(process.cwd(), 'src/app/competitors/page.tsx')
      const source = fs.readFileSync(uiPath, 'utf8')

      assert(!source.includes('Golden Dragon is running a review campaign'), 'Static Golden Dragon alert must be removed')
      assert(!source.includes('Showing demo data'), 'Demo data disclaimer must be removed')
      assert(!source.includes('restroom cleanliness'), 'Static restroom cleanliness mock must be removed')
      assert(!source.includes('25% above market'), 'Static sub-label 25% above market must be removed')
    })

    await test('DEF-02.16: Playwright selector contracts (#comp-name, #comp-url, button) are preserved', () => {
      const uiPath = path.join(process.cwd(), 'src/app/competitors/page.tsx')
      const source = fs.readFileSync(uiPath, 'utf8')

      assert(source.includes('id="comp-name"'), 'Modal must keep #comp-name for test compatibility')
      assert(source.includes('id="comp-url"'), 'Modal must keep #comp-url for test compatibility')
      assert(source.includes('Add competitor'), 'Modal button must keep "Add competitor" text')
      assert(source.includes('title="Delete competitor"'), 'Row delete button must keep title="Delete competitor"')
    })

  } finally {
    // Cleanup test data
    console.log('\n--- Cleaning up test fixtures ---')
    await cleanupTestTenant(tenantA.org.id)
    await cleanupTestTenant(tenantB.org.id)
    await cleanupTestTenant(tenantC.org.id)
    await cleanupTestTenant(tenantFree.org.id)
  }

  console.log('\n=================================================================')
  console.log(`JOB-7.2 DEF-02 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob72Verification().catch(err => {
  console.error('Unhandled test suite error:', err)
  process.exit(1)
})

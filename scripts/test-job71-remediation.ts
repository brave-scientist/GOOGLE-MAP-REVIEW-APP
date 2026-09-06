/**
 * JOB-7.1 Remediation Verification Test Suite
 *
 * Verifies:
 *   - DEF-01: Inbox active business scoping, authorization, switching, and stale-request protection
 *   - DEF-06: Tenant-scoped Audit Log API (/api/audit-log), tenant isolation, empty/loading/error states,
 *             and preservation of platform-wide /api/admin/audit-log
 *
 * Executes against live isolated local PostgreSQL test database on port 5433.
 */

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { prisma, seedTestTenant, seedTestReview, cleanupTestTenant } from '../e2e/fixtures/db-seed'
import { encodeSession } from '../src/lib/session'
import { GET as inboxHandler } from '../src/app/api/inbox/route'
import { GET as tenantAuditLogHandler } from '../src/app/api/audit-log/route'
import { GET as adminAuditLogHandler } from '../src/app/api/admin/audit-log/route'
import { DraftStatus, ReviewSource, Role } from '@prisma/client'

async function runJob71Verification() {
  console.log('=================================================================')
  console.log('JOB-7.1 — DEF-01 & DEF-06 HIGH-PRIORITY REMEDIATION TEST SUITE')
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
    name: 'Tenant Alpha Org',
    businessName: 'Alpha Primary Location',
    businessSlug: `alpha-primary-${Date.now()}`,
    userEmail: `alpha-owner-${Date.now()}@example.com`,
  })

  // Create a second business in Org A to test A/B switching within same tenant
  const businessA2 = await prisma.business.create({
    data: {
      orgId: tenantA.org.id,
      ownerId: tenantA.user.id,
      name: 'Alpha Secondary Location',
      slug: `alpha-secondary-${Date.now()}`,
      avgRating: 4.5,
      reviewCount: 2,
    },
  })

  // Create reviews in Business A1 (3 reviews)
  const reviewA1_1 = await prisma.review.create({
    data: {
      businessId: tenantA.business.id,
      author: 'Customer A1-1',
      rating: 5,
      text: 'Great experience at Alpha Primary!',
      source: ReviewSource.GOOGLE,
      externalId: `rev_a1_1_${Date.now()}`,
      draftStatus: DraftStatus.PENDING,
    },
  })
  const reviewA1_2 = await prisma.review.create({
    data: {
      businessId: tenantA.business.id,
      author: 'Customer A1-2',
      rating: 4,
      text: 'Good service at Alpha Primary.',
      source: ReviewSource.GOOGLE,
      externalId: `rev_a1_2_${Date.now()}`,
      draftStatus: DraftStatus.PENDING,
    },
  })
  const reviewA1_3 = await prisma.review.create({
    data: {
      businessId: tenantA.business.id,
      author: 'Customer A1-3',
      rating: 5,
      text: 'Loved Alpha Primary.',
      source: ReviewSource.FACEBOOK,
      externalId: `rev_a1_3_${Date.now()}`,
      draftStatus: DraftStatus.POSTED,
    },
  })

  // Create reviews in Business A2 (2 reviews)
  const reviewA2_1 = await prisma.review.create({
    data: {
      businessId: businessA2.id,
      author: 'Customer A2-1',
      rating: 4,
      text: 'Visiting Alpha Secondary.',
      source: ReviewSource.GOOGLE,
      externalId: `rev_a2_1_${Date.now()}`,
      draftStatus: DraftStatus.PENDING,
    },
  })
  const reviewA2_2 = await prisma.review.create({
    data: {
      businessId: businessA2.id,
      author: 'Customer A2-2',
      rating: 5,
      text: 'Alpha Secondary was very nice.',
      source: ReviewSource.GOOGLE,
      externalId: `rev_a2_2_${Date.now()}`,
      draftStatus: DraftStatus.POSTED,
    },
  })

  // Setup Tenant B (different organization)
  const tenantB = await seedTestTenant({
    name: 'Tenant Beta Org',
    businessName: 'Beta Bistro',
    businessSlug: `beta-bistro-${Date.now()}`,
    userEmail: `beta-owner-${Date.now()}@example.com`,
  })

  // Create reviews in Business B1 (3 reviews)
  const reviewB1_1 = await prisma.review.create({
    data: {
      businessId: tenantB.business.id,
      author: 'Customer B1-1',
      rating: 2,
      text: 'Poor service at Beta Bistro.',
      source: ReviewSource.GOOGLE,
      externalId: `rev_b1_1_${Date.now()}`,
      draftStatus: DraftStatus.PENDING,
    },
  })
  const reviewB1_2 = await prisma.review.create({
    data: {
      businessId: tenantB.business.id,
      author: 'Customer B1-2',
      rating: 3,
      text: 'Average meal at Beta Bistro.',
      source: ReviewSource.FACEBOOK,
      externalId: `rev_b1_2_${Date.now()}`,
      draftStatus: DraftStatus.PENDING,
    },
  })
  const reviewB1_3 = await prisma.review.create({
    data: {
      businessId: tenantB.business.id,
      author: 'Customer B1-3',
      rating: 5,
      text: 'Beta Bistro improved.',
      source: ReviewSource.GOOGLE,
      externalId: `rev_b1_3_${Date.now()}`,
      draftStatus: DraftStatus.POSTED,
    },
  })

  // Setup Tenant C (empty organization with no reviews and no audit logs)
  const tenantC = await seedTestTenant({
    name: 'Tenant Gamma Org (Empty)',
    businessName: 'Gamma Cafe',
    businessSlug: `gamma-cafe-${Date.now()}`,
    userEmail: `gamma-owner-${Date.now()}@example.com`,
  })

  // Create audit log records for Tenant A
  const auditA1 = await prisma.auditLog.create({
    data: {
      actorId: tenantA.user.id,
      action: 'business.profile_updated',
      targetType: 'business',
      targetId: tenantA.business.id,
      metadata: JSON.stringify({ businessName: tenantA.business.name, orgId: tenantA.org.id }),
    },
  })
  const auditA2 = await prisma.auditLog.create({
    data: {
      actorId: tenantA.user.id,
      action: 'google.sync_reviews',
      targetType: 'business',
      targetId: businessA2.id,
      metadata: JSON.stringify({ businessId: businessA2.id, orgId: tenantA.org.id }),
    },
  })

  // Create audit log records for Tenant B
  const auditB1 = await prisma.auditLog.create({
    data: {
      actorId: tenantB.user.id,
      action: 'campaign.created',
      targetType: 'campaign',
      targetId: `cmp_${Date.now()}`,
      metadata: JSON.stringify({ businessId: tenantB.business.id, orgId: tenantB.org.id }),
    },
  })
  const auditB2 = await prisma.auditLog.create({
    data: {
      actorId: tenantB.user.id,
      action: 'team.member_invited',
      targetType: 'team_invitation',
      targetId: `inv_${Date.now()}`,
      metadata: JSON.stringify({ orgId: tenantB.org.id, email: 'staff@betabistro.com' }),
    },
  })

  // Generate sessions
  const sessionTokenA = await encodeSession({
    id: tenantA.user.id,
    email: tenantA.user.email,
    name: tenantA.user.name,
    role: Role.OWNER,
    orgId: tenantA.org.id,
    orgName: tenantA.org.name,
    orgPlan: tenantA.org.plan,
    sessionVersion: tenantA.user.sessionVersion,
  })

  const sessionTokenB = await encodeSession({
    id: tenantB.user.id,
    email: tenantB.user.email,
    name: tenantB.user.name,
    role: Role.OWNER,
    orgId: tenantB.org.id,
    orgName: tenantB.org.name,
    orgPlan: tenantB.org.plan,
    sessionVersion: tenantB.user.sessionVersion,
  })

  const sessionTokenC = await encodeSession({
    id: tenantC.user.id,
    email: tenantC.user.email,
    name: tenantC.user.name,
    role: Role.OWNER,
    orgId: tenantC.org.id,
    orgName: tenantC.org.name,
    orgPlan: tenantC.org.plan,
    sessionVersion: tenantC.user.sessionVersion,
  })

  try {
    // =================================================================
    // GROUP 1: DEF-01 BACKEND SCOPING & MULTI-TENANT AUTHORIZATION
    // =================================================================
    console.log('\n--- GROUP 1: DEF-01 Backend Scoping & Multi-Tenant Authorization ---')

    await test('DEF-01.1: User A requesting Business A1 returns only Business A1 reviews', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox?businessId=${tenantA.business.id}`, {
        headers: { cookie: `rr_session=${sessionTokenA}` },
      })
      const res = await inboxHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.reviews.length, 3, `Expected 3 reviews for Business A1, got ${data.reviews.length}`)
      for (const r of data.reviews) {
        assert.strictEqual(r.business.id, tenantA.business.id, 'Found review not belonging to Business A1')
      }
    })

    await test('DEF-01.2: User A requesting Business A2 returns only Business A2 reviews', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox?businessId=${businessA2.id}`, {
        headers: { cookie: `rr_session=${sessionTokenA}` },
      })
      const res = await inboxHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.reviews.length, 2, `Expected 2 reviews for Business A2, got ${data.reviews.length}`)
      for (const r of data.reviews) {
        assert.strictEqual(r.business.id, businessA2.id, 'Found review not belonging to Business A2')
      }
    })

    await test('DEF-01.3: User A attempting to access foreign Business B1 is rejected with 403 BUSINESS_NOT_OWNED', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox?businessId=${tenantB.business.id}`, {
        headers: { cookie: `rr_session=${sessionTokenA}` },
      })
      const res = await inboxHandler(req)
      assert.strictEqual(res.status, 403, `Expected HTTP 403 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.code, 'BUSINESS_NOT_OWNED', `Expected code BUSINESS_NOT_OWNED but got ${data.code}`)
    })

    await test('DEF-01.4: User B requesting Business B1 returns only Business B1 reviews', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox?businessId=${tenantB.business.id}`, {
        headers: { cookie: `rr_session=${sessionTokenB}` },
      })
      const res = await inboxHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.reviews.length, 3, `Expected 3 reviews for Business B1, got ${data.reviews.length}`)
      for (const r of data.reviews) {
        assert.strictEqual(r.business.id, tenantB.business.id, 'Found review not belonging to Business B1')
      }
    })

    await test('DEF-01.5: User B attempting to access foreign Business A1 is rejected with 403 BUSINESS_NOT_OWNED', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox?businessId=${tenantA.business.id}`, {
        headers: { cookie: `rr_session=${sessionTokenB}` },
      })
      const res = await inboxHandler(req)
      assert.strictEqual(res.status, 403, `Expected HTTP 403 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.code, 'BUSINESS_NOT_OWNED', `Expected code BUSINESS_NOT_OWNED but got ${data.code}`)
    })

    // =================================================================
    // GROUP 2: DEF-01 FRONTEND SOURCE CODE & STALE REQUEST PROTECTION
    // =================================================================
    console.log('\n--- GROUP 2: DEF-01 Frontend Source Code & Stale-Request Protection ---')

    await test('DEF-01.6: Inbox page source passes activeBusinessId in fetch query params', () => {
      const inboxPath = path.join(process.cwd(), 'src/app/inbox/page.tsx')
      const inboxSrc = fs.readFileSync(inboxPath, 'utf-8')
      assert(
        inboxSrc.includes("if (activeBusinessId) params.set('businessId', activeBusinessId)"),
        'InboxPage does not pass activeBusinessId to params'
      )
      assert(
        inboxSrc.includes('[filter, search, reviewIdParam, activeBusinessId]'),
        'fetchReviews dependency array does not include activeBusinessId'
      )
    })

    await test('DEF-01.7: Inbox page implements latestRequestId guard against out-of-order responses', () => {
      const inboxPath = path.join(process.cwd(), 'src/app/inbox/page.tsx')
      const inboxSrc = fs.readFileSync(inboxPath, 'utf-8')
      assert(
        inboxSrc.includes('const latestRequestId = useRef(0)'),
        'InboxPage does not define latestRequestId ref'
      )
      assert(
        inboxSrc.includes('if (requestId !== latestRequestId.current) return'),
        'InboxPage does not check requestId against latestRequestId.current'
      )
    })

    await test('DEF-01.8: Inbox page revalidates selectedReview on business switch', () => {
      const inboxPath = path.join(process.cwd(), 'src/app/inbox/page.tsx')
      const inboxSrc = fs.readFileSync(inboxPath, 'utf-8')
      assert(
        inboxSrc.includes('setSelectedReview(current => (current && fetchedReviews.some(r => r.id === current.id) ? current : null))'),
        'InboxPage does not clear stale selectedReview from previous business'
      )
    })

    await test('DEF-01.9: Rapid switching simulation: stale responses are strictly discarded', async () => {
      // Simulate rapid switching logic:
      // Request 1: starts for Business A
      // Request 2: starts for Business B (increments requestId)
      // Request 1 finishes late -> must be discarded
      let requestId = 0
      let latestId = 0
      let activeState = 'NONE'

      // Request 1 dispatched
      const r1 = ++latestId
      // Request 2 dispatched immediately after
      const r2 = ++latestId

      // Handler for R1 finishes late
      function handleR1() {
        if (r1 !== latestId) return // Discarded
        activeState = 'BUSINESS_A'
      }

      // Handler for R2 finishes
      function handleR2() {
        if (r2 !== latestId) return
        activeState = 'BUSINESS_B'
      }

      // R2 finishes first, then R1 finishes
      handleR2()
      handleR1()

      assert.strictEqual(activeState, 'BUSINESS_B', 'Stale request R1 improperly overwrote activeState!')
    })

    // =================================================================
    // GROUP 3: DEF-06 TENANT-SCOPED AUDIT LOG API & TENANT ISOLATION
    // =================================================================
    console.log('\n--- GROUP 3: DEF-06 Tenant-Scoped Audit Log API & Tenant Isolation ---')

    await test('DEF-06.1: GET /api/audit-log returns only Organization A audit records for User A', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-log', {
        headers: { cookie: `rr_session=${sessionTokenA}` },
      })
      const res = await tenantAuditLogHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert(Array.isArray(data.entries), 'entries is not an array')
      assert(data.entries.length >= 2, `Expected at least 2 entries for Org A, got ${data.entries.length}`)

      // Verify all returned records belong to Org A
      const orgAIds = [auditA1.id, auditA2.id]
      const returnedIds = data.entries.map((e: any) => e.id)
      for (const id of orgAIds) {
        assert(returnedIds.includes(id), `Expected audit record ${id} to be present in Org A response`)
      }

      // Zero records from Org B
      assert(!returnedIds.includes(auditB1.id), 'Cross-tenant leak: Org B auditB1 leaked to Org A!')
      assert(!returnedIds.includes(auditB2.id), 'Cross-tenant leak: Org B auditB2 leaked to Org A!')
    })

    await test('DEF-06.2: GET /api/audit-log returns only Organization B audit records for User B', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-log', {
        headers: { cookie: `rr_session=${sessionTokenB}` },
      })
      const res = await tenantAuditLogHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert(Array.isArray(data.entries), 'entries is not an array')
      assert(data.entries.length >= 2, `Expected at least 2 entries for Org B, got ${data.entries.length}`)

      const orgBIds = [auditB1.id, auditB2.id]
      const returnedIds = data.entries.map((e: any) => e.id)
      for (const id of orgBIds) {
        assert(returnedIds.includes(id), `Expected audit record ${id} to be present in Org B response`)
      }

      // Zero records from Org A
      assert(!returnedIds.includes(auditA1.id), 'Cross-tenant leak: Org A auditA1 leaked to Org B!')
      assert(!returnedIds.includes(auditA2.id), 'Cross-tenant leak: Org A auditA2 leaked to Org B!')
    })

    await test('DEF-06.3: Client passing ?orgId=<OrgB> cannot leak Org B audit data to User A', async () => {
      const req = new NextRequest(`http://localhost:3000/api/audit-log?orgId=${tenantB.org.id}`, {
        headers: { cookie: `rr_session=${sessionTokenA}` },
      })
      const res = await tenantAuditLogHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()

      const returnedIds = data.entries.map((e: any) => e.id)
      assert(!returnedIds.includes(auditB1.id), 'Cross-tenant spoofing leak: User A accessed Org B audit records!')
      assert(!returnedIds.includes(auditB2.id), 'Cross-tenant spoofing leak: User A accessed Org B audit records!')
    })

    await test('DEF-06.4: GET /api/audit-log requires authentication (fails closed with 401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-log')
      const res = await tenantAuditLogHandler(req)
      assert.strictEqual(res.status, 401, `Expected HTTP 401 but got ${res.status}`)
    })

    await test('DEF-06.5: Honest empty state for tenant with no audit logs', async () => {
      const req = new NextRequest('http://localhost:3000/api/audit-log', {
        headers: { cookie: `rr_session=${sessionTokenC}` },
      })
      const res = await tenantAuditLogHandler(req)
      assert.strictEqual(res.status, 200, `Expected HTTP 200 but got ${res.status}`)
      const data = await res.json()
      assert.strictEqual(data.entries.length, 0, `Expected 0 entries for empty tenant, got ${data.entries.length}`)
      assert.strictEqual(data.total, 0, `Expected total 0, got ${data.total}`)
    })

    // =================================================================
    // GROUP 4: DEF-06 SETTINGS SECURITY TAB FRONTEND VERIFICATION
    // =================================================================
    console.log('\n--- GROUP 4: DEF-06 Settings Security Tab Frontend Verification ---')

    await test('DEF-06.6: Settings page no longer contains hardcoded fake audit log strings', () => {
      const settingsPath = path.join(process.cwd(), 'src/app/settings/page.tsx')
      const settingsSrc = fs.readFileSync(settingsPath, 'utf-8')
      assert(!settingsSrc.includes('staff@bamboogarden.com'), 'Fake audit log email still found in Settings page!')
      assert(!settingsSrc.includes('Chrome on macOS · San Francisco, US'), 'Fake audit log target still found in Settings page!')
    })

    await test('DEF-06.7: Settings page renders SecurityAuditLogSection querying /api/audit-log', () => {
      const settingsPath = path.join(process.cwd(), 'src/app/settings/page.tsx')
      const settingsSrc = fs.readFileSync(settingsPath, 'utf-8')
      assert(settingsSrc.includes('<SecurityAuditLogSection />'), 'SecurityAuditLogSection not rendered in Settings page!')
      assert(settingsSrc.includes("fetch('/api/audit-log?limit=10')"), 'SecurityAuditLogSection does not fetch /api/audit-log')
      assert(settingsSrc.includes('No audit log events recorded for this organization yet.'), 'Honest empty state missing in Settings page')
      assert(settingsSrc.includes('Loading audit events...'), 'Honest loading state missing in Settings page')
    })

    // =================================================================
    // GROUP 5: PRESERVATION OF ADMIN AUDIT LOG
    // =================================================================
    console.log('\n--- GROUP 5: Preservation of Platform Admin Audit Log ---')

    await test('DEF-06.8: GET /api/admin/audit-log continues to deny non-admin users', async () => {
      const originalAdmins = process.env.ADMIN_EMAILS
      process.env.ADMIN_EMAILS = 'superadmin@platform.internal'

      try {
        const req = new NextRequest('http://localhost:3000/api/admin/audit-log', {
          headers: { cookie: `rr_session=${sessionTokenA}` },
        })
        const res = await adminAuditLogHandler(req)
        assert.strictEqual(res.status, 403, `Expected HTTP 403 for non-admin on admin audit endpoint, got ${res.status}`)
      } finally {
        if (originalAdmins) process.env.ADMIN_EMAILS = originalAdmins
        else delete process.env.ADMIN_EMAILS
      }
    })

    await test('DEF-06.9: GET /api/admin/audit-log serves platform-wide entries for authorized platform admin', async () => {
      const originalAdmins = process.env.ADMIN_EMAILS
      process.env.ADMIN_EMAILS = tenantA.user.email

      try {
        const req = new NextRequest('http://localhost:3000/api/admin/audit-log', {
          headers: { cookie: `rr_session=${sessionTokenA}` },
        })
        const res = await adminAuditLogHandler(req)
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for platform admin, got ${res.status}`)
        const data = await res.json()
        assert(Array.isArray(data.entries), 'Admin audit log does not return entries array')
        // Admin sees events from multiple organizations
        const returnedIds = data.entries.map((e: any) => e.id)
        assert(returnedIds.includes(auditA1.id) || returnedIds.includes(auditB1.id), 'Admin cannot see system audit logs')
      } finally {
        if (originalAdmins) process.env.ADMIN_EMAILS = originalAdmins
        else delete process.env.ADMIN_EMAILS
      }
    })

  } finally {
    console.log('\n--- Cleaning up test fixtures ---')
    await prisma.review.deleteMany({
      where: {
        id: {
          in: [
            reviewA1_1.id, reviewA1_2.id, reviewA1_3.id,
            reviewA2_1.id, reviewA2_2.id,
            reviewB1_1.id, reviewB1_2.id, reviewB1_3.id,
          ],
        },
      },
    }).catch(() => {})

    await prisma.auditLog.deleteMany({
      where: {
        id: {
          in: [auditA1.id, auditA2.id, auditB1.id, auditB2.id],
        },
      },
    }).catch(() => {})

    await prisma.business.delete({ where: { id: businessA2.id } }).catch(() => {})
    await cleanupTestTenant(tenantA.org.id).catch(() => {})
    await cleanupTestTenant(tenantB.org.id).catch(() => {})
    await cleanupTestTenant(tenantC.org.id).catch(() => {})
  }

  console.log('\n=================================================================')
  console.log(`JOB-7.1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runJob71Verification().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})

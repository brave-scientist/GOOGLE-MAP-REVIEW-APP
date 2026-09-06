/**
 * JOB-7.4 Dedicated Verification Suite: Compliance DSAR + Staff SMS Consent UI
 *
 * Validates:
 * 1. DSAR personal data archive export (GDPR Art. 15):
 *    - Authenticated success
 *    - Multi-tenant isolation (Tenant B cannot see Tenant A's data)
 *    - Strict allowlisting (zero password hashes, session tokens, or stripe customer secrets)
 *    - Audit event emission (compliance.dsar_exported)
 * 2. Audit log export (CSV):
 *    - Tenant isolation (only Tenant A's logs)
 *    - Valid CSV format with expected headers
 *    - Audit event emission (compliance.audit_log_exported)
 * 3. Deletion request lifecycle (GDPR Art. 17):
 *    - Persistent request creation with 30-day statutory grace period
 *    - Idempotency & duplicate prevention (no duplicate pending records)
 *    - Query active status (GET)
 *    - Cancellation workflow (DELETE)
 *    - Audit event emissions (compliance.deletion_requested, compliance.deletion_cancelled)
 * 4. Staff SMS Consent Invitation API (SMS-002.1 / JOB-5 DEF-05):
 *    - Legitimate invite creates single-use token and URL
 *    - Cross-tenant business rejection (IDOR defense)
 *    - Phone normalization and invalid phone rejection
 *    - Token entropy and verification
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as exportHandler } from '../src/app/api/export/route'
import {
  GET as getDeletionHandler,
  POST as postDeletionHandler,
  DELETE as deleteDeletionHandler,
} from '../src/app/api/compliance/deletion-request/route'
import { POST as postInviteHandler } from '../src/app/api/sms/consent/invite/route'

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
  tenant: TestSeedResult,
  method = 'GET',
  body?: any
): Promise<NextRequest> {
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

  const headers = new Headers({
    cookie: `${SESSION_COOKIE}=${token}`,
    host: 'localhost:3000',
  })

  if (body) {
    headers.set('content-type', 'application/json')
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function runSuite() {
  console.log('\n======================================================')
  console.log('  JOB-7.4 VERIFICATION SUITE: COMPLIANCE DSAR & SMS UI')
  console.log('======================================================\n')

  // Seed two completely isolated tenants
  const tenantA = await seedTestTenant({
    name: 'Tenant A Owner',
    businessName: 'Business A',
  })
  const tenantB = await seedTestTenant({
    name: 'Tenant B Owner',
    businessName: 'Business B',
  })

  try {
    // Seed some reviews for Business A
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Alice Customer',
        rating: 5,
        source: 'GOOGLE',
        text: 'Wonderful experience at Business A!',
        externalId: `ext_test_${Date.now()}`,
      },
    })

    // Seed an audit log for Tenant A
    await prisma.auditLog.create({
      data: {
        actorId: tenantA.user.id,
        action: 'review.replied',
        targetType: 'review',
        targetId: 'rev_123',
        metadata: JSON.stringify({ orgId: tenantA.org.id, businessId: tenantA.business.id }),
      },
    })

    // Seed an audit log for Tenant B (to test cross-tenant isolation)
    await prisma.auditLog.create({
      data: {
        actorId: tenantB.user.id,
        action: 'settings.updated',
        targetType: 'organization',
        targetId: tenantB.org.id,
        metadata: JSON.stringify({ orgId: tenantB.org.id, businessId: tenantB.business.id }),
      },
    })

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 1: DSAR PERSONAL DATA ARCHIVE EXPORT
    // ─────────────────────────────────────────────────────────────
    console.log('\n[DSAR EXPORT TESTS]')

    // 1.1: Unauthenticated request rejected
    {
      const req = new NextRequest(new URL('http://localhost:3000/api/export?type=dsar'))
      const res = await exportHandler(req)
      assert(res.status === 401, 'Unauthenticated DSAR export returns 401 Unauthorized')
    }

    // 1.2: Authenticated Tenant A export succeeds with valid JSON archive
    let dsarData: any
    {
      const req = await createAuthRequest('http://localhost:3000/api/export?type=dsar', tenantA)
      const res = await exportHandler(req)
      assert(res.status === 200, 'Authenticated DSAR export returns 200 OK')
      assert(res.headers.get('content-type')?.includes('application/json') ?? false, 'DSAR returns application/json')
      assert(res.headers.get('content-disposition')?.includes('dsar-export-') ?? false, 'DSAR returns attachment filename')

      const text = await res.text()
      dsarData = JSON.parse(text)
      assert(dsarData.exportMetadata?.type === 'DSAR_PERSONAL_DATA_ARCHIVE', 'Archive metadata type is DSAR_PERSONAL_DATA_ARCHIVE')
      assert(dsarData.user?.email === tenantA.user.email, 'User profile contains requester email')
      assert(dsarData.organization?.name === tenantA.org.name, 'Organization profile contains requester org')
      assert(dsarData.businesses?.length === 1 && dsarData.businesses[0].name === 'Business A', 'Contains authorized business')
      assert(dsarData.reviews?.length === 1 && dsarData.reviews[0].author === 'Alice Customer', 'Contains reviews for authorized business')
    }

    // 1.3: Sensitive data exclusions (Zero secrets leak)
    {
      assert(dsarData.user.passwordHash === undefined, 'Zero passwordHash leakage in DSAR archive')
      assert(dsarData.user.sessionVersion === undefined, 'Zero sessionVersion leakage in DSAR archive')
      assert(dsarData.organization.stripeCustomerId === undefined, 'Zero stripeCustomerId leakage in DSAR archive')
      assert(dsarData.organization.stripeSubscriptionId === undefined, 'Zero stripeSubscriptionId leakage in DSAR archive')
    }

    // 1.4: Cross-tenant isolation in DSAR
    {
      const hasTenantBBusiness = dsarData.businesses.some((b: any) => b.id === tenantB.business.id)
      const hasTenantBReview = dsarData.reviews.some((r: any) => r.businessId === tenantB.business.id)
      assert(!hasTenantBBusiness, 'Tenant B business is strictly excluded from Tenant A DSAR')
      assert(!hasTenantBReview, 'Tenant B reviews are strictly excluded from Tenant A DSAR')
    }

    // 1.5: Audit event emitted for DSAR export
    {
      const dsarAudit = await prisma.auditLog.findFirst({
        where: {
          actorId: tenantA.user.id,
          action: 'compliance.dsar_exported',
        },
      })
      assert(dsarAudit !== null, 'compliance.dsar_exported event recorded in audit trail')
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 2: AUDIT LOG CSV EXPORT
    // ─────────────────────────────────────────────────────────────
    console.log('\n[AUDIT LOG EXPORT TESTS]')

    // 2.1: Authenticated Audit Log CSV export
    {
      const req = await createAuthRequest('http://localhost:3000/api/export?type=audit-log', tenantA)
      const res = await exportHandler(req)
      assert(res.status === 200, 'Audit log export returns 200 OK')
      assert(res.headers.get('content-type')?.includes('text/csv') ?? false, 'Audit log export returns text/csv')
      assert(res.headers.get('content-disposition')?.includes('audit-log-') ?? false, 'Audit log export returns attachment filename')

      const csv = await res.text()
      const lines = csv.split('\n')
      assert(lines[0] === 'ID,Timestamp,Action,Actor,Target Type,Target ID,IP,Metadata', 'CSV contains expected standard audit headers')
      assert(csv.includes('review.replied'), 'CSV contains Tenant A audit action')
      assert(!csv.includes('settings.updated'), 'CSV strictly excludes Tenant B audit action (Multi-tenant isolation)')
    }

    // 2.2: Audit event emitted for audit export
    {
      const auditExportEvent = await prisma.auditLog.findFirst({
        where: {
          actorId: tenantA.user.id,
          action: 'compliance.audit_log_exported',
        },
      })
      assert(auditExportEvent !== null, 'compliance.audit_log_exported event recorded in audit trail')
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 3: DELETION REQUEST WORKFLOW
    // ─────────────────────────────────────────────────────────────
    console.log('\n[DELETION REQUEST WORKFLOW TESTS]')

    // 3.1: Initial status is inactive
    {
      const req = await createAuthRequest('http://localhost:3000/api/compliance/deletion-request', tenantA)
      const res = await getDeletionHandler(req)
      const data = await res.json()
      assert(res.status === 200, 'GET /api/compliance/deletion-request returns 200')
      assert(data.hasActiveRequest === false, 'Initial state hasActiveRequest is false')
    }

    // 3.2: Create deletion request
    let createdRequestId: string
    {
      const req = await createAuthRequest(
        'http://localhost:3000/api/compliance/deletion-request',
        tenantA,
        'POST',
        { reason: 'Testing compliance GDPR deletion' }
      )
      const res = await postDeletionHandler(req)
      const data = await res.json()
      assert(res.status === 201, 'POST /api/compliance/deletion-request returns 201 Created')
      assert(data.success === true, 'Deletion request returns success true')
      assert(data.deletionRequest.status === 'PENDING', 'Deletion request status is PENDING')

      // Check scheduledFor is ~30 days in future
      const scheduled = new Date(data.deletionRequest.scheduledFor).getTime()
      const now = Date.now()
      const daysDiff = (scheduled - now) / (1000 * 60 * 60 * 24)
      assert(daysDiff >= 29 && daysDiff <= 31, 'Deletion request scheduled for 30-day statutory grace period')

      createdRequestId = data.deletionRequest.id
    }

    // 3.3: Duplicate active deletion request prevented
    {
      const req = await createAuthRequest(
        'http://localhost:3000/api/compliance/deletion-request',
        tenantA,
        'POST',
        { reason: 'Second request attempt' }
      )
      const res = await postDeletionHandler(req)
      const data = await res.json()
      assert(res.status === 200, 'Duplicate deletion request returns 200 (idempotent)')
      assert(data.deletionRequest.id === createdRequestId, 'Returns existing deletion request instead of creating duplicate')

      // Verify only 1 record in DB
      const count = await prisma.deletionRequest.count({
        where: { userId: tenantA.user.id, status: 'PENDING' },
      })
      assert(count === 1, 'Database contains exactly 1 active deletion request')
    }

    // 3.4: Active status query returns the pending request
    {
      const req = await createAuthRequest('http://localhost:3000/api/compliance/deletion-request', tenantA)
      const res = await getDeletionHandler(req)
      const data = await res.json()
      assert(data.hasActiveRequest === true, 'GET reflects active deletion request')
      assert(data.deletionRequest.id === createdRequestId, 'GET returns correct deletion request ID')
    }

    // 3.5: Audit log recorded for deletion request
    {
      const reqAudit = await prisma.auditLog.findFirst({
        where: {
          actorId: tenantA.user.id,
          action: 'compliance.deletion_requested',
        },
      })
      assert(reqAudit !== null, 'compliance.deletion_requested event logged in audit trail')
    }

    // 3.6: Cancel deletion request within grace period
    {
      const req = await createAuthRequest('http://localhost:3000/api/compliance/deletion-request', tenantA, 'DELETE')
      const res = await deleteDeletionHandler(req)
      const data = await res.json()
      assert(res.status === 200, 'DELETE /api/compliance/deletion-request returns 200')
      assert(data.success === true, 'Cancellation returns success true')
      assert(data.deletionRequest.status === 'CANCELLED', 'Request status updated to CANCELLED')

      // Verify in DB
      const updated = await prisma.deletionRequest.findUnique({
        where: { id: createdRequestId },
      })
      assert(updated?.status === 'CANCELLED' && updated?.cancelledAt !== null, 'Record marked CANCELLED with timestamp in DB')
    }

    // 3.7: After cancellation, hasActiveRequest returns false
    {
      const req = await createAuthRequest('http://localhost:3000/api/compliance/deletion-request', tenantA)
      const res = await getDeletionHandler(req)
      const data = await res.json()
      assert(data.hasActiveRequest === false, 'GET reflects no active deletion request after cancellation')
    }

    // 3.8: Audit log recorded for cancellation
    {
      const cancelAudit = await prisma.auditLog.findFirst({
        where: {
          actorId: tenantA.user.id,
          action: 'compliance.deletion_cancelled',
        },
      })
      assert(cancelAudit !== null, 'compliance.deletion_cancelled event logged in audit trail')
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 4: STAFF SMS CONSENT INVITATION (JOB-5 DEF-05)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STAFF SMS CONSENT INVITATION TESTS]')

    // 4.1: Valid invitation generation
    {
      const req = await createAuthRequest(
        'http://localhost:3000/api/sms/consent/invite',
        tenantA,
        'POST',
        {
          businessId: tenantA.business.id,
          contact: '+1 (415) 555-0123',
          recipientName: 'Sarah TestCustomer',
        }
      )
      const res = await postInviteHandler(req)
      const data = await res.json()
      assert(res.status === 200, 'POST /api/sms/consent/invite returns 200')
      assert(data.success === true, 'Consent invitation returns success true')
      assert(typeof data.inviteUrl === 'string' && data.inviteUrl.includes('/consent/'), 'Returns valid /consent/ URL')
      assert(typeof data.token === 'string' && data.token.length === 64, 'Returns 64-hex character token')
    }

    // 4.2: Invalid phone number rejection
    {
      const req = await createAuthRequest(
        'http://localhost:3000/api/sms/consent/invite',
        tenantA,
        'POST',
        {
          businessId: tenantA.business.id,
          contact: 'invalid-number',
        }
      )
      const res = await postInviteHandler(req)
      assert(res.status === 400, 'Invalid phone number rejected with 400 Bad Request')
    }

    // 4.3: Cross-tenant business authorization rejection (IDOR)
    {
      const req = await createAuthRequest(
        'http://localhost:3000/api/sms/consent/invite',
        tenantA,
        'POST',
        {
          businessId: tenantB.business.id, // Tenant B's business attempted by Tenant A
          contact: '+14155550123',
        }
      )
      const res = await postInviteHandler(req)
      assert(res.status === 403 || res.status === 404, 'Cross-tenant businessId strictly rejected (IDOR prevention)')
    }

    // 4.4: Generated invitation persisted in DB
    {
      const dbInvite = await prisma.customerSmsConsentInvitation.findFirst({
        where: {
          businessId: tenantA.business.id,
          contact: '+14155550123',
        },
      })
      assert(dbInvite !== null, 'Invitation record persisted in CustomerSmsConsentInvitation table')
      assert(dbInvite?.status === 'PENDING', 'Invitation status is PENDING')
      assert(dbInvite?.recipientName === 'Sarah TestCustomer', 'Recipient name persisted correctly')
    }
  } finally {
    // Clean up test tenants
    await cleanupTestTenant(tenantA.org.id)
    await cleanupTestTenant(tenantB.org.id)
  }

  console.log('\n======================================================')
  console.log(`  JOB-7.4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`)
  console.log('======================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runSuite().catch(err => {
  console.error('Unhandled test suite error:', err)
  process.exit(1)
})

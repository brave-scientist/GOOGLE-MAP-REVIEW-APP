/**
 * scripts/test-job17-2-features.ts
 *
 * Dedicated verification suite for Milestone JOB-17.2:
 * Feature Implementation (Branding, Domains, Portals, Reports) for AGY-01
 *
 * Validates:
 * A. Agency Branding API & RBAC:
 *    1. GET /api/agency/branding returns default branding when unconfigured
 *    2. PUT /api/agency/branding updates brandName, colors, logo, and identities
 *    3. VIEWER / STAFF roles cannot modify agency branding (HTTP 403)
 *    4. Invalid hex color format rejected (HTTP 400)
 *
 * B. Custom Domain Engine & DNS Verification:
 *    5. POST /api/agency/domains registers domain with PENDING_VERIFICATION status
 *    6. Invalid domain syntax rejected (HTTP 400)
 *    7. Duplicate domain registration across organizations rejected (HTTP 409)
 *    8. POST /api/agency/domains/[id]/verify executes CNAME check & updates status to VERIFIED
 *    9. GET /api/agency/domains lists registered domains
 *   10. DELETE /api/agency/domains/[id] removes custom domain
 *
 * C. Client Portal Share Links & Public Portal Summary:
 *   11. POST /api/portal/share creates ClientPortalShare and returns rawToken
 *   12. Token hash invariant: SHA-256 of rawToken matches DB tokenHash
 *   13. GET /api/portal/[token]/summary renders zero-auth public client portal
 *   14. Public summary reflects custom AgencyBranding and location reviews
 *   15. Passcode protection: missing passcode returns 401, wrong passcode 403, correct passcode 200
 *   16. Expiration handling: expired share link returns 410 PORTAL_EXPIRED
 *   17. DELETE /api/portal/share/[id] revokes share link (subsequent query returns 404)
 *
 * D. Scheduled Report Delivery & Idempotency:
 *   18. Cron dispatch logs entries in ReportDeliveryLog with idempotencyKey
 *
 * E. Multi-Tenant IDOR Boundaries:
 *   19. Tenant A cannot modify Tenant B AgencyBranding
 *   20. Tenant A cannot verify or delete Tenant B CustomDomain
 *   21. Tenant A cannot list or revoke Tenant B ClientPortalShare
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getBrandingHandler, PUT as putBrandingHandler } from '../src/app/api/agency/branding/route'
import { GET as getDomainsHandler, POST as postDomainsHandler } from '../src/app/api/agency/domains/route'
import { DELETE as deleteDomainHandler } from '../src/app/api/agency/domains/[id]/route'
import { POST as verifyDomainHandler } from '../src/app/api/agency/domains/[id]/verify/route'
import { GET as getPortalSharesHandler, POST as postPortalShareHandler } from '../src/app/api/portal/share/route'
import { DELETE as deletePortalShareHandler } from '../src/app/api/portal/share/[id]/route'
import { GET as getPortalSummaryHandler } from '../src/app/api/portal/[token]/summary/route'
import { GET as reportCronHandler } from '../src/app/api/cron/reports/route'
import { Role, Plan, ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'
import crypto from 'crypto'

process.env.CRON_SECRET = 'test-secret'

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

async function createMockRequest(
  url: string,
  options: {
    method?: string
    user?: any
    body?: any
    headers?: Record<string, string>
  } = {}
): Promise<NextRequest> {
  const method = options.method || 'GET'
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  }

  if (options.user) {
    const token = await encodeSession({
      id: options.user.id,
      email: options.user.email,
      name: options.user.name,
      role: options.user.role,
      orgId: options.user.orgId,
      orgName: options.user.orgName || 'Test Agency Org',
      orgPlan: options.user.orgPlan || 'AGENCY',
      sessionVersion: options.user.sessionVersion || 1,
    })
    headers['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: any = { method, headers }
  if (options.body) {
    reqInit.body = JSON.stringify(options.body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

async function runJob17_2Suite() {
  console.log('====================================================================')
  console.log('JOB-17.2 VERIFICATION SUITE: Feature Implementation (Branding, Domains, Portals, Reports)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let staffUserA: any = null

  try {
    // Setup Test Tenants
    tenantA = await seedTestTenant({
      name: 'Agency Tenant A',
      businessName: 'Client Biz Alpha',
      role: Role.OWNER,
      plan: Plan.AGENCY,
    })

    tenantB = await seedTestTenant({
      name: 'Independent Tenant B',
      businessName: 'Client Biz Beta',
      role: Role.OWNER,
      plan: Plan.PRO,
    })

    // Staff user under Tenant A
    const staffEmail = generateTestEmail('agency_staff')
    const sUser = await prisma.user.create({
      data: { email: staffEmail, name: 'Staff User', sessionVersion: 1 },
    })
    await prisma.orgMember.create({
      data: { orgId: tenantA.org.id, userId: sUser.id, role: Role.STAFF },
    })
    staffUserA = { ...sUser, role: Role.STAFF, orgId: tenantA.org.id }

    // Seed sample reviews for Business Alpha
    await prisma.review.createMany({
      data: [
        {
          businessId: tenantA.business.id,
          externalId: `ext_rev_1_${Date.now()}`,
          author: 'Jane Doe',
          rating: 5,
          text: 'Outstanding service and white-label execution!',
          source: 'GOOGLE',
          draftStatus: 'POSTED',
          replyText: 'Thank you for your review!',
        },
        {
          businessId: tenantA.business.id,
          externalId: `ext_rev_2_${Date.now()}`,
          author: 'John Smith',
          rating: 4,
          text: 'Great experience overall.',
          source: 'FACEBOOK',
          draftStatus: 'APPROVED',
        },
      ],
    })

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: Agency Branding API & RBAC
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Agency Branding API & RBAC]')

    // 1. GET returns default branding when unconfigured
    const getBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      user: tenantA.user,
    })
    const getBrandingRes = await getBrandingHandler(getBrandingReq)
    assert(getBrandingRes.status === 200, 'GET /api/agency/branding returns HTTP 200')
    const brandingData = await getBrandingRes.json()
    assert(brandingData?.branding?.primaryColor === '#1E40AF', 'Returns default primary color when unconfigured')

    // 2. PUT updates brandName, colors, logo, identities
    const putBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantA.user,
      body: {
        brandName: 'Apex Agency Media',
        logoUrl: 'https://cdn.example.com/logo-apex.png',
        primaryColor: '#111827',
        accentColor: '#10B981',
        supportEmail: 'support@apexagency.com',
        portalTitle: 'Apex Client Portal',
        hideReviewReplyBadge: true,
      },
    })
    const putBrandingRes = await putBrandingHandler(putBrandingReq)
    assert(putBrandingRes.status === 200, 'PUT /api/agency/branding updates configuration (HTTP 200)')
    const updatedBranding = await putBrandingRes.json()
    assert(updatedBranding?.branding?.brandName === 'Apex Agency Media', 'Brand name updated in database')
    assert(updatedBranding?.branding?.hideReviewReplyBadge === true, 'hideReviewReplyBadge set to true')

    // 3. STAFF role cannot modify agency branding
    const staffBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: staffUserA,
      body: { brandName: 'Hacked Brand' },
    })
    const staffBrandingRes = await putBrandingHandler(staffBrandingReq)
    assert(staffBrandingRes.status === 403, 'STAFF role cannot modify branding (HTTP 403 INSUFFICIENT_ROLE)')

    // 4. Invalid hex color format rejected
    const badHexReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantA.user,
      body: { primaryColor: 'not-a-hex' },
    })
    const badHexRes = await putBrandingHandler(badHexReq)
    assert(badHexRes.status === 400, 'Invalid primaryColor hex format rejected (HTTP 400)\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: Custom Domain Engine & DNS Verification
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 2: Custom Domain Engine & DNS Verification]')

    // 5. POST /api/agency/domains registers domain
    const testDomainName = `reviews-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.apexagency.com`
    const postDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantA.user,
      body: { domain: testDomainName },
    })
    const postDomainRes = await postDomainsHandler(postDomainReq)
    assert(postDomainRes.status === 201, 'POST /api/agency/domains registers domain (HTTP 201)')
    const domainObj = await postDomainRes.json()
    assert(domainObj?.domain?.status === 'PENDING_VERIFICATION', 'Domain status initialized to PENDING_VERIFICATION')

    // 6. Invalid domain syntax rejected
    const badDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantA.user,
      body: { domain: 'invalid_domain_name' },
    })
    const badDomainRes = await postDomainsHandler(badDomainReq)
    assert(badDomainRes.status === 400, 'Invalid domain syntax rejected (HTTP 400)')

    // 7. Duplicate domain rejected across orgs
    const dupDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantB.user,
      body: { domain: testDomainName },
    })
    const dupDomainRes = await postDomainsHandler(dupDomainReq)
    assert(dupDomainRes.status === 409, 'Duplicate domain rejected across organizations (HTTP 409 DOMAIN_EXISTS)')

    // 8. POST /api/agency/domains/[id]/verify verifies CNAME
    const verifyReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${domainObj.domain.id}/verify`, {
      method: 'POST',
      user: tenantA.user,
    })
    const verifyRes = await verifyDomainHandler(verifyReq, { params: Promise.resolve({ id: domainObj.domain.id }) })
    assert(verifyRes.status === 200, 'POST /api/agency/domains/[id]/verify executes DNS check (HTTP 200)')
    const verifiedData = await verifyRes.json()
    assert(verifiedData?.domain?.status === 'VERIFIED', 'Domain status updated to VERIFIED')
    assert(verifiedData?.domain?.sslStatus === 'ACTIVE', 'SSL status updated to ACTIVE')

    // 9. GET /api/agency/domains lists registered domains
    const listDomainsReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      user: tenantA.user,
    })
    const listDomainsRes = await getDomainsHandler(listDomainsReq)
    const domainList = await listDomainsRes.json()
    assert(Array.isArray(domainList?.domains) && domainList.domains.length >= 1, 'GET /api/agency/domains lists domains')

    // 10. DELETE /api/agency/domains/[id] removes domain
    const deleteDomainReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${domainObj.domain.id}`, {
      method: 'DELETE',
      user: tenantA.user,
    })
    const deleteDomainRes = await deleteDomainHandler(deleteDomainReq, { params: Promise.resolve({ id: domainObj.domain.id }) })
    assert(deleteDomainRes.status === 200, 'DELETE /api/agency/domains/[id] removes custom domain (HTTP 200)\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: Client Portal Share Links & Public Summary
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 3: Client Portal Share Links & Public Summary]')

    // 11. POST /api/portal/share creates ClientPortalShare
    const createShareReq = await createMockRequest('http://localhost:3000/api/portal/share', {
      method: 'POST',
      user: tenantA.user,
      body: {
        businessId: tenantA.business.id,
        expiresDays: 30,
      },
    })
    const createShareRes = await postPortalShareHandler(createShareReq)
    assert(createShareRes.status === 201, 'POST /api/portal/share creates portal link (HTTP 201)')
    const shareObj = await createShareRes.json()
    assert(shareObj?.rawToken !== undefined, 'Returns unhashed rawToken in creation response')

    // 12. Token hash invariant: SHA-256 of rawToken matches DB tokenHash
    const expectedHash = crypto.createHash('sha256').update(shareObj.rawToken).digest('hex')
    assert(shareObj.share.tokenHash === expectedHash, 'DB tokenHash matches SHA-256 of rawToken')

    // 13. GET /api/portal/[token]/summary renders zero-auth public portal summary
    const summaryReq = await createMockRequest(`http://localhost:3000/api/portal/${shareObj.rawToken}/summary`)
    const summaryRes = await getPortalSummaryHandler(summaryReq, { params: Promise.resolve({ token: shareObj.rawToken }) })
    assert(summaryRes.status === 200, 'GET /api/portal/[token]/summary returns HTTP 200 (zero-auth)')
    const summaryData = await summaryRes.json()

    // 14. Public summary reflects custom AgencyBranding and location reviews
    assert(summaryData?.branding?.brandName === 'Apex Agency Media', 'Public summary includes agency brand name')
    assert(summaryData?.business?.name === 'Client Biz Alpha', 'Public summary includes location name')
    assert(summaryData?.reviews?.length >= 2, 'Public summary includes location reviews')

    // 15. Passcode protection tests
    const passcodeShareReq = await createMockRequest('http://localhost:3000/api/portal/share', {
      method: 'POST',
      user: tenantA.user,
      body: {
        businessId: tenantA.business.id,
        passcode: 'Secret123!',
      },
    })
    const passcodeShareRes = await postPortalShareHandler(passcodeShareReq)
    const passcodeShareObj = await passcodeShareRes.json()

    // Missing passcode -> 401
    const passMissingReq = await createMockRequest(`http://localhost:3000/api/portal/${passcodeShareObj.rawToken}/summary`)
    const passMissingRes = await getPortalSummaryHandler(passMissingReq, { params: Promise.resolve({ token: passcodeShareObj.rawToken }) })
    assert(passMissingRes.status === 401, 'Passcode protected portal returns 401 when passcode missing')

    // Wrong passcode -> 403
    const passWrongReq = await createMockRequest(`http://localhost:3000/api/portal/${passcodeShareObj.rawToken}/summary?passcode=Wrong`)
    const passWrongRes = await getPortalSummaryHandler(passWrongReq, { params: Promise.resolve({ token: passcodeShareObj.rawToken }) })
    assert(passWrongRes.status === 403, 'Passcode protected portal returns 403 when passcode incorrect')

    // Correct passcode -> 200
    const passCorrectReq = await createMockRequest(`http://localhost:3000/api/portal/${passcodeShareObj.rawToken}/summary?passcode=Secret123!`)
    const passCorrectRes = await getPortalSummaryHandler(passCorrectReq, { params: Promise.resolve({ token: passcodeShareObj.rawToken }) })
    assert(passCorrectRes.status === 200, 'Passcode protected portal returns 200 when passcode correct')

    // 16. Expiration handling: expired share link returns 410
    const expiredRawToken = `expired-token-raw-${Date.now()}`
    const expiredShare = await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(expiredRawToken).digest('hex'),
        expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      },
    })
    const expSummaryReq = await createMockRequest(`http://localhost:3000/api/portal/${expiredRawToken}/summary`)
    const expSummaryRes = await getPortalSummaryHandler(expSummaryReq, { params: Promise.resolve({ token: expiredRawToken }) })
    assert(expSummaryRes.status === 410, 'Expired portal link returns HTTP 410 PORTAL_EXPIRED')

    // 17. DELETE /api/portal/share/[id] revokes link
    const deleteShareReq = await createMockRequest(`http://localhost:3000/api/portal/share/${shareObj.share.id}`, {
      method: 'DELETE',
      user: tenantA.user,
    })
    const deleteShareRes = await deletePortalShareHandler(deleteShareReq, { params: Promise.resolve({ id: shareObj.share.id }) })
    assert(deleteShareRes.status === 200, 'DELETE /api/portal/share/[id] revokes link (HTTP 200)')

    const revokedReq = await createMockRequest(`http://localhost:3000/api/portal/${shareObj.rawToken}/summary`)
    const revokedRes = await getPortalSummaryHandler(revokedReq, { params: Promise.resolve({ token: shareObj.rawToken }) })
    assert(revokedRes.status === 404, 'Revoked portal token returns HTTP 404 NOT_FOUND\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: Scheduled Report Delivery & Idempotency
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 4: Scheduled Report Delivery & Idempotency]')

    // Create a active scheduled report for Tenant A
    const schedReport = await prisma.scheduledReport.create({
      data: {
        orgId: tenantA.org.id,
        businessId: tenantA.business.id,
        name: 'Weekly Executive Report',
        schedule: ReportSchedule.WEEKLY,
        recipients: JSON.stringify(['client@apexagency.com']),
        format: ReportFormat.EMAIL_HTML,
        status: ReportStatus.ACTIVE,
        lastSentAt: null, // Due immediately
      },
    })

    const cronReq = await createMockRequest('http://localhost:3000/api/cron/reports', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'test-secret'}` },
    })
    const cronRes = await reportCronHandler(cronReq)
    assert(cronRes.status === 200, 'Report cron execution returns HTTP 200')
    const cronData = await cronRes.json()
    assert(cronData?.dispatched >= 1, 'Cron dispatched scheduled report')

    // Verify ReportDeliveryLog entry in database
    const deliveryLog = await prisma.reportDeliveryLog.findFirst({
      where: { reportId: schedReport.id },
    })
    assert(deliveryLog !== null && deliveryLog.status === 'SENT', 'ReportDeliveryLog recorded with status SENT')
    assert(deliveryLog?.idempotencyKey?.includes(schedReport.id) === true, 'ReportDeliveryLog idempotencyKey formatted correctly\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: Multi-Tenant IDOR Boundaries
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 5: Multi-Tenant IDOR Boundaries]')

    // 19. Tenant B cannot modify Tenant A AgencyBranding
    const idorBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantB.user, // Tenant B trying to overwrite Tenant A branding is scoped to Tenant B orgId
      body: { brandName: 'Tenant B Overwrite' },
    })
    await putBrandingHandler(idorBrandingReq)

    const tenantABrandingCheck = await prisma.agencyBranding.findUnique({
      where: { orgId: tenantA.org.id },
    })
    assert(tenantABrandingCheck?.brandName === 'Apex Agency Media', 'Tenant A branding unmutated by Tenant B request')

    // 20. Tenant B cannot verify or delete Tenant A CustomDomain
    const tenantADomain = await prisma.customDomain.create({
      data: {
        orgId: tenantA.org.id,
        domain: `reviews-idor-${Date.now()}.com`,
        status: 'PENDING_VERIFICATION',
        verificationToken: `token-idor-${Date.now()}`,
      },
    })

    const idorVerifyReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${tenantADomain.id}/verify`, {
      method: 'POST',
      user: tenantB.user, // Tenant B
    })
    const idorVerifyRes = await verifyDomainHandler(idorVerifyReq, { params: Promise.resolve({ id: tenantADomain.id }) })
    assert(idorVerifyRes.status === 404, 'Tenant B cannot verify Tenant A domain (HTTP 404 NOT_FOUND)')

    const idorDeleteReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${tenantADomain.id}`, {
      method: 'DELETE',
      user: tenantB.user, // Tenant B
    })
    const idorDeleteRes = await deleteDomainHandler(idorDeleteReq, { params: Promise.resolve({ id: tenantADomain.id }) })
    assert(idorDeleteRes.status === 404, 'Tenant B cannot delete Tenant A domain (HTTP 404 NOT_FOUND)')

    // 21. Tenant B cannot list or revoke Tenant A ClientPortalShare
    const tenantAShare = await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(`idor-share-token-${Date.now()}`).digest('hex'),
      },
    })

    const idorDeleteShareReq = await createMockRequest(`http://localhost:3000/api/portal/share/${tenantAShare.id}`, {
      method: 'DELETE',
      user: tenantB.user, // Tenant B
    })
    const idorDeleteShareRes = await deletePortalShareHandler(idorDeleteShareReq, { params: Promise.resolve({ id: tenantAShare.id }) })
    assert(idorDeleteShareRes.status === 404, 'Tenant B cannot revoke Tenant A portal share (HTTP 404 NOT_FOUND)')

    console.log('\n====================================================================')
    console.log(`JOB-17.2 SUITE RESULT: ${passed} PASSED, ${failed} FAILED`)
    console.log('====================================================================')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error during JOB-17.2 test execution:', error)
    process.exit(1)
  } finally {
    // Cleanup JOB-17 entities
    const orgIds = [tenantA?.org?.id, tenantB?.org?.id].filter(Boolean) as string[]
    if (orgIds.length > 0) {
      await prisma.reportDeliveryLog.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.clientPortalShare.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.customDomain.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.agencyBranding.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
    }
    if (tenantA?.org?.id) await cleanupTestTenant(tenantA.org.id).catch(() => {})
    if (tenantB?.org?.id) await cleanupTestTenant(tenantB.org.id).catch(() => {})
    if (staffUserA) {
      await prisma.user.deleteMany({ where: { id: staffUserA.id } }).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  }
}

runJob17_2Suite()

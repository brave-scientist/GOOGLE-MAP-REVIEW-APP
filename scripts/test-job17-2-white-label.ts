/**
 * scripts/test-job17-2-white-label.ts
 *
 * Dedicated verification suite for Milestone JOB-17.2:
 * White-Label Branding, Custom Domains & Client Portal (AGY-01)
 *
 * Validates:
 * A. Agency Branding
 *    1. GET branding (returns defaults or persisted)
 *    2. create/update branding (PUT updates brandName, colors, logo, identities)
 *    3. persisted branding survives reload
 *    4. unauthorized role cannot modify branding (HTTP 403)
 *    5. tenant A cannot modify tenant B branding
 *
 * B. Custom Domains
 *    6. create valid domain (HTTP 201, PENDING_VERIFICATION)
 *    7. invalid domain rejected (HTTP 400)
 *    8. duplicate domain rejected across orgs (HTTP 409)
 *    9. cross-tenant domain access rejected (HTTP 404)
 *   10. revoked domain cannot serve portal (HTTP 403 DOMAIN_REVOKED)
 *   11. unverified domain cannot serve portal (HTTP 403 DOMAIN_NOT_VERIFIED)
 *
 * C. Domain Verification
 *   12. valid DNS verification path (status -> VERIFIED, sslStatus -> ACTIVE)
 *   13. failed DNS verification path (status -> FAILED, sslStatus -> FAILED)
 *   14. verification status persisted in database
 *   15. verification timestamp persisted in database (verifiedAt, lastCheckedAt)
 *
 * D. Client Portal
 *   16. valid portal token works (HTTP 200)
 *   17. invalid token rejected (HTTP 404)
 *   18. expired token rejected (HTTP 410 PORTAL_EXPIRED)
 *   19. disabled token rejected (HTTP 404 PORTAL_DISABLED)
 *   20. passcode-protected portal requires passcode (HTTP 401 PASSCODE_REQUIRED)
 *   21. wrong passcode rejected (HTTP 403 PASSCODE_INVALID)
 *   22. correct passcode accepted (HTTP 200)
 *
 * E. Tenant Isolation
 *   23. Business A token cannot access Business B
 *   24. Organization A token cannot access Organization B
 *   25. Organization A branding cannot appear on Organization B portal
 *
 * F. Security Invariants
 *   26. client-supplied orgId cannot override server scope
 *   27. client-supplied businessId cannot override portal scope
 *   28. raw portal token is never persisted in database (only tokenHash)
 *   29. raw passcode is never persisted in database (only passcodeHash)
 *   30. audit log contains mutation event without secret material
 */

process.env.TEST_MOCK_DNS = 'true'

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getBrandingHandler, PUT as putBrandingHandler } from '../src/app/api/agency/branding/route'
import { GET as getDomainsHandler, POST as postDomainsHandler } from '../src/app/api/agency/domains/route'
import { GET as getDomainByIdHandler, DELETE as deleteDomainHandler } from '../src/app/api/agency/domains/[id]/route'
import { POST as verifyDomainHandler } from '../src/app/api/agency/domains/[id]/verify/route'
import { GET as getPortalSharesHandler, POST as postPortalShareHandler } from '../src/app/api/portal/share/route'
import { DELETE as deletePortalShareHandler } from '../src/app/api/portal/share/[id]/route'
import { GET as getPortalSummaryHandler } from '../src/app/api/portal/[token]/summary/route'
import { Role, Plan } from '@prisma/client'
import crypto from 'crypto'

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

async function runJob17_2TestSuite() {
  console.log('====================================================================')
  console.log('JOB-17.2 DEDICATED VERIFICATION SUITE: White-Label Branding, Custom Domains & Portal')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let staffUserA: any = null

  try {
    // ─────────────────────────────────────────────────────────────────
    // TENANT SETUP
    // ─────────────────────────────────────────────────────────────────
    tenantA = await seedTestTenant({
      name: 'Alpha Agency Enterprise',
      businessName: 'Alpha Client Biz',
      role: Role.OWNER,
      plan: Plan.AGENCY,
    })

    tenantB = await seedTestTenant({
      name: 'Beta Marketing Group',
      businessName: 'Beta Client Biz',
      role: Role.OWNER,
      plan: Plan.PRO,
    })

    // Staff member under Tenant A
    const staffEmail = generateTestEmail('agency_staff_user')
    const sUser = await prisma.user.create({
      data: { email: staffEmail, name: 'Staff Operator', sessionVersion: 1 },
    })
    await prisma.orgMember.create({
      data: { orgId: tenantA.org.id, userId: sUser.id, role: Role.STAFF },
    })
    staffUserA = { ...sUser, role: Role.STAFF, orgId: tenantA.org.id }

    // Seed sample reviews for Tenant A Business
    await prisma.review.createMany({
      data: [
        {
          businessId: tenantA.business.id,
          externalId: `ext_rev_a1_${Date.now()}`,
          author: 'Alice Walker',
          rating: 5,
          text: 'Superb customer service and responsive team!',
          source: 'GOOGLE',
          draftStatus: 'POSTED',
          replyText: 'Thank you Alice!',
        },
        {
          businessId: tenantA.business.id,
          externalId: `ext_rev_a2_${Date.now()}`,
          author: 'Bob Miller',
          rating: 4,
          text: 'Very satisfied with the quick turnaround.',
          source: 'FACEBOOK',
          draftStatus: 'POSTED',
          replyText: 'Glad we could help Bob!',
        },
      ],
    })

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: Agency Branding API
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Agency Branding API]')

    // 1. GET branding (returns defaults when unconfigured)
    const getBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      user: tenantA.user,
    })
    const getBrandingRes = await getBrandingHandler(getBrandingReq)
    assert(getBrandingRes.status === 200, 'Test 1: GET /api/agency/branding returns HTTP 200')
    const initialBranding = await getBrandingRes.json()
    assert(initialBranding?.branding?.primaryColor === '#1E40AF', 'Test 1: Default branding returns valid primaryColor (#1E40AF)')

    // 2. create/update branding (PUT updates brandName, colors, logo, identities)
    const putBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantA.user,
      body: {
        brandName: 'Alpha Brand Authority',
        logoUrl: 'https://cdn.example.com/alpha-logo.png',
        faviconUrl: 'https://cdn.example.com/alpha-fav.ico',
        primaryColor: '#0F172A',
        accentColor: '#38BDF8',
        supportEmail: 'support@alphabrand.com',
        portalTitle: 'Alpha Client Executive Portal',
        hideReviewReplyBadge: true,
        emailSenderName: 'Alpha Notifications',
        replyToEmail: 'noreply@alphabrand.com',
      },
    })
    const putBrandingRes = await putBrandingHandler(putBrandingReq)
    assert(putBrandingRes.status === 200, 'Test 2: PUT /api/agency/branding updates configuration (HTTP 200)')
    const updatedBranding = await putBrandingRes.json()
    assert(updatedBranding?.branding?.brandName === 'Alpha Brand Authority', 'Test 2: Persisted brandName updated correctly')
    assert(updatedBranding?.branding?.hideReviewReplyBadge === true, 'Test 2: hideReviewReplyBadge updated to true')

    // 3. persisted branding survives reload
    const reloadReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      user: tenantA.user,
    })
    const reloadRes = await getBrandingHandler(reloadReq)
    const reloaded = await reloadRes.json()
    assert(reloaded?.branding?.brandName === 'Alpha Brand Authority', 'Test 3: Persisted branding survives reload')
    assert(reloaded?.branding?.primaryColor === '#0F172A', 'Test 3: Persisted primaryColor matches updated value')

    // 4. unauthorized role cannot modify branding
    const staffPutReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: staffUserA,
      body: { brandName: 'Unauthorized Brand Hack' },
    })
    const staffPutRes = await putBrandingHandler(staffPutReq)
    assert(staffPutRes.status === 403, 'Test 4: STAFF role rejected from updating branding (HTTP 403 INSUFFICIENT_ROLE)')

    // 5. tenant A cannot modify tenant B branding
    const crossTenantBrandingReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantB.user,
      body: { brandName: 'Tenant B Custom Name' },
    })
    await putBrandingHandler(crossTenantBrandingReq)

    const tenantACheck = await prisma.agencyBranding.findUnique({
      where: { orgId: tenantA.org.id },
    })
    assert(tenantACheck?.brandName === 'Alpha Brand Authority', 'Test 5: Tenant A branding unchanged after Tenant B PUT\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: Custom Domains
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 2: Custom Domains]')

    // 6. create valid domain
    const validDomain = `reviews-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.alphaagency.com`
    const postDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantA.user,
      body: { domain: validDomain },
    })
    const postDomainRes = await postDomainsHandler(postDomainReq)
    assert(postDomainRes.status === 201, 'Test 6: POST /api/agency/domains creates valid domain (HTTP 201)')
    const createdDomainData = await postDomainRes.json()
    const domainRecordA = createdDomainData.domain
    assert(domainRecordA?.status === 'PENDING_VERIFICATION', 'Test 6: New domain status initialized to PENDING_VERIFICATION')
    assert(domainRecordA?.verificationToken?.startsWith('rr_verify_') === true, 'Test 6: Generated verificationToken format valid')

    // 7. invalid domain rejected
    const badDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantA.user,
      body: { domain: 'https://bad domain/path:8080' },
    })
    const badDomainRes = await postDomainsHandler(badDomainReq)
    assert(badDomainRes.status === 400, 'Test 7: Malformed domain rejected (HTTP 400 INVALID_DOMAIN_FORMAT)')

    // 8. duplicate domain rejected
    const dupDomainReq = await createMockRequest('http://localhost:3000/api/agency/domains', {
      method: 'POST',
      user: tenantB.user,
      body: { domain: validDomain },
    })
    const dupDomainRes = await postDomainsHandler(dupDomainReq)
    assert(dupDomainRes.status === 409, 'Test 8: Duplicate domain registration rejected across orgs (HTTP 409 DOMAIN_EXISTS)')

    // 9. cross-tenant domain access rejected
    const crossTenantGetReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${domainRecordA.id}`, {
      user: tenantB.user,
    })
    const crossTenantGetRes = await getDomainByIdHandler(crossTenantGetReq, { params: Promise.resolve({ id: domainRecordA.id }) })
    assert(crossTenantGetRes.status === 404, 'Test 9: Tenant B cannot view Tenant A custom domain (HTTP 404)')

    const crossTenantDelReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${domainRecordA.id}`, {
      method: 'DELETE',
      user: tenantB.user,
    })
    const crossTenantDelRes = await deleteDomainHandler(crossTenantDelReq, { params: Promise.resolve({ id: domainRecordA.id }) })
    assert(crossTenantDelRes.status === 404, 'Test 9: Tenant B cannot delete Tenant A custom domain (HTTP 404)')

    // 10. revoked domain cannot serve portal
    const revokedDomainName = `revoked-${Date.now()}.alphaagency.com`
    const revokedDomain = await prisma.customDomain.create({
      data: {
        orgId: tenantA.org.id,
        domain: revokedDomainName,
        status: 'REVOKED',
        verificationToken: `rr_verify_rev_${Date.now()}`,
      },
    })

    // Create a temporary portal share for Tenant A
    const tempRawToken = `portal_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const tempShare = await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(tempRawToken).digest('hex'),
        isEnabled: true,
      },
    })

    const revokedPortalReq = await createMockRequest(`http://localhost:3000/api/portal/${tempRawToken}/summary?domain=${revokedDomainName}`)
    const revokedPortalRes = await getPortalSummaryHandler(revokedPortalReq, { params: Promise.resolve({ token: tempRawToken }) })
    assert(revokedPortalRes.status === 403, 'Test 10: Revoked custom domain cannot serve portal (HTTP 403 DOMAIN_REVOKED)')

    // 11. unverified domain cannot serve portal
    const unverifiedPortalReq = await createMockRequest(`http://localhost:3000/api/portal/${tempRawToken}/summary?domain=${validDomain}`)
    const unverifiedPortalRes = await getPortalSummaryHandler(unverifiedPortalReq, { params: Promise.resolve({ token: tempRawToken }) })
    assert(unverifiedPortalRes.status === 403, 'Test 11: Unverified domain cannot serve portal (HTTP 403 DOMAIN_NOT_VERIFIED)\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: Domain Verification
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 3: Domain Verification]')

    // 12. valid DNS verification path
    const verifyValidReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${domainRecordA.id}/verify`, {
      method: 'POST',
      user: tenantA.user,
    })
    const verifyValidRes = await verifyDomainHandler(verifyValidReq, { params: Promise.resolve({ id: domainRecordA.id }) })
    assert(verifyValidRes.status === 200, 'Test 12: POST verify succeeds for valid domain (HTTP 200)')
    const verifyValidData = await verifyValidRes.json()
    assert(verifyValidData?.domain?.status === 'VERIFIED', 'Test 12: Domain status updated to VERIFIED')
    assert(verifyValidData?.domain?.sslStatus === 'ACTIVE', 'Test 12: SslStatus updated to ACTIVE')

    // 13. failed DNS verification path
    const failDomainName = `invalid-cname-${Date.now()}.alphaagency.com`
    const failDomainRecord = await prisma.customDomain.create({
      data: {
        orgId: tenantA.org.id,
        domain: failDomainName,
        status: 'PENDING_VERIFICATION',
        verificationToken: `rr_verify_fail_${Date.now()}`,
      },
    })

    const verifyFailReq = await createMockRequest(`http://localhost:3000/api/agency/domains/${failDomainRecord.id}/verify`, {
      method: 'POST',
      user: tenantA.user,
    })
    const verifyFailRes = await verifyDomainHandler(verifyFailReq, { params: Promise.resolve({ id: failDomainRecord.id }) })
    assert(verifyFailRes.status === 200, 'Test 13: POST verify returns result for failing CNAME')
    const verifyFailData = await verifyFailRes.json()
    assert(verifyFailData?.verified === false, 'Test 13: Failing CNAME returns verified === false')
    assert(verifyFailData?.domain?.status === 'FAILED', 'Test 13: Domain status updated to FAILED')

    // 14. verification status persisted in database
    const dbDomainCheck = await prisma.customDomain.findUnique({
      where: { id: domainRecordA.id },
    })
    assert(dbDomainCheck?.status === 'VERIFIED', 'Test 14: Verification status VERIFIED persisted in database')

    // 15. verification timestamp persisted in database
    assert(dbDomainCheck?.verifiedAt !== null, 'Test 15: verifiedAt timestamp persisted')
    assert(dbDomainCheck?.lastCheckedAt !== null, 'Test 15: lastCheckedAt timestamp persisted\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: Client Portal
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 4: Client Portal]')

    // 16. valid portal token works
    const createShareReq = await createMockRequest('http://localhost:3000/api/portal/share', {
      method: 'POST',
      user: tenantA.user,
      body: {
        businessId: tenantA.business.id,
        expiresDays: 14,
      },
    })
    const createShareRes = await postPortalShareHandler(createShareReq)
    assert(createShareRes.status === 201, 'Test 16: POST /api/portal/share creates portal link (HTTP 201)')
    const shareCreation = await createShareRes.json()
    const rawPortalToken = shareCreation.rawToken

    const portalSummaryReq = await createMockRequest(`http://localhost:3000/api/portal/${rawPortalToken}/summary`)
    const portalSummaryRes = await getPortalSummaryHandler(portalSummaryReq, { params: Promise.resolve({ token: rawPortalToken }) })
    assert(portalSummaryRes.status === 200, 'Test 16: Valid portal token retrieves public summary (HTTP 200)')
    const portalData = await portalSummaryRes.json()
    assert(portalData?.business?.name === 'Alpha Client Biz', 'Test 16: Portal data includes location business')

    // 17. invalid token rejected
    const invalidTokenReq = await createMockRequest('http://localhost:3000/api/portal/bogus_token_12345/summary')
    const invalidTokenRes = await getPortalSummaryHandler(invalidTokenReq, { params: Promise.resolve({ token: 'bogus_token_12345' }) })
    assert(invalidTokenRes.status === 404, 'Test 17: Invalid portal token rejected (HTTP 404 PORTAL_DISABLED)')

    // 18. expired token rejected
    const expiredRawToken = `portal_exp_${Date.now()}`
    await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(expiredRawToken).digest('hex'),
        expiresAt: new Date(Date.now() - 3600000), // 1 hour in the past
      },
    })
    const expiredTokenReq = await createMockRequest(`http://localhost:3000/api/portal/${expiredRawToken}/summary`)
    const expiredTokenRes = await getPortalSummaryHandler(expiredTokenReq, { params: Promise.resolve({ token: expiredRawToken }) })
    assert(expiredTokenRes.status === 410, 'Test 18: Expired portal token rejected (HTTP 410 PORTAL_EXPIRED)')

    // 19. disabled token rejected
    const disabledRawToken = `portal_dis_${Date.now()}`
    await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(disabledRawToken).digest('hex'),
        isEnabled: false,
      },
    })
    const disabledTokenReq = await createMockRequest(`http://localhost:3000/api/portal/${disabledRawToken}/summary`)
    const disabledTokenRes = await getPortalSummaryHandler(disabledTokenReq, { params: Promise.resolve({ token: disabledRawToken }) })
    assert(disabledTokenRes.status === 404, 'Test 19: Disabled portal token rejected (HTTP 404 PORTAL_DISABLED)')

    // 20. passcode-protected portal requires passcode
    const passRawToken = `portal_pass_${Date.now()}`
    await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: crypto.createHash('sha256').update(passRawToken).digest('hex'),
        passcodeHash: crypto.createHash('sha256').update('AlphaPass2026!').digest('hex'),
        isEnabled: true,
      },
    })

    const noPassReq = await createMockRequest(`http://localhost:3000/api/portal/${passRawToken}/summary`)
    const noPassRes = await getPortalSummaryHandler(noPassReq, { params: Promise.resolve({ token: passRawToken }) })
    assert(noPassRes.status === 401, 'Test 20: Passcode-protected portal requires passcode (HTTP 401 PASSCODE_REQUIRED)')

    // 21. wrong passcode rejected
    const wrongPassReq = await createMockRequest(`http://localhost:3000/api/portal/${passRawToken}/summary?passcode=IncorrectPassword`)
    const wrongPassRes = await getPortalSummaryHandler(wrongPassReq, { params: Promise.resolve({ token: passRawToken }) })
    assert(wrongPassRes.status === 403, 'Test 21: Incorrect passcode rejected (HTTP 403 PASSCODE_INVALID)')

    // 22. correct passcode accepted
    const correctPassReq = await createMockRequest(`http://localhost:3000/api/portal/${passRawToken}/summary?passcode=AlphaPass2026!`)
    const correctPassRes = await getPortalSummaryHandler(correctPassReq, { params: Promise.resolve({ token: passRawToken }) })
    assert(correctPassRes.status === 200, 'Test 22: Correct passcode accepted (HTTP 200)\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: Tenant Isolation
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 5: Tenant Isolation]')

    // Seed second business for Tenant A
    const secondBizA = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Alpha Second Location',
        address: '123 Second St',
      },
    })

    // 23. Business A token cannot access Business B (within same org)
    const tokenSummaryA = await getPortalSummaryHandler(
      await createMockRequest(`http://localhost:3000/api/portal/${rawPortalToken}/summary`),
      { params: Promise.resolve({ token: rawPortalToken }) }
    )
    const dataA = await tokenSummaryA.json()
    assert(dataA.business.id === tenantA.business.id, 'Test 23: Portal token maps strictly to Business Alpha')
    assert(dataA.business.id !== secondBizA.id, 'Test 23: Business A token cannot access second location in same org')

    // 24. Organization A token cannot access Organization B
    assert(dataA.business.id !== tenantB.business.id, 'Test 24: Organization A token cannot access Organization B business')
    assert(dataA.business.orgId === tenantA.org.id, 'Test 24: Business belongs strictly to Organization A')

    // 25. Organization A branding cannot appear on Organization B portal
    const tenantBRawToken = `portal_b_${Date.now()}`
    await prisma.clientPortalShare.create({
      data: {
        businessId: tenantB.business.id,
        orgId: tenantB.org.id,
        tokenHash: crypto.createHash('sha256').update(tenantBRawToken).digest('hex'),
        isEnabled: true,
      },
    })

    const portalBReq = await createMockRequest(`http://localhost:3000/api/portal/${tenantBRawToken}/summary`)
    const portalBRes = await getPortalSummaryHandler(portalBReq, { params: Promise.resolve({ token: tenantBRawToken }) })
    const dataB = await portalBRes.json()
    assert(dataB.branding.brandName !== 'Alpha Brand Authority', 'Test 25: Organization A custom branding never leaks into Org B portal\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 6: Security Invariants
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 6: Security Invariants]')

    // 26. client-supplied orgId cannot override server scope
    const spoofOrgReq = await createMockRequest('http://localhost:3000/api/agency/branding', {
      method: 'PUT',
      user: tenantA.user,
      body: {
        orgId: tenantB.org.id, // Attacker tries to inject Tenant B orgId
        brandName: 'Malicious Injected Name',
      },
    })
    await putBrandingHandler(spoofOrgReq)

    const tenantBBrandingAfterSpoof = await prisma.agencyBranding.findUnique({
      where: { orgId: tenantB.org.id },
    })
    assert(tenantBBrandingAfterSpoof?.brandName !== 'Malicious Injected Name', 'Test 26: Client-supplied orgId cannot override server-side tenant scope')

    // 27. client-supplied businessId cannot override portal scope
    const spoofBizPortalReq = await createMockRequest(`http://localhost:3000/api/portal/${rawPortalToken}/summary?businessId=${tenantB.business.id}`)
    const spoofBizPortalRes = await getPortalSummaryHandler(spoofBizPortalReq, { params: Promise.resolve({ token: rawPortalToken }) })
    const spoofData = await spoofBizPortalRes.json()
    assert(spoofData.business.id === tenantA.business.id, 'Test 27: Client-supplied businessId parameter ignored by public portal summary')

    // 28. raw portal token is never persisted in database (only tokenHash)
    const rawTokenCheck = await prisma.clientPortalShare.findFirst({
      where: { id: shareCreation.share.id },
    })
    assert(rawTokenCheck !== null, 'Test 28: Share record exists')
    assert(rawTokenCheck?.tokenHash !== rawPortalToken, 'Test 28: DB tokenHash is not raw token')
    const hashMatches = crypto.createHash('sha256').update(rawPortalToken).digest('hex') === rawTokenCheck?.tokenHash
    assert(hashMatches, 'Test 28: DB stores strictly SHA-256 hash of token')

    // 29. raw passcode is never persisted in database (only passcodeHash)
    const passRecordCheck = await prisma.clientPortalShare.findFirst({
      where: { tokenHash: crypto.createHash('sha256').update(passRawToken).digest('hex') },
    })
    assert(passRecordCheck?.passcodeHash !== 'AlphaPass2026!', 'Test 29: DB does not contain raw passcode')
    assert(
      passRecordCheck?.passcodeHash === crypto.createHash('sha256').update('AlphaPass2026!').digest('hex'),
      'Test 29: DB stores strictly SHA-256 hash of passcode'
    )

    // 30. audit log contains mutation event without secret material
    const auditEvents = await prisma.auditLog.findMany({
      where: {
        actorId: tenantA.user.id,
        action: { in: ['branding.updated', 'custom_domain.created', 'portal_share.created'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    assert(auditEvents.length >= 3, 'Test 30: Audit log captured branding, custom domain, and portal mutations')

    const hasSecretLeak = auditEvents.some((event) => {
      const meta = event.metadata || ''
      return meta.includes(rawPortalToken) || meta.includes('AlphaPass2026!') || meta.includes('password')
    })
    assert(!hasSecretLeak, 'Test 30: Audit log metadata contains zero raw tokens, passcodes, or secrets\n')

    console.log('====================================================================')
    console.log(`JOB-17.2 SUITE RESULT: ${passed} PASSED, ${failed} FAILED`)
    console.log('====================================================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error during JOB-17.2 test execution:', error)
    process.exit(1)
  } finally {
    // Teardown test entities
    const orgIds = [tenantA?.org?.id, tenantB?.org?.id].filter(Boolean) as string[]
    if (orgIds.length > 0) {
      await prisma.clientPortalShare.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.customDomain.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.agencyBranding.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.business.deleteMany({ where: { name: 'Alpha Second Location' } }).catch(() => {})
      await prisma.auditLog.deleteMany({ where: { targetId: { in: orgIds } } }).catch(() => {})
    }
    if (tenantA?.org?.id) await cleanupTestTenant(tenantA.org.id).catch(() => {})
    if (tenantB?.org?.id) await cleanupTestTenant(tenantB.org.id).catch(() => {})
    if (staffUserA) {
      await prisma.user.deleteMany({ where: { id: staffUserA.id } }).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  }
}

runJob17_2TestSuite()

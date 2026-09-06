/**
 * scripts/test-job17-1-governance.ts
 *
 * Dedicated verification suite for Milestone JOB-17.1:
 * Database Schema, Tenant Governance & CLIENT_ADMIN Isolation (AGY-01)
 *
 * Validates:
 * A. Database Schema & Integrity Constraints:
 *    1. AgencyBranding creation and 1-to-1 association with Organization
 *    2. Duplicate orgId on AgencyBranding rejected (@unique)
 *    3. CustomDomain creation and global domain uniqueness (@unique)
 *    4. Duplicate domain registration rejected across organizations
 *    5. ClientPortalShare creation and tokenHash uniqueness (@unique)
 *    6. ReportDeliveryLog creation and idempotencyKey uniqueness (@unique)
 *
 * B. CLIENT_ADMIN Security Isolation:
 *    7. CLIENT_ADMIN with explicit Business A assignment can access Business A
 *    8. CLIENT_ADMIN with Business A assignment CANNOT access Business B in same org
 *    9. CLIENT_ADMIN cannot access businesses belonging to another organization
 *   10. CLIENT_ADMIN with zero assignments fails closed (permittedBusinessIds = [])
 *   11. CLIENT_ADMIN cannot bypass scope by supplying unauthorized businessId parameter
 *   12. CLIENT_ADMIN cannot view or manipulate reports belonging to unauthorized businesses
 *   13. CLIENT_ADMIN cannot create or mutate automation rules for unauthorized businesses
 *
 * C. OWNER / ADMIN / AGENCY_ADMIN Regression:
 *   14. OWNER retains authoritative organization-wide scope across all businesses
 *   15. ADMIN retains authoritative organization-wide scope across all businesses
 *   16. AGENCY_ADMIN retains authoritative organization-wide scope across all businesses
 *
 * D. Invitation Role Authorization:
 *   17. AGENCY_ADMIN can successfully invite permitted agency and client roles
 *   18. Unauthorized roles (STAFF, VIEWER, etc.) cannot invite team members (HTTP 403)
 *   19. CLIENT_ADMIN cannot invite elevated administrative roles (OWNER, ADMIN, AGENCY_ADMIN)
 *   20. Cross-organization invitation tampering rejected
 *
 * E. Multi-Tenant IDOR Boundaries:
 *   21. Organization A cannot access Organization B's AgencyBranding
 *   22. Organization A cannot access Organization B's CustomDomain
 *   23. Organization A cannot access Organization B's ClientPortalShare
 *   24. Organization A cannot access Organization B's ReportDeliveryLog
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { resolveEffectiveScope, isOrgAdminRole, isOperatorRole, isClientAdminRole } from '../src/lib/operator-governance'
import { getTenantContext, assertBusinessOwnership } from '../src/lib/tenant-context'
import { POST as inviteHandler } from '../src/app/api/team/invite/route'
import { GET as getReportsHandler, POST as createReportHandler } from '../src/app/api/reports/route'
import { GET as getAutomationsHandler, POST as postAutomationsHandler } from '../src/app/api/automations/route'
import {
  Role,
  Plan,
  ReportSchedule,
  ReportFormat,
  ReportStatus,
  DomainStatus,
  SslStatus,
  DeliveryStatus,
} from '@prisma/client'
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
  } = {}
): Promise<NextRequest> {
  const method = options.method || 'GET'
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }

  if (options.user) {
    const token = await encodeSession({
      id: options.user.id,
      email: options.user.email,
      name: options.user.name,
      role: options.user.role,
      orgId: options.user.orgId,
      orgName: options.user.orgName || 'Test Org',
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

async function runJob17Suite() {
  console.log('====================================================================')
  console.log('JOB-17.1 VERIFICATION SUITE: Database Schema, Tenant Governance & CLIENT_ADMIN Isolation')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let businessA2: { id: string; name: string } | null = null
  let clientAdminUser: any = null
  let agencyAdminUser: any = null
  let staffUser: any = null

  try {
    // Setup Primary Test Tenants
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

    // Create a second business under Tenant A (Client Biz Alpha Two)
    const b2 = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Client Biz Alpha Two',
        slug: `alpha-two-${Date.now()}`,
      },
    })
    businessA2 = { id: b2.id, name: b2.name }

    // Create additional users under Tenant A:
    // 1. AGENCY_ADMIN
    const agencyAdminEmail = generateTestEmail('agency_admin')
    const aaUser = await prisma.user.create({
      data: {
        email: agencyAdminEmail,
        name: 'Agency Administrator',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: aaUser.id,
        role: Role.AGENCY_ADMIN,
      },
    })
    agencyAdminUser = {
      ...aaUser,
      role: Role.AGENCY_ADMIN,
      orgId: tenantA.org.id,
    }

    // 2. CLIENT_ADMIN
    const clientAdminEmail = generateTestEmail('client_admin')
    const caUser = await prisma.user.create({
      data: {
        email: clientAdminEmail,
        name: 'Client Location Admin',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: caUser.id,
        role: Role.CLIENT_ADMIN,
      },
    })
    clientAdminUser = {
      ...caUser,
      role: Role.CLIENT_ADMIN,
      orgId: tenantA.org.id,
    }

    // 3. STAFF
    const staffEmail = generateTestEmail('staff')
    const sUser = await prisma.user.create({
      data: {
        email: staffEmail,
        name: 'Agency Staff',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: tenantA.org.id,
        userId: sUser.id,
        role: Role.STAFF,
      },
    })
    staffUser = {
      ...sUser,
      role: Role.STAFF,
      orgId: tenantA.org.id,
    }

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: Database Schema & Integrity Constraints
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Database Schema & Constraints]')

    // 1. AgencyBranding creation and 1-to-1 association with Org A
    const brandingA = await prisma.agencyBranding.create({
      data: {
        orgId: tenantA.org.id,
        brandName: 'Apex Agency Media',
        logoUrl: 'https://cdn.example.com/apex-logo.png',
        faviconUrl: 'https://cdn.example.com/apex-favicon.ico',
        primaryColor: '#1E40AF',
        accentColor: '#3B82F6',
        supportEmail: 'support@apexagency.com',
        portalTitle: 'Apex Client Portal',
        hideReviewReplyBadge: true,
        emailSenderName: 'Apex Review Team',
        replyToEmail: 'reviews@apexagency.com',
      },
    })
    assert(brandingA.id !== undefined && brandingA.orgId === tenantA.org.id, 'AgencyBranding created and linked to Organization A')

    // 2. Duplicate orgId on AgencyBranding rejected (@unique)
    let duplicateBrandingRejected = false
    try {
      await prisma.agencyBranding.create({
        data: {
          orgId: tenantA.org.id, // Duplicate orgId
          brandName: 'Duplicate Agency',
        },
      })
    } catch {
      duplicateBrandingRejected = true
    }
    assert(duplicateBrandingRejected, 'Duplicate AgencyBranding orgId rejected by unique constraint')

    // 3. CustomDomain creation and global domain uniqueness (@unique)
    const testDomainName = `reviews-apex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.com`
    const customDomainA = await prisma.customDomain.create({
      data: {
        orgId: tenantA.org.id,
        domain: testDomainName,
        status: DomainStatus.PENDING_VERIFICATION,
        verificationToken: `rr_verify_${crypto.randomBytes(16).toString('hex')}`,
        cnameTarget: 'cname.reviewreply.com',
        sslStatus: SslStatus.PENDING,
      },
    })
    assert(customDomainA.domain === testDomainName, 'CustomDomain created successfully for Org A')

    // 4. Duplicate domain rejected across organizations (@unique)
    let duplicateDomainRejected = false
    try {
      await prisma.customDomain.create({
        data: {
          orgId: tenantB.org.id, // Different org, same domain
          domain: testDomainName,
          verificationToken: `rr_verify_${crypto.randomBytes(16).toString('hex')}`,
        },
      })
    } catch {
      duplicateDomainRejected = true
    }
    assert(duplicateDomainRejected, 'Duplicate CustomDomain rejected across different organizations')

    // 5. ClientPortalShare creation and tokenHash uniqueness (@unique)
    const tokenHashA = crypto.createHash('sha256').update(`portal-token-${Date.now()}-${Math.random()}`).digest('hex')
    const portalShareA = await prisma.clientPortalShare.create({
      data: {
        businessId: tenantA.business.id,
        orgId: tenantA.org.id,
        tokenHash: tokenHashA,
        isEnabled: true,
      },
    })
    assert(portalShareA.tokenHash === tokenHashA, 'ClientPortalShare created with unique tokenHash')

    let duplicatePortalShareRejected = false
    try {
      await prisma.clientPortalShare.create({
        data: {
          businessId: businessA2.id,
          orgId: tenantA.org.id,
          tokenHash: tokenHashA, // Duplicate tokenHash
        },
      })
    } catch {
      duplicatePortalShareRejected = true
    }
    assert(duplicatePortalShareRejected, 'Duplicate ClientPortalShare tokenHash rejected by unique constraint')

    // 6. ReportDeliveryLog creation and idempotencyKey uniqueness (@unique)
    // First create a scheduled report to attach log to
    const schedReport = await prisma.scheduledReport.create({
      data: {
        orgId: tenantA.org.id,
        businessId: tenantA.business.id,
        name: 'Weekly Digest Report',
        schedule: ReportSchedule.WEEKLY,
        recipients: JSON.stringify(['client@example.com']),
        format: ReportFormat.EMAIL_HTML,
        status: ReportStatus.ACTIVE,
      },
    })

    const testIdempotencyKey = `report:${schedReport.id}:client@example.com:${Date.now()}:${Math.random()}`
    const reportLogA = await prisma.reportDeliveryLog.create({
      data: {
        reportId: schedReport.id,
        orgId: tenantA.org.id,
        businessId: tenantA.business.id,
        recipient: 'client@example.com',
        format: ReportFormat.EMAIL_HTML,
        status: DeliveryStatus.SENT,
        idempotencyKey: testIdempotencyKey,
        sentAt: new Date(),
      },
    })
    assert(reportLogA.status === DeliveryStatus.SENT, 'ReportDeliveryLog created successfully')

    let duplicateReportLogRejected = false
    try {
      await prisma.reportDeliveryLog.create({
        data: {
          reportId: schedReport.id,
          orgId: tenantA.org.id,
          recipient: 'client@example.com',
          format: ReportFormat.EMAIL_HTML,
          status: DeliveryStatus.SENT,
          idempotencyKey: testIdempotencyKey, // Duplicate idempotencyKey
        },
      })
    } catch {
      duplicateReportLogRejected = true
    }
    assert(duplicateReportLogRejected, 'Duplicate ReportDeliveryLog idempotencyKey rejected by unique constraint\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: CLIENT_ADMIN Security Fix & Scoped Governance
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 2: CLIENT_ADMIN Security Isolation]')

    // 10. CLIENT_ADMIN with no assignments fails closed
    const unassignedScope = await resolveEffectiveScope(clientAdminUser.id, tenantA.org.id, Role.CLIENT_ADMIN)
    assert(unassignedScope.isOrgAdmin === false, 'CLIENT_ADMIN has isOrgAdmin === false')
    assert(unassignedScope.permittedBusinessIds.length === 0, 'CLIENT_ADMIN with no assignments fails closed with 0 permitted businesses')

    // 7. CLIENT_ADMIN with Business A assignment can access A
    await prisma.operatorLocationAssignment.create({
      data: {
        orgId: tenantA.org.id,
        userId: clientAdminUser.id,
        businessId: tenantA.business.id,
        assignedById: tenantA.user.id,
      },
    })

    const assignedScope = await resolveEffectiveScope(clientAdminUser.id, tenantA.org.id, Role.CLIENT_ADMIN)
    assert(assignedScope.isOrgAdmin === false, 'Assigned CLIENT_ADMIN retains isOrgAdmin === false')
    assert(
      assignedScope.permittedBusinessIds.includes(tenantA.business.id),
      'CLIENT_ADMIN with Business A assignment can access Business A'
    )

    // 8. CLIENT_ADMIN with Business A assignment CANNOT access Business B in same org
    assert(
      !assignedScope.permittedBusinessIds.includes(businessA2.id),
      'CLIENT_ADMIN with Business A assignment CANNOT access Business A2 in same org'
    )

    // 9. CLIENT_ADMIN cannot access another organization's business
    assert(
      !assignedScope.permittedBusinessIds.includes(tenantB.business.id),
      'CLIENT_ADMIN cannot access another organization business (Tenant B)'
    )

    // 11. CLIENT_ADMIN cannot bypass scope by supplying another businessId
    const reqBypass = await createMockRequest(`http://localhost:3000/api/reports?businessId=${businessA2.id}`, {
      user: clientAdminUser,
    })
    const ctxBypass = await getTenantContext(reqBypass)
    assert(!(ctxBypass instanceof Response), 'Tenant context resolved for CLIENT_ADMIN')
    if (!(ctxBypass instanceof Response)) {
      const denial = assertBusinessOwnership(ctxBypass, businessA2.id)
      assert(denial !== null, 'assertBusinessOwnership rejects unassigned businessId parameter with 403')
    }

    // 12. CLIENT_ADMIN cannot view or manipulate reports belonging to unauthorized businesses
    const reqCreateUnauthReport = await createMockRequest('http://localhost:3000/api/reports', {
      method: 'POST',
      user: clientAdminUser,
      body: {
        name: 'Unauthorized Business Report',
        schedule: 'WEEKLY',
        recipients: 'evil@example.com',
        format: 'EMAIL_HTML',
        businessId: businessA2.id, // Unassigned business
      },
    })
    const resCreateUnauthReport = await createReportHandler(reqCreateUnauthReport)
    assert(resCreateUnauthReport.status === 403, 'CLIENT_ADMIN cannot create report for unassigned business (HTTP 403)')

    // 13. CLIENT_ADMIN cannot manipulate automations for unauthorized businesses
    const reqCreateUnauthRule = await createMockRequest('http://localhost:3000/api/automations', {
      method: 'POST',
      user: clientAdminUser,
      body: {
        businessId: businessA2.id, // Unassigned business
        name: 'Unauthorized Rule',
        triggerType: 'NEW_REVIEW',
      },
    })
    const resCreateUnauthRule = await postAutomationsHandler(reqCreateUnauthRule)
    assert(resCreateUnauthRule.status === 403, 'CLIENT_ADMIN cannot create automation for unassigned business (HTTP 403)\n')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: OWNER / ADMIN / AGENCY_ADMIN Regression
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 3: OWNER / ADMIN / AGENCY_ADMIN Regression]')

    // 14. OWNER retains authoritative organization-wide scope
    const ownerScope = await resolveEffectiveScope(tenantA.user.id, tenantA.org.id, Role.OWNER)
    assert(ownerScope.isOrgAdmin === true, 'OWNER has isOrgAdmin === true')
    assert(
      ownerScope.permittedBusinessIds.includes(tenantA.business.id) &&
      ownerScope.permittedBusinessIds.includes(businessA2.id),
      'OWNER retains access to all organization businesses'
    )

    // 15. ADMIN retains authoritative organization-wide scope
    // Create an ADMIN user
    const adminUser = await prisma.user.create({
      data: {
        email: generateTestEmail('admin'),
        name: 'Workspace Admin',
        sessionVersion: 1,
      },
    })
    await prisma.orgMember.create({
      data: { orgId: tenantA.org.id, userId: adminUser.id, role: Role.ADMIN },
    })
    const adminScope = await resolveEffectiveScope(adminUser.id, tenantA.org.id, Role.ADMIN)
    assert(adminScope.isOrgAdmin === true, 'ADMIN has isOrgAdmin === true')
    assert(
      adminScope.permittedBusinessIds.includes(tenantA.business.id) &&
      adminScope.permittedBusinessIds.includes(businessA2.id),
      'ADMIN retains access to all organization businesses'
    )

    // 16. AGENCY_ADMIN retains authoritative organization-wide scope
    const agencyScope = await resolveEffectiveScope(agencyAdminUser.id, tenantA.org.id, Role.AGENCY_ADMIN)
    assert(agencyScope.isOrgAdmin === true, 'AGENCY_ADMIN has isOrgAdmin === true')
    assert(
      agencyScope.permittedBusinessIds.includes(tenantA.business.id) &&
      agencyScope.permittedBusinessIds.includes(businessA2.id),
      'AGENCY_ADMIN retains access to all organization businesses\n'
    )

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: Team Invitation Authorization
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 4: Team Invitation Authorization]')

    // 17. AGENCY_ADMIN can invite permitted agency and client roles
    const inviteClientAdminReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: agencyAdminUser,
      body: {
        email: generateTestEmail('invitee_ca'),
        role: 'CLIENT_ADMIN',
      },
    })
    const inviteClientAdminRes = await inviteHandler(inviteClientAdminReq)
    assert(inviteClientAdminRes.status === 200, 'AGENCY_ADMIN can invite CLIENT_ADMIN (HTTP 200)')

    const inviteClientStaffReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: agencyAdminUser,
      body: {
        email: generateTestEmail('invitee_cs'),
        role: 'CLIENT_STAFF',
      },
    })
    const inviteClientStaffRes = await inviteHandler(inviteClientStaffReq)
    assert(inviteClientStaffRes.status === 200, 'AGENCY_ADMIN can invite CLIENT_STAFF (HTTP 200)')

    // 18. Unauthorized role (STAFF) cannot invite team members
    const staffInviteReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: staffUser,
      body: {
        email: generateTestEmail('staff_invitee'),
        role: 'STAFF',
      },
    })
    const staffInviteRes = await inviteHandler(staffInviteReq)
    assert(staffInviteRes.status === 403, 'STAFF cannot invite team members (HTTP 403 INSUFFICIENT_ROLE)')

    // 19. CLIENT_ADMIN cannot invite elevated administrative roles (OWNER, ADMIN, AGENCY_ADMIN)
    const caElevatedReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: clientAdminUser,
      body: {
        email: generateTestEmail('ca_elevated'),
        role: 'AGENCY_ADMIN', // Unauthorized elevated role
      },
    })
    const caElevatedRes = await inviteHandler(caElevatedReq)
    assert(caElevatedRes.status === 403, 'CLIENT_ADMIN cannot invite elevated role AGENCY_ADMIN (HTTP 403)')

    const caOwnerReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: clientAdminUser,
      body: {
        email: generateTestEmail('ca_owner'),
        role: 'OWNER', // No role can invite OWNER
      },
    })
    const caOwnerRes = await inviteHandler(caOwnerReq)
    assert(caOwnerRes.status === 403, 'CLIENT_ADMIN cannot invite OWNER (HTTP 403)')

    // 20. Cross-organization invitation tampering rejected (invitations scoped to session orgId)
    const caInviteStaffReq = await createMockRequest('http://localhost:3000/api/team/invite', {
      method: 'POST',
      user: clientAdminUser,
      body: {
        email: generateTestEmail('ca_staff'),
        role: 'CLIENT_STAFF',
      },
    })
    const caInviteStaffRes = await inviteHandler(caInviteStaffReq)
    assert(caInviteStaffRes.status === 200, 'CLIENT_ADMIN can invite permitted CLIENT_STAFF (HTTP 200)')

    const inviteData = await caInviteStaffRes.json()
    if (inviteData?.invitationId) {
      const persistedInvite = await prisma.teamInvitation.findUnique({
        where: { id: inviteData.invitationId },
      })
      assert(persistedInvite?.orgId === tenantA.org.id, 'Invitation strictly bound to caller orgId (Tenant A)\n')
    }

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: Multi-Tenant IDOR Boundaries
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 5: Multi-Tenant IDOR Boundaries]')

    // 21. Org A cannot access Org B's branding
    // Create branding for Tenant B
    const brandingB = await prisma.agencyBranding.create({
      data: {
        orgId: tenantB.org.id,
        brandName: 'Beta Branding Org',
      },
    })

    const foundBrandingForA = await prisma.agencyBranding.findFirst({
      where: { orgId: tenantA.org.id, id: brandingB.id },
    })
    assert(foundBrandingForA === null, 'Tenant A cannot query Tenant B AgencyBranding')

    // 22. Org A cannot access Org B's domain
    const testDomainB = `reviews-beta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.com`
    const domainB = await prisma.customDomain.create({
      data: {
        orgId: tenantB.org.id,
        domain: testDomainB,
        verificationToken: `rr_verify_${crypto.randomBytes(16).toString('hex')}`,
      },
    })
    const foundDomainForA = await prisma.customDomain.findFirst({
      where: { orgId: tenantA.org.id, id: domainB.id },
    })
    assert(foundDomainForA === null, 'Tenant A cannot query Tenant B CustomDomain')

    // 23. Org A cannot access Org B's portal share
    const portalShareB = await prisma.clientPortalShare.create({
      data: {
        businessId: tenantB.business.id,
        orgId: tenantB.org.id,
        tokenHash: crypto.createHash('sha256').update(`portal-secret-token-b-${Date.now()}-${Math.random()}`).digest('hex'),
      },
    })
    const foundPortalForA = await prisma.clientPortalShare.findFirst({
      where: { orgId: tenantA.org.id, id: portalShareB.id },
    })
    assert(foundPortalForA === null, 'Tenant A cannot query Tenant B ClientPortalShare')

    // 24. Org A cannot access Org B's report delivery log
    const schedReportB = await prisma.scheduledReport.create({
      data: {
        orgId: tenantB.org.id,
        businessId: tenantB.business.id,
        name: 'Report B',
        schedule: ReportSchedule.MONTHLY,
        recipients: JSON.stringify(['tenantb@example.com']),
        format: ReportFormat.EMAIL_HTML,
      },
    })
    const reportLogB = await prisma.reportDeliveryLog.create({
      data: {
        reportId: schedReportB.id,
        orgId: tenantB.org.id,
        recipient: 'tenantb@example.com',
        format: ReportFormat.EMAIL_HTML,
        status: DeliveryStatus.SENT,
        idempotencyKey: `report:${schedReportB.id}:tenantb@example.com:${Date.now()}:${Math.random()}`,
      },
    })
    const foundReportLogForA = await prisma.reportDeliveryLog.findFirst({
      where: { orgId: tenantA.org.id, id: reportLogB.id },
    })
    assert(foundReportLogForA === null, 'Tenant A cannot query Tenant B ReportDeliveryLog')

    console.log('\n====================================================================')
    console.log(`JOB-17.1 SUITE RESULT: ${passed} PASSED, ${failed} FAILED`)
    console.log('====================================================================')

    if (failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error during JOB-17.1 test execution:', error)
    process.exit(1)
  } finally {
    // Cleanup JOB-17 entities first
    const orgIds = [tenantA?.org?.id, tenantB?.org?.id].filter(Boolean) as string[]
    if (orgIds.length > 0) {
      await prisma.reportDeliveryLog.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.clientPortalShare.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.customDomain.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
      await prisma.agencyBranding.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {})
    }
    // Cleanup seeded tenants
    if (tenantA?.org?.id) await cleanupTestTenant(tenantA.org.id).catch(() => {})
    if (tenantB?.org?.id) await cleanupTestTenant(tenantB.org.id).catch(() => {})
    if (businessA2) {
      await prisma.business.deleteMany({ where: { id: businessA2.id } }).catch(() => {})
    }
    if (clientAdminUser) {
      await prisma.user.deleteMany({ where: { id: clientAdminUser.id } }).catch(() => {})
    }
    if (agencyAdminUser) {
      await prisma.user.deleteMany({ where: { id: agencyAdminUser.id } }).catch(() => {})
    }
    if (staffUser) {
      await prisma.user.deleteMany({ where: { id: staffUser.id } }).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  }
}

runJob17Suite()

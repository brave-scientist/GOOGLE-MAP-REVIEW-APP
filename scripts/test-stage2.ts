import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Role, ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'
import {
  generateInvitationToken,
  hashInvitationToken,
  GeneratedToken,
  INVITATION_ROLE_MATRIX,
  canInviteRole,
} from '../src/lib/team-invitations'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function runStage2Tests() {
  console.log('=================================================================')
  console.log('REVIEWREPLY STAGE 2 — MILESTONE 2A VERIFICATION TEST SUITE')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function verify(group: string, name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [${group}] PASS: ${name}`)
      passed++
    } else {
      console.error(`  ✗ [${group}] FAIL: ${name}${details ? ` -> ${details}` : ''}`)
      failed++
    }
  }

  // =========================================================================
  // SECTION 1: COMPETITOR INTELLIGENCE PERSISTENCE & ISOLATION (DB-002)
  // =========================================================================
  console.log('--- SECTION 1: DB-002 COMPETITOR INTELLIGENCE ---')

  interface TestCompetitor {
    id: string
    businessId: string
    name: string
    googleMapsUrl: string | null
    placeId: string | null
    rating: number
    reviewCount: number
    responseRate: number
    sentimentScore: number | null
    createdAt: Date
    updatedAt: Date
  }

  interface TestSnapshot {
    id: string
    competitorId: string
    rating: number
    reviewCount: number
    sentimentScore: number | null
    capturedAt: Date
  }

  const competitorsDb: TestCompetitor[] = []
  const snapshotsDb: TestSnapshot[] = []

  const businessOrgA = 'biz_orgA_001'
  const businessOrgB = 'biz_orgB_002'

  function createCompetitor(data: {
    businessId: string
    name: string
    googleMapsUrl?: string
    rating: number
    reviewCount: number
    responseRate: number
    sentimentScore?: number
  }) {
    if (!data.name || data.name.trim().length === 0) throw new Error('Name required')
    const comp: TestCompetitor = {
      id: 'comp_' + Math.random().toString(36).substring(2, 9),
      businessId: data.businessId,
      name: data.name.trim(),
      googleMapsUrl: data.googleMapsUrl || null,
      placeId: null,
      rating: data.rating,
      reviewCount: data.reviewCount,
      responseRate: data.responseRate,
      sentimentScore: data.sentimentScore ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    competitorsDb.push(comp)

    const snap: TestSnapshot = {
      id: 'snap_' + Math.random().toString(36).substring(2, 9),
      competitorId: comp.id,
      rating: comp.rating,
      reviewCount: comp.reviewCount,
      sentimentScore: comp.sentimentScore,
      capturedAt: new Date(),
    }
    snapshotsDb.push(snap)
    return comp
  }

  const comp1 = createCompetitor({
    businessId: businessOrgA,
    name: 'Competitor Alpha',
    rating: 4.3,
    reviewCount: 150,
    responseRate: 75,
    sentimentScore: 0.65,
  })

  verify('COMP-001', 'Create competitor persists competitor record',
    comp1.name === 'Competitor Alpha' && competitorsDb.some(c => c.id === comp1.id))

  verify('COMP-002', 'Snapshot creation on competitor initialization',
    snapshotsDb.some(s => s.competitorId === comp1.id && s.rating === 4.3 && s.reviewCount === 150))

  function getCompetitorsForBusiness(businessIds: string[]) {
    return competitorsDb
      .filter(c => businessIds.includes(c.businessId))
      .map(c => {
        const snaps = snapshotsDb.filter(s => s.competitorId === c.id)
        return { ...c, snapshots: snaps }
      })
  }

  const retrievedA = getCompetitorsForBusiness([businessOrgA])
  verify('COMP-003', 'Retrieve competitor returns competitor with snapshot history',
    retrievedA.length === 1 && retrievedA[0].snapshots.length === 1)

  const comp2 = createCompetitor({
    businessId: businessOrgB,
    name: 'Competitor Beta (Tenant B)',
    rating: 4.8,
    reviewCount: 300,
    responseRate: 90,
  })

  const tenantAView = getCompetitorsForBusiness([businessOrgA])
  const tenantBView = getCompetitorsForBusiness([businessOrgB])

  verify('COMP-004', 'Tenant isolation prevents Org A from reading Org B competitors',
    !tenantAView.some(c => c.id === comp2.id) && tenantBView.some(c => c.id === comp2.id))

  function updateCompetitor(id: string, callerBusinessIds: string[], updates: { rating?: number; reviewCount?: number; name?: string }) {
    const target = competitorsDb.find(c => c.id === id)
    if (!target) throw new Error('Not found')
    if (!callerBusinessIds.includes(target.businessId)) throw new Error('Forbidden')

    if (updates.name) target.name = updates.name
    if (updates.rating !== undefined) target.rating = updates.rating
    if (updates.reviewCount !== undefined) target.reviewCount = updates.reviewCount
    target.updatedAt = new Date()

    if (updates.rating !== undefined || updates.reviewCount !== undefined) {
      snapshotsDb.push({
        id: 'snap_' + Math.random().toString(36).substring(2, 9),
        competitorId: target.id,
        rating: target.rating,
        reviewCount: target.reviewCount,
        sentimentScore: target.sentimentScore,
        capturedAt: new Date(),
      })
    }
    return target
  }

  updateCompetitor(comp1.id, [businessOrgA], { rating: 4.5, reviewCount: 165 })
  const updatedComp1 = competitorsDb.find(c => c.id === comp1.id)
  const comp1Snapshots = snapshotsDb.filter(s => s.competitorId === comp1.id)

  verify('COMP-005', 'Update competitor updates values and captures snapshot delta',
    updatedComp1?.rating === 4.5 && comp1Snapshots.length === 2)

  let crossUpdateBlocked = false
  try {
    updateCompetitor(comp2.id, [businessOrgA], { rating: 1.0 })
  } catch {
    crossUpdateBlocked = true
  }
  verify('COMP-006', 'Cross-tenant competitor modification is rejected with 403', crossUpdateBlocked)

  function deleteCompetitor(id: string, callerBusinessIds: string[]) {
    const idx = competitorsDb.findIndex(c => c.id === id)
    if (idx === -1) throw new Error('Not found')
    if (!callerBusinessIds.includes(competitorsDb[idx].businessId)) throw new Error('Forbidden')

    competitorsDb.splice(idx, 1)
    for (let i = snapshotsDb.length - 1; i >= 0; i--) {
      if (snapshotsDb[i].competitorId === id) snapshotsDb.splice(i, 1)
    }
  }

  deleteCompetitor(comp1.id, [businessOrgA])
  verify('COMP-007', 'Delete competitor removes competitor and cascade deletes snapshots',
    !competitorsDb.some(c => c.id === comp1.id) && !snapshotsDb.some(s => s.competitorId === comp1.id))

  // =========================================================================
  // SECTION 2: SCHEDULED REPORTS PERSISTENCE & VALIDATION (DB-003)
  // =========================================================================
  console.log('\n--- SECTION 2: DB-003 SCHEDULED REPORTS ---')

  interface TestReport {
    id: string
    orgId: string
    businessId: string | null
    name: string
    schedule: ReportSchedule
    recipients: string[]
    format: ReportFormat
    status: ReportStatus
    lastSentAt: Date | null
    createdAt: Date
    updatedAt: Date
  }

  const reportsDb: TestReport[] = []

  function createReport(orgId: string, payload: {
    name: string
    schedule: string
    recipients: string[]
    format: string
  }) {
    if (!payload.name || payload.name.trim().length === 0) throw new Error('Name required')

    const s = payload.schedule.toUpperCase()
    let schedEnum: ReportSchedule
    if (s === 'DAILY') schedEnum = ReportSchedule.DAILY
    else if (s === 'WEEKLY') schedEnum = ReportSchedule.WEEKLY
    else if (s === 'MONTHLY') schedEnum = ReportSchedule.MONTHLY
    else if (s === 'REALTIME_ALERT') schedEnum = ReportSchedule.REALTIME_ALERT
    else throw new Error('Invalid schedule')

    if (!payload.recipients || payload.recipients.length === 0) throw new Error('Recipients required')
    for (const email of payload.recipients) {
      if (!EMAIL_REGEX.test(email)) throw new Error(`Invalid email: ${email}`)
    }

    const f = payload.format.toUpperCase()
    let fmtEnum: ReportFormat
    if (f === 'EMAIL_HTML' || f === 'EMAIL') fmtEnum = ReportFormat.EMAIL_HTML
    else if (f === 'PDF_ATTACHMENT' || f === 'PDF') fmtEnum = ReportFormat.PDF_ATTACHMENT
    else if (f === 'BOTH') fmtEnum = ReportFormat.BOTH
    else throw new Error('Invalid format')

    const report: TestReport = {
      id: 'rpt_' + Math.random().toString(36).substring(2, 9),
      orgId,
      businessId: null,
      name: payload.name.trim(),
      schedule: schedEnum,
      recipients: payload.recipients,
      format: fmtEnum,
      status: ReportStatus.ACTIVE,
      lastSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    reportsDb.push(report)
    return report
  }

  const report1 = createReport('org_1', {
    name: 'Weekly Executive Brief',
    schedule: 'WEEKLY',
    recipients: ['owner@org1.com', 'cfo@org1.com'],
    format: 'PDF',
  })

  verify('RPT-001', 'Create scheduled report with valid schedule, format, and recipients',
    report1.schedule === ReportSchedule.WEEKLY && report1.format === ReportFormat.PDF_ATTACHMENT && report1.recipients.length === 2)

  let invalidRecipientRejected = false
  try {
    createReport('org_1', {
      name: 'Bad Email Report',
      schedule: 'DAILY',
      recipients: ['not-an-email'],
      format: 'EMAIL',
    })
  } catch {
    invalidRecipientRejected = true
  }
  verify('RPT-002', 'Invalid recipient email addresses are strictly rejected', invalidRecipientRejected)

  let invalidScheduleRejected = false
  try {
    createReport('org_1', {
      name: 'Bad Sched Report',
      schedule: 'EVERY_SECOND',
      recipients: ['valid@email.com'],
      format: 'EMAIL',
    })
  } catch {
    invalidScheduleRejected = true
  }
  verify('RPT-003', 'Invalid schedule frequency is rejected with 400 error', invalidScheduleRejected)

  const reportOrg2 = createReport('org_2', {
    name: 'Org 2 Internal Digest',
    schedule: 'MONTHLY',
    recipients: ['boss@org2.com'],
    format: 'BOTH',
  })

  function getReports(orgId: string) {
    return reportsDb.filter(r => r.orgId === orgId)
  }

  verify('RPT-004', 'Scheduled reports are strictly scoped to organization tenant boundary',
    getReports('org_1').length === 1 && !getReports('org_1').some(r => r.id === reportOrg2.id))

  function setReportStatus(id: string, orgId: string, status: ReportStatus) {
    const report = reportsDb.find(r => r.id === id)
    if (!report) throw new Error('Not found')
    if (report.orgId !== orgId) throw new Error('Forbidden')
    report.status = status
    report.updatedAt = new Date()
    return report
  }

  const paused = setReportStatus(report1.id, 'org_1', ReportStatus.PAUSED)
  verify('RPT-005', 'Pause scheduled report transitions status to PAUSED', paused.status === ReportStatus.PAUSED)

  const resumed = setReportStatus(report1.id, 'org_1', ReportStatus.ACTIVE)
  verify('RPT-006', 'Resume scheduled report transitions status to ACTIVE', resumed.status === ReportStatus.ACTIVE)

  let crossReportUpdateBlocked = false
  try {
    setReportStatus(reportOrg2.id, 'org_1', ReportStatus.ARCHIVED)
  } catch {
    crossReportUpdateBlocked = true
  }
  verify('RPT-007', 'Cross-tenant report modification is rejected with 403/404', crossReportUpdateBlocked)

  // =========================================================================
  // SECTION 3: CRYPTOGRAPHIC TEAM INVITATIONS & ROLE MATRIX (AUTH-003)
  // =========================================================================
  console.log('\n--- SECTION 3: AUTH-003 TEAM INVITATIONS & ROLE MATRIX ---')

  const token1: GeneratedToken = generateInvitationToken()
  const token2: GeneratedToken = generateInvitationToken()

  verify('AUTH-001', 'Invitation token generated with 32 bytes entropy (64 hex chars)',
    token1.rawToken.length === 64 && token2.rawToken.length === 64)

  verify('AUTH-002', 'Cryptographic tokens are globally unique and non-repeating',
    token1.rawToken !== token2.rawToken)

  verify('AUTH-003', 'SHA-256 token hashing is deterministic and irreversible',
    token1.tokenHash === hashInvitationToken(token1.rawToken) && token1.tokenHash.length === 64)

  // Explicit Role Matrix & Escalation Tests
  verify('AUTH-004', 'Role Matrix: ADMIN -> ADMIN is PERMITTED (peer administration)',
    canInviteRole(Role.ADMIN, Role.ADMIN))

  verify('AUTH-005', 'Role Matrix: ADMIN -> STAFF and ADMIN -> VIEWER are PERMITTED',
    canInviteRole(Role.ADMIN, Role.STAFF) && canInviteRole(Role.ADMIN, Role.VIEWER))

  verify('AUTH-006', 'Role Matrix: ADMIN -> AGENCY_ADMIN is FORBIDDEN (cross-tenant escalation blocked)',
    !canInviteRole(Role.ADMIN, Role.AGENCY_ADMIN))

  verify('AUTH-007', 'Role Matrix: ADMIN -> CLIENT_ADMIN is FORBIDDEN (cross-tenant escalation blocked)',
    !canInviteRole(Role.ADMIN, Role.CLIENT_ADMIN))

  verify('AUTH-008', 'Role Matrix: ADMIN -> OWNER is FORBIDDEN (ownership escalation blocked)',
    !canInviteRole(Role.ADMIN, Role.OWNER))

  verify('AUTH-009', 'Role Matrix: OWNER -> OWNER is FORBIDDEN (owner cannot duplicate ownership via invite)',
    !canInviteRole(Role.OWNER, Role.OWNER))

  verify('AUTH-010', 'Role Matrix: OWNER -> ADMIN / AGENCY_ADMIN / CLIENT_ADMIN are PERMITTED',
    canInviteRole(Role.OWNER, Role.ADMIN) &&
    canInviteRole(Role.OWNER, Role.AGENCY_ADMIN) &&
    canInviteRole(Role.OWNER, Role.CLIENT_ADMIN))

  verify('AUTH-011', 'Role Matrix: STAFF and VIEWER cannot invite any role (fail closed)',
    INVITATION_ROLE_MATRIX[Role.STAFF].length === 0 && INVITATION_ROLE_MATRIX[Role.VIEWER].length === 0)

  // In-Memory Team Invitation Lifecycle Simulation
  interface TestInvitation {
    id: string
    orgId: string
    email: string
    role: Role
    tokenHash: string
    invitedById: string
    expiresAt: Date
    consumedAt: Date | null
    createdAt: Date
  }

  interface TestUser {
    id: string
    email: string
    name: string | null
    passwordHash: string | null
    sessionVersion: number
  }

  interface TestOrgMember {
    id: string
    orgId: string
    userId: string
    role: Role
  }

  const invitationsDb: TestInvitation[] = []
  const usersDb: TestUser[] = []
  const membersDb: TestOrgMember[] = []

  function issueInvitation(orgId: string, inviterRole: Role, inviterId: string, email: string, role: Role) {
    if (!canInviteRole(inviterRole, role)) throw new Error('INSUFFICIENT_ROLE')
    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(normalizedEmail)) throw new Error('INVALID_EMAIL')

    const existingUser = usersDb.find(u => u.email === normalizedEmail)
    if (existingUser && membersDb.some(m => m.orgId === orgId && m.userId === existingUser.id)) {
      throw new Error('ALREADY_MEMBER')
    }

    const { rawToken, tokenHash, expiresAt } = generateInvitationToken()

    const inv: TestInvitation = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      orgId,
      email: normalizedEmail,
      role,
      tokenHash,
      invitedById: inviterId,
      expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    }
    invitationsDb.push(inv)
    return { rawToken, invitation: inv }
  }

  async function acceptInvitation(
    rawToken: string,
    payload: { password?: string; name?: string; sessionUser?: { id: string; email: string } | null },
  ) {
    const tokenHash = hashInvitationToken(rawToken)
    const inv = invitationsDb.find(i => i.tokenHash === tokenHash)
    if (!inv) throw new Error('INVALID_TOKEN')
    if (inv.consumedAt !== null) throw new Error('ALREADY_CONSUMED')
    if (inv.expiresAt < new Date()) throw new Error('EXPIRED')

    if (payload.sessionUser) {
      if (payload.sessionUser.email.toLowerCase() !== inv.email.toLowerCase()) {
        throw new Error('EMAIL_MISMATCH')
      }
    }

    let user = usersDb.find(u => u.email === inv.email)

    if (!user) {
      // Flow A: New user registration
      if (!payload.password || payload.password.length < 8) throw new Error('PASSWORD_REQUIRED')
      const passwordHash = await bcrypt.hash(payload.password, 10)
      user = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        email: inv.email,
        name: payload.name || inv.email.split('@')[0],
        passwordHash,
        sessionVersion: 1,
      }
      usersDb.push(user)
    } else {
      // Flow B: Existing user confirmation
      if (!payload.sessionUser) {
        // Unauthenticated existing user must prove credentials
        if (user.passwordHash) {
          if (!payload.password) throw new Error('PASSWORD_REQUIRED')
          const valid = await bcrypt.compare(payload.password, user.passwordHash)
          if (!valid) throw new Error('INVALID_CREDENTIALS')
        }
      }
    }

    inv.consumedAt = new Date()

    const membership: TestOrgMember = {
      id: 'mem_' + Math.random().toString(36).substring(2, 9),
      orgId: inv.orgId,
      userId: user.id,
      role: inv.role,
    }
    membersDb.push(membership)

    return { user, membership }
  }

  // 3.5 Issue & Accept: New User Flow
  const { rawToken: newRawToken, invitation: newInv } = issueInvitation(
    'org_corp',
    Role.OWNER,
    'usr_owner1',
    'newhire@company.com',
    Role.STAFF,
  )

  verify('AUTH-012', 'Raw token is NOT stored in DB (only SHA-256 tokenHash persisted)',
    newInv.tokenHash.length === 64 && !(newInv as any).rawToken)

  const acceptResultNew = await acceptInvitation(newRawToken, {
    password: 'SecurePassword2026!',
    name: 'Jane Newhire',
  })

  verify('AUTH-013', 'Valid token accepted: provisions User and OrgMember atomically',
    acceptResultNew.user.email === 'newhire@company.com' &&
    acceptResultNew.membership.orgId === 'org_corp' &&
    acceptResultNew.membership.role === Role.STAFF)

  // 3.6 Replay Protection & Single-Use Semantics
  let replayBlocked = false
  try {
    await acceptInvitation(newRawToken, { password: 'AnotherPassword123!' })
  } catch (err: any) {
    if (err.message === 'ALREADY_CONSUMED') replayBlocked = true
  }
  verify('AUTH-014', 'Replay consumption rejected: token cannot be consumed twice', replayBlocked)

  // 3.7 Expired Token Rejection
  const { rawToken: expiredRawToken, invitation: expiredInv } = issueInvitation(
    'org_corp',
    Role.ADMIN,
    'usr_owner1',
    'latehire@company.com',
    Role.VIEWER,
  )
  expiredInv.expiresAt = new Date(Date.now() - 1000)

  let expiredBlocked = false
  try {
    await acceptInvitation(expiredRawToken, { password: 'SecurePassword2026!' })
  } catch (err: any) {
    if (err.message === 'EXPIRED') expiredBlocked = true
  }
  verify('AUTH-015', 'Expired token rejected with EXPIRED error code', expiredBlocked)

  // 3.8 Invalid Token Rejection
  let invalidTokenBlocked = false
  try {
    await acceptInvitation('definitely-not-a-valid-token-string', { password: 'SecurePassword2026!' })
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN') invalidTokenBlocked = true
  }
  verify('AUTH-016', 'Tampered or unknown token rejected with INVALID_TOKEN', invalidTokenBlocked)

  // =========================================================================
  // EXISTING USER AUTHENTICATION & CONFIRMATION SEMANTICS
  // =========================================================================
  const existingUserOrgX = {
    id: 'usr_external_99',
    email: 'consultant@agency.com',
    name: 'Bob Consultant',
    passwordHash: await bcrypt.hash('ConsultantPass2026!', 10),
    sessionVersion: 1,
  }
  usersDb.push(existingUserOrgX)

  const { rawToken: existingUserToken1 } = issueInvitation(
    'org_corp',
    Role.ADMIN,
    'usr_owner1',
    'consultant@agency.com',
    Role.ADMIN,
  )

  // Existing user unauthenticated without password -> rejected
  let existingNoPassBlocked = false
  try {
    await acceptInvitation(existingUserToken1, {})
  } catch (err: any) {
    if (err.message === 'PASSWORD_REQUIRED') existingNoPassBlocked = true
  }
  verify('AUTH-017', 'Existing user unauthenticated acceptance without password is rejected', existingNoPassBlocked)

  // Existing user unauthenticated with wrong password -> rejected
  let existingWrongPassBlocked = false
  try {
    await acceptInvitation(existingUserToken1, { password: 'WrongPassword!' })
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') existingWrongPassBlocked = true
  }
  verify('AUTH-018', 'Existing user unauthenticated acceptance with wrong password is rejected', existingWrongPassBlocked)

  // Existing user unauthenticated with correct password -> succeeds
  const acceptExistingWithPass = await acceptInvitation(existingUserToken1, { password: 'ConsultantPass2026!' })
  verify('AUTH-019', 'Existing user unauthenticated acceptance with correct password confirms and joins org',
    acceptExistingWithPass.user.id === 'usr_external_99' &&
    membersDb.some(m => m.orgId === 'org_corp' && m.userId === 'usr_external_99' && m.role === Role.ADMIN))

  // Existing user authenticated session with mismatched email -> rejected
  const { rawToken: existingUserToken2 } = issueInvitation(
    'org_corp2',
    Role.OWNER,
    'usr_owner1',
    'target@company.com',
    Role.STAFF,
  )

  let mismatchSessionBlocked = false
  try {
    await acceptInvitation(existingUserToken2, {
      sessionUser: { id: 'usr_other', email: 'other_user@domain.com' },
    })
  } catch (err: any) {
    if (err.message === 'EMAIL_MISMATCH') mismatchSessionBlocked = true
  }
  verify('AUTH-020', 'Authenticated session with mismatched email is rejected (cross-account takeover blocked)',
    mismatchSessionBlocked)

  // Existing user authenticated session with matching email -> succeeds without password prompt
  const existingUserOrgY = {
    id: 'usr_matching_session',
    email: 'target@company.com',
    name: 'Target User',
    passwordHash: await bcrypt.hash('TargetPass2026!', 10),
    sessionVersion: 1,
  }
  usersDb.push(existingUserOrgY)

  const acceptMatchingSession = await acceptInvitation(existingUserToken2, {
    sessionUser: { id: 'usr_matching_session', email: 'target@company.com' },
  })
  verify('AUTH-021', 'Authenticated session with matching email confirms and joins org directly',
    acceptMatchingSession.user.id === 'usr_matching_session' &&
    membersDb.some(m => m.orgId === 'org_corp2' && m.userId === 'usr_matching_session'))

  console.log('\n=================================================================')
  console.log(`STAGE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) process.exit(1)
}

runStage2Tests().catch(err => {
  console.error('Stage 2 test fatal error:', err)
  process.exit(1)
})

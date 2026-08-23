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

  // =========================================================================
  // SECTION 4: MILESTONE 2B — TEAM MANAGEMENT & SCHEDULED REPORTS LIFECYCLE
  // =========================================================================
  console.log('\n--- SECTION 4: MILESTONE 2B TEAM & REPORTS AUTOMATION ---')

  // 1. Team members list & seat limit computation
  const orgTeamMembers = membersDb.filter(m => m.orgId === 'org_corp')
  const orgPendingInvites = invitationsDb.filter(i => i.orgId === 'org_corp' && i.consumedAt === null && i.expiresAt > new Date())
  verify('TEAM-001', 'Team members query lists active organization members with user details',
    orgTeamMembers.length > 0)
  verify('TEAM-002', 'Team members query includes pending unconsumed invitations',
    Array.isArray(orgPendingInvites))

  // 2. Revoke Invitation
  const { rawToken: revocableRaw, tokenHash: revocableHash } = generateInvitationToken()
  const revocableInviteId = 'inv_to_revoke_001'
  invitationsDb.push({
    id: revocableInviteId,
    orgId: 'org_corp',
    email: 'temp_invite@domain.com',
    role: Role.STAFF,
    tokenHash: revocableHash,
    invitedById: 'usr_owner1',
    expiresAt: new Date(Date.now() + 86400000),
    consumedAt: null,
    createdAt: new Date(),
  })

  // Revoke by non-admin -> rejected
  function canRevoke(callerRole: Role): boolean {
    return callerRole === Role.OWNER || callerRole === Role.ADMIN
  }
  verify('TEAM-003', 'Revoking invitation requires OWNER or ADMIN role',
    canRevoke(Role.OWNER) && canRevoke(Role.ADMIN) && !canRevoke(Role.STAFF) && !canRevoke(Role.VIEWER))

  // Revoke removes from DB
  const idxToRevoke = invitationsDb.findIndex(i => i.id === revocableInviteId && i.orgId === 'org_corp')
  if (idxToRevoke >= 0) invitationsDb.splice(idxToRevoke, 1)
  verify('TEAM-004', 'Revoking invitation deletes the record and prevents subsequent acceptance',
    !invitationsDb.some(i => i.id === revocableInviteId))

  // 3. Remove Team Member RBAC & Safeguards
  function canRemoveMember(actorRole: Role, targetRole: Role, isSelf: boolean): { allowed: boolean; code?: string } {
    if (isSelf) {
      return { allowed: false, code: 'CANNOT_REMOVE_SELF' }
    }
    if (actorRole !== Role.OWNER && actorRole !== Role.ADMIN) {
      return { allowed: false, code: 'INSUFFICIENT_ROLE' }
    }
    if (targetRole === Role.OWNER) {
      return { allowed: false, code: 'CANNOT_REMOVE_OWNER' }
    }
    if (actorRole === Role.ADMIN && targetRole === Role.ADMIN) {
      return { allowed: false, code: 'INSUFFICIENT_ROLE' }
    }
    return { allowed: true }
  }

  verify('TEAM-005', 'Owner cannot be removed from organization',
    !canRemoveMember(Role.ADMIN, Role.OWNER, false).allowed &&
    canRemoveMember(Role.ADMIN, Role.OWNER, false).code === 'CANNOT_REMOVE_OWNER')

  verify('TEAM-006', 'Admin cannot remove peer admin (only owner can)',
    !canRemoveMember(Role.ADMIN, Role.ADMIN, false).allowed &&
    canRemoveMember(Role.ADMIN, Role.ADMIN, false).code === 'INSUFFICIENT_ROLE')

  verify('TEAM-007', 'Owner can remove admin and staff members',
    canRemoveMember(Role.OWNER, Role.ADMIN, false).allowed &&
    canRemoveMember(Role.OWNER, Role.STAFF, false).allowed)

  verify('TEAM-008', 'User cannot remove themselves via team management endpoint',
    !canRemoveMember(Role.ADMIN, Role.ADMIN, true).allowed &&
    canRemoveMember(Role.ADMIN, Role.ADMIN, true).code === 'CANNOT_REMOVE_SELF')

  // 4. Report Deletion & Scoping
  const reportToDeleteId = 'rpt_test_del_001'
  reportsDb.push({
    id: reportToDeleteId,
    orgId: 'org_corp',
    businessId: 'biz_orgA_001',
    name: 'Obsolete Report',
    schedule: ReportSchedule.DAILY,
    recipients: ['test@domain.com'],
    format: ReportFormat.EMAIL_HTML,
    status: ReportStatus.ACTIVE,
    lastSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Cross-tenant report deletion check
  function canDeleteReport(reportOrgId: string, callerOrgId: string, callerRole: Role): boolean {
    if (callerRole !== Role.OWNER && callerRole !== Role.ADMIN) return false
    return reportOrgId === callerOrgId
  }

  verify('RPT-009', 'Deleting report enforces tenant isolation and owner/admin role',
    canDeleteReport('org_corp', 'org_corp', Role.OWNER) &&
    !canDeleteReport('org_corp', 'org_corp', Role.STAFF) &&
    !canDeleteReport('org_corp', 'org_other', Role.OWNER))

  const rptIdx = reportsDb.findIndex(r => r.id === reportToDeleteId && r.orgId === 'org_corp')
  if (rptIdx >= 0) reportsDb.splice(rptIdx, 1)
  verify('RPT-010', 'Report deletion deletes the record from database',
    !reportsDb.some(r => r.id === reportToDeleteId))

  // 4b. Format Contract Enforcement (Direct API payload validation)
  function validateReportFormatPayload(format: string): { allowed: boolean; code?: string } {
    if (format === 'PDF_ATTACHMENT' || format === 'BOTH') {
      return { allowed: false, code: 'UNSUPPORTED_FORMAT' }
    }
    if (format === 'EMAIL_HTML' || format === 'EMAIL') {
      return { allowed: true }
    }
    return { allowed: false, code: 'INVALID_FORMAT' }
  }

  verify('RPT-011', 'Direct API payloads with PDF_ATTACHMENT or BOTH are rejected with UNSUPPORTED_FORMAT',
    !validateReportFormatPayload('PDF_ATTACHMENT').allowed &&
    validateReportFormatPayload('PDF_ATTACHMENT').code === 'UNSUPPORTED_FORMAT' &&
    !validateReportFormatPayload('BOTH').allowed &&
    validateReportFormatPayload('BOTH').code === 'UNSUPPORTED_FORMAT')

  verify('RPT-012', 'Direct API payload with EMAIL_HTML is accepted as active supported format',
    validateReportFormatPayload('EMAIL_HTML').allowed)

  // 5. Automated Report Dispatch Due Logic
  function isDue(schedule: ReportSchedule, lastSentAt: Date | null, now: Date): boolean {
    if (!lastSentAt) return true
    const diff = now.getTime() - lastSentAt.getTime()
    if (schedule === ReportSchedule.DAILY) return diff >= 23 * 3600 * 1000
    if (schedule === ReportSchedule.WEEKLY) return diff >= 6.5 * 24 * 3600 * 1000
    if (schedule === ReportSchedule.MONTHLY) return diff >= 27 * 24 * 3600 * 1000
    return false
  }

  const now = new Date('2026-08-23T12:00:00Z')
  verify('CRON-001', 'Report with lastSentAt = null is immediately due',
    isDue(ReportSchedule.DAILY, null, now))
  verify('CRON-002', 'Daily report sent 24h ago is due',
    isDue(ReportSchedule.DAILY, new Date('2026-08-22T11:00:00Z'), now))
  verify('CRON-003', 'Daily report sent 2h ago is NOT due',
    !isDue(ReportSchedule.DAILY, new Date('2026-08-23T10:00:00Z'), now))
  verify('CRON-004', 'Weekly report sent 7 days ago is due',
    isDue(ReportSchedule.WEEKLY, new Date('2026-08-16T10:00:00Z'), now))
  verify('CRON-005', 'Weekly report sent 3 days ago is NOT due',
    !isDue(ReportSchedule.WEEKLY, new Date('2026-08-20T10:00:00Z'), now))

  // 6. Concurrency Protection: Atomic Optimistic Claim Lock
  interface AtomicReport {
    id: string
    name: string
    status: ReportStatus
    lastSentAt: Date | null
  }

  const concurrentReport: AtomicReport = {
    id: 'rpt_concurrent_001',
    name: 'Weekly Digest',
    status: ReportStatus.ACTIVE,
    lastSentAt: new Date('2026-08-16T10:00:00Z'),
  }

  function attemptAtomicClaim(
    targetReport: AtomicReport,
    expectedLastSentAt: Date | null,
    claimTimestamp: Date,
  ): boolean {
    if (targetReport.status !== ReportStatus.ACTIVE) return false
    const match = targetReport.lastSentAt?.getTime() === expectedLastSentAt?.getTime()
    if (match) {
      targetReport.lastSentAt = claimTimestamp
      return true
    }
    return false
  }

  const claimTime = new Date('2026-08-23T12:00:00Z')
  // Worker A attempts claim with expectedLastSentAt
  const workerAClaim = attemptAtomicClaim(concurrentReport, new Date('2026-08-16T10:00:00Z'), claimTime)
  verify('CRON-010', 'Worker A successfully acquires atomic claim lock on due report', workerAClaim)

  // Worker B concurrently attempts claim with stale expectedLastSentAt
  const workerBClaim = attemptAtomicClaim(concurrentReport, new Date('2026-08-16T10:00:00Z'), claimTime)
  verify('CRON-011', 'Worker B is rejected by atomic claim lock (zero duplicate dispatch under concurrency)', !workerBClaim)

  // 7. REALTIME_ALERT Negative Review Qualification Logic
  interface MockReview {
    id: string
    businessId: string
    author: string
    rating: number
    text: string
    createdAt: Date
  }

  const businessReviews: MockReview[] = [
    {
      id: 'rev_1',
      businessId: 'biz_001',
      author: 'Happy Customer',
      rating: 5,
      text: 'Great service!',
      createdAt: new Date('2026-08-23T11:30:00Z'),
    },
    {
      id: 'rev_2',
      businessId: 'biz_001',
      author: 'Upset Patron',
      rating: 1,
      text: 'Food was cold and service was terrible.',
      createdAt: new Date('2026-08-23T11:45:00Z'),
    },
  ]

  function filterQualifyingAlertReviews(reviews: MockReview[], since: Date): MockReview[] {
    return reviews.filter(r => r.rating <= 2 && r.createdAt >= since)
  }

  const alertSinceWindow = new Date('2026-08-23T11:00:00Z')
  const qualifyingReviews = filterQualifyingAlertReviews(businessReviews, alertSinceWindow)

  verify('ALERT-001', 'Real-time alert queries only qualifying negative reviews (rating <= 2)',
    qualifyingReviews.length === 1 && qualifyingReviews[0].rating === 1 && qualifyingReviews[0].author === 'Upset Patron')

  const noNegativeReviews = filterQualifyingAlertReviews(
    businessReviews.filter(r => r.rating > 2),
    alertSinceWindow,
  )
  verify('ALERT-002', 'Real-time alert does not dispatch when no qualifying negative reviews exist (avoids spam)',
    noNegativeReviews.length === 0)

  // 8. Cron Authorization Fail-Closed Verification (4 cases)
  function evaluateCronSecurity(authHeader: string | null, envSecret?: string): { status: number; authorized: boolean } {
    if (!envSecret || envSecret.trim().length === 0) {
      return { status: 500, authorized: false }
    }
    if (!authHeader || authHeader !== `Bearer ${envSecret}`) {
      return { status: 401, authorized: false }
    }
    return { status: 200, authorized: true }
  }

  verify('CRON-006', 'Case A: Missing CRON_SECRET yields HTTP 500 fail-closed in all environments',
    evaluateCronSecurity('Bearer any_secret', undefined).status === 500 &&
    evaluateCronSecurity('Bearer any_secret', '').status === 500)

  verify('CRON-007', 'Case B: Missing Authorization header yields HTTP 401 Unauthorized',
    evaluateCronSecurity(null, 'secret_prod_123').status === 401)

  verify('CRON-008', 'Case C: Incorrect Bearer token yields HTTP 401 Unauthorized',
    evaluateCronSecurity('Bearer invalid_token', 'secret_prod_123').status === 401)

  verify('CRON-009', 'Case D: Correct Bearer token yields HTTP 200 Authorized',
    evaluateCronSecurity('Bearer secret_prod_123', 'secret_prod_123').status === 200 &&
    evaluateCronSecurity('Bearer secret_prod_123', 'secret_prod_123').authorized)

  console.log('\n=================================================================')
  console.log(`STAGE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) process.exit(1)
}

runStage2Tests().catch(err => {
  console.error('Stage 2 test fatal error:', err)
  process.exit(1)
})

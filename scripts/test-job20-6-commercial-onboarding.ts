/**
 * scripts/test-job20-6-commercial-onboarding.ts
 * JOB-20.6 END-TO-END COMMERCIAL ONBOARDING VERIFICATION
 * 40 authoritative assertions across 11 domains
 * Runs exclusively against isolated test DB (port 5433 / reviewreply_test)
 */

import { PrismaClient, Plan, Role, ReviewSource } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { encodeSession } from '../src/lib/session'
import { encrypt } from '../src/lib/crypto'
import { resolveDashboardReadiness, getBusinessDashboardReadiness } from '../src/lib/readiness'
import { resolveLocationReadiness } from '../src/app/api/onboarding/route'
import {
  generatePKCE,
  generateCryptographicEntropy,
  verifyPKCEChallenge,
  verifyGoogleLocation,
} from '../src/lib/integrations/google-business-profile'
import { assertBusinessOwnership } from '../src/lib/tenant-context'
import { _clearInMemoryStore } from '../src/lib/rate-limit'
import { NextRequest } from 'next/server'

// DB isolation guard
const E2E_DB_URL = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || ''
if (!E2E_DB_URL.includes('5433') && !E2E_DB_URL.includes('reviewreply_test')) {
  console.error('[JOB-20.6] FATAL: Must run against isolated test DB (port 5433 / reviewreply_test).')
  process.exit(1)
}
process.env.DATABASE_URL = E2E_DB_URL
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id-job20-6'
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret-job20-6'

const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } })

// Session helper
async function makeSessionCookie(user: {
  id: string; email: string; name: string | null; role: Role
  orgId: string | null; orgName: string | null; orgPlan: string | null
  sessionVersion?: number
}): Promise<string> {
  const token = await encodeSession({
    id: user.id, email: user.email, name: user.name, role: user.role,
    orgId: user.orgId, orgName: user.orgName, orgPlan: user.orgPlan,
    sessionVersion: user.sessionVersion ?? 1,
  })
  return `rr_session=${token}`
}

// HTTP helper
let ipCounter = 1
function makeRequest(url: string, opts: {
  method?: string; body?: object; cookie?: string; ip?: string
} = {}): NextRequest {
  const clientIp = opts.ip || `192.168.1.${ipCounter++}`
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': opts.cookie || '',
      'x-forwarded-for': clientIp,
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })
}

// Assertion tracker
let assertionCount = 0
let passCount = 0
let failCount = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  assertionCount++
  if (condition) {
    passCount++
    console.log(`  YES [${assertionCount}] ${label}`)
  } else {
    failCount++
    const msg = `  NO  [${assertionCount}] FAIL: ${label}`
    console.error(msg)
    failures.push(msg)
  }
}

const orgIdsToClean: string[] = []

async function cleanup() {
  for (const orgId of orgIdsToClean) {
    try {
      await prisma.business.deleteMany({ where: { orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    } catch {}
  }
  await prisma.$disconnect()
}

async function provisionTenant(opts: { name?: string; plan?: Plan; role?: Role } = {}) {
  const email = `job206_${Date.now()}_${Math.random().toString(36).slice(2)}@test.local`
  const passwordHash = await bcrypt.hash('TestPass2026!', 10)
  const name = opts.name || 'JOB-20.6 Test User'
  const plan = opts.plan ?? Plan.PRO
  const role = opts.role ?? Role.OWNER
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name, passwordHash, sessionVersion: 1 } })
    const org = await tx.organization.create({
      data: { name: `${name}Org`, plan, trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), onboardingStep: 1 },
    })
    orgIdsToClean.push(org.id)
    await tx.orgMember.create({ data: { orgId: org.id, userId: user.id, role } })
    const bName = `Biz ${Date.now()}`
    const business = await tx.business.create({
      data: { orgId: org.id, ownerId: user.id, name: bName, industry: 'restaurant' },
    })
    return { user, org, business }
  }, { timeout: 15000 })
}

async function main() {
  console.log('\n=============================================================')
  console.log(' JOB-20.6 END-TO-END COMMERCIAL ONBOARDING VERIFICATION')
  console.log(` DB: ${E2E_DB_URL.replace(/:[^:@]+@/, ':***@')}`)
  console.log('=============================================================\n')

  // DOMAIN 1 - ACCOUNT (1-4)
  console.log('-- DOMAIN 1: Account')

  // [1] Signup rejects empty required fields
  {
    const { POST } = await import('../src/app/api/auth/signup/route')
    const req = makeRequest('/api/auth/signup', { method: 'POST', body: { email: '', password: '', name: '', businessName: '' } })
    const res = await POST(req)
    const json = await res.json()
    assert(res.status === 400 && json.code === 'MISSING_FIELDS', 'Signup: empty required fields -> 400 MISSING_FIELDS')
  }

  // [2] Signup rejects duplicate email
  {
    const { POST } = await import('../src/app/api/auth/signup/route')
    const dupEmail = `dup206_${Date.now()}@test.local`
    await prisma.user.create({ data: { email: dupEmail, passwordHash: await bcrypt.hash('pw', 10) } })
    const req = makeRequest('/api/auth/signup', { method: 'POST', body: { email: dupEmail, password: 'TestPass2026!', name: 'D', businessName: 'B' } })
    const res = await POST(req)
    const json = await res.json()
    assert(res.status === 409 && json.code === 'EMAIL_EXISTS', 'Signup: duplicate email -> 409 EMAIL_EXISTS')
    await prisma.user.delete({ where: { email: dupEmail } }).catch(() => {})
  }

  // [3] Signup creates user+org+session, redirects to /onboarding
  {
    const { POST } = await import('../src/app/api/auth/signup/route')
    const newEmail = `new206_${Date.now()}@test.local`
    const req = makeRequest('/api/auth/signup', { method: 'POST', body: { email: newEmail, password: 'TestPass2026!', name: 'New', businessName: 'Biz' } })
    const res = await POST(req)
    const json = await res.json()
    assert(res.status === 200 && json.user?.id && json.redirectTo === '/onboarding', 'Signup: valid data -> 200 + redirectTo=/onboarding')
    const created = await prisma.user.findUnique({ where: { email: newEmail }, include: { memberships: true } })
    if (created) {
      const orgId = created.memberships[0]?.orgId
      if (orgId) { await prisma.business.deleteMany({ where: { orgId } }); await prisma.organization.delete({ where: { id: orgId } }).catch(() => {}) }
      await prisma.auditLog.deleteMany({ where: { actorId: created.id } })
      await prisma.user.delete({ where: { id: created.id } }).catch(() => {})
    }
  }

  // [4] Signup rejects invalid plan name
  {
    const { POST } = await import('../src/app/api/auth/signup/route')
    const req = makeRequest('/api/auth/signup', { method: 'POST', body: { email: 'pt206@test.local', password: 'TestPass2026!', name: 'PT', businessName: 'PB', plan: 'SUPERADMIN' } })
    const res = await POST(req)
    const json = await res.json()
    assert(res.status === 400 && json.code === 'INVALID_PLAN', 'Signup: invalid plan -> 400 INVALID_PLAN')
  }

  // DOMAIN 2 - ORGANIZATION (5-7)
  console.log('-- DOMAIN 2: Organization')
  const tenantA = await provisionTenant({ name: 'TenantA', plan: Plan.PRO })
  const tenantB = await provisionTenant({ name: 'TenantB', plan: Plan.PRO })

  // [5] Authenticated user fetches own org onboarding state
  {
    const { GET } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await GET(makeRequest('/api/onboarding', { cookie }))
    const json = await res.json()
    assert(res.status === 200 && json.organization?.id === tenantA.org.id, 'Org: authenticated user sees own org state')
  }

  // [6] Business is bound to correct org+owner
  {
    const biz = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })
    assert(biz !== null && biz.ownerId === tenantA.user.id && biz.orgId === tenantA.org.id, 'Org: business has correct ownerId and orgId')
  }

  // [7] Onboarding starts at step=1, completedAt=null
  {
    const org = await prisma.organization.findUnique({ where: { id: tenantA.org.id } })
    assert(org?.onboardingStep === 1 && org.onboardingCompletedAt === null, 'Org: onboardingStep=1, onboardingCompletedAt=null on creation')
  }

  // DOMAIN 3 - BILLING (8-11)
  console.log('-- DOMAIN 3: Billing')

  // [8] FREE plan selection -> no checkout required
  {
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'select-plan', plan: 'FREE' }, cookie }))
    const json = await res.json()
    assert(res.status === 200 && json.plan === 'FREE' && json.requiresCheckout === false, 'Billing: FREE plan selection -> requiresCheckout=false')
  }

  // [9] Invalid plan name rejected server-side
  {
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'select-plan', plan: 'GODMODE' }, cookie }))
    const json = await res.json()
    assert(res.status === 400 && json.code === 'INVALID_PLAN', 'Billing: invalid plan name -> 400 INVALID_PLAN')
  }

  // [10] Client cannot escalate plan without trial/sub (entitlement hardening)
  {
    const noTrialUser = await prisma.user.create({ data: { email: `nt206_${Date.now()}@test.local`, passwordHash: await bcrypt.hash('pw', 10) } })
    const noTrialOrg = await prisma.organization.create({ data: { name: 'NoTrialOrg', plan: Plan.FREE, trialEndsAt: null } })
    orgIdsToClean.push(noTrialOrg.id)
    await prisma.orgMember.create({ data: { orgId: noTrialOrg.id, userId: noTrialUser.id, role: Role.OWNER } })
    await prisma.business.create({ data: { orgId: noTrialOrg.id, ownerId: noTrialUser.id, name: 'NT Biz', industry: 'restaurant' } })
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: noTrialUser.id, email: noTrialUser.email, name: noTrialUser.name, role: Role.OWNER, orgId: noTrialOrg.id, orgName: noTrialOrg.name, orgPlan: noTrialOrg.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'select-plan', plan: 'ENTERPRISE' }, cookie }))
    const json = await res.json()
    assert(res.status === 200 && json.entitledPlan === 'FREE', 'Billing: no-trial org cannot escalate plan (entitledPlan stays FREE)')
  }

  // [11] VIEWER role blocked from onboarding mutations
  {
    const viewerUser = await prisma.user.create({ data: { email: `vw206_${Date.now()}@test.local`, passwordHash: await bcrypt.hash('pw', 10) } })
    await prisma.orgMember.create({ data: { orgId: tenantA.org.id, userId: viewerUser.id, role: Role.VIEWER } })
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: viewerUser.id, email: viewerUser.email, name: viewerUser.name, role: Role.VIEWER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'set-step', step: 2 }, cookie }))
    assert(res.status === 403, 'Billing/RBAC: VIEWER cannot execute onboarding mutations -> 403')
    await prisma.orgMember.deleteMany({ where: { userId: viewerUser.id } })
    await prisma.user.delete({ where: { id: viewerUser.id } }).catch(() => {})
  }

  // DOMAIN 4 - GOOGLE OAUTH STATE (12-14)
  console.log('-- DOMAIN 4: Google OAuth State')

  // [12] PKCE S256 round-trips correctly
  {
    const { codeVerifier, codeChallenge } = generatePKCE()
    assert(verifyPKCEChallenge(codeVerifier, codeChallenge) === true && verifyPKCEChallenge(codeVerifier, 'bad') === false, 'OAuth: PKCE S256 generation/verification round-trips correctly')
  }

  // [13] OAuth state values are unique per invocation
  {
    const s1 = generateCryptographicEntropy(32)
    const s2 = generateCryptographicEntropy(32)
    assert(s1 !== s2 && s1.length >= 43, 'OAuth: state entropy values are unique and >= 43 chars')
  }

  // [14] Cross-tenant OAuth initiation refused
  {
    const { GET } = await import('../src/app/api/oauth/google/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const bizB = await prisma.business.findFirst({ where: { orgId: tenantB.org.id } })
    const res = await GET(makeRequest(`/api/oauth/google?businessId=${bizB?.id || 'x'}`, { cookie }))
    assert(res.status === 403 || res.status === 400, 'OAuth: cross-tenant businessId for OAuth initiation -> 403/400')
  }

  // DOMAIN 5 - LOCATION DISCOVERY (15-17)
  console.log('-- DOMAIN 5: Location Discovery')

  // [15] Cross-tenant location discovery refused
  {
    const { GET } = await import('../src/app/api/oauth/google/locations/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const bizB = await prisma.business.findFirst({ where: { orgId: tenantB.org.id } })
    const res = await GET(makeRequest(`/api/oauth/google/locations?businessId=${bizB?.id || 'x'}`, { cookie }))
    assert(res.status === 403 || res.status === 401, 'Discovery: cross-tenant businessId -> 403/401')
  }

  // [16] Missing businessId returns 400
  {
    const { GET } = await import('../src/app/api/oauth/google/locations/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await GET(makeRequest('/api/oauth/google/locations', { cookie }))
    assert(res.status === 400, 'Discovery: missing businessId -> 400')
  }

  // [17] resolveLocationReadiness state machine correctness
  {
    const noInt = resolveLocationReadiness({ hasBusiness: true, hasName: true, hasIndustry: true, googleConnected: false, googleLocationVerified: false, facebookConnected: false, linksConfigured: false })
    const verif = resolveLocationReadiness({ hasBusiness: true, hasName: true, hasIndustry: true, googleConnected: true, googleLocationVerified: true, facebookConnected: false, linksConfigured: false })
    const pend = resolveLocationReadiness({ hasBusiness: true, hasName: true, hasIndustry: true, googleConnected: true, googleLocationVerified: false, facebookConnected: false, linksConfigured: false })
    assert(noInt === 'location_configured' && verif === 'ready_for_sync' && pend === 'integration_pending', 'Discovery: resolveLocationReadiness state machine correct for all 3 cases')
  }

  // DOMAIN 6 - LOCATION VERIFICATION (18-21)
  console.log('-- DOMAIN 6: Location Verification')
  const tenantC = await provisionTenant({ name: 'TenantC' })

  // [18] select-location without businessId returns 400
  {
    const { POST } = await import('../src/app/api/oauth/google/select-location/route')
    const cookie = await makeSessionCookie({ id: tenantC.user.id, email: tenantC.user.email, name: tenantC.user.name, role: Role.OWNER, orgId: tenantC.org.id, orgName: tenantC.org.name, orgPlan: tenantC.org.plan })
    const res = await POST(makeRequest('/api/oauth/google/select-location', { method: 'POST', body: { locationId: 'accounts/1/locations/2' }, cookie }))
    assert(res.status === 400, 'Location: select-location without businessId -> 400')
  }

  // [19] select-location with cross-tenant businessId returns 403
  {
    const { POST } = await import('../src/app/api/oauth/google/select-location/route')
    const cookie = await makeSessionCookie({ id: tenantC.user.id, email: tenantC.user.email, name: tenantC.user.name, role: Role.OWNER, orgId: tenantC.org.id, orgName: tenantC.org.name, orgPlan: tenantC.org.plan })
    const bizA = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })
    const res = await POST(makeRequest('/api/oauth/google/select-location', { method: 'POST', body: { businessId: bizA?.id, locationId: 'accounts/1/locations/2' }, cookie }))
    assert(res.status === 403, 'Location: cross-tenant businessId for select-location -> 403')
  }

  // [20] Unverified location blocks readiness (server-authoritative)
  {
    const dr = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: false, initialSyncCompleted: false, googleSyncStatus: 'not_started', realGoogleReviewCount: 99 })
    assert(dr.isReady === false && dr.actionRequired === 'Location verification required', 'Location: unverified location blocks readiness (99 reviews irrelevant)')
  }

  // [21] Verified location persists to DB correctly and server-side verification rejects invalid location
  {
    const forged = await verifyGoogleLocation('invalid_token', 'accounts/99/locations/fake')
    const bizC = await prisma.business.findFirst({ where: { orgId: tenantC.org.id } })
    if (bizC) {
      await prisma.business.update({ where: { id: bizC.id }, data: { googleLocationId: 'accounts/99/locations/42', googleLocationVerified: true, googleSyncStatus: 'pending' } })
      const updated = await prisma.business.findUnique({ where: { id: bizC.id } })
      assert(forged === null && updated?.googleLocationVerified === true && updated.googleLocationId === 'accounts/99/locations/42', 'Location: server verification rejects forged IDs; verified location persists to DB')
      await prisma.business.update({ where: { id: bizC.id }, data: { googleLocationVerified: false, googleLocationId: null, googleSyncStatus: null } })
    } else {
      assert(false, 'TenantC business must exist for location verification test')
    }
  }

  // DOMAIN 7 - INITIAL SYNC (22-25)
  console.log('-- DOMAIN 7: Initial Sync')

  // [22] No location selected -> cannot sync
  {
    const dr = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: false, googleLocationVerified: false, initialSyncCompleted: false, googleSyncStatus: 'not_started', realGoogleReviewCount: 0 })
    assert(dr.isReady === false && dr.actionRequired === 'Select your business location', 'Sync: no location selected -> actionRequired=Select your business location')
  }

  // [23] syncing status -> not_ready, completed -> ready
  {
    const syncing = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: false, googleSyncStatus: 'syncing', realGoogleReviewCount: 0 })
    const completed = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: true, googleSyncStatus: 'completed', realGoogleReviewCount: 0 })
    assert(syncing.isReady === false && syncing.headline === 'Sync In Progress' && completed.isReady === true, 'Sync: transitions syncing->not_ready, completed->ready')
  }

  // [24] failed sync -> safe recovery state
  {
    const failed = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: false, googleSyncStatus: 'failed', realGoogleReviewCount: 0 })
    assert(failed.isReady === false && failed.headline === 'Sync Failed' && failed.actionRequired === 'Retry initial sync', 'Sync: failed -> Sync Failed headline + Retry initial sync action')
  }

  // [25] Review upsert collision prevention (unique constraint on source+externalId)
  {
    const bizA = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })
    const bizC = await prisma.business.findFirst({ where: { orgId: tenantC.org.id } })
    if (bizA && bizC) {
      const extId = `ext_col206_${Date.now()}`
      await prisma.review.create({ data: { businessId: bizA.id, source: ReviewSource.GOOGLE, externalId: extId, author: 'A', rating: 5, text: 'Great', draftStatus: 'NONE' } })
      let crossCreated = false
      try { await prisma.review.create({ data: { businessId: bizC.id, source: ReviewSource.GOOGLE, externalId: extId, author: 'C', rating: 4, text: 'Also great', draftStatus: 'NONE' } }); crossCreated = true } catch {}
      const existing = await prisma.review.findUnique({ where: { source_externalId: { source: ReviewSource.GOOGLE, externalId: extId } } })
      assert(!crossCreated && existing?.businessId === bizA.id, 'Sync: cross-tenant externalId collision blocked by DB unique constraint')
      await prisma.review.delete({ where: { id: existing!.id } }).catch(() => {})
    } else { assert(false, 'businesses must exist for collision test') }
  }

  // DOMAIN 8 - READINESS / DASHBOARD GATE (26-30)
  console.log('-- DOMAIN 8: Readiness / Dashboard Gate')

  // [26] No session -> not_ready
  {
    const dr = resolveDashboardReadiness({ hasSession: false, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: true, googleSyncStatus: 'completed', realGoogleReviewCount: 5 })
    assert(dr.isReady === false, 'Gate: no session -> not_ready')
  }

  // [27] Token without location -> not_ready regardless of review count
  {
    const dr = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: false, googleLocationVerified: false, initialSyncCompleted: false, googleSyncStatus: 'not_started', realGoogleReviewCount: 100 })
    assert(dr.isReady === false, 'Gate: token-only (no location) -> not_ready even with 100 reviews')
  }

  // [28] Sync in progress -> not_ready
  {
    const dr = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: false, googleSyncStatus: 'syncing', realGoogleReviewCount: 50 })
    assert(dr.isReady === false, 'Gate: syncing status -> not_ready even with 50 reviews')
  }

  // [29] POST action:complete on unready org -> redirectTo=/onboarding
  {
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'complete' }, cookie }))
    const json = await res.json()
    assert(res.status === 200 && json.redirectTo === '/onboarding' && json.onboardingCompleted === false, 'Gate: action:complete on unready org -> redirectTo=/onboarding, onboardingCompleted=false')
  }

  // [30] Unauthenticated dashboard GET returns 401
  {
    const { GET } = await import('../src/app/api/dashboard/route')
    const res = await GET(makeRequest('/api/dashboard'))
    assert(res.status === 401, 'Gate: unauthenticated dashboard GET -> 401')
  }

  // DOMAIN 9 - RECOVERY / ERROR STATES (31-33)
  console.log('-- DOMAIN 9: Recovery / Error States')

  // [31] Revoked connection detected from sync error pattern via GET /api/onboarding
  {
    const bizA = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })
    if (bizA) {
      await prisma.business.update({ where: { id: bizA.id }, data: { googleSyncStatus: 'failed', googleSyncError: 'Google token expired -- please reconnect your account.' } })
      const token = await prisma.oAuthToken.create({
        data: {
          businessId: bizA.id,
          provider: 'google',
          accessTokenEnc: encrypt('fake_access'),
          refreshTokenEnc: encrypt('fake_refresh'),
          expiresAt: new Date(Date.now() - 3600_000),
          scopes: 'business.manage',
        },
      })
      const { GET } = await import('../src/app/api/onboarding/route')
      const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
      const res = await GET(makeRequest('/api/onboarding', { cookie }))
      const json = await res.json()
      const googleHealth = json.integrationHealth?.find((i: any) => i.provider === 'google')
      assert(res.status === 200 && json.onboardingStatus?.googleConnectionHealthy === false && googleHealth?.actionRequired === 'reconnect', 'Recovery: expired/revoked token detected via GET /api/onboarding (googleConnectionHealthy=false, actionRequired=reconnect)')
      await prisma.oAuthToken.delete({ where: { id: token.id } }).catch(() => {})
      await prisma.business.update({ where: { id: bizA.id }, data: { googleSyncStatus: null, googleSyncError: null } })
    } else { assert(false, 'TenantA business exists for revoked connection test') }
  }

  // [32] getBusinessDashboardReadiness(null) -> not_ready
  {
    const dr = await getBusinessDashboardReadiness(null, true)
    assert(dr.isReady === false && dr.googleConnected === false, 'Recovery: null business -> not_ready, googleConnected=false')
  }

  // [33] Empty business name -> hasBusiness=false -> not_ready
  {
    const dr = await getBusinessDashboardReadiness({ id: 'x', name: '', googleLocationId: null, googleLocationVerified: false, googleSyncStatus: 'completed', googleSyncError: null }, true)
    assert(dr.isReady === false, 'Recovery: empty business name treated as hasBusiness=false -> not_ready')
  }

  // DOMAIN 10 - TENANT / SECURITY ISOLATION (34-38)
  console.log('-- DOMAIN 10: Tenant/Security Isolation')

  // [34] Tenant A cannot read Tenant B's data via businessId param
  {
    const { GET } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const bizB = await prisma.business.findFirst({ where: { orgId: tenantB.org.id } })
    const res = await GET(makeRequest(`/api/onboarding?businessId=${bizB?.id}`, { cookie }))
    const json = await res.json()
    const leaksTenantB = json.organization?.id === tenantB.org.id
    assert(!leaksTenantB && (res.status === 403 || json.organization?.id === tenantA.org.id), 'Isolation: Tenant A cannot read Tenant B org via businessId param')
  }

  // [35] assertBusinessOwnership correctly rejects cross-tenant business
  {
    const bizA = await prisma.business.findFirst({ where: { orgId: tenantA.org.id } })
    const bizB = await prisma.business.findFirst({ where: { orgId: tenantB.org.id } })
    const fakeCtx = { user: { id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan }, orgId: tenantA.org.id, businessIds: bizA ? [bizA.id] : [], allOrgBusinessIds: bizA ? [bizA.id] : [], isOrgAdmin: true }
    const denied = assertBusinessOwnership(fakeCtx, bizB?.id || 'nonexistent')
    assert(denied !== null && denied.status === 403, 'Isolation: assertBusinessOwnership returns 403 for cross-tenant business')
  }

  // [36] Dashboard refuses cross-tenant businessId
  {
    const { GET } = await import('../src/app/api/dashboard/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const bizB = await prisma.business.findFirst({ where: { orgId: tenantB.org.id } })
    const res = await GET(makeRequest(`/api/dashboard?businessId=${bizB?.id}`, { cookie }))
    assert(res.status === 403, 'Isolation: dashboard refuses cross-tenant businessId -> 403')
  }

  // [37] Client-supplied orgId in body is ignored (server-authoritative)
  {
    const { POST } = await import('../src/app/api/onboarding/route')
    const cookie = await makeSessionCookie({ id: tenantA.user.id, email: tenantA.user.email, name: tenantA.user.name, role: Role.OWNER, orgId: tenantA.org.id, orgName: tenantA.org.name, orgPlan: tenantA.org.plan })
    const res = await POST(makeRequest('/api/onboarding', { method: 'POST', body: { action: 'set-step', step: 2, orgId: tenantB.org.id }, cookie }))
    const orgB = await prisma.organization.findUnique({ where: { id: tenantB.org.id } })
    assert(res.status === 200 && orgB?.onboardingStep !== 2, 'Isolation: client-supplied orgId in body is ignored; server uses session orgId')
    await prisma.organization.update({ where: { id: tenantA.org.id }, data: { onboardingStep: 1 } })
  }

  // [38] Unauthenticated onboarding GET -> 401 (no data leak)
  {
    const { GET } = await import('../src/app/api/onboarding/route')
    const res = await GET(makeRequest('/api/onboarding'))
    const json = await res.json()
    assert(res.status === 401 && json.code === 'UNAUTHORIZED', 'Isolation: unauthenticated onboarding GET -> 401 UNAUTHORIZED, no data leak')
  }

  // DOMAIN 11 - ZERO-REVIEW READINESS (39-40)
  console.log('-- DOMAIN 11: Zero-Review Readiness')

  // [39] Zero reviews + completed sync -> isReady=true
  {
    const dr = resolveDashboardReadiness({ hasSession: true, hasBusiness: true, googleOAuthConnected: true, googleConnectionHealthy: true, googleLocationSelected: true, googleLocationVerified: true, initialSyncCompleted: true, googleSyncStatus: 'completed', realGoogleReviewCount: 0 })
    assert(dr.isReady === true && dr.realGoogleReviewCount === 0 && dr.message.includes('0 Google reviews found'), 'Zero-review: 0 reviews + completed -> isReady=true with "0 Google reviews found"')
  }

  // [40] DB-backed completed sync + zero real reviews -> ready
  {
    const tenantZ = await provisionTenant({ name: 'TenantZero' })
    const bizZ = await prisma.business.findFirst({ where: { orgId: tenantZ.org.id } })
    if (bizZ) {
      await prisma.business.update({ where: { id: bizZ.id }, data: { name: 'Zero Biz', googleLocationId: 'accounts/9/locations/7', googleLocationVerified: true, googleSyncStatus: 'completed', googleSyncError: null } })
      try {
        await prisma.oAuthToken.create({ data: { businessId: bizZ.id, provider: 'google', accessTokenEnc: encrypt('fake_access'), refreshTokenEnc: encrypt('fake_refresh'), expiresAt: new Date(Date.now() + 3600_000), scopes: 'business.manage' } })
      } catch {}
      const fresh = await prisma.business.findUnique({ where: { id: bizZ.id } })
      const dr = await getBusinessDashboardReadiness(fresh, true)
      assert(dr.isReady === true && dr.realGoogleReviewCount === 0, 'Zero-review: DB-backed business with completed sync and 0 real reviews -> isReady=true')
    } else { assert(false, 'TenantZero business must exist') }
  }

  // SUMMARY
  await cleanup()
  console.log('\n=============================================================')
  console.log(` JOB-20.6 TEST SUITE RESULTS: ${passCount} PASSED, ${failCount} FAILED`)
  console.log('=============================================================')
  if (failCount > 0) { failures.forEach(f => console.error(f)); process.exit(1) }
  else { console.log('\nAll assertions passed.'); process.exit(0) }
}

main().catch(err => { console.error('[JOB-20.6] Error:', err); cleanup().finally(() => process.exit(1)) })

// scripts/test-admin-config.ts — Unit & integration verification for ADMIN-001 Platform Admin Authorization

import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminCheckResult } from '../src/lib/admin-auth'
import { db } from '../src/lib/db'
import { Role } from '@prisma/client'
import { SignJWT } from 'jose'

const SECRET_KEY = process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars'
const secret = new TextEncoder().encode(SECRET_KEY)

async function createTestSessionToken(user: { id: string; email: string; role: Role }) {
  return await new SignJWT({
    id: user.id,
    email: user.email,
    name: 'Test Admin',
    role: user.role,
    orgId: 'org_test',
    orgName: 'Test Org',
    orgPlan: 'ENTERPRISE',
    sessionVersion: 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000))
    .setSubject(user.id)
    .sign(secret)
}

async function createAuthenticatedRequest(user: { id: string; email: string; role: Role }) {
  const token = await createTestSessionToken(user)
  const req = new NextRequest('http://localhost:3000/api/admin', {
    headers: {
      cookie: `rr_session=${token}`,
    },
  })
  return req
}

async function runAdminTests() {
  console.log('=================================================================')
  console.log('ADMIN-001 — PLATFORM ADMIN AUTHORIZATION CONFIGURATION TEST')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function verify(id: string, name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [${id}] PASS: ${name}`)
      passed++
    } else {
      console.error(`  ✗ [${id}] FAIL: ${name}${details ? ` -> ${details}` : ''}`)
      failed++
    }
  }

  const rootDir = process.cwd()

  // --- TEST GROUP 1: Code & Route Invariant Verification ---
  console.log('--- TEST GROUP 1: Protected Admin Route File Scans ---')

  const adminRoutes = [
    'src/app/api/admin/route.ts',
    'src/app/api/admin/audit-log/route.ts',
    'src/app/api/admin/broadcast/route.ts',
    'src/app/api/admin/extend-trial/route.ts',
  ]

  for (let i = 0; i < adminRoutes.length; i++) {
    const routeFile = adminRoutes[i]
    const fullPath = path.join(rootDir, routeFile)
    const exists = fs.existsSync(fullPath)
    verify(`FILE-00${i + 1}`, `${routeFile} exists`, exists)

    if (exists) {
      const content = fs.readFileSync(fullPath, 'utf8')
      const callsRequireAdmin = content.includes('requireAdmin(request)') || content.includes('requireAdmin(')
      verify(`AUTH-GATE-00${i + 1}`, `${routeFile} strictly invokes requireAdmin()`, callsRequireAdmin)
    }
  }

  // --- TEST GROUP 2: requireAdmin Logic & Authorization Branches ---
  console.log('\n--- TEST GROUP 2: Authorization Branches & Fail-Closed Matrix ---')

  const unauthRequest = new NextRequest('http://localhost:3000/api/admin')

  // Save original environment & db user findUnique
  const originalAdminEmails = process.env.ADMIN_EMAILS
  const originalFindUnique = db.user.findUnique

  // Setup mock db.user.findUnique to return simulated user
  let activeMockUser: any = null
  db.user.findUnique = (async ({ where }: any) => {
    if (activeMockUser && (where.id === activeMockUser.id || where.email === activeMockUser.email)) {
      return {
        id: activeMockUser.id,
        email: activeMockUser.email,
        name: activeMockUser.name,
        sessionVersion: 1,
        memberships: [
          {
            role: activeMockUser.role,
            org: { id: 'org_test', name: 'Test Org', plan: 'ENTERPRISE' },
          },
        ],
      }
    }
    return null
  }) as any

  try {
    // 1. Unauthenticated request (no session cookie)
    activeMockUser = null
    delete process.env.ADMIN_EMAILS
    const unauthRes = (await requireAdmin(unauthRequest)) as NextResponse
    const unauthBody = await unauthRes.json()
    verify('UNAUTH-001', 'Unauthenticated request returns HTTP 401', unauthRes.status === 401)
    verify('UNAUTH-002', 'Unauthenticated response returns code UNAUTHORIZED', unauthBody.code === 'UNAUTHORIZED')

    // 2. Authenticated user but ADMIN_EMAILS is undefined / unset
    activeMockUser = {
      id: 'usr_1',
      email: 'owner@bamboogarden.com',
      name: 'Owner',
      role: Role.OWNER,
    }
    const authReq1 = await createAuthenticatedRequest(activeMockUser)
    delete process.env.ADMIN_EMAILS
    const unsetRes = (await requireAdmin(authReq1)) as NextResponse
    const unsetBody = await unsetRes.json()
    verify('UNSET-001', 'Unset ADMIN_EMAILS fails closed returning HTTP 403', unsetRes.status === 403)
    verify('UNSET-002', 'Unset ADMIN_EMAILS returns code ADMINS_NOT_CONFIGURED', unsetBody.code === 'ADMINS_NOT_CONFIGURED')

    // 3. ADMIN_EMAILS is empty string
    process.env.ADMIN_EMAILS = ''
    const emptyRes = (await requireAdmin(authReq1)) as NextResponse
    const emptyBody = await emptyRes.json()
    verify('EMPTY-001', 'Empty ADMIN_EMAILS="" fails closed returning HTTP 403', emptyRes.status === 403)
    verify('EMPTY-002', 'Empty ADMIN_EMAILS returns code ADMINS_NOT_CONFIGURED', emptyBody.code === 'ADMINS_NOT_CONFIGURED')

    // 4. ADMIN_EMAILS is whitespace only
    process.env.ADMIN_EMAILS = '   '
    const wsRes = (await requireAdmin(authReq1)) as NextResponse
    const wsBody = await wsRes.json()
    verify('WS-001', 'Whitespace ADMIN_EMAILS="   " fails closed returning HTTP 403', wsRes.status === 403)
    verify('WS-002', 'Whitespace ADMIN_EMAILS returns code ADMINS_NOT_CONFIGURED', wsBody.code === 'ADMINS_NOT_CONFIGURED')

    // 5. ADMIN_EMAILS is commas / empty entries only (e.g. ", , , ")
    process.env.ADMIN_EMAILS = ', , , '
    const commasRes = (await requireAdmin(authReq1)) as NextResponse
    const commasBody = await commasRes.json()
    verify('COMMAS-001', 'Invalid commas ADMIN_EMAILS=", , , " fails closed returning HTTP 403', commasRes.status === 403)
    verify('COMMAS-002', 'Invalid commas ADMIN_EMAILS returns code ADMINS_NOT_CONFIGURED', commasBody.code === 'ADMINS_NOT_CONFIGURED')

    // 6. Authenticated user NOT in allowlist
    process.env.ADMIN_EMAILS = 'admin@reviewreply.pw, ops@reviewreply.pw'
    activeMockUser = {
      id: 'usr_2',
      email: 'attacker@evil.com',
      name: 'Attacker',
      role: Role.STAFF,
    }
    const authReqNonAdmin = await createAuthenticatedRequest(activeMockUser)
    const nonAdminRes = (await requireAdmin(authReqNonAdmin)) as NextResponse
    const nonAdminBody = await nonAdminRes.json()
    verify('NOTADMIN-001', 'Non-admin user returns HTTP 403', nonAdminRes.status === 403)
    verify('NOTADMIN-002', 'Non-admin response returns code NOT_ADMIN', nonAdminBody.code === 'NOT_ADMIN')

    // 7. Authenticated user IN allowlist (exact match)
    activeMockUser = {
      id: 'usr_admin',
      email: 'admin@reviewreply.pw',
      name: 'Primary Admin',
      role: Role.ADMIN,
    }
    const authReqAdmin = await createAuthenticatedRequest(activeMockUser)
    const authAdminRes = await requireAdmin(authReqAdmin)
    verify('AUTH-001', 'Allowlisted admin passes requireAdmin check', (authAdminRes as AdminCheckResult).ok === true)
    verify('AUTH-002', 'Allowlisted admin returns matched SessionUser', (authAdminRes as AdminCheckResult).user?.email === 'admin@reviewreply.pw')

    // 8. Case-insensitive matching (user email uppercase, env lowercase)
    activeMockUser = {
      id: 'usr_case1',
      email: 'ADMIN@REVIEWREPLY.PW',
      name: 'Upper Admin',
      role: Role.ADMIN,
    }
    const authReqCase1 = await createAuthenticatedRequest(activeMockUser)
    const caseMatchRes1 = await requireAdmin(authReqCase1)
    verify('CASE-001', 'Case-insensitive matching (UPPERCASE user email)', (caseMatchRes1 as AdminCheckResult).ok === true)

    // 9. Case-insensitive matching (env mixed case, user lowercase)
    process.env.ADMIN_EMAILS = 'Ops-Lead@ReviewReply.PW, Founder@Domain.IO'
    activeMockUser = {
      id: 'usr_case2',
      email: 'ops-lead@reviewreply.pw',
      name: 'Ops Lead',
      role: Role.ADMIN,
    }
    const authReqCase2 = await createAuthenticatedRequest(activeMockUser)
    const caseMatchRes2 = await requireAdmin(authReqCase2)
    verify('CASE-002', 'Case-insensitive matching (Mixed-case ADMIN_EMAILS)', (caseMatchRes2 as AdminCheckResult).ok === true)

    // 10. Whitespace tolerance in ADMIN_EMAILS list
    process.env.ADMIN_EMAILS = '  first@admin.com  ,   second@admin.com   '
    activeMockUser = {
      id: 'usr_trim',
      email: 'second@admin.com',
      name: 'Second Admin',
      role: Role.ADMIN,
    }
    const authReqTrim = await createAuthenticatedRequest(activeMockUser)
    const wsListRes = await requireAdmin(authReqTrim)
    verify('TRIM-001', 'Whitespace-trimmed multi-admin list matches correctly', (wsListRes as AdminCheckResult).ok === true)

  } finally {
    // Restore environment & mocked functions
    if (originalAdminEmails !== undefined) {
      process.env.ADMIN_EMAILS = originalAdminEmails
    } else {
      delete process.env.ADMIN_EMAILS
    }
    db.user.findUnique = originalFindUnique
  }

  // Summary
  console.log('\n=================================================================')
  console.log(`ADMIN AUTHORIZATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runAdminTests().catch(err => {
  console.error('Test execution failed:', err)
  process.exit(1)
})

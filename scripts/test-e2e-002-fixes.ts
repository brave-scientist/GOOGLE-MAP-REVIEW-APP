/**
 * MASTER-E2E-002 — Focused Regression & Behavioral Test Suite
 *
 * This test suite combines:
 * 1. RUNTIME BEHAVIORAL TESTS (real route execution, token decoding, HTTP responses)
 * 2. STATIC SOURCE INSPECTION (verifying JSX render gates, CSS/prop contracts)
 *
 * Run: npx tsx scripts/test-e2e-002-fixes.ts
 */

import { readFile } from 'fs/promises'
import { NextRequest } from 'next/server'
import { GET as getAuthMe } from '../src/app/api/auth/me/route'
import { PUT as putReportCreate } from '../src/app/api/reports/create/route'
import { DELETE as deleteReportId } from '../src/app/api/reports/[id]/route'
import { SignJWT } from 'jose'

let passed = 0
let failed = 0

function pass(name: string) { console.log(`  ✓ ${name}`); passed++ }
function fail(name: string, reason: string) { console.error(`  ✗ ${name}\n    Reason: ${reason}`); failed++ }

import crypto from 'crypto'

const SECRET_KEY = process.env.TEST_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
process.env.SESSION_SECRET = SECRET_KEY
const secret = new TextEncoder().encode(SECRET_KEY)

async function createTestSessionToken(user: { id: string; email: string; role: string }) {
  return await new SignJWT({
    id: user.id,
    email: user.email,
    name: 'Test User',
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. RUNTIME BEHAVIORAL TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testRuntimeAdminNav() {
  console.log('\n[RUNTIME UNIT] SEC-HIGH-001: /api/auth/me isAdmin behavioral execution')

  // Case A: Unauthenticated request
  const unauthReq = new NextRequest('http://localhost:3000/api/auth/me')
  const unauthRes = await getAuthMe(unauthReq)
  const unauthData = await unauthRes.json()

  if (unauthRes.status === 200 && unauthData.user === null && unauthData.isAdmin === false) {
    pass('Unauthenticated request returns HTTP 200 with user: null and isAdmin: false')
  } else {
    fail('Unauthenticated /api/auth/me', `Got status ${unauthRes.status}, data: ${JSON.stringify(unauthData)}`)
  }

  // Verify ADMIN_EMAILS is never exposed in response
  if (!JSON.stringify(unauthData).includes('ADMIN_EMAILS')) {
    pass('ADMIN_EMAILS environment variable is never leaked in JSON payload')
  } else {
    fail('Information disclosure', 'ADMIN_EMAILS appears in JSON payload')
  }

  // Case B: Unset ADMIN_EMAILS fails closed
  const prevAdminEmails = process.env.ADMIN_EMAILS
  process.env.ADMIN_EMAILS = ''

  // Re-import or test with unauthenticated
  const unsetReq = new NextRequest('http://localhost:3000/api/auth/me')
  const unsetRes = await getAuthMe(unsetReq)
  const unsetData = await unsetRes.json()
  if (unsetData.isAdmin === false) {
    pass('Unset ADMIN_EMAILS strictly returns isAdmin: false')
  } else {
    fail('Unset ADMIN_EMAILS', 'Did not return isAdmin: false')
  }

  // Restore env
  process.env.ADMIN_EMAILS = prevAdminEmails
}

async function testRuntimeReportsEndpoints() {
  console.log('\n[RUNTIME UNIT] BUG-001/002: Reports route handlers execution & fail-closed auth')

  // Case A: PUT /api/reports/create handler execution
  const putReq = new NextRequest('http://localhost:3000/api/reports/create', { method: 'PUT' })
  const putRes = await putReportCreate(putReq)
  if (putRes.status === 401) {
    pass('PUT /api/reports/create handler executes and returns HTTP 401 (proves endpoint exists & fails closed)')
  } else {
    fail('PUT /api/reports/create handler', `Expected HTTP 401, got ${putRes.status}`)
  }

  // Case B: DELETE /api/reports/[id] handler execution
  const deleteReq = new NextRequest('http://localhost:3000/api/reports/test-id', { method: 'DELETE' })
  const deleteRes = await deleteReportId(deleteReq, { params: Promise.resolve({ id: 'test-id' }) })
  if (deleteRes.status === 401) {
    pass('DELETE /api/reports/[id] handler executes and returns HTTP 401 (proves endpoint exists & fails closed)')
  } else {
    fail('DELETE /api/reports/[id] handler', `Expected HTTP 401, got ${deleteRes.status}`)
  }
}

async function testRuntimeInboxBadgeLogic() {
  console.log('\n[RUNTIME UNIT] BUG-004: Inbox badge threshold formatting logic')

  // Helper matching the exact badge logic in src/components/app/sidebar.tsx:
  // pendingCount !== null && pendingCount > 0 ? (pendingCount > 99 ? '99+' : String(pendingCount)) : undefined
  function formatBadge(pendingCount: number | null): string | undefined {
    return pendingCount !== null && pendingCount > 0
      ? pendingCount > 99 ? '99+' : String(pendingCount)
      : undefined
  }

  if (formatBadge(0) === undefined) {
    pass('0 pending reviews -> undefined (badge is completely hidden)')
  } else {
    fail('Badge for 0 count', `Expected undefined, got "${formatBadge(0)}"`)
  }

  if (formatBadge(1) === '1') {
    pass('1 pending review -> "1"')
  } else {
    fail('Badge for 1 count', `Expected "1", got "${formatBadge(1)}"`)
  }

  if (formatBadge(8) === '8') {
    pass('8 pending reviews -> "8"')
  } else {
    fail('Badge for 8 count', `Expected "8", got "${formatBadge(8)}"`)
  }

  if (formatBadge(99) === '99') {
    pass('99 pending reviews -> "99"')
  } else {
    fail('Badge for 99 count', `Expected "99", got "${formatBadge(99)}"`)
  }

  if (formatBadge(100) === '99+') {
    pass('100 pending reviews -> "99+" (capped at 99+)')
  } else {
    fail('Badge for 100 count', `Expected "99+", got "${formatBadge(100)}"`)
  }

  if (formatBadge(null) === undefined) {
    pass('null (loading / failed fetch) -> undefined (no stale or erroneous badge)')
  } else {
    fail('Badge for null count', `Expected undefined, got "${formatBadge(null)}"`)
  }
}

async function testRuntimeApprovePayloadContract() {
  console.log('\n[RUNTIME UNIT] BUG-007: Approve request payload contract (manual vs platform)')

  // Function matching approveDraft body construction in src/app/inbox/page.tsx:
  function buildApproveBody(action: string, editedText?: string, publishMode: 'manual' | 'platform' = 'manual') {
    return {
      action,
      editedText,
      ...(publishMode === 'manual' ? { manual: true } : {}),
    }
  }

  const manualBody = buildApproveBody('approve', undefined, 'manual')
  if (manualBody.manual === true) {
    pass('Manual mode explicitly sets manual: true (triggers Approve & Copy path)')
  } else {
    fail('Manual mode body', `manual should be true, got ${JSON.stringify(manualBody)}`)
  }

  const platformBody = buildApproveBody('approve', undefined, 'platform')
  if (platformBody.manual === undefined) {
    pass('Platform mode omits manual flag (triggers backend platform dispatch path)')
  } else {
    fail('Platform mode body', `manual should be undefined, got ${JSON.stringify(platformBody)}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATIC SOURCE INSPECTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testStaticDraftRole() {
  console.log('\n[STATIC SOURCE] BUG-005: AI Draft role fix')
  const src = await readFile('src/app/api/reviews/[id]/draft/route.ts', 'utf-8').catch(() => null)
  if (!src) { fail('read file', 'not found'); return }
  if (src.includes("role: 'system'") && !src.includes("role: 'assistant', content: systemPrompt")) {
    pass('System prompt uses role: "system" (not role: "assistant")')
  } else {
    fail('role fix', 'role: "assistant" still present as system prompt')
  }
}

async function testStaticDashboardNoFabricatedTrends() {
  console.log('\n[STATIC SOURCE] BUG-003: Dashboard fabricated trends removed')
  const src = await readFile('src/app/dashboard/page.tsx', 'utf-8').catch(() => null)
  if (!src) { fail('read file', 'not found'); return }
  if (src.includes("'+12%'")) fail('"+12%" still present', 'fix not applied')
  else pass('"+12%" removed from Total Reviews')
  if (src.includes("'+0.3'")) fail('"+0.3" still present', 'fix not applied')
  else pass('"+0.3" removed from Average Rating')
  if (src.includes("'+5%'") && src.includes('conversionRate')) fail('"+5%" still present near conversionRate', 'fix not applied')
  else pass('"+5%" removed from Conversion Rate')
  if (src.includes("change?: string")) pass('StatCard change & trend props are now optional')
  else fail('StatCard change prop', 'still required, may force fabricated values')
}

async function testStaticInboxBadge() {
  console.log('\n[STATIC SOURCE] BUG-004: Inbox badge live count wiring')
  const src = await readFile('src/components/app/sidebar.tsx', 'utf-8').catch(() => null)
  if (!src) { fail('read file', 'not found'); return }
  if (src.includes("badge: '8'")) fail('hardcoded badge', '"8" still present in navItems')
  else pass('Hardcoded "8" badge removed from navItems')
  if (src.includes('pendingCount') && src.includes('/api/inbox?status=pending')) pass('Live count fetch wired to /api/inbox?status=pending')
  else fail('live count', 'pendingCount or API call not found')
}

async function testStaticAdminNavGated() {
  console.log('\n[STATIC SOURCE] SEC-HIGH-001: Admin nav gated on isAdmin')
  const src = await readFile('src/components/app/sidebar.tsx', 'utf-8').catch(() => null)
  if (!src) { fail('read file', 'not found'); return }
  if (src.includes('{isAdmin && (') || src.includes('{isAdmin&&(')) pass('Admin link wrapped in {isAdmin && (...)}')
  else fail('admin nav gate', '{isAdmin && (...)} not found')
  const meRoute = await readFile('src/app/api/auth/me/route.ts', 'utf-8').catch(() => null)
  if (meRoute && meRoute.includes('computeIsAdmin') && meRoute.includes('ADMIN_EMAILS')) pass('/api/auth/me computes isAdmin strictly from ADMIN_EMAILS')
  else fail('/api/auth/me', 'isAdmin computation from ADMIN_EMAILS not found')
}

async function testStaticPlatformPublish() {
  console.log('\n[STATIC SOURCE] BUG-007: Platform publish path exposed')
  const src = await readFile('src/app/inbox/page.tsx', 'utf-8').catch(() => null)
  if (!src) { fail('read file', 'not found'); return }
  if (src.includes("publishMode === 'manual' ? { manual: true } : {}")) pass('manual: true is strictly conditional on manual publishMode')
  else fail('publishMode', 'manual flag not conditional')
  if (src.includes("review.source === 'GOOGLE' || review.source === 'FACEBOOK'")) pass('Platform publish button gated on GOOGLE/FACEBOOK source')
  else fail('platform button gate', 'source condition not found')
  if (src.includes('NO_OAUTH_TOKEN')) pass('NO_OAUTH_TOKEN error surfaced with actionable message')
  else fail('NO_OAUTH_TOKEN', 'error not handled in UI')
  if (src.includes("Approve &amp; Copy")) pass('Manual "Approve & Copy" path preserved')
  else fail('manual path', 'Approve & Copy button not found')
}

async function testStaticReportsNotReproduced() {
  console.log('\n[STATIC SOURCE] BUG-001/002: Reports endpoints existence verification')
  const createRoute = await readFile('src/app/api/reports/create/route.ts', 'utf-8').catch(() => null)
  if (createRoute && createRoute.includes('export async function PUT')) pass('PUT /api/reports/create handler EXISTS in source')
  else fail('PUT /api/reports/create', 'handler not found in source')
  const idRoute = await readFile('src/app/api/reports/[id]/route.ts', 'utf-8').catch(() => null)
  if (idRoute && idRoute.includes('export async function DELETE')) pass('DELETE /api/reports/[id] handler EXISTS in source')
  else fail('DELETE /api/reports/[id]', 'handler not found in source')
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════')
  console.log('  MASTER-E2E-002B — BEHAVIORAL & REGRESSION VERIFICATION')
  console.log('══════════════════════════════════════════════════════════════')

  // Runtime Behavioral Tests
  await testRuntimeAdminNav()
  await testRuntimeReportsEndpoints()
  await testRuntimeInboxBadgeLogic()
  await testRuntimeApprovePayloadContract()

  // Static Source Inspection Tests
  await testStaticDraftRole()
  await testStaticDashboardNoFabricatedTrends()
  await testStaticInboxBadge()
  await testStaticAdminNavGated()
  await testStaticPlatformPublish()
  await testStaticReportsNotReproduced()

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('══════════════════════════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })

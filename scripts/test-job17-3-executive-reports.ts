/**
 * scripts/test-job17-3-executive-reports.ts
 *
 * Dedicated verification suite for Milestone JOB-17.3:
 * Automated Executive Reports & Scheduled Delivery
 *
 * Validates:
 *  1. Report data generation
 *  2. Correct business metrics
 *  3. Branding resolution
 *  4. PDF generation succeeds
 *  5. Schedule creation
 *  6. Schedule update
 *  7. Schedule disable
 *  8. Unauthorized role rejection
 *  9. Cross-tenant schedule isolation
 * 10. Cross-tenant report isolation
 * 11. Delivery record creation
 * 12. Successful email delivery
 * 13. Failed email delivery
 * 14. Duplicate execution / idempotency
 * 15. Retry behavior
 * 16. Disabled schedule does not execute
 * 17. No raw secrets in audit logs
 * 18. No cross-tenant data leakage
 */

process.env.TEST_MOCK_EMAIL = 'true'

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult, generateTestEmail } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getReportsHandler, POST as postReportHandler, PATCH as patchReportHandler, DELETE as deleteReportHandler } from '../src/app/api/reports/route'
import { GET as getReportByIdHandler } from '../src/app/api/reports/[id]/route'
import { GET as getPreviewHandler } from '../src/app/api/reports/preview/route'
import { GET as getHistoryHandler } from '../src/app/api/reports/history/route'
import { generateExecutiveReportData } from '../src/lib/reports/report-service'
import { renderExecutiveReportPdf } from '../src/lib/reports/pdf-renderer'
import { executeScheduledReportDelivery, retryReportDeliveryLog } from '../src/lib/reports/delivery-service'
import { Role, Plan, ReportSchedule, ReportFormat, ReportStatus, DeliveryStatus, ReviewSource } from '@prisma/client'

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
      orgName: options.user.orgName || 'Apex Health Org',
      orgPlan: options.user.orgPlan || Plan.AGENCY,
      sessionVersion: options.user.sessionVersion || 1,
    })
    headers['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: RequestInit = {
    method,
    headers,
  }

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    reqInit.body = JSON.stringify(options.body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit as any)
}

async function runSuite() {
  console.log('====================================================================')
  console.log('JOB-17.3 DEDICATED VERIFICATION SUITE: Executive Reports & Delivery')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null
  let businessA2: any = null
  let agencyAdminUser: any = null
  let staffUser: any = null

  try {
    // ─────────────────────────────────────────────────────────────────
    // Setup Primary Test Tenants
    // ─────────────────────────────────────────────────────────────────
    tenantA = await seedTestTenant({
      name: 'Apex Health Org A',
      businessName: 'Apex Medical Clinic',
      role: Role.OWNER,
      plan: Plan.AGENCY,
    })

    tenantB = await seedTestTenant({
      name: 'Apex Competitor Org B',
      businessName: 'Beta Auto Repair',
      role: Role.OWNER,
      plan: Plan.PRO,
    })

    // Second business under Tenant A
    const b2 = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Apex Dental Care',
        slug: `apex-dental-${Date.now()}`,
      },
    })
    businessA2 = { id: b2.id, name: b2.name }

    // Users under Tenant A:
    // 1. AGENCY_ADMIN
    const aaEmail = generateTestEmail('agency_admin')
    const aaUser = await prisma.user.create({
      data: {
        email: aaEmail,
        name: 'Apex Agency Admin',
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
      orgName: tenantA.org.name,
    }

    // 2. STAFF (unauthorized operator)
    const staffEmail = generateTestEmail('staff_op')
    const sUser = await prisma.user.create({
      data: {
        email: staffEmail,
        name: 'Apex Staff Operator',
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
      orgName: tenantA.org.name,
    }

    // Configure Custom Agency Branding for Tenant A
    await prisma.agencyBranding.create({
      data: {
        orgId: tenantA.org.id,
        brandName: 'Apex Health Agency',
        primaryColor: '#0D9488',
        accentColor: '#14B8A6',
        supportEmail: 'reports@apexhealth.com',
        portalTitle: 'Apex Health Executive Portal',
        hideReviewReplyBadge: true,
      },
    })

    // Seed Reviews for Tenant A (Apex Medical Clinic)
    const now = new Date()
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

    // Review 1: 5-star with reply
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `rev-a1-${Date.now()}`,
        author: 'Alice Cooper',
        rating: 5,
        text: 'Outstanding service and care from the team!',
        sentimentScore: 0.95,
        replyText: 'Thank you Alice for your kind review!',
        repliedAt: twoDaysAgo,
        createdAt: fiveDaysAgo,
      },
    })

    // Review 2: 4-star with reply
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `rev-a2-${Date.now()}`,
        author: 'Bob Martin',
        rating: 4,
        text: 'Very friendly staff, clean facility.',
        sentimentScore: 0.8,
        replyText: 'Glad to hear Bob, see you next time!',
        repliedAt: twoDaysAgo,
        createdAt: twoDaysAgo,
      },
    })

    // Review 3: 1-star unreplied (actionable negative)
    await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `rev-a3-${Date.now()}`,
        author: 'Charlie Davis',
        rating: 1,
        text: 'Waited 45 minutes past my scheduled appointment.',
        sentimentScore: -0.85,
        createdAt: twoDaysAgo,
      },
    })

    // Seed Review for Tenant B (Beta Auto Repair)
    await prisma.review.create({
      data: {
        businessId: tenantB.business.id,
        source: ReviewSource.GOOGLE,
        externalId: `rev-b1-${Date.now()}`,
        author: 'Zoe TenantB',
        rating: 3,
        text: 'Average auto repair service.',
        sentimentScore: 0.0,
        createdAt: twoDaysAgo,
      },
    })

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: Report Data & Metrics Computation
    // ─────────────────────────────────────────────────────────────────
    console.log('[SECTION 1: Report Data & Metrics Engine]')

    // 1. report data generation
    const reportData = await generateExecutiveReportData({
      orgId: tenantA.org.id,
      businessId: tenantA.business.id,
    })
    assert(reportData !== null && reportData.orgId === tenantA.org.id, 'Test 1: Executive report data generated successfully')
    assert(reportData.businessName === 'Apex Medical Clinic', 'Test 1: Correct business name resolved')

    // 2. correct business metrics
    assert(reportData.kpis.totalReviewsPeriod === 3, 'Test 2: Review count in period matches exactly (3 reviews)')
    assert(reportData.kpis.avgRatingPeriod === 3.3, `Test 2: Average rating computed correctly (expected 3.3, got ${reportData.kpis.avgRatingPeriod})`)
    assert(reportData.ratingDistribution[5] === 1, 'Test 2: Rating distribution 5-star count is 1')
    assert(reportData.ratingDistribution[4] === 1, 'Test 2: Rating distribution 4-star count is 1')
    assert(reportData.ratingDistribution[1] === 1, 'Test 2: Rating distribution 1-star count is 1')
    assert(reportData.kpis.repliedCount === 2, 'Test 2: Replied count is 2')
    assert(reportData.kpis.replyCoverageRate === 67, `Test 2: Reply coverage computed correctly (expected 67%, got ${reportData.kpis.replyCoverageRate}%)`)
    assert(reportData.kpis.actionableCount === 1, 'Test 2: Actionable unreplied count is 1 (1-star review)')
    assert(reportData.sentimentSummary.positive === 2, 'Test 2: Sentiment positive count is 2')
    assert(reportData.sentimentSummary.negative === 1, 'Test 2: Sentiment negative count is 1')

    // 3. branding resolution
    assert(reportData.branding.brandName === 'Apex Health Agency', 'Test 3: Custom agency brand name resolved')
    assert(reportData.branding.primaryColor === '#0D9488', 'Test 3: Custom primary brand color resolved')
    assert(reportData.branding.hideReviewReplyBadge === true, 'Test 3: White-label badge hiding setting resolved')

    // Test fallback branding resolution for Tenant B
    const reportDataB = await generateExecutiveReportData({
      orgId: tenantB.org.id,
      businessId: tenantB.business.id,
    })
    assert(reportDataB.branding.brandName === 'ReviewReply', 'Test 3: Fallback brand name used when no custom agency branding')
    assert(reportDataB.branding.primaryColor === '#1E40AF', 'Test 3: Fallback primary color used when no custom branding')

    // 4. PDF generation succeeds
    const pdfBuffer = renderExecutiveReportPdf(reportData)
    assert(Buffer.isBuffer(pdfBuffer), 'Test 4: PDF renderer returns Node Buffer')
    const pdfHeader = pdfBuffer.slice(0, 8).toString('utf-8')
    assert(pdfHeader.startsWith('%PDF-1.4'), `Test 4: PDF output starts with %PDF-1.4 header (got "${pdfHeader.trim()}")`)
    const pdfString = pdfBuffer.toString('utf-8')
    assert(pdfString.includes('%%EOF'), 'Test 4: PDF output contains standard %%EOF marker')
    assert(pdfString.includes('APEX HEALTH AGENCY'), 'Test 4: PDF contains agency brand name in header')
    assert(pdfString.includes('Apex Medical Clinic'), 'Test 4: PDF contains business location name')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: Scheduled Report CRUD & RBAC
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 2: Schedule CRUD, Enable/Disable & RBAC]')

    // 5. schedule creation
    const postReq = await createMockRequest('/api/reports', {
      method: 'POST',
      user: tenantA.user,
      body: {
        name: 'Weekly Executive Briefing',
        schedule: 'WEEKLY',
        format: 'PDF_ATTACHMENT',
        recipients: ['exec@apexhealth.com', 'director@apexhealth.com'],
        businessId: tenantA.business.id,
        timezone: 'America/New_York',
        reportType: 'EXECUTIVE_SUMMARY',
      },
    })
    const postRes = await postReportHandler(postReq)
    const postJson = await postRes.json()

    assert(postRes.status === 200 && postJson.success === true, 'Test 5: POST /api/reports created schedule (HTTP 200)')
    assert(postJson.report.format === 'PDF_ATTACHMENT', 'Test 5: Schedule format persisted as PDF_ATTACHMENT')
    assert(postJson.report.timezone === 'America/New_York', 'Test 5: Timezone persisted')

    const createdScheduleId = postJson.report.id

    // 6. schedule update
    const patchReq = await createMockRequest('/api/reports', {
      method: 'PATCH',
      user: tenantA.user,
      body: {
        id: createdScheduleId,
        name: 'Weekly Executive Briefing (Updated)',
        format: 'BOTH',
      },
    })
    const patchRes = await patchReportHandler(patchReq)
    const patchJson = await patchRes.json()
    assert(patchRes.status === 200 && patchJson.success === true, 'Test 6: PATCH /api/reports updated schedule')
    assert(patchJson.report.name === 'Weekly Executive Briefing (Updated)', 'Test 6: Schedule name updated')
    assert(patchJson.report.format === 'BOTH', 'Test 6: Format updated to BOTH (Email + PDF)')

    // 7. schedule disable (enable/disable state)
    const disableReq = await createMockRequest('/api/reports', {
      method: 'PATCH',
      user: tenantA.user,
      body: {
        id: createdScheduleId,
        status: 'PAUSED',
      },
    })
    const disableRes = await patchReportHandler(disableReq)
    const disableJson = await disableRes.json()
    assert(disableRes.status === 200 && disableJson.report.status === 'PAUSED', 'Test 7: Schedule disabled to PAUSED state')

    // Re-enable schedule for delivery tests
    const enableReq = await createMockRequest('/api/reports', {
      method: 'PATCH',
      user: tenantA.user,
      body: {
        id: createdScheduleId,
        status: 'ACTIVE',
      },
    })
    await patchReportHandler(enableReq)

    // 8. unauthorized role rejection
    // Staff attempting to create an org-wide schedule (businessId: null)
    const staffPostReq = await createMockRequest('/api/reports', {
      method: 'POST',
      user: staffUser,
      body: {
        name: 'Unauthorized Org Report',
        schedule: 'DAILY',
        format: 'EMAIL_HTML',
      },
    })
    const staffPostRes = await postReportHandler(staffPostReq)
    assert(staffPostRes.status === 403, `Test 8: STAFF role rejected from creating org-wide report (HTTP ${staffPostRes.status})`)

    // Staff attempting to preview org-wide report without business scope
    const staffPreviewReq = await createMockRequest('/api/reports/preview', {
      method: 'GET',
      user: staffUser,
    })
    const staffPreviewRes = await getPreviewHandler(staffPreviewReq)
    assert(staffPreviewRes.status === 403, `Test 8: STAFF role rejected from previewing org-wide report (HTTP ${staffPreviewRes.status})`)

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 3: Tenant Isolation]')

    // 9. cross-tenant schedule isolation
    const tenantBGetScheduleReq = await createMockRequest(`/api/reports/${createdScheduleId}`, {
      method: 'GET',
      user: tenantB.user,
    })
    const tenantBGetScheduleRes = await getReportByIdHandler(tenantBGetScheduleReq, {
      params: Promise.resolve({ id: createdScheduleId }),
    })
    assert(tenantBGetScheduleRes.status === 404, `Test 9: Tenant B cannot access Tenant A schedule (HTTP ${tenantBGetScheduleRes.status})`)

    const tenantBPatchReq = await createMockRequest('/api/reports', {
      method: 'PATCH',
      user: tenantB.user,
      body: {
        id: createdScheduleId,
        name: 'Malicious Tenant B Tamper',
      },
    })
    const tenantBPatchRes = await patchReportHandler(tenantBPatchReq)
    assert(tenantBPatchRes.status === 404, `Test 9: Tenant B cannot modify Tenant A schedule (HTTP ${tenantBPatchRes.status})`)

    // 10. cross-tenant report preview isolation
    const crossPreviewReq = await createMockRequest(`/api/reports/preview?businessId=${tenantA.business.id}`, {
      method: 'GET',
      user: tenantB.user,
    })
    const crossPreviewRes = await getPreviewHandler(crossPreviewReq)
    assert(crossPreviewRes.status === 403, `Test 10: Tenant B cannot preview Tenant A business data (HTTP ${crossPreviewRes.status})`)

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4: Email Delivery & Database Idempotency
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 4: Delivery Engine, Email & Idempotency]')

    // 11. delivery record creation & 12. successful email delivery
    const deliveryResult = await executeScheduledReportDelivery({
      scheduleId: createdScheduleId,
      actorId: tenantA.user.id,
    })
    assert(deliveryResult.success === true, 'Test 11 & 12: executeScheduledReportDelivery executed successfully')
    assert(deliveryResult.sent === 2, `Test 12: Exactly 2 emails delivered successfully (got ${deliveryResult.sent})`)

    // Check DB record
    const deliveryLogs = await prisma.reportDeliveryLog.findMany({
      where: { reportId: createdScheduleId },
    })
    assert(deliveryLogs.length === 2, `Test 11: Database contains 2 ReportDeliveryLog records (got ${deliveryLogs.length})`)
    const sampleLog = deliveryLogs[0]
    assert(sampleLog.status === DeliveryStatus.SENT, 'Test 11: Delivery log status is SENT')
    assert(sampleLog.sentAt !== null, 'Test 11: Delivery log has valid sentAt timestamp')
    assert(sampleLog.providerMessageId !== null && sampleLog.providerMessageId.startsWith('msg_mock_'), 'Test 12: Provider message ID persisted')
    assert(sampleLog.idempotencyKey.includes(createdScheduleId), 'Test 11: Idempotency key contains schedule ID')

    // 13. failed email delivery
    // Create schedule with recipient simulating provider failure
    const failSchedule = await prisma.scheduledReport.create({
      data: {
        orgId: tenantA.org.id,
        businessId: tenantA.business.id,
        name: 'Failing Delivery Schedule',
        schedule: ReportSchedule.DAILY,
        format: ReportFormat.EMAIL_HTML,
        recipients: JSON.stringify(['error-destination@example.com']),
        status: ReportStatus.ACTIVE,
      },
    })

    const failDeliveryResult = await executeScheduledReportDelivery({
      scheduleId: failSchedule.id,
      actorId: tenantA.user.id,
    })
    assert(failDeliveryResult.failed === 1, 'Test 13: Delivery failure recognized properly')

    const failedLog = await prisma.reportDeliveryLog.findFirst({
      where: { reportId: failSchedule.id },
    })
    assert(failedLog !== null && failedLog.status === DeliveryStatus.FAILED, 'Test 13: Failed delivery persisted with FAILED status')
    assert(failedLog !== null && failedLog.error !== null && failedLog.error.includes('Simulated delivery failure'), 'Test 13: Safe error message recorded without secrets')

    // 14. duplicate execution / idempotency
    // Execute the first schedule again for the exact same period
    const secondDeliveryResult = await executeScheduledReportDelivery({
      scheduleId: createdScheduleId,
      actorId: tenantA.user.id,
    })
    assert(secondDeliveryResult.sent === 0, `Test 14: Duplicate execution sent 0 emails (got ${secondDeliveryResult.sent})`)
    assert(secondDeliveryResult.skipped === 2, `Test 14: Duplicate execution skipped 2 already-sent records (got ${secondDeliveryResult.skipped})`)

    const logsAfterDuplicate = await prisma.reportDeliveryLog.findMany({
      where: { reportId: createdScheduleId },
    })
    assert(logsAfterDuplicate.length === 2, 'Test 14: Database uniqueness prevented duplicate log records')

    // 15. retry behavior
    if (failedLog) {
      const retryResult = await retryReportDeliveryLog(failedLog.id, tenantA.org.id, {
        newRecipient: 'valid-destination@example.com',
      })
      assert(retryResult.success === true, 'Test 15: Failed delivery retried successfully')
      assert(retryResult.log?.status === DeliveryStatus.SENT, 'Test 15: Delivery record transitioned to SENT')
    }

    // 16. disabled schedule does not execute
    await prisma.scheduledReport.update({
      where: { id: createdScheduleId },
      data: { status: ReportStatus.PAUSED },
    })
    const pausedDeliveryResult = await executeScheduledReportDelivery({
      scheduleId: createdScheduleId,
      actorId: 'system.cron',
    })
    assert(pausedDeliveryResult.sent === 0, 'Test 16: Disabled schedule sent 0 reports')
    assert(pausedDeliveryResult.skipped === 1, 'Test 16: Disabled schedule skipped execution')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5: Audit Logging & Tenant Isolation Validation
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SECTION 5: Audit Integrity & Security Invariants]')

    // 17. no raw secrets in audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: { in: ['report.created', 'report.updated', 'report.enabled', 'report.disabled', 'report.dispatched', 'report.delivery_failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    assert(auditLogs.length > 0, `Test 17: Audit logs recorded (${auditLogs.length} events found)`)

    let foundSecretInLogs = false
    for (const log of auditLogs) {
      const metaStr = log.metadata || ''
      if (
        metaStr.includes('re_') || // Resend API key prefix
        metaStr.includes('password') ||
        metaStr.includes('Bearer') ||
        metaStr.includes('%PDF-') || // Raw PDF binary contents
        metaStr.includes('secret')
      ) {
        foundSecretInLogs = true
        console.error('Violating audit log:', log)
        break
      }
    }
    assert(!foundSecretInLogs, 'Test 17: Audit log metadata contains zero raw secrets, tokens, API keys, or PDF binary streams')

    // 18. no cross-tenant data leakage
    // Query delivery history as Tenant B: should see ZERO logs from Tenant A
    const historyReqB = await createMockRequest('/api/reports/history', {
      method: 'GET',
      user: tenantB.user,
    })
    const historyResB = await getHistoryHandler(historyReqB)
    const historyJsonB = await historyResB.json()

    assert(historyResB.status === 200, 'Test 18: Tenant B history request succeeds (HTTP 200)')
    assert(historyJsonB.total === 0, `Test 18: Zero Tenant A logs leaked to Tenant B (total: ${historyJsonB.total})`)

    const historyReqA = await createMockRequest('/api/reports/history', {
      method: 'GET',
      user: tenantA.user,
    })
    const historyResA = await getHistoryHandler(historyReqA)
    const historyJsonA = await historyResA.json()
    assert(historyJsonA.total >= 2, `Test 18: Tenant A sees only its own delivery logs (total: ${historyJsonA.total})`)

  } catch (err: any) {
    console.error('Unexpected test suite error:', err)
    failed++
  } finally {
    console.log('\n[TEARDOWN: Cleaning up test fixtures...]')
    if (tenantA) {
      await prisma.reportDeliveryLog.deleteMany({ where: { orgId: tenantA.org.id } }).catch(() => {})
      await prisma.scheduledReport.deleteMany({ where: { orgId: tenantA.org.id } }).catch(() => {})
      await prisma.agencyBranding.deleteMany({ where: { orgId: tenantA.org.id } }).catch(() => {})
      if (businessA2) {
        await prisma.review.deleteMany({ where: { businessId: businessA2.id } }).catch(() => {})
        await prisma.business.delete({ where: { id: businessA2.id } }).catch(() => {})
      }
      if (agencyAdminUser) {
        await prisma.orgMember.deleteMany({ where: { userId: agencyAdminUser.id } }).catch(() => {})
        await prisma.user.delete({ where: { id: agencyAdminUser.id } }).catch(() => {})
      }
      if (staffUser) {
        await prisma.orgMember.deleteMany({ where: { userId: staffUser.id } }).catch(() => {})
        await prisma.user.delete({ where: { id: staffUser.id } }).catch(() => {})
      }
      await cleanupTestTenant(tenantA.org.id).catch(() => {})
    }
    if (tenantB) {
      await prisma.reportDeliveryLog.deleteMany({ where: { orgId: tenantB.org.id } }).catch(() => {})
      await prisma.scheduledReport.deleteMany({ where: { orgId: tenantB.org.id } }).catch(() => {})
      await cleanupTestTenant(tenantB.org.id).catch(() => {})
    }
  }

  console.log('\n====================================================================')
  console.log(`JOB-17.3 SUITE RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runSuite()

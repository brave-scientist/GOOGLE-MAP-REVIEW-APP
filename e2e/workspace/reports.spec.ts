import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestReport, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'
import { ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'

test.describe('Milestone 2D / JRN-023 & DB-003: Scheduled Reports Management & Cron Lifecycle', () => {
  let tenantA: Awaited<ReturnType<typeof seedTestTenant>>
  let tenantB: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenantA = await seedTestTenant({
      name: 'Reports Org A',
      businessName: 'Harbor Grille',
    })
    tenantB = await seedTestTenant({
      name: 'Reports Org B',
      businessName: 'Anchor Bar',
    })
  })

  test.afterEach(async () => {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  })

  test('JRN-023: Create, toggle active/paused status, and delete scheduled reports', async ({ page, context }) => {
    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    // 1. Open /reports
    await page.goto('/reports')
    await page.waitForLoadState('domcontentloaded')

    // 2. Open "Schedule New Report" modal
    const scheduleBtn = page.getByRole('button', { name: /Schedule New Report|New Report/i }).first()
    await expect(scheduleBtn).toBeVisible()
    await scheduleBtn.click()

    // 3. Fill report modal
    const nameInput = page.locator('#rpt-name')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Executive Monthly Overview')

    const recipientsInput = page.locator('#rpt-recipients')
    await recipientsInput.fill('executive@harborgrille.com, gm@harborgrille.com')

    const submitBtn = page.getByRole('button', { name: /^Create Report$/i })
    await submitBtn.click()

    // 4. Verify report card is visible in UI
    await expect(page.getByRole('heading', { name: 'Executive Monthly Overview' })).toBeVisible({ timeout: 10000 })

    // 5. Verify database record
    const dbReport = await prisma.scheduledReport.findFirst({
      where: {
        orgId: tenantA.org.id,
        name: 'Executive Monthly Overview',
      },
    })
    expect(dbReport).not.toBeNull()
    expect(dbReport?.status).toBe(ReportStatus.ACTIVE)
    expect(JSON.parse(dbReport!.recipients)).toEqual(['executive@harborgrille.com', 'gm@harborgrille.com'])

    // 6. Pause report in UI
    const pauseBtn = page.getByRole('button', { name: /Pause/i }).first()
    await expect(pauseBtn).toBeVisible()
    await pauseBtn.click()

    // Assert status badge updates to PAUSED
    await expect(page.getByText('PAUSED', { exact: true })).toBeVisible({ timeout: 10000 })

    const updatedDbReport = await prisma.scheduledReport.findUnique({
      where: { id: dbReport!.id },
    })
    expect(updatedDbReport?.status).toBe(ReportStatus.PAUSED)

    // 7. Delete report
    page.on('dialog', async dialog => {
      await dialog.accept()
    })

    const deleteBtn = page.getByRole('button', { name: /Delete/i }).first()
    await deleteBtn.click()

    await expect(page.getByRole('heading', { name: 'Executive Monthly Overview' })).not.toBeVisible({ timeout: 10000 })

    const deletedCheck = await prisma.scheduledReport.findUnique({
      where: { id: dbReport!.id },
    })
    expect(deletedCheck).toBeNull()
  })

  test('Cron reports endpoint enforces fail-closed Bearer authentication', async ({ request }) => {
    // 1. Unauthenticated request -> must return 401 (or 500 when CRON_SECRET is unconfigured)
    const unauthRes = await request.get('http://127.0.0.1:3002/api/cron/reports')
    expect([401, 500]).toContain(unauthRes.status())

    // 2. Request with invalid Bearer token -> must return 401 (or 500 when CRON_SECRET is unconfigured)
    const badAuthRes = await request.get('http://127.0.0.1:3002/api/cron/reports', {
      headers: {
        'Authorization': 'Bearer wrong_cron_secret_value',
      },
    })
    expect([401, 500]).toContain(badAuthRes.status())
  })

  test('Tenant Isolation: Tenant B cannot access or mutate Tenant A scheduled reports', async ({ request }) => {
    const reportA = await seedTestReport(tenantA.org.id, {
      name: 'Confidential Report A',
    })

    // Issue session token for Tenant B
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars')
    const tokenB = await new SignJWT({
      id: tenantB.user.id,
      email: tenantB.user.email,
      name: tenantB.user.name,
      orgId: tenantB.org.id,
      orgName: tenantB.org.name,
      orgPlan: tenantB.org.plan,
      role: 'OWNER',
      sessionVersion: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(secret)

    // Tenant B attempts to delete Tenant A report -> must return 404
    const deleteRes = await request.delete(`http://127.0.0.1:3002/api/reports/${reportA.id}`, {
      headers: {
        'Cookie': `rr_session=${tokenB}`,
      },
    })
    expect(deleteRes.status()).toBe(404)

    // Verify report A still exists
    const checkReport = await prisma.scheduledReport.findUnique({
      where: { id: reportA.id },
    })
    expect(checkReport).not.toBeNull()
  })
})

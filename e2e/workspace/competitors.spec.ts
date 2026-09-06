import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestCompetitor, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'

test.describe('Milestone 2D / JRN-022 & DB-002: Competitor Benchmarking & Snapshotting', () => {
  let tenantA: Awaited<ReturnType<typeof seedTestTenant>>
  let tenantB: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenantA = await seedTestTenant({
      name: 'Competitor Tracking Org',
      businessName: 'Golden Dragon Diner',
    })
    tenantB = await seedTestTenant({
      name: 'Competitor B Org',
      businessName: 'Silver Palace',
    })
  })

  test.afterEach(async () => {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  })

  test('JRN-022: Competitor page renders "You" row, allows adding a competitor, and reflects in database with snapshot', async ({ page, context }) => {
    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    // 1. Navigate to /competitors
    await page.goto('/competitors')
    await page.waitForLoadState('domcontentloaded')

    // 2. Assert "You" benchmark row displays Golden Dragon Diner
    await expect(page.locator('text=Golden Dragon Diner (You)')).toBeVisible()

    // 3. Click "Add Competitor" button
    const addBtn = page.getByRole('button', { name: /Add Competitor/i }).first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    // 4. Fill modal form
    const nameInput = page.locator('#comp-name')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Jade Garden Cafe')

    const urlInput = page.locator('#comp-url')
    await urlInput.fill('https://maps.google.com/?cid=99887766')

    // Submit form
    const submitBtn = page.getByRole('button', { name: /^Add competitor$/i })
    await submitBtn.click()

    // 5. Assert competitor appears in the table
    await expect(page.getByText('Jade Garden Cafe', { exact: true })).toBeVisible({ timeout: 10000 })

    // 6. Verify database record and associated snapshot
    const dbCompetitor = await prisma.competitor.findFirst({
      where: {
        businessId: tenantA.business.id,
        name: 'Jade Garden Cafe',
      },
      include: { snapshots: true },
    })
    expect(dbCompetitor).not.toBeNull()
    expect(dbCompetitor?.snapshots.length).toBeGreaterThanOrEqual(1)
  })

  test('JRN-022: Deleting a competitor cascades deletion to snapshots', async ({ page, context }) => {
    // 1. Seed competitor with snapshot
    const competitor = await seedTestCompetitor(tenantA.business.id, {
      name: 'Peking Express to Delete',
      rating: 3.8,
      reviewCount: 90,
    })

    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    // 2. Open /competitors
    await page.goto('/competitors')
    await page.waitForLoadState('domcontentloaded')

    // Assert competitor is visible
    await expect(page.getByText('Peking Express to Delete', { exact: true })).toBeVisible({ timeout: 15000 })

    // 3. Handle confirm dialog automatically and click delete
    page.on('dialog', async dialog => {
      await dialog.accept()
    })

    const deleteBtn = page.locator('button[title="Delete competitor"]').first()
    await deleteBtn.click()

    // 4. Verify competitor is removed from UI
    await expect(page.getByText('Peking Express to Delete', { exact: true })).not.toBeVisible({ timeout: 10000 })

    // 5. Verify competitor and snapshots are deleted from DB
    const dbComp = await prisma.competitor.findUnique({
      where: { id: competitor.id },
    })
    expect(dbComp).toBeNull()

    const dbSnapshots = await prisma.competitorSnapshot.findMany({
      where: { competitorId: competitor.id },
    })
    expect(dbSnapshots.length).toBe(0)
  })

  test('Tenant Isolation: Tenant B cannot access or mutate Tenant A competitors', async ({ request }) => {
    const compA = await seedTestCompetitor(tenantA.business.id, {
      name: 'Confidential Competitor A',
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

    // Tenant B attempts to delete Tenant A competitor
    const deleteRes = await request.delete(`http://127.0.0.1:3002/api/competitors?id=${compA.id}`, {
      headers: {
        'Cookie': `rr_session=${tokenB}`,
      },
    })
    expect(deleteRes.status()).toBe(404)

    // Verify competitor A still exists in DB
    const checkComp = await prisma.competitor.findUnique({
      where: { id: compA.id },
    })
    expect(checkComp).not.toBeNull()
  })
})

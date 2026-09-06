import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'

test.describe('JOB-7.4: Compliance DSAR & Staff SMS Consent UI', () => {
  let tenant: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenant = await seedTestTenant({
      name: 'Compliance Test Org',
      businessName: 'Apex Bistro',
    })

    // Seed a real audit event for the tenant
    await prisma.auditLog.create({
      data: {
        actorId: tenant.user.id,
        action: 'compliance.test_initialized',
        targetType: 'business',
        targetId: tenant.business.id,
        metadata: JSON.stringify({ orgId: tenant.org.id }),
      },
    })
  })

  test.afterEach(async () => {
    if (tenant) await cleanupTestTenant(tenant.org.id)
  })

  test('Compliance: GDPR DSAR export, deletion request lifecycle, and real audit logs', async ({ page, context }) => {
    await injectSessionCookie(context, {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
    })

    // 1. Navigate to /compliance
    await page.goto('/compliance')
    await page.waitForLoadState('domcontentloaded')

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Compliance Center', level: 1 })).toBeVisible()

    // 2. Switch to GDPR tab
    await page.getByRole('tab', { name: /GDPR/i }).click()

    // Verify DSAR export button is visible
    const exportBtn = page.getByRole('button', { name: /Export my data/i })
    await expect(exportBtn).toBeVisible()

    // 3. Deletion Request confirmation flow
    const deleteBtn = page.getByRole('button', { name: /Request deletion/i })
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // Dialog opens with explanation of 30-day grace period
    await expect(page.getByRole('heading', { name: /Request Account Deletion/i })).toBeVisible()
    await expect(page.locator('text=30-day grace period').first()).toBeVisible()

    // Fill optional reason and confirm
    await page.locator('#deletion-reason').fill('Switching to another provider')
    await page.getByRole('button', { name: /Confirm Deletion Request/i }).click()

    // Verify Active banner appears on the page
    await expect(page.locator('text=Account Deletion Request Active')).toBeVisible()
    await expect(page.getByRole('button', { name: /Cancel Request/i })).toBeVisible()

    // 4. Cancel Deletion Request
    await page.getByRole('button', { name: /Cancel Request/i }).click()
    await expect(page.locator('text=Account Deletion Request Active')).not.toBeVisible()

    // 5. Switch to Audit Log tab
    await page.getByRole('tab', { name: /Audit Log/i }).click()

    // Verify Export CSV button is present
    await expect(page.getByRole('button', { name: /Export/i })).toBeVisible()

    // Verify real audit log entry renders, and fake demo entries are completely absent
    await expect(page.locator('text=Sarah Chen')).not.toBeVisible()
    await expect(page.locator('text=192.168.1.1')).not.toBeVisible()
    await expect(page.locator('text=compliance.test_initialized').first()).toBeVisible()
  })

  test('Review Us: Staff can open SMS consent invite modal and generate single-use link', async ({ page, context }) => {
    await injectSessionCookie(context, {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
    })

    // 1. Navigate to /review-us-page
    await page.goto('/review-us-page')
    await page.waitForLoadState('domcontentloaded')

    // 2. Locate and click "Send Consent Invite" button
    const inviteBtn = page.getByRole('button', { name: /Send Consent Invite/i }).first()
    await expect(inviteBtn).toBeVisible()
    await inviteBtn.click()

    // 3. Dialog opens
    await expect(page.getByRole('heading', { name: /SMS Customer Consent Invitation/i })).toBeVisible()
    await expect(page.locator('text=TCPA / CTIA Compliance Requirement')).toBeVisible()

    // 4. Fill form with mobile number
    const phoneInput = page.locator('#consent-phone')
    await expect(phoneInput).toBeVisible()
    await phoneInput.fill('+1 (415) 555-0123')

    const nameInput = page.locator('#consent-name')
    await nameInput.fill('Jordan Customer')

    // 5. Submit
    await page.getByRole('button', { name: /Generate Consent Link/i }).click()

    // 6. Verify result view displays generated link
    await expect(page.locator('text=Consent Invitation Link Generated')).toBeVisible()
    await expect(page.getByRole('button', { name: /Copy/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Done/i })).toBeVisible()

    // Click Done to dismiss
    await page.getByRole('button', { name: /Done/i }).click()
    await expect(page.getByRole('heading', { name: /SMS Customer Consent Invitation/i })).not.toBeVisible()
  })
})

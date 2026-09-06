import { test, expect } from '@playwright/test'
import { generateTestEmail, prisma, cleanupTestTenant } from '../fixtures/db-seed'
import { getSessionCookie } from '../fixtures/auth.fixture'

test.describe('JRN-002: Signup Registration & Workspace Provisioning', () => {
  let createdOrgId: string | null = null

  test.afterEach(async () => {
    if (createdOrgId) {
      await cleanupTestTenant(createdOrgId)
      createdOrgId = null
    }
  })

  test('User completes 2-step signup wizard, receives HttpOnly session cookie, and enters dashboard', async ({ page, context }) => {
    const testEmail = generateTestEmail('signup')
    const testPassword = 'SecurePassword2026!'
    const testName = 'Sarah Enterprise'
    const testBusinessName = 'Enterprise Bistro E2E'

    // 1. Visit signup page
    await page.goto('/signup')
    await page.waitForLoadState('domcontentloaded')

    // Step 1: User credentials
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible()

    const nameInput = page.locator('#name')
    await expect(nameInput).toBeVisible()
    await nameInput.click()
    await nameInput.pressSequentially(testName, { delay: 5 })
    await expect(nameInput).toHaveValue(testName)

    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
    await emailInput.click()
    await emailInput.pressSequentially(testEmail, { delay: 5 })
    await expect(emailInput).toHaveValue(testEmail)

    const passwordInput = page.locator('#password')
    await expect(passwordInput).toBeVisible()
    await passwordInput.click()
    await passwordInput.pressSequentially(testPassword, { delay: 5 })
    await expect(passwordInput).toHaveValue(testPassword)

    await page.getByRole('button', { name: /Continue/i }).click()

    // Step 2: Business details
    await expect(page.getByRole('heading', { name: /Tell us about your business/i })).toBeVisible({ timeout: 10000 })

    const bizInput = page.locator('#businessName')
    await expect(bizInput).toBeVisible()
    await bizInput.click()
    await bizInput.pressSequentially(testBusinessName, { delay: 5 })
    await expect(bizInput).toHaveValue(testBusinessName)

    await page.getByRole('button', { name: /Create account/i }).click()

    // 2. Verify navigation to /onboarding (or /dashboard)
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15000 })
    if (page.url().includes('/onboarding')) {
      // User can click "Skip for now" to reach dashboard directly
      await page.getByRole('button', { name: /Skip for now/i }).click()
      await page.waitForURL('**/dashboard', { timeout: 15000 })
    }
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('aside')).toBeVisible()

    // 3. Security assertions on session cookie
    const sessionCookie = await getSessionCookie(context)
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)
    expect(['Lax', 'None', 'lax', 'Default']).toContain(sessionCookie?.sameSite)

    // 4. Verify document.cookie does NOT expose the raw session token (HttpOnly protection)
    const clientCookies = await page.evaluate(() => document.cookie)
    expect(clientCookies).not.toContain('rr_session=')

    // 5. Verify database records created
    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: {
        memberships: {
          include: { org: { include: { businesses: true } } },
        },
      },
    })
    expect(createdUser).not.toBeNull()
    expect(createdUser?.name).toBe(testName)
    expect(createdUser?.memberships.length).toBe(1)
    expect(createdUser?.memberships[0].role).toBe('OWNER')
    expect(createdUser?.memberships[0].org.businesses[0].name).toBe(testBusinessName)

    if (createdUser?.memberships[0].org.id) {
      createdOrgId = createdUser.memberships[0].org.id
    }
  })
})

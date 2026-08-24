import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, prisma } from '../fixtures/db-seed'
import { getSessionCookie, loginViaUI } from '../fixtures/auth.fixture'

test.describe('Authentication & Password Security (JRN-003, JRN-004, JRN-005)', () => {
  const cleanupOrgIds: string[] = []

  test.afterEach(async () => {
    while (cleanupOrgIds.length > 0) {
      const orgId = cleanupOrgIds.pop()
      if (orgId) await cleanupTestTenant(orgId)
    }
  })

  test('JRN-003: Standard Bcrypt login verifies credentials, sets HttpOnly session, and redirects to dashboard', async ({ page, context }) => {
    const rawPassword = 'BcryptSecurePassword2026!'
    const tenant = await seedTestTenant({
      password: rawPassword,
      name: 'Bcrypt User',
    })
    cleanupOrgIds.push(tenant.org.id)

    // Execute UI login using robust accessible helper
    await loginViaUI(page, tenant.user.email, rawPassword)

    // Verify successful navigation to dashboard
    await expect(page).toHaveURL(/\/dashboard/)

    // Security assertions on session cookie
    const sessionCookie = await getSessionCookie(context)
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)
    expect(['Lax', 'None', 'lax', 'Default']).toContain(sessionCookie?.sameSite)
  })

  test('JRN-004: Legacy password hash (demo_hash_) transparently upgrades to Bcrypt on successful login', async ({ page }) => {
    const rawPassword = 'LegacyMigrationPassword123'
    const tenant = await seedTestTenant({
      password: rawPassword,
      name: 'Legacy User',
      isLegacy: true,
    })
    cleanupOrgIds.push(tenant.org.id)

    // Verify initial hash format is legacy
    expect(tenant.user.passwordHash?.startsWith('demo_hash_')).toBe(true)

    await loginViaUI(page, tenant.user.email, rawPassword)
    await expect(page).toHaveURL(/\/dashboard/)

    // Verify in database that hash was upgraded to bcrypt
    const updatedUser = await prisma.user.findUnique({
      where: { id: tenant.user.id },
    })
    expect(updatedUser?.passwordHash).not.toBeNull()
    expect(updatedUser?.passwordHash?.startsWith('$2a$') || updatedUser?.passwordHash?.startsWith('$2b$')).toBe(true)
  })

  test('JRN-005: Account with null passwordHash cannot authenticate via password login endpoint', async ({ page, context }) => {
    const tenant = await seedTestTenant({
      name: 'Null Password User',
      isNullPassword: true,
    })
    cleanupOrgIds.push(tenant.org.id)

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const passwordTab = page.getByRole('button', { name: /^Password$/i })
    if (await passwordTab.isVisible()) {
      await passwordTab.click()
    }

    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
    await emailInput.fill(tenant.user.email)
    await expect(emailInput).toHaveValue(tenant.user.email)

    const passwordInput = page.locator('#password')
    await passwordInput.fill('AnyAttemptedPassword123!')
    await expect(passwordInput).toHaveValue('AnyAttemptedPassword123!')

    await page.getByRole('button', { name: /Sign In|Log In/i }).click()

    // Verify rejection toast message and remaining on /login
    await expect(page.getByText(/Password authentication not configured for this account/i)).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)

    // Verify no session cookie was minted
    const sessionCookie = await getSessionCookie(context)
    expect(sessionCookie).toBeUndefined()
  })
})

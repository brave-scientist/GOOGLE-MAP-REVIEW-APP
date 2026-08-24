import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant } from '../fixtures/db-seed'
import { loginViaUI, getSessionCookie } from '../fixtures/auth.fixture'

test.describe('JRN-009: User Profile Dropdown & Logout Session Clearance', () => {
  let orgId: string | null = null

  test.afterEach(async () => {
    if (orgId) {
      await cleanupTestTenant(orgId)
      orgId = null
    }
  })

  test('User logs out via UserProfileDropdown, session cookie is destroyed, and back navigation is prevented', async ({ page, context }) => {
    const rawPassword = 'LogoutPassword2026!'
    const tenant = await seedTestTenant({
      password: rawPassword,
      name: 'Logout User',
    })
    orgId = tenant.org.id

    // 1. Log in via UI
    await loginViaUI(page, tenant.user.email, rawPassword)
    await expect(page).toHaveURL(/\/dashboard/)

    // 2. Locate and open UserProfileDropdown in Sidebar
    // The profile trigger button contains the user's name/email
    const profileTrigger = page.locator('aside').getByRole('button').filter({ hasText: /Logout User|My Account/i })
    await expect(profileTrigger).toBeVisible()
    await profileTrigger.click()

    // 3. Click "Sign Out"
    const signOutItem = page.getByRole('menuitem', { name: /Sign Out/i })
    await expect(signOutItem).toBeVisible()
    await signOutItem.click()

    // 4. Verify redirection to /login
    await page.waitForURL('**/login', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)

    // 5. Verify rr_session cookie is cleared or empty
    const sessionCookie = await getSessionCookie(context)
    expect(sessionCookie === undefined || sessionCookie.value === '').toBe(true)

    // 6. Attempt browser Back navigation -> middleware intercepts and forces /login
    await page.goBack()
    await page.waitForURL('**/login?redirect=%2Fdashboard', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/)
  })
})

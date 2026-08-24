import { test, expect } from '@playwright/test'

test.describe('JRN-001: Landing Page Navigation & Route Guards', () => {
  test('Landing page CTAs route unauthenticated visitors directly to login and signup', async ({ page }) => {
    // 1. Visit landing page
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // 2. Verify top navigation Log in button routes to /login
    const loginCta = page.getByRole('link', { name: /^Log in$/i }).first()
    await expect(loginCta).toBeVisible()
    await expect(loginCta).toHaveAttribute('href', '/login')

    // 3. Verify top navigation Get Started button routes to /signup
    const signupCta = page.getByRole('link', { name: /Get Started|Start free trial/i }).first()
    await expect(signupCta).toBeVisible()
    await expect(signupCta).toHaveAttribute('href', '/signup')

    // 4. Click Log in CTA and verify browser navigates to /login
    await loginCta.click()
    await page.waitForURL('**/login', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()

    // 5. Navigate back and click Get Started CTA
    await page.goto('/')
    const getStartedButton = page.getByRole('link', { name: /Get Started/i }).first()
    await getStartedButton.click()
    await page.waitForURL('**/signup', { timeout: 10000 })
    await expect(page).toHaveURL(/\/signup/)
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible()
  })

  test('Protected workspace routes redirect unauthenticated users to /login with redirect query preservation', async ({ page }) => {
    // Attempt to access protected dashboard directly without session cookie
    await page.goto('/dashboard')
    await page.waitForURL('**/login?redirect=%2Fdashboard', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/)

    // Attempt to access protected inbox directly
    await page.goto('/inbox')
    await page.waitForURL('**/login?redirect=%2Finbox', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login\?redirect=%2Finbox/)
  })
})

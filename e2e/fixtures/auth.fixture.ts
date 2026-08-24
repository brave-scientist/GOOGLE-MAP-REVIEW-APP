import { Page, BrowserContext, expect } from '@playwright/test'
import { SignJWT } from 'jose'
import { Role, Plan } from '@prisma/client'

const SESSION_COOKIE = 'rr_session'
const SECRET_KEY = process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars'
const secret = new TextEncoder().encode(SECRET_KEY)

export interface TestSessionUser {
  id: string
  email: string
  name?: string | null
  role?: Role
  orgId?: string | null
  orgName?: string | null
  orgPlan?: Plan | null
  sessionVersion?: number
}

/**
 * Perform a real browser-level UI login
 */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Ensure Password tab is selected
  const passwordTab = page.getByRole('button', { name: /^Password$/i })
  if (await passwordTab.isVisible()) {
    await passwordTab.click()
  }

  // Fill in credentials using accessible selectors and assert value hydration
  const emailInput = page.locator('#email')
  await expect(emailInput).toBeVisible()
  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)

  const passwordInput = page.locator('#password')
  await passwordInput.fill(password)
  await expect(passwordInput).toHaveValue(password)

  // Click Submit
  await page.getByRole('button', { name: /Sign In|Log In/i }).click()

  // Wait for redirect to /dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 })
  await expect(page).toHaveURL(/\/dashboard/)
}

/**
 * Fast-inject a test signed session JWT cookie directly into the Playwright BrowserContext
 * (Used for accelerating non-auth feature tests without repeating form login)
 */
export async function injectSessionCookie(context: BrowserContext, user: TestSessionUser): Promise<string> {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name || 'E2E User',
    role: user.role || Role.OWNER,
    orgId: user.orgId || 'org_test',
    orgName: user.orgName || 'E2E Organization',
    orgPlan: user.orgPlan || Plan.PRO,
    sessionVersion: user.sessionVersion ?? 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(user.id)
    .sign(secret)

  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
    {
      name: SESSION_COOKIE,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ])

  return token
}

/**
 * Retrieve the rr_session cookie from the browser context to assert attributes
 */
export async function getSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies()
  return cookies.find(c => c.name === SESSION_COOKIE)
}

import { test, expect } from '@playwright/test'
import { seedTestTenant, seedPasswordResetToken, cleanupTestTenant, prisma, generateTestEmail } from '../fixtures/db-seed'
import { injectSessionCookie, loginViaUI } from '../fixtures/auth.fixture'

test.describe('Password Recovery & Reset Lifecycle (JRN-006, JRN-007, JRN-008)', () => {
  const cleanupOrgIds: string[] = []

  test.afterEach(async () => {
    while (cleanupOrgIds.length > 0) {
      const orgId = cleanupOrgIds.pop()
      if (orgId) await cleanupTestTenant(orgId)
    }
  })

  test('JRN-006: Forgot password endpoint provides anti-enumeration confirmation and creates DB reset token', async ({ page }) => {
    const tenant = await seedTestTenant({ name: 'Forgot Pass User' })
    cleanupOrgIds.push(tenant.org.id)

    // 1. Submit existing user email
    await page.goto('/forgot-password')
    await page.waitForLoadState('domcontentloaded')

    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
    await emailInput.click()
    await emailInput.pressSequentially(tenant.user.email, { delay: 5 })
    await expect(emailInput).toHaveValue(tenant.user.email)

    await page.getByRole('button', { name: /Send reset link|Reset password/i }).click()

    await expect(page.getByRole('heading', { name: /Check your email/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(tenant.user.email)).toBeVisible()

    // Verify token record created in DB
    const resetRecord = await prisma.passwordResetToken.findFirst({
      where: { userId: tenant.user.id },
    })
    expect(resetRecord).not.toBeNull()
    expect(resetRecord?.consumedAt).toBeNull()

    // 2. Submit non-existent email -> verifies identical confirmation UI without leaking absence
    const nonExistentEmail = generateTestEmail('unknown')
    await page.goto('/forgot-password')
    await page.waitForLoadState('domcontentloaded')

    const unknownEmailInput = page.locator('#email')
    await expect(unknownEmailInput).toBeVisible()
    await unknownEmailInput.click()
    await unknownEmailInput.pressSequentially(nonExistentEmail, { delay: 5 })
    await expect(unknownEmailInput).toHaveValue(nonExistentEmail)

    await page.getByRole('button', { name: /Send reset link|Reset password/i }).click()

    await expect(page.getByRole('heading', { name: /Check your email/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(nonExistentEmail)).toBeVisible()
  })

  test('JRN-007: Single-use reset token atomically updates password and rejects replay attempts', async ({ page }) => {
    const tenant = await seedTestTenant({ name: 'Reset Token User' })
    cleanupOrgIds.push(tenant.org.id)

    const { rawToken } = await seedPasswordResetToken(tenant.user.id)
    const newPassword = 'BrandNewPassword2026!'

    // 1. Open reset link with raw token
    await page.goto(`/reset-password?token=${rawToken}`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('heading', { name: /Create new password/i })).toBeVisible({ timeout: 10000 })

    const pwdInput = page.locator('#password')
    await expect(pwdInput).toBeVisible()
    await pwdInput.click()
    await pwdInput.pressSequentially(newPassword, { delay: 5 })
    await expect(pwdInput).toHaveValue(newPassword)

    const confirmPwdInput = page.locator('#confirmPassword')
    await expect(confirmPwdInput).toBeVisible()
    await confirmPwdInput.click()
    await confirmPwdInput.pressSequentially(newPassword, { delay: 5 })
    await expect(confirmPwdInput).toHaveValue(newPassword)

    await page.getByRole('button', { name: /Update password/i }).click()

    // 2. Verify success screen
    await expect(page.getByRole('heading', { name: /Password reset complete/i })).toBeVisible({ timeout: 10000 })

    // 3. Attempt replay of the exact same token
    await page.goto(`/reset-password?token=${rawToken}`)
    await page.waitForLoadState('domcontentloaded')

    const replayPwd = page.locator('#password')
    await expect(replayPwd).toBeVisible()
    await replayPwd.click()
    await replayPwd.pressSequentially('AnotherPassword123!', { delay: 5 })
    await expect(replayPwd).toHaveValue('AnotherPassword123!')

    const replayConfirm = page.locator('#confirmPassword')
    await expect(replayConfirm).toBeVisible()
    await replayConfirm.click()
    await replayConfirm.pressSequentially('AnotherPassword123!', { delay: 5 })
    await expect(replayConfirm).toHaveValue('AnotherPassword123!')

    await page.getByRole('button', { name: /Update password/i }).click()

    await expect(page.getByText(/This password reset link has already been used/i)).toBeVisible({ timeout: 10000 })
  })

  test('JRN-008: Password reset increments sessionVersion and invalidates active browser sessions across contexts', async ({ browser }) => {
    const initialPassword = 'InitialOldPassword123!'
    const tenant = await seedTestTenant({
      password: initialPassword,
      name: 'Multi Session User',
      sessionVersion: 1,
    })
    cleanupOrgIds.push(tenant.org.id)

    // Context A: User is logged in with sessionVersion = 1
    const contextA = await browser.newContext()
    await injectSessionCookie(contextA, {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: tenant.membership.role,
      orgId: tenant.org.id,
      orgPlan: tenant.org.plan,
      sessionVersion: 1,
    })

    const pageA = await contextA.newPage()
    await pageA.goto('/dashboard')
    await pageA.waitForLoadState('domcontentloaded')
    await expect(pageA).toHaveURL(/\/dashboard/)

    // Context B: Password reset is executed
    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    const { rawToken } = await seedPasswordResetToken(tenant.user.id)
    const newPassword = 'NewlyChangedPassword2026!'

    await pageB.goto(`/reset-password?token=${rawToken}`)
    await pageB.waitForLoadState('domcontentloaded')

    const pwdInput = pageB.locator('#password')
    await expect(pwdInput).toBeVisible()
    await pwdInput.click()
    await pwdInput.pressSequentially(newPassword, { delay: 5 })
    await expect(pwdInput).toHaveValue(newPassword)

    const confirmPwdInput = pageB.locator('#confirmPassword')
    await expect(confirmPwdInput).toBeVisible()
    await confirmPwdInput.click()
    await confirmPwdInput.pressSequentially(newPassword, { delay: 5 })
    await expect(confirmPwdInput).toHaveValue(newPassword)

    await pageB.getByRole('button', { name: /Update password/i }).click()
    await expect(pageB.getByRole('heading', { name: /Password reset complete/i })).toBeVisible({ timeout: 10000 })

    // Verify in database that sessionVersion was incremented
    const updatedUser = await prisma.user.findUnique({
      where: { id: tenant.user.id },
    })
    expect(updatedUser?.sessionVersion).toBe(2)

    // Context A attempts an authenticated API operation using its stale sessionVersion=1 cookie
    const apiResponse = await contextA.request.get('/api/inbox')
    expect(apiResponse.status()).toBe(401)
    const errBody = await apiResponse.json()
    expect(errBody.error).toBeDefined()

    // Context B logs in with the newly set password and succeeds
    await loginViaUI(pageB, tenant.user.email, newPassword)
    await expect(pageB).toHaveURL(/\/dashboard/)

    await contextA.close()
    await contextB.close()
  })
})

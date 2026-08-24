import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestTeamInvitation, generateTestEmail, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'
import { Role } from '@prisma/client'

test.describe('Milestone 2D / AUTH-003: Cryptographic Team Invitations Lifecycle', () => {
  let tenant: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenant = await seedTestTenant({
      name: 'Invite Team Org',
      businessName: 'Coastal Hospitality',
    })
  })

  test.afterEach(async () => {
    if (tenant) await cleanupTestTenant(tenant.org.id)
  })

  test('New user accepts invitation by setting password and joining organization', async ({ page }) => {
    const invitedEmail = generateTestEmail('new_staff')

    // 1. Seed invitation in DB
    const { rawToken } = await seedTestTeamInvitation(
      tenant.org.id,
      tenant.user.id,
      invitedEmail,
      { role: Role.STAFF }
    )

    // 2. Open /invite/accept?token=...
    await page.goto(`/invite/accept?token=${rawToken}`)
    await page.waitForLoadState('domcontentloaded')

    // 3. Verify invitation banner displays organization name and role
    await expect(page.locator(`text=Join ${tenant.org.name}`)).toBeVisible()
    await expect(page.locator(`text=${invitedEmail}`)).toBeVisible()

    // 4. Fill in new password and name
    const passwordInput = page.locator('#inv-password')
    await expect(passwordInput).toBeVisible()
    await passwordInput.fill('SecureStaffPassword2026!')

    const confirmPasswordInput = page.locator('#inv-confirm')
    await confirmPasswordInput.fill('SecureStaffPassword2026!')

    // 5. Submit acceptance
    const acceptBtn = page.getByRole('button', { name: /Create Account & Join Team|Join Team/i })
    await acceptBtn.click()

    // 6. Verify redirection to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await expect(page).toHaveURL(/\/dashboard/)

    // 7. Verify database records: User created, OrgMember created, invitation marked consumed
    const newUser = await prisma.user.findUnique({
      where: { email: invitedEmail },
      include: { memberships: true },
    })
    expect(newUser).not.toBeNull()
    expect(newUser?.memberships.some(m => m.orgId === tenant.org.id && m.role === Role.STAFF)).toBe(true)

    const invitation = await prisma.teamInvitation.findFirst({
      where: { email: invitedEmail, orgId: tenant.org.id },
    })
    expect(invitation?.consumedAt).not.toBeNull()
  })

  test('Invalid or expired invitation tokens display error banner and block acceptance', async ({ page }) => {
    // 1. Visit with invalid token
    await page.goto('/invite/accept?token=completely_invalid_token_12345')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('text=Invalid Invitation Link')).toBeVisible()

    // 2. Visit with expired token
    const expiredEmail = generateTestEmail('expired_user')
    const { rawToken: expiredToken } = await seedTestTeamInvitation(
      tenant.org.id,
      tenant.user.id,
      expiredEmail,
      { expiresInMs: -1000 } // already expired
    )

    await page.goto(`/invite/accept?token=${expiredToken}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('text=Invitation Expired')).toBeVisible()

    // 3. Visit with already consumed token
    const consumedEmail = generateTestEmail('consumed_user')
    const { rawToken: consumedToken } = await seedTestTeamInvitation(
      tenant.org.id,
      tenant.user.id,
      consumedEmail,
      { consumed: true }
    )

    await page.goto(`/invite/accept?token=${consumedToken}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('text=Invitation Already Accepted')).toBeVisible()
  })
})

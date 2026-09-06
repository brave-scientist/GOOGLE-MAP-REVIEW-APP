import { test, expect } from '@playwright/test'
import { generateTestEmail, prisma, cleanupTestTenant, seedTestTenant } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'

test.describe('JOB-10: Self-Serve Customer Onboarding Setup Wizard (Browser E2E)', () => {
  let createdOrgId: string | null = null

  test.afterEach(async () => {
    if (createdOrgId) {
      // Clean up child business records first to prevent foreign key errors
      const businesses = await prisma.business.findMany({ where: { orgId: createdOrgId } })
      for (const b of businesses) {
        await prisma.reviewPlatformLink.deleteMany({ where: { businessId: b.id } }).catch(() => {})
        await prisma.brandVoiceProfile.deleteMany({ where: { businessId: b.id } }).catch(() => {})
        await prisma.review.deleteMany({ where: { businessId: b.id } }).catch(() => {})
        await prisma.business.delete({ where: { id: b.id } }).catch(() => {})
      }
      await cleanupTestTenant(createdOrgId).catch(() => {})
      createdOrgId = null
    }
  })

  test('Full Real Browser Journey: Signup → /onboarding → Step 1 → Step 2 → Step 3 → Complete → Dashboard', async ({ page }) => {
    const testEmail = generateTestEmail('onboard_journey')
    const testPassword = 'Password2026!Secure'
    const testName = 'Alex Founder'
    const testBusinessName = 'Alex Gourmet Kitchen'

    // 1. Visit signup page
    await page.goto('/signup')
    await page.waitForLoadState('domcontentloaded')

    // Fill Step 1 credentials
    await page.locator('#name').fill(testName)
    await page.locator('#email').fill(testEmail)
    await page.locator('#password').fill(testPassword)
    await page.getByRole('button', { name: /Continue/i }).click()

    // Fill Step 2 business details
    await expect(page.getByRole('heading', { name: /Tell us about your business/i })).toBeVisible({ timeout: 10000 })
    await page.locator('#businessName').fill(testBusinessName)
    await page.getByRole('button', { name: /Create account/i }).click()

    // 2. Verify arrival at /onboarding
    await page.waitForURL('**/onboarding', { timeout: 20000 })
    await expect(page).toHaveURL(/\/onboarding/)

    // Capture orgId for teardown
    const userRecord = await prisma.user.findUnique({
      where: { email: testEmail.toLowerCase() },
      include: { memberships: true },
    })
    if (userRecord?.memberships[0]) {
      createdOrgId = userRecord.memberships[0].orgId
    }

    // =========================================================================
    // STEP 1: REVIEW DESTINATIONS
    // =========================================================================
    await expect(page.getByRole('heading', { name: /Configure Your Review Destinations/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Step 1 of 3/i)).toBeVisible()

    // Configure Google Review Destination URL
    const googleInput = page.locator('input[placeholder*="google.com/review"]').first()
    await googleInput.fill('https://google.com/review/alex-gourmet')

    // Advance to Step 2
    const continueToStep2Btn = page.getByRole('button', { name: /Continue to Brand Voice/i })
    await continueToStep2Btn.click()

    // =========================================================================
    // STEP 2: BRAND VOICE
    // =========================================================================
    await expect(page.getByRole('heading', { name: /Tune Your AI Brand Voice/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible()

    // Select "Warm & Welcoming" preset
    const warmPresetBtn = page.getByRole('button', { name: /Warm & Welcoming/i })
    await warmPresetBtn.click()

    // Fill Signature & Forbidden phrases
    const signatureInput = page.locator('#signature')
    await signatureInput.fill('— The Gourmet Kitchen Hospitality Team')

    const forbiddenInput = page.locator('#forbiddenPhrases')
    await forbiddenInput.fill('We apologize for any inconvenience, Unfortunately')

    // Advance to Step 3
    const continueToStep3Btn = page.getByRole('button', { name: /Continue to Value Action/i })
    await continueToStep3Btn.click()

    // =========================================================================
    // STEP 3: FIRST VALUE ACTION
    // =========================================================================
    await expect(page.getByRole('heading', { name: /Activate Your Review Acceleration/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible()

    // Verify QR code generation
    const qrImage = page.locator('img[alt="Review Us QR Code"]')
    await expect(qrImage).toBeVisible({ timeout: 10000 })

    // Verify Preview Page link
    const previewLink = page.getByRole('link', { name: /Preview Page/i })
    await expect(previewLink).toBeVisible()
    const previewHref = await previewLink.getAttribute('href')
    expect(previewHref).toMatch(/\/review-us\//)

    // Verify First-Value Guidance note
    await expect(page.getByText(/First-Value Guidance:/i)).toBeVisible()

    // Verify Consent Checkbox in test invitation form
    const consentCheckbox = page.locator('#onboarding-consent-checkbox')
    await expect(consentCheckbox).toBeVisible()

    // Test send button is disabled before consent is checked
    const testContactInput = page.locator('input[placeholder*="example.com"], input[placeholder*="555"]').first()
    await testContactInput.fill('testowner@example.com')
    const sendTestBtn = page.getByRole('button', { name: /Send Test/i })
    await expect(sendTestBtn).toBeDisabled()

    // Check consent checkbox -> button enables
    await consentCheckbox.click()
    await expect(sendTestBtn).toBeEnabled()

    // Complete Onboarding
    const completeBtn = page.getByRole('button', { name: /Complete Setup & Go to Dashboard/i })
    await completeBtn.click()

    // =========================================================================
    // ARRIVAL AT DASHBOARD
    // =========================================================================
    await page.waitForURL('**/dashboard', { timeout: 20000 })
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('aside')).toBeVisible()

    // Verify DB state updated
    if (createdOrgId) {
      const orgInDb = await prisma.organization.findUnique({ where: { id: createdOrgId } })
      expect(orgInDb?.onboardingCompletedAt).not.toBeNull()
    }
  })

  test('Back navigation and Refresh hydration preserve user state across steps', async ({ page }) => {
    const testEmail = generateTestEmail('onboard_nav')
    const testPassword = 'Password2026!Secure'

    // 1. Fast signup
    await page.goto('/signup')
    await page.locator('#name').fill('Taylor Host')
    await page.locator('#email').fill(testEmail)
    await page.locator('#password').fill(testPassword)
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { name: /Tell us about your business/i })).toBeVisible({ timeout: 10000 })
    await page.locator('#businessName').fill('Taylor Roastery')
    await page.getByRole('button', { name: /Create account/i }).click()

    await page.waitForURL('**/onboarding', { timeout: 20000 })

    const userRecord = await prisma.user.findUnique({
      where: { email: testEmail.toLowerCase() },
      include: { memberships: true },
    })
    if (userRecord?.memberships[0]) {
      createdOrgId = userRecord.memberships[0].orgId
    }

    // Step 1: fill slug and google link, then advance
    await expect(page.getByRole('heading', { name: /Configure Your Review Destinations/i })).toBeVisible({ timeout: 10000 })
    const slugInput = page.locator('#slug')
    await slugInput.fill('taylor-roastery-custom')
    const googleInput = page.locator('input[placeholder*="google.com/review"]').first()
    await googleInput.fill('https://google.com/review/taylor-roastery')

    await page.getByRole('button', { name: /Continue to Brand Voice/i }).click()

    // Step 2 reached
    await expect(page.getByRole('heading', { name: /Tune Your AI Brand Voice/i })).toBeVisible({ timeout: 10000 })

    // Test Back Navigation
    const backBtn = page.getByRole('button', { name: /Back/i })
    await backBtn.click()

    // Back to Step 1
    await expect(page.getByRole('heading', { name: /Configure Your Review Destinations/i })).toBeVisible()
    await expect(page.locator('#slug')).toHaveValue('taylor-roastery-custom')

    // Advance to Step 2 again and add custom signature
    await page.getByRole('button', { name: /Continue to Brand Voice/i }).click()
    await expect(page.getByRole('heading', { name: /Tune Your AI Brand Voice/i })).toBeVisible({ timeout: 10000 })
    await page.locator('#signature').fill('— Taylor & The Coffee Team')
    await page.getByRole('button', { name: /Continue to Value Action/i }).click()

    // Step 3 reached
    await expect(page.getByRole('heading', { name: /Activate Your Review Acceleration/i })).toBeVisible({ timeout: 10000 })

    // Test Refresh Hydration: reload page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Page must hydrate directly back to Step 3
    await expect(page.getByRole('heading', { name: /Activate Your Review Acceleration/i })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('img[alt="Review Us QR Code"]')).toBeVisible({ timeout: 10000 })

    // Navigate back to Step 2 to verify signature persisted on server
    await page.getByRole('button', { name: /Back/i }).click()
    await expect(page.locator('#signature')).toHaveValue('— Taylor & The Coffee Team')
  })

  test('"Skip for now" permits direct exit to dashboard without blocking', async ({ page }) => {
    const testEmail = generateTestEmail('onboard_skip')
    const testPassword = 'Password2026!Secure'

    await page.goto('/signup')
    await page.locator('#name').fill('Morgan Pilot')
    await page.locator('#email').fill(testEmail)
    await page.locator('#password').fill(testPassword)
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { name: /Tell us about your business/i })).toBeVisible({ timeout: 10000 })
    await page.locator('#businessName').fill('Morgan Flying Club')
    await page.getByRole('button', { name: /Create account/i }).click()

    await page.waitForURL('**/onboarding', { timeout: 20000 })

    const userRecord = await prisma.user.findUnique({
      where: { email: testEmail.toLowerCase() },
      include: { memberships: true },
    })
    if (userRecord?.memberships[0]) {
      createdOrgId = userRecord.memberships[0].orgId
    }

    // Click "Skip for now"
    const skipBtn = page.getByRole('button', { name: /Skip for now/i })
    await expect(skipBtn).toBeVisible()
    await skipBtn.click()

    // Directly reaches dashboard
    await page.waitForURL('**/dashboard', { timeout: 20000 })
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('aside')).toBeVisible()
  })

  test('Mobile viewport layout verification (375x667)', async ({ page, context }) => {
    // Set viewport to mobile (iPhone SE dimensions)
    await page.setViewportSize({ width: 375, height: 667 })

    const tenant = await seedTestTenant({ name: 'Mobile Owner', businessName: 'Mobile Food Truck' })
    createdOrgId = tenant.org.id

    await injectSessionCookie(context, {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: 'OWNER',
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: 'PRO',
      sessionVersion: 1,
    })

    await page.goto('/onboarding')
    await page.waitForLoadState('domcontentloaded')

    // Verify mobile header and controls
    await expect(page.getByText(/Step 1 of 3/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /Configure Your Review Destinations/i })).toBeVisible()
    const continueBtn = page.getByRole('button', { name: /Continue to Brand Voice/i })
    await expect(continueBtn).toBeVisible()

    // Verify container does not have horizontal scroll blowout
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2) // Within 2px threshold
  })
})

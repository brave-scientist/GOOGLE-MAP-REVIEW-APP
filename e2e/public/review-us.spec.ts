import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestPlatformLink, prisma } from '../fixtures/db-seed'

test.describe('Milestone 2D / JRN-020: Public Review-Us Page & Click Tracking Redirects', () => {
  let tenant: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenant = await seedTestTenant({
      name: 'Public Review Biz',
      businessName: 'Sunset Bistro',
    })
  })

  test.afterEach(async () => {
    if (tenant) await cleanupTestTenant(tenant.org.id)
  })

  test('Public visitor visits /review-us/[slug] and views enabled platform cards', async ({ page }) => {
    // 1. Seed two platform links for the business: Google and Yelp
    await seedTestPlatformLink(tenant.business.id, {
      platformId: 'google',
      customName: 'Google Reviews',
      url: 'https://search.google.com/local/writereview?placeid=ChIJmock123',
      enabled: true,
      sortOrder: 1,
    })

    await seedTestPlatformLink(tenant.business.id, {
      platformId: 'yelp',
      customName: 'Yelp Page',
      url: 'https://www.yelp.com/writeareview/biz/sunset-bistro',
      enabled: true,
      sortOrder: 2,
    })

    // 2. Open public review-us page without session
    await page.goto(`/review-us/${tenant.business.slug}`)
    await page.waitForLoadState('domcontentloaded')

    // 3. Assert header and business name are rendered
    await expect(page.locator('text=How was your experience?')).toBeVisible()
    await expect(page.locator('#review-us-business-name')).toBeVisible()

    // 4. Assert platform links are visible with correct href targets
    const googleCard = page.locator('a[href*="search.google.com"]')
    await expect(googleCard).toBeVisible()
    await expect(googleCard).toHaveAttribute('href', 'https://search.google.com/local/writereview?placeid=ChIJmock123')

    const yelpCard = page.locator('a[href*="yelp.com"]')
    await expect(yelpCard).toBeVisible()
    await expect(yelpCard).toHaveAttribute('href', 'https://www.yelp.com/writeareview/biz/sunset-bistro')
  })

  test('Visiting /r/[token] atomically records clickedAt timestamp and executes redirect', async ({ page }) => {
    // 1. Create a campaign & review request
    const campaign = await prisma.campaign.create({
      data: {
        businessId: tenant.business.id,
        name: 'SMS Click Track Test',
        status: 'active',
        channelMix: 'sms',
      },
    })

    const requestRecord = await prisma.reviewRequest.create({
      data: {
        businessId: tenant.business.id,
        campaignId: campaign.id,
        customerName: 'Clicker Customer',
        customerContact: '+15554443333',
        channel: 'SMS',
        status: 'SENT',
      },
    })

    expect(requestRecord.clickedAt).toBeNull()

    // 2. Intercept external Google search redirect to prevent leaving local test browser
    await page.route('https://www.google.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Google Mock Destination</body></html>',
      })
    })

    // 3. Navigate to /r/[token]
    await page.goto(`/r/${requestRecord.id}`)

    // 4. Verify database record has clickedAt set
    const updatedRecord = await prisma.reviewRequest.findUnique({
      where: { id: requestRecord.id },
    })
    expect(updatedRecord?.clickedAt).not.toBeNull()
  })

  test('Non-existent slug returns 404 not found page', async ({ page }) => {
    await page.goto('/review-us/non-existent-slug-xyz-999')
    await expect(page.getByRole('heading', { name: /Page not found|404/i })).toBeVisible()
  })

  test('Public review page renders customized headline, subtitle, and submits private feedback', async ({ page }) => {
    // 1. Update business with custom headline, subtitle, and enable private feedback
    const customTitle = 'Loved your visit to Sunset Bistro?'
    const customSubtitle = 'Let our chef and servers know how we did today!'
    await prisma.business.update({
      where: { id: tenant.business.id },
      data: {
        reviewPageTitle: customTitle,
        reviewPageSubtitle: customSubtitle,
        reviewPagePrivateFeedbackEnabled: true,
      },
    })

    // Seed platform link
    await seedTestPlatformLink(tenant.business.id, {
      platformId: 'google',
      customName: 'Google Reviews',
      url: 'https://search.google.com/local/writereview?placeid=ChIJmock123',
      enabled: true,
      sortOrder: 1,
    })

    // 2. Visit public page
    await page.goto(`/review-us/${tenant.business.slug}`)
    await page.waitForLoadState('domcontentloaded')

    // 3. Verify customized headline and subtitle
    await expect(page.locator('#review-us-title')).toHaveText(customTitle)
    await expect(page.locator('#review-us-subtitle')).toHaveText(customSubtitle)

    // 4. Verify private feedback option is present and clickable
    const feedbackTrigger = page.locator('#private-feedback-trigger')
    await expect(feedbackTrigger).toBeVisible()
    await feedbackTrigger.click()

    // 5. Fill out modal form
    await expect(page.getByRole('heading', { name: /Direct Message to Management/i })).toBeVisible()
    await page.fill('#customer-name', 'Samantha Reed')
    await page.fill('#customer-contact', 'samantha@example.com')
    await page.fill('#customer-message', 'The sea bass was perfectly cooked, but our table was a bit drafty near the patio door.')

    // 6. Submit feedback
    await page.click('#submit-private-feedback')

    // 7. Verify success confirmation screen
    await expect(page.locator('#private-feedback-success')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=Thank You for Your Feedback')).toBeVisible()

    // 8. Verify record persisted in database
    const feedbackRecord = await prisma.review.findFirst({
      where: {
        businessId: tenant.business.id,
        author: 'Samantha Reed',
      },
    })
    expect(feedbackRecord).not.toBeNull()
    expect(feedbackRecord?.source).toBe('INTERNAL')
    expect(feedbackRecord?.text).toContain('sea bass was perfectly cooked')
    expect(feedbackRecord?.text).toContain('samantha@example.com')
  })

  test('Public review page displays cleanly on mobile viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await seedTestPlatformLink(tenant.business.id, {
      platformId: 'google',
      customName: 'Google Reviews',
      url: 'https://search.google.com/local/writereview?placeid=ChIJmock123',
      enabled: true,
      sortOrder: 1,
    })

    await page.goto(`/review-us/${tenant.business.slug}`)
    await page.waitForLoadState('domcontentloaded')

    // Check horizontal scroll
    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2
    })
    expect(isOverflowing).toBe(false)
  })
})

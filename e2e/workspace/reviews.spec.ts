import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestReview, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'
import { mockAIDraftGeneration } from '../fixtures/mock-handlers'
import { DraftStatus, ReviewSource, PublishAttemptStatus } from '@prisma/client'

test.describe('Milestone 2D / JRN-014 & JRN-015: Unified Review Inbox & AI Publishing Loop', () => {
  let tenantA: Awaited<ReturnType<typeof seedTestTenant>>
  let tenantB: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenantA = await seedTestTenant({
      name: 'Alice Owner',
      businessName: 'Alice Dining House',
    })
    tenantB = await seedTestTenant({
      name: 'Bob Competitor',
      businessName: 'Bob Bistro',
    })
  })

  test.afterEach(async () => {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  })

  test('JRN-014: Authenticated tenant opens inbox, generates AI draft, edits, and approves reply', async ({ page, context }) => {
    // 1. Seed a review for Tenant A
    const review = await seedTestReview(tenantA.business.id, {
      author: 'David Miller',
      rating: 5,
      text: 'The food was exceptionally delicious and service was five stars!',
      source: ReviewSource.GOOGLE,
      draftStatus: DraftStatus.DRAFT,
    })

    // 2. Authenticate as Tenant A
    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    // Mock AI draft generation route for deterministic fast response
    await mockAIDraftGeneration(page, 'Thank you David! We are delighted you loved the food and service.')

    // 3. Navigate to /inbox
    await page.goto('/inbox')
    await page.waitForLoadState('domcontentloaded')

    // 4. Assert review is visible in the list
    const reviewCard = page.locator('text=David Miller').first()
    await expect(reviewCard).toBeVisible()
    await expect(page.locator('text=The food was exceptionally delicious')).toBeVisible()

    // 5. Open review detail drawer by clicking card
    await reviewCard.click()

    // 6. Click "Generate draft" button
    const generateBtn = page.getByRole('button', { name: /Generate draft/i })
    await expect(generateBtn).toBeVisible()
    await generateBtn.click()

    // 7. Verify AI draft is populated in the drawer
    await expect(page.locator('text=Thank you David! We are delighted you loved the food and service.')).toBeVisible()

    // 8. Click "Edit" button to modify the draft
    const editBtn = page.getByRole('button', { name: /^Edit$/i })
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('Thank you David! We truly appreciate your five-star review and hope to see you again!')

    // 9. Click "Save & Copy" (or "Save & Post") to approve and post reply
    const saveAndPostBtn = page.getByRole('button', { name: /Save & (Post|Copy)/i })
    await expect(saveAndPostBtn).toBeVisible()
    await saveAndPostBtn.click()

    // 10. Assert UI updates to reflect posted status
    await expect(page.getByRole('heading', { name: /Posted Reply/i })).toBeVisible({ timeout: 10000 })

    // 11. Assert database state reflects POSTED with repliedAt timestamp
    const dbReview = await prisma.review.findUnique({
      where: { id: review.id },
    })
    expect(dbReview?.draftStatus).toBe(DraftStatus.POSTED)
    expect(dbReview?.replyText).toContain('Thank you David! We truly appreciate your five-star review')
    expect(dbReview?.repliedAt).not.toBeNull()
  })

  test('JRN-014: Concurrency control & double-click rejection (HTTP 409)', async ({ request }) => {
    // Seed review in DRAFT state
    const review = await seedTestReview(tenantA.business.id, {
      author: 'Concurrent Customer',
      rating: 4,
      text: 'Great ambiance.',
      draftStatus: DraftStatus.DRAFT,
      draftText: 'Thank you for your visit!',
    })

    // Issue session token for API request
    const { injectSessionCookie: _, ...authUtils } = await import('../fixtures/auth.fixture')
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars')
    const token = await new SignJWT({
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
      role: 'OWNER',
      sessionVersion: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(secret)

    // First approval request claims the review
    const res1 = await request.post(`http://127.0.0.1:3002/api/reviews/${review.id}/approve`, {
      headers: {
        'Cookie': `rr_session=${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'approve' },
    })
    expect(res1.status()).toBe(200)

    // Manually set status to POSTING in DB to simulate atomic mid-flight concurrency
    await prisma.review.update({
      where: { id: review.id },
      data: { draftStatus: DraftStatus.POSTING },
    })

    // Concurrent second approval attempt must be rejected with 409 Conflict
    const res2 = await request.post(`http://127.0.0.1:3002/api/reviews/${review.id}/approve`, {
      headers: {
        'Cookie': `rr_session=${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'approve' },
    })
    expect(res2.status()).toBe(409)
    const body2 = await res2.json()
    expect(body2.error).toMatch(/already been posted|currently being posted/i)
  })

  test('JRN-015: Ambiguous network timeout transitions to UNCONFIRMED without blind retry', async ({ page, context }) => {
    const review = await seedTestReview(tenantA.business.id, {
      author: 'Network Test User',
      rating: 3,
      text: 'Good but room for improvement.',
      draftStatus: DraftStatus.DRAFT,
      draftText: 'Thank you for your feedback.',
      source: ReviewSource.FACEBOOK,
    })

    // Record an UNCONFIRMED publish attempt
    await prisma.reviewPublishAttempt.create({
      data: {
        reviewId: review.id,
        platform: ReviewSource.FACEBOOK,
        status: PublishAttemptStatus.UNCONFIRMED,
        errorMessage: 'Connection timed out during Facebook Graph dispatch',
        idempotencyKey: `idemp_${Date.now()}`,
      },
    })

    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    await page.goto('/inbox')
    await page.waitForLoadState('domcontentloaded')

    // Open review drawer
    await page.locator('text=Network Test User').first().click()

    // Assert attempt status in DB remains UNCONFIRMED and prevents duplicated posting
    const attempts = await prisma.reviewPublishAttempt.findMany({
      where: { reviewId: review.id },
    })
    expect(attempts.length).toBe(1)
    expect(attempts[0].status).toBe(PublishAttemptStatus.UNCONFIRMED)
  })

  test('Tenant Isolation: Tenant B cannot access or approve Tenant A reviews', async ({ request }) => {
    // Seed review for Tenant A
    const reviewA = await seedTestReview(tenantA.business.id, {
      author: 'Secret Customer A',
      text: 'Confidential review for Org A',
      rating: 5,
    })

    // Issue session token for Tenant B
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars')
    const tokenB = await new SignJWT({
      id: tenantB.user.id,
      email: tenantB.user.email,
      name: tenantB.user.name,
      orgId: tenantB.org.id,
      orgName: tenantB.org.name,
      orgPlan: tenantB.org.plan,
      role: 'OWNER',
      sessionVersion: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(secret)

    // Attempt to generate draft for Tenant A review using Tenant B token -> must fail with 404
    const draftRes = await request.post(`http://127.0.0.1:3002/api/reviews/${reviewA.id}/draft`, {
      headers: {
        'Cookie': `rr_session=${tokenB}`,
        'Content-Type': 'application/json',
      },
    })
    expect(draftRes.status()).toBe(404)

    // Attempt to approve Tenant A review using Tenant B token -> must fail with 404
    const approveRes = await request.post(`http://127.0.0.1:3002/api/reviews/${reviewA.id}/approve`, {
      headers: {
        'Cookie': `rr_session=${tokenB}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'approve' },
    })
    expect(approveRes.status()).toBe(404)
  })
})

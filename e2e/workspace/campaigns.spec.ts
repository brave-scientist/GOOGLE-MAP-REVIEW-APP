import { test, expect } from '@playwright/test'
import { seedTestTenant, cleanupTestTenant, seedTestOptOut, prisma } from '../fixtures/db-seed'
import { injectSessionCookie } from '../fixtures/auth.fixture'
import { normalizeContact, filterOptedOut } from '@/lib/opt-out'

test.describe('Milestone 2D / JRN-016 & JRN-021: Campaigns & TCPA Compliance', () => {
  let tenantA: Awaited<ReturnType<typeof seedTestTenant>>
  let tenantB: Awaited<ReturnType<typeof seedTestTenant>>

  test.beforeEach(async () => {
    tenantA = await seedTestTenant({
      name: 'Campaign Admin A',
      businessName: 'Apex Clinic',
    })
    tenantB = await seedTestTenant({
      name: 'Campaign Admin B',
      businessName: 'Beacon Dental',
    })
  })

  test.afterEach(async () => {
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
  })

  test('JRN-016: Campaign creation modal accepts valid recipients and saves campaign', async ({ page, context }) => {
    await injectSessionCookie(context, {
      id: tenantA.user.id,
      email: tenantA.user.email,
      name: tenantA.user.name,
      orgId: tenantA.org.id,
      orgName: tenantA.org.name,
      orgPlan: tenantA.org.plan,
    })

    // Navigate to /campaigns
    await page.goto('/campaigns')
    await page.waitForLoadState('domcontentloaded')

    // Open "New Campaign" modal
    const newCampaignBtn = page.getByRole('button', { name: /New campaign/i }).last()
    await expect(newCampaignBtn).toBeVisible()
    await newCampaignBtn.click()

    // Step 1: Campaign details
    const nameInput = page.locator('#camp-name')
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill('August VIP Customer Feedback')

    const continueBtn = page.getByRole('button', { name: /^Continue$/i })
    await continueBtn.click()

    // Step 2: Message Template -> click Continue
    await continueBtn.click()

    // Step 3: Recipients
    const recipientName = page.locator('input[placeholder="Customer name"]').first()
    await expect(recipientName).toBeVisible()
    await recipientName.fill('Michael Scott')

    const recipientContact = page.locator('input[placeholder="Phone or email"]').first()
    await recipientContact.fill('+1 (555) 987-6543')

    // Click "Save as draft"
    const saveDraftBtn = page.getByRole('button', { name: /Save as draft/i })
    await expect(saveDraftBtn).toBeVisible()
    await saveDraftBtn.click()

    // Assert campaign appears in list
    await expect(page.locator('text=August VIP Customer Feedback')).toBeVisible({ timeout: 10000 })

    // Verify database record
    const dbCampaign = await prisma.campaign.findFirst({
      where: {
        businessId: tenantA.business.id,
        name: 'August VIP Customer Feedback',
      },
    })
    expect(dbCampaign).not.toBeNull()
    expect(dbCampaign?.status).toBe('draft')
  })

  test('JRN-016: Defensive contact normalization safely handles malformed inputs without 500 error', async () => {
    // Verify pure unit defense of contact normalization
    expect(normalizeContact('  +1 (555) 321-4321  ')).toBe('+15553214321')
    expect(normalizeContact('TEST.USER@EXAMPLE.COM')).toBe('test.user@example.com')
    expect(normalizeContact(null)).toBe('')
    expect(normalizeContact(undefined)).toBe('')
    expect(normalizeContact(1234567890)).toBe('+11234567890')
    expect(normalizeContact({ invalid: true })).toBe('')
  })

  test('JRN-021: TCPA / Opt-Out engine suppresses unsubscribed contacts', async () => {
    const unsubscribedPhone = '+15550009999'
    const activePhone = '+15550002222'

    try {
      // Seed opt-out record in database
      await seedTestOptOut(unsubscribedPhone, { reason: 'STOP_REPLIED' })

      const recipients = [
        { name: 'Opted Out User', contact: unsubscribedPhone },
        { name: 'Active User', contact: activePhone },
      ]

      const result = await filterOptedOut(recipients)
      expect(result.sendable.length).toBe(1)
      expect(result.sendable[0].contact).toBe('+15550002222')
      expect(result.optedOut).toBe(1)
    } finally {
      await prisma.optOut.deleteMany({ where: { contact: unsubscribedPhone } }).catch(() => {})
    }
  })

  test('Tenant Isolation: Tenant B cannot query Tenant A campaigns', async ({ request }) => {
    // Create a campaign for Tenant A
    const campaignA = await prisma.campaign.create({
      data: {
        businessId: tenantA.business.id,
        name: 'Confidential Strategy Campaign A',
        status: 'active',
        channelMix: 'sms',
      },
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

    // Request campaigns as Tenant B -> campaignA must NOT be in the results
    const res = await request.get('http://127.0.0.1:3002/api/campaigns', {
      headers: {
        'Cookie': `rr_session=${tokenB}`,
      },
    })
    expect(res.status()).toBe(200)
    const data = await res.json()
    const foundCampaign = data.campaigns?.find((c: any) => c.id === campaignA.id)
    expect(foundCampaign).toBeUndefined()
  })
})

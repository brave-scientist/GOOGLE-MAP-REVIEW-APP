import { Page } from '@playwright/test'

/**
 * Playwright Network Interception Helpers for Milestone 2D E2E Testing
 */

/**
 * Mock AI reply generation to ensure fast, deterministic, and offline-capable tests
 */
export async function mockAIDraftGeneration(page: Page, customReply?: string): Promise<void> {
  await page.route('**/api/reviews/*/draft', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        draft: customReply || 'Thank you so much for your wonderful review! We are thrilled that you enjoyed your experience and look forward to welcoming you back soon.',
        source: 'AI (GLM-4.6)',
        model: 'glm-4.6',
      }),
    })
  })
}

/**
 * Mock Stripe checkout session endpoint
 */
export async function mockStripeCheckout(page: Page, simulatedRedirectUrl?: string): Promise<void> {
  await page.route('**/api/billing/checkout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: simulatedRedirectUrl || 'http://localhost:3000/billing?mock_checkout=true&status=success',
        mock: true,
      }),
    })
  })
}

/**
 * Mock Stripe Customer Portal endpoint
 */
export async function mockStripePortal(page: Page): Promise<void> {
  await page.route('**/api/billing/portal', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'http://localhost:3000/billing?mock_portal=true',
        mock: true,
      }),
    })
  })
}

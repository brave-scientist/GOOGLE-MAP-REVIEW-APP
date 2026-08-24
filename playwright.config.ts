import { defineConfig, devices } from '@playwright/test'
import { getAuthoritativeE2EDatabaseUrl } from './e2e/fixtures/db-guard'

const TEST_PORT = process.env.PORT || '3002'
const TEST_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${TEST_PORT}`

// Fail-closed E2E database resolution: strictly ignores process.env.DATABASE_URL
const E2E_DATABASE_URL = getAuthoritativeE2EDatabaseUrl()

console.log(`[PLAYWRIGHT CONFIG] Database Target: ${E2E_DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`)

/**
 * ReviewReply Playwright E2E Configuration (Milestone 2D / TEST-002)
 *
 * Rules:
 * - Deterministic hermetic execution
 * - Fail-closed isolated test database (reviewreply_test on port 5433)
 * - Never uses production DATABASE_URL
 * - Zero production secret usage
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 60000,
  use: {
    baseURL: TEST_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${TEST_PORT}`,
    url: `${TEST_BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      E2E_DATABASE_URL: E2E_DATABASE_URL,
      NEXT_PUBLIC_APP_URL: TEST_BASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars',
      PORT: TEST_PORT,
    },
  },
})

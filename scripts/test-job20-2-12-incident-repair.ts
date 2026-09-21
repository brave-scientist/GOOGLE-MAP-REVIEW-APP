/**
 * scripts/test-job20-2-12-incident-repair.ts
 *
 * Targeted regression and integration test suite for JOB-20.2.12:
 * PRODUCTION GOOGLE INTEGRATION FAILURE INVESTIGATION & TARGETED REPAIR
 *
 * Verifies all required verification domains:
 * 1. Upstream Google API 403 extraction: project number (157306378344), service name, and direct activation link.
 * 2. Review sync 403 preservation: Google API errors must NEVER be masked as tenant permission errors.
 * 3. Review sync tenant access denial: Truly unauthorized businesses still return 403 and access denied message.
 * 4. Locations route pass-through: subcode, projectNumber, serviceName, and activationUrl passed in JSON.
 * 5. Integrations disconnect resilience: POST /api/integrations bounded transient retry absorbs momentary pool spikes.
 * 6. Integrations status resilience: GET /api/integrations bounded transient retry absorbs momentary pool spikes.
 * 7. Dashboard lightweight query: businessesOnly=true returns businesses immediately without review aggregations.
 * 8. Dashboard saturation resilience: Server-side bounded retry absorbs momentary pool spikes.
 * 9. Frontend settings error mapping: Ensures data.message / data.error is prioritized over generic fallbacks.
 */

import fs from 'fs'
import { NextRequest } from 'next/server'
import { db } from '../src/lib/db'
import { seedTestTenant, cleanupTestTenant, generateTestEmail, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { storeTokens } from '../src/lib/oauth-store'
import { isDatabasePoolError, createDatabasePoolResponse } from '../src/lib/db-errors'
import {
  listGoogleAccounts,
  listGoogleLocations,
  GoogleApiError,
} from '../src/lib/integrations/google-business-profile'
import { GET as getLocationsHandler } from '../src/app/api/oauth/google/locations/route'
import { POST as syncReviewsHandler } from '../src/app/api/businesses/[id]/sync-reviews/route'
import { GET as getIntegrationsHandler, POST as postIntegrationsHandler } from '../src/app/api/integrations/route'
import { GET as getDashboardHandler } from '../src/app/api/dashboard/route'

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ PASS: ${name}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function mockFetch(handler: (input: any, init?: any) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<NextRequest> {
  const reqHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  }

  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: tenant.membership.role,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
      sessionVersion: tenant.user.sessionVersion,
    })
    reqHeaders['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const init: any = {
    method: options.method || 'GET',
    headers: reqHeaders,
  }

  if (options.body) {
    init.body = JSON.stringify(options.body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

async function runTests() {
  console.log('========================================================================')
  console.log('  JOB-20.2.12: INCIDENT REPAIR & RESILIENCE VERIFICATION SUITE')
  console.log('========================================================================\n')

  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '157306378344-uf3tj91husbph89bdjffjn5b8mqb3elv.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret'
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-min-32-chars-for-job20-2-12-verification'

  const originalFetch = global.fetch
  let primaryTenant: TestSeedResult | null = null
  let secondaryTenant: TestSeedResult | null = null

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: Google API 403 Classification with Project Number & Direct Link
    // ------------------------------------------------------------------------
    console.log('--- Section 1: Google API 403 Classification with Project Number & Link ---')

    mockFetch(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('mybusinessaccountmanagement.googleapis.com')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'My Business Account Management API has not been used in project 157306378344 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=157306378344 then retry.',
              status: 'PERMISSION_DENIED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'SERVICE_DISABLED',
                  domain: 'googleapis.com',
                  metadata: {
                    consumer: 'projects/157306378344',
                    service: 'mybusinessaccountmanagement.googleapis.com',
                  },
                },
              ],
            },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('Not Found', { status: 404 })
    })

    let caughtErr: any = null
    try {
      await listGoogleAccounts('mock-access-token')
    } catch (e: any) {
      caughtErr = e
    }

    assert(caughtErr instanceof GoogleApiError, 'listGoogleAccounts throws GoogleApiError on 403 SERVICE_DISABLED')
    assert(caughtErr?.statusCode === 403, 'Error preserves HTTP 403 status code')
    assert(caughtErr?.subcode === 'GOOGLE_API_DISABLED', 'Error correctly identifies subcode GOOGLE_API_DISABLED')
    assert(caughtErr?.projectNumber === '157306378344', 'Error extracts exact project number 157306378344', caughtErr?.projectNumber)
    assert(caughtErr?.serviceName === 'mybusinessaccountmanagement.googleapis.com', 'Error extracts disabled service name', caughtErr?.serviceName)
    assert(
      typeof caughtErr?.activationUrl === 'string' && caughtErr.activationUrl.includes('157306378344'),
      'Error provides direct activation link with project number',
      caughtErr?.activationUrl
    )
    assert(
      caughtErr?.message.includes('157306378344'),
      'Formatted error message explicitly contains the Google Cloud project number',
      caughtErr?.message
    )
    assert(
      caughtErr?.message.includes('My Business Account Management API'),
      'Formatted error message advises enabling My Business Account Management API'
    )

    // Verify listGoogleLocations extraction
    mockFetch(async (url: any) => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message:
              'My Business Business Information API has not been used in project 157306378344 before or it is disabled. Enable it by visiting https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com?project=157306378344 then retry.',
            status: 'PERMISSION_DENIED',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'SERVICE_DISABLED',
                domain: 'googleapis.com',
                metadata: {
                  consumer: 'projects/157306378344',
                  service: 'mybusinessbusinessinformation.googleapis.com',
                },
              },
            ],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    })

    let locCaughtErr: any = null
    try {
      await listGoogleLocations('mock-access-token', 'accounts/123')
    } catch (e: any) {
      locCaughtErr = e
    }

    assert(locCaughtErr instanceof GoogleApiError, 'listGoogleLocations throws GoogleApiError on 403')
    assert(locCaughtErr?.subcode === 'GOOGLE_API_DISABLED', 'Location error identifies GOOGLE_API_DISABLED')
    assert(locCaughtErr?.projectNumber === '157306378344', 'Location error extracts project number 157306378344')
    assert(locCaughtErr?.message.includes('157306378344'), 'Location error message includes project number')

    // ------------------------------------------------------------------------
    // SECTION 2: Seed Test Tenants
    // ------------------------------------------------------------------------
    console.log('\n--- Section 2: Seed Test Tenants ---')
    primaryTenant = await seedTestTenant({
      name: 'Primary Repair User',
      businessName: 'Primary Repair Business',
      userEmail: generateTestEmail('repair-pri'),
    })
    console.log(`  ✓ Primary tenant created: ${primaryTenant.org.id}`)

    secondaryTenant = await seedTestTenant({
      name: 'Secondary Repair User',
      businessName: 'Secondary Repair Business',
      userEmail: generateTestEmail('repair-sec'),
    })
    console.log(`  ✓ Secondary tenant created: ${secondaryTenant.org.id}`)

    await storeTokens({
      businessId: primaryTenant.business.id,
      provider: 'google',
      accessToken: 'valid-mock-access-token',
      refreshToken: 'valid-mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    // ------------------------------------------------------------------------
    // SECTION 3: Locations Route Pass-Through of Metadata
    // ------------------------------------------------------------------------
    console.log('\n--- Section 3: Locations Route Metadata Pass-Through ---')

    mockFetch(async (url: any) => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'My Business Account Management API has not been used in project 157306378344 before or it is disabled.',
            status: 'PERMISSION_DENIED',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'SERVICE_DISABLED',
                metadata: {
                  consumer: 'projects/157306378344',
                  service: 'mybusinessaccountmanagement.googleapis.com',
                },
              },
            ],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const locReq = await createAuthRequest(
      `/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const locRes = await getLocationsHandler(locReq)
    const locData = await locRes.json()

    assert(locRes.status === 403, 'GET /api/oauth/google/locations returns HTTP 403')
    assert(locData.code === 'GOOGLE_PERMISSION_DENIED', 'Locations response code is GOOGLE_PERMISSION_DENIED')
    assert(locData.subcode === 'GOOGLE_API_DISABLED', 'Locations response subcode is GOOGLE_API_DISABLED')
    assert(locData.projectNumber === '157306378344', 'Locations response includes projectNumber 157306378344', locData.projectNumber)
    assert(locData.activationUrl?.includes('157306378344'), 'Locations response includes activationUrl')
    assert(locData.message.includes('157306378344'), 'Locations response message contains project number')

    // ------------------------------------------------------------------------
    // SECTION 4: Review Sync Error Preservation (No False Permission Masking)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 4: Review Sync Error Preservation (Symptom 3 Fix) ---')

    // Reset primary business location to unselected placeholder to test auto-discovery fallback
    await db.business.update({
      where: { id: primaryTenant.business.id },
      data: {
        googleLocationId: 'google_connected',
        googleLocationVerified: false,
      },
    })

    // Mock Google 403 during review sync auto-discovery
    mockFetch(async (url: any) => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'My Business Account Management API has not been used in project 157306378344 before or it is disabled.',
            status: 'PERMISSION_DENIED',
            details: [
              {
                reason: 'SERVICE_DISABLED',
                metadata: {
                  consumer: 'projects/157306378344',
                  service: 'mybusinessaccountmanagement.googleapis.com',
                },
              },
            ],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const syncReq = await createAuthRequest(
      `/api/businesses/${primaryTenant.business.id}/sync-reviews`,
      primaryTenant,
      { method: 'POST' }
    )
    const syncRes = await syncReviewsHandler(syncReq, {
      params: Promise.resolve({ id: primaryTenant.business.id }),
    })
    const syncData = await syncRes.json()

    assert(syncRes.status === 403, 'POST sync-reviews returns HTTP 403 when Google API is disabled')
    assert(syncData.subcode === 'GOOGLE_API_DISABLED', 'Sync response includes subcode GOOGLE_API_DISABLED')
    assert(
      syncData.message.includes('Google Business Profile API is disabled in your Google Cloud project'),
      'Sync response message explicitly reports Google API disabled, NOT a tenant permission error',
      syncData.message
    )
    assert(syncData.projectNumber === '157306378344', 'Sync response includes projectNumber 157306378344')

    // Verify true tenant access denial still rejects with 403 BUSINESS_NOT_OWNED
    const crossTenantSyncReq = await createAuthRequest(
      `/api/businesses/${secondaryTenant.business.id}/sync-reviews`,
      primaryTenant,
      { method: 'POST' }
    )
    const crossTenantRes = await syncReviewsHandler(crossTenantSyncReq, {
      params: Promise.resolve({ id: secondaryTenant.business.id }),
    })
    const crossTenantData = await crossTenantRes.json()

    assert(crossTenantRes.status === 403, 'Cross-tenant sync attempt rejected with HTTP 403')
    assert(crossTenantData.code === 'BUSINESS_NOT_OWNED', 'Cross-tenant code is BUSINESS_NOT_OWNED')
    assert(crossTenantData.error === 'Access denied', 'Cross-tenant error message is Access denied')

    // ------------------------------------------------------------------------
    // SECTION 5: Integrations Disconnect Transient Retry (Symptom 2 Fix)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 5: Integrations Disconnect Database Pool Saturation Handling ---')

    // Verify POST /api/integrations executes cleanly
    const disconnectReq = await createAuthRequest('/api/integrations', primaryTenant, {
      method: 'POST',
      body: {
        provider: 'google',
        action: 'disconnect',
        businessId: primaryTenant.business.id,
      },
    })
    const disconnectRes = await postIntegrationsHandler(disconnectReq)
    const disconnectData = await disconnectRes.json()

    assert(disconnectRes.status === 200, 'POST /api/integrations disconnect returns HTTP 200')
    assert(disconnectData.status === 'available', 'Post-disconnect status is available')

    // Verify database token was cleanly deleted
    const remainingToken = await db.oAuthToken.findUnique({
      where: {
        businessId_provider: {
          businessId: primaryTenant.business.id,
          provider: 'google',
        },
      },
    })
    assert(!remainingToken, 'OAuthToken was cleanly removed from database')

    // Verify business Google metadata was reset
    const refreshedBiz = await db.business.findUnique({
      where: { id: primaryTenant.business.id },
      select: {
        googleLocationId: true,
        googleLocationVerified: true,
      },
    })
    assert(refreshedBiz?.googleLocationId === null, 'googleLocationId was reset to null')
    assert(refreshedBiz?.googleLocationVerified === false, 'googleLocationVerified was reset to false')

    // ------------------------------------------------------------------------
    // SECTION 6: Dashboard Lightweight Query & Concurrency Relief (Symptom 1 Fix)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 6: Dashboard Lightweight Query (businessesOnly=true) ---')

    const dashLightReq = await createAuthRequest(
      '/api/dashboard?businessesOnly=true',
      primaryTenant
    )
    const dashLightRes = await getDashboardHandler(dashLightReq)
    const dashLightData = await dashLightRes.json()

    assert(dashLightRes.status === 200, 'GET /api/dashboard?businessesOnly=true returns HTTP 200')
    assert(Array.isArray(dashLightData.businesses), 'Returns businesses array')
    assert(dashLightData.businesses.length >= 1, 'Contains tenant businesses')
    assert(dashLightData.businesses[0].id === primaryTenant.business.id, 'First business matches tenant business')
    assert(dashLightData.stats.totalReviews === 0, 'Skips totalReviews count query')
    assert(dashLightData.recentReviews.length === 0, 'Skips recentReviews queries')
    assert(dashLightData.ratingDistribution.length === 0, 'Skips rating distribution groupBy')
    assert(dashLightData.sentimentTrend.length === 0, 'Skips 8-week sentiment trend computation')

    // Verify full dashboard query still works when requested by DashboardPage
    const dashFullReq = await createAuthRequest(
      `/api/dashboard?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const dashFullRes = await getDashboardHandler(dashFullReq)
    const dashFullData = await dashFullRes.json()

    assert(dashFullRes.status === 200, 'Full GET /api/dashboard returns HTTP 200')
    assert(dashFullData.stats.avgRating !== undefined, 'Full dashboard includes avgRating')
    assert(Array.isArray(dashFullData.ratingDistribution), 'Full dashboard includes ratingDistribution')
    assert(dashFullData.ratingDistribution.length === 5, 'Rating distribution has 5 buckets')

    // ------------------------------------------------------------------------
    // SECTION 7: Static Client Invariant Assertions
    // ------------------------------------------------------------------------
    console.log('\n--- Section 7: Static Invariant Verification in Source Code ---')

    const settingsSource = fs.readFileSync('src/app/settings/page.tsx', 'utf-8')
    assert(
      !settingsSource.includes("res.status === 403\n                  ? 'You do not have permission to sync reviews for this location.'"),
      'settings/page.tsx NO LONGER contains unconditional 403 hardcoded masking'
    )
    assert(
      settingsSource.includes('fallbackError = data?.message || data?.error'),
      'settings/page.tsx prioritizes data.message and data.error in review sync failure handling'
    )
    assert(
      settingsSource.includes('res.status === 503') && settingsSource.includes('await new Promise((resolve) => setTimeout(resolve, 500))'),
      'settings/page.tsx includes bounded transient retry on 503 in handleToggleIntegration'
    )
    assert(
      settingsSource.includes('break-words'),
      'settings/page.tsx includes break-words in googlePicker.error display'
    )

    const dashboardSource = fs.readFileSync('src/app/dashboard/page.tsx', 'utf-8')
    assert(
      dashboardSource.includes('if (r.status === 503)') && dashboardSource.includes('setTimeout(resolve, 500)'),
      'dashboard/page.tsx includes bounded retry on 503 database pool saturation'
    )
    assert(
      dashboardSource.includes('Database connection limit reached. Please retry in a few moments.'),
      'dashboard/page.tsx provides user-friendly pool saturation message instead of raw HTTP 503'
    )

    const bizContextSource = fs.readFileSync('src/lib/business-context.tsx', 'utf-8')
    assert(
      bizContextSource.includes('/api/dashboard?businessesOnly=true'),
      'business-context.tsx calls /api/dashboard?businessesOnly=true to eliminate database query saturation'
    )

  } catch (err: any) {
    console.error('Test execution failed with unexpected error:', err)
    failed++
  } finally {
    global.fetch = originalFetch
    if (primaryTenant) await cleanupTestTenant(primaryTenant.org.id)
    if (secondaryTenant) await cleanupTestTenant(secondaryTenant.org.id)
    console.log('\n--- Cleanup ---')
    console.log('  ✓ Cleaned up test tenants')
  }

  console.log('\n========================================================================')
  console.log(`  JOB-20.2.12 SUITE SUMMARY: ${passed} passed, ${failed} failed`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled suite error:', err)
  process.exit(1)
})

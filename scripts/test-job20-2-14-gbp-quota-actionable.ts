/**
 * scripts/test-job20-2-14-gbp-quota-actionable.ts
 *
 * Targeted regression and integration test suite for JOB-20.2.14:
 * MAKE GBP QUOTA ERRORS ACTIONABLE & VERIFY DISCOVERY RECOVERY
 *
 * Verifies all required verification domains:
 * 1. HTTP 429 with explicit evidence of zero quota (structured quota_limit_value: '0').
 * 2. HTTP 429 with text evidence of zero quota (limit is 0).
 * 3. HTTP 429 without zero-quota evidence (transient rate limit).
 * 4. Project number is never fabricated or hardcoded when absent.
 * 5. HTTP 403 SERVICE_DISABLED (with project number and direct activation link).
 * 6. HTTP 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT (scope failure).
 * 7. HTTP 403 generic permission denied (does not misclassify as disabled).
 * 8. HTTP 401 authentication failure (GOOGLE_REAUTH_REQUIRED).
 * 9. HTTP 5xx Google service error (mapped to 502 GOOGLE_API_ERROR).
 * 10. Business Information API (listGoogleLocations) consistent error classification.
 * 11. Locations route (/api/oauth/google/locations) safe metadata pass-through and token sanitization.
 * 12. Database pool saturation remains distinguishable from Google API errors.
 * 13. Settings page UI invariants and state mapping.
 */

import fs from 'fs'
import { NextRequest } from 'next/server'
import { db } from '../src/lib/db'
import { seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { storeTokens } from '../src/lib/oauth-store'
import { isDatabasePoolError, createDatabasePoolResponse } from '../src/lib/db-errors'
import {
  listGoogleAccounts,
  listGoogleLocations,
  GoogleApiError,
  parseGoogleApiErrorDetails,
} from '../src/lib/integrations/google-business-profile'
import { GET as getLocationsHandler } from '../src/app/api/oauth/google/locations/route'

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
  console.log('  JOB-20.2.14: ACTIONABLE GBP QUOTA & DISCOVERY RECOVERY SUITE')
  console.log('========================================================================\n')

  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '157306378344-uf3tj91husbph89bdjffjn5b8mqb3elv.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret'
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-min-32-chars-for-job20-2-14-verification'

  const originalFetch = global.fetch
  let primaryTenant: TestSeedResult | null = null

  try {
    // ------------------------------------------------------------------------
    // Domain 1: HTTP 429 with explicit evidence of zero quota (structured)
    // ------------------------------------------------------------------------
    console.log('--- Section 1: HTTP 429 Zero-Quota Detection (Structured Details) ---')

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' of service 'mybusinessaccountmanagement.googleapis.com' for consumer 'project_number:157306378344'.",
            status: 'RESOURCE_EXHAUSTED',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'RATE_LIMIT_EXCEEDED',
                domain: 'googleapis.com',
                metadata: {
                  consumer: 'projects/157306378344',
                  quota_limit: 'QueriesPerMinutePerProject',
                  quota_limit_value: '0',
                  quota_metric: 'mybusinessaccountmanagement.googleapis.com/queries',
                  service: 'mybusinessaccountmanagement.googleapis.com',
                },
              },
            ],
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtZeroQuota: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtZeroQuota = err
    }

    assert(caughtZeroQuota instanceof GoogleApiError, 'listGoogleAccounts throws GoogleApiError on structured 429')
    assert(caughtZeroQuota?.statusCode === 429, 'Status code is 429')
    assert(caughtZeroQuota?.code === 'GOOGLE_QUOTA_EXCEEDED', 'Error code is GOOGLE_QUOTA_EXCEEDED')
    assert(caughtZeroQuota?.subcode === 'GOOGLE_ZERO_QUOTA', 'Subcode is GOOGLE_ZERO_QUOTA')
    assert(caughtZeroQuota?.projectNumber === '157306378344', 'Project number 157306378344 extracted correctly')
    assert(caughtZeroQuota?.serviceName === 'mybusinessaccountmanagement.googleapis.com', 'Service name extracted')
    assert(caughtZeroQuota?.activationUrl?.includes('request-access'), 'Provides direct link to Basic Access application form')
    assert(caughtZeroQuota?.message.includes('0 quota'), 'Message explicitly mentions 0 quota')
    assert(caughtZeroQuota?.message.includes('157306378344'), 'Message includes project number')
    assert(caughtZeroQuota?.message.includes('Basic API Access'), 'Message advises submitting Basic API Access application')
    assert(!caughtZeroQuota?.message.toLowerCase().includes('try again later'), 'Does NOT mislead with "try again later"')

    // ------------------------------------------------------------------------
    // Domain 2: HTTP 429 with text evidence of zero quota
    // ------------------------------------------------------------------------
    console.log('\n--- Section 2: HTTP 429 Zero-Quota Detection (Text Evidence in Message) ---')

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota limit 'Queries per minute' has been exceeded: limit is 0 for project 987654321000",
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtTextZero: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtTextZero = err
    }

    assert(caughtTextZero instanceof GoogleApiError, 'Catches zero quota from message text')
    assert(caughtTextZero?.subcode === 'GOOGLE_ZERO_QUOTA', 'Subcode is GOOGLE_ZERO_QUOTA')
    assert(caughtTextZero?.projectNumber === '987654321000', 'Project number extracted from text')
    assert(caughtTextZero?.activationUrl?.includes('request-access'), 'Provides link to Basic Access form')

    // ------------------------------------------------------------------------
    // Domain 3: HTTP 429 without zero-quota evidence (transient rate limit)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 3: HTTP 429 Transient Rate Limit (No Zero-Quota Evidence) ---')

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: 'User rate limit exceeded for queries per minute.',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtTransient429: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtTransient429 = err
    }

    assert(caughtTransient429 instanceof GoogleApiError, 'Throws GoogleApiError on transient 429')
    assert(caughtTransient429?.statusCode === 429, 'Status code is 429')
    assert(caughtTransient429?.code === 'GOOGLE_QUOTA_EXCEEDED', 'Code is GOOGLE_QUOTA_EXCEEDED')
    assert(caughtTransient429?.subcode === 'GOOGLE_RATE_LIMITED', 'Subcode is GOOGLE_RATE_LIMITED (not ZERO_QUOTA)')
    assert(caughtTransient429?.activationUrl === undefined, 'No basic access link for transient rate limit')
    assert(caughtTransient429?.message.includes('rate limit reached'), 'Gives appropriate rate limit guidance')
    assert(caughtTransient429?.message.includes('wait a few moments'), 'Advises waiting a few moments')

    // ------------------------------------------------------------------------
    // Domain 4: Project number is NEVER hardcoded or fabricated
    // ------------------------------------------------------------------------
    console.log('\n--- Section 4: Project Number Integrity (Never Fabricated) ---')

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: 'Rate limit exceeded: limit is 0',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtNoProject: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtNoProject = err
    }

    assert(caughtNoProject?.projectNumber === undefined, 'Project number is undefined when not in Google response')
    assert(!caughtNoProject?.message.includes('157306378344'), 'Never injects project 157306378344 when not provided by Google')

    // ------------------------------------------------------------------------
    // Domain 5: HTTP 403 SERVICE_DISABLED handling
    // ------------------------------------------------------------------------
    console.log('\n--- Section 5: HTTP 403 SERVICE_DISABLED Classification ---')

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'My Business Account Management API has not been used in project 157306378344 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=157306378344 then retry.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtDisabled: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtDisabled = err
    }

    assert(caughtDisabled?.statusCode === 403, '403 preserves status code 403')
    assert(caughtDisabled?.subcode === 'GOOGLE_API_DISABLED', 'Subcode is GOOGLE_API_DISABLED')
    assert(caughtDisabled?.projectNumber === '157306378344', 'Extracts project number from 403')
    assert(caughtDisabled?.activationUrl?.includes('mybusinessaccountmanagement.googleapis.com'), 'Provides direct console enablement URL')

    // ------------------------------------------------------------------------
    // Domain 6: HTTP 403 Scope failure & Generic permission denied
    // ------------------------------------------------------------------------
    console.log('\n--- Section 6: HTTP 403 Scope & Permission Differentiation ---')

    // Scope insufficient
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Request had insufficient authentication scopes.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtScope: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtScope = err
    }
    assert(caughtScope?.subcode === 'GOOGLE_SCOPE_INSUFFICIENT', 'Scope failure classified as GOOGLE_SCOPE_INSUFFICIENT')
    assert(caughtScope?.message.includes('missing required permissions'), 'Advises granting requested scopes')

    // Generic permission denied (NOT disabled, NOT scope)
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'The caller does not have permission to manage this resource.',
            status: 'PERMISSION_DENIED',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtGeneric403: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caughtGeneric403 = err
    }
    assert(caughtGeneric403?.subcode === 'GOOGLE_PERMISSION_DENIED', 'Generic 403 classified as GOOGLE_PERMISSION_DENIED')
    assert(!caughtGeneric403?.message.includes('is disabled'), 'Does NOT falsely claim API is disabled')

    // ------------------------------------------------------------------------
    // Domain 7: HTTP 401 & 5xx Google errors
    // ------------------------------------------------------------------------
    console.log('\n--- Section 7: HTTP 401 & 5xx Handling ---')

    // 401
    global.fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caught401: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caught401 = err
    }
    assert(caught401?.statusCode === 401, '401 preserves status 401')
    assert(caught401?.code === 'GOOGLE_REAUTH_REQUIRED', '401 code is GOOGLE_REAUTH_REQUIRED')

    // 503 from Google
    global.fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: 'The service is currently unavailable.', status: 'UNAVAILABLE' } }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caught503: any = null
    try {
      await listGoogleAccounts('test_token')
    } catch (err) {
      caught503 = err
    }
    assert(caught503?.statusCode === 502, 'Google 503 is mapped to gateway status 502')
    assert(caught503?.code === 'GOOGLE_API_ERROR', 'Google 503 code is GOOGLE_API_ERROR')

    // ------------------------------------------------------------------------
    // Domain 8: Business Information API (listGoogleLocations) consistency
    // ------------------------------------------------------------------------
    console.log('\n--- Section 8: Business Information API Error Classification Consistency ---')

    // Zero quota on locations
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota limit 'Queries per minute' has been exceeded: limit is 0",
            status: 'RESOURCE_EXHAUSTED',
            details: [
              {
                metadata: {
                  consumer: 'projects/157306378344',
                  quota_limit_value: '0',
                  service: 'mybusinessbusinessinformation.googleapis.com',
                },
              },
            ],
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtLocZero: any = null
    try {
      await listGoogleLocations('test_token', 'accounts/12345')
    } catch (err) {
      caughtLocZero = err
    }

    assert(caughtLocZero?.statusCode === 429, 'listGoogleLocations 429 status is 429')
    assert(caughtLocZero?.subcode === 'GOOGLE_ZERO_QUOTA', 'listGoogleLocations subcode is GOOGLE_ZERO_QUOTA')
    assert(caughtLocZero?.projectNumber === '157306378344', 'listGoogleLocations extracts project number')
    assert(caughtLocZero?.serviceName === 'mybusinessbusinessinformation.googleapis.com', 'Service name is Business Information')

    // Transient rate limit on locations
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: 'Too many queries',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    let caughtLocTransient: any = null
    try {
      await listGoogleLocations('test_token', 'accounts/12345')
    } catch (err) {
      caughtLocTransient = err
    }
    assert(caughtLocTransient?.subcode === 'GOOGLE_RATE_LIMITED', 'listGoogleLocations transient subcode is GOOGLE_RATE_LIMITED')

    // ------------------------------------------------------------------------
    // Domain 9: Locations Route (/api/oauth/google/locations) Pass-Through
    // ------------------------------------------------------------------------
    console.log('\n--- Section 9: Locations Route Safe Metadata Pass-Through ---')

    primaryTenant = await seedTestTenant({
      name: 'JOB-20.2.14 User',
      businessName: 'JOB-20.2.14 Business',
    })
    await storeTokens({
      businessId: primaryTenant.business.id,
      provider: 'google',
      accessToken: 'valid-mock-access-token',
      refreshToken: 'valid-mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    // 1. Zero quota pass-through
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota exceeded: limit is 0 for project 157306378344. Secret token Bearer ya29.secret-token-should-not-leak should be stripped",
            status: 'RESOURCE_EXHAUSTED',
            details: [
              {
                metadata: {
                  consumer: 'projects/157306378344',
                  quota_limit_value: '0',
                },
              },
            ],
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    const reqZero = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const resZero = await getLocationsHandler(reqZero)
    const dataZero = await resZero.json()

    assert(resZero.status === 429, 'Route returns HTTP 429 for zero quota')
    assert(dataZero.code === 'GOOGLE_QUOTA_EXCEEDED', 'Route returns code GOOGLE_QUOTA_EXCEEDED')
    assert(dataZero.subcode === 'GOOGLE_ZERO_QUOTA', 'Route returns subcode GOOGLE_ZERO_QUOTA')
    assert(dataZero.projectNumber === '157306378344', 'Route passes projectNumber 157306378344')
    assert(dataZero.activationUrl?.includes('request-access'), 'Route passes activationUrl for Basic Access')
    assert(dataZero.message.includes('0 quota'), 'Route message explains 0 quota')
    assert(dataZero.originalMessage !== undefined, 'Route includes originalMessage')
    assert(!dataZero.originalMessage.includes('ya29.secret-token-should-not-leak'), 'Sanitizes originalMessage (strips Bearer tokens)')
    assert(dataZero.originalMessage.includes('Bearer [REDACTED]'), 'Sanitized token replaced with Bearer [REDACTED]')

    // 2. Transient rate limit pass-through
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      ) as any

    const reqTransient = await createAuthRequest(
      `http://localhost:3000/api/oauth/google/locations?businessId=${primaryTenant.business.id}`,
      primaryTenant
    )
    const resTransient = await getLocationsHandler(reqTransient)
    const dataTransient = await resTransient.json()

    assert(resTransient.status === 429, 'Route returns HTTP 429 for transient rate limit')
    assert(dataTransient.subcode === 'GOOGLE_RATE_LIMITED', 'Route returns subcode GOOGLE_RATE_LIMITED')
    assert(dataTransient.activationUrl === undefined, 'Route activationUrl is undefined for transient 429')

    // ------------------------------------------------------------------------
    // Domain 10: Database Pool Saturation Distinguishability
    // ------------------------------------------------------------------------
    console.log('\n--- Section 10: Database Pool Saturation Distinguishability ---')

    const mockPoolError = new Error('EMAXCONNSESSION: max clients reached for pool')
    assert(isDatabasePoolError(mockPoolError) === true, 'isDatabasePoolError correctly identifies pool saturation')

    const poolResponse = createDatabasePoolResponse()
    assert(poolResponse.status === 503, 'Pool response returns HTTP 503')
    const poolData = await poolResponse.json()
    assert(poolData.code === 'DATABASE_POOL_SATURATED', 'Pool response code is DATABASE_POOL_SATURATED')
    assert(poolData.code !== 'GOOGLE_QUOTA_EXCEEDED', 'Pool saturation is NEVER conflated with Google quota error')

    // ------------------------------------------------------------------------
    // Domain 11: Static Invariant Verification in Source Files
    // ------------------------------------------------------------------------
    console.log('\n--- Section 11: Static Invariant Verification in Source Files ---')

    const gbpCode = fs.readFileSync('src/lib/integrations/google-business-profile.ts', 'utf-8')
    const locationsRouteCode = fs.readFileSync('src/app/api/oauth/google/locations/route.ts', 'utf-8')
    const settingsCode = fs.readFileSync('src/app/settings/page.tsx', 'utf-8')

    assert(
      gbpCode.includes('GOOGLE_ZERO_QUOTA'),
      'google-business-profile.ts defines GOOGLE_ZERO_QUOTA subcode'
    )
    assert(
      gbpCode.includes('GOOGLE_RATE_LIMITED'),
      'google-business-profile.ts defines GOOGLE_RATE_LIMITED subcode'
    )
    assert(
      gbpCode.includes('https://developers.google.com/my-business/content/get-started#request-access'),
      'google-business-profile.ts provides link to official Google access documentation'
    )
    assert(
      !gbpCode.includes("'Google API quota or rate limit exceeded. Please try again later.'"),
      'google-business-profile.ts NO LONGER hardcodes generic misleading quota message'
    )
    assert(
      locationsRouteCode.includes('originalMessage: sanitizedOriginal'),
      'locations route includes sanitized originalMessage'
    )
    assert(
      settingsCode.includes("googlePicker.subcode === 'GOOGLE_ZERO_QUOTA'"),
      'settings/page.tsx inspects GOOGLE_ZERO_QUOTA subcode'
    )
    assert(
      settingsCode.includes('Apply for Basic Access'),
      'settings/page.tsx renders "Apply for Basic Access" button for zero quota'
    )
    assert(
      settingsCode.includes("googlePicker.subcode !== 'GOOGLE_ZERO_QUOTA'"),
      'settings/page.tsx avoids rendering futile Retry Discovery button on zero quota'
    )

  } finally {
    global.fetch = originalFetch
    if (primaryTenant) {
      await cleanupTestTenant(primaryTenant.org.id)
      console.log('\n  ✓ Cleaned up test tenant')
    }
  }

  console.log('\n========================================================================')
  console.log(`  JOB-20.2.14 SUITE SUMMARY: ${passed} passed, ${failed} failed`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err)
  process.exit(1)
})

import { NextRequest, NextResponse } from 'next/server'
import {
  getGoogleAuthUrl,
  isGoogleConfigured,
  generatePKCE,
  generateCryptographicEntropy,
  setGBPStateCookie,
} from '@/lib/integrations/google-business-profile'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { isDatabasePoolError } from '@/lib/db-errors'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google — Redirect to Google OAuth consent screen
// SEC-01: requires auth + verifies the caller's org owns the businessId
//         before initiating OAuth. Without this, an attacker could initiate
//         OAuth with businessId=victim_business_id and hijack the connection.
//
// Order of checks (deliberate):
//   1. Auth         (401 if no session)
//   2. businessId present + owned by caller's org (400/403 if not)
//   3. Google configured (503 if not — only revealed to authorized callers)
//
// This order ensures an unauthenticated or unauthorized caller never learns
// whether Google OAuth is configured.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = new URL(request.url).origin
  const rawReturnTo = searchParams.get('returnTo') || ''
  const returnTo = rawReturnTo === '/onboarding' ? '/onboarding' : '/settings'

  // Content negotiation: detect browser document navigation vs programmatic API calls
  const acceptHeader = request.headers.get('accept') || ''
  const secFetchDest = request.headers.get('sec-fetch-dest') || ''
  const isBrowserNav =
    secFetchDest === 'document' ||
    (acceptHeader.includes('text/html') && !acceptHeader.includes('application/json'))

  const respondWithError = (
    status: number,
    code: string,
    message: string,
    extraJson?: Record<string, any>
  ) => {
    if (isBrowserNav) {
      if (status === 401) {
        return NextResponse.redirect(
          new URL(`/login?error=session_expired&returnTo=${encodeURIComponent(returnTo)}`, origin)
        )
      }
      return NextResponse.redirect(
        new URL(
          `${returnTo}?error=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`,
          origin
        )
      )
    }
    return NextResponse.json(
      { error: extraJson?.error || message, code, message, ...(extraJson || {}) },
      { status }
    )
  }

  try {
    // 1. SEC-01: require auth (with transparent transient retry for database pool saturation)
    let ctx: Awaited<ReturnType<typeof getTenantContext>>
    try {
      ctx = await getTenantContext(request)
    } catch (authErr: any) {
      const errMsg = authErr?.message || ''
      const isPool =
        errMsg.includes('EMAXCONNSESSION') ||
        errMsg.includes('max clients reached') ||
        errMsg.includes('PrismaClientInitializationError') ||
        errMsg.includes('connector')
      if (isPool) {
        // Brief 200ms delay to allow concurrent connection slots to free up
        await new Promise((resolve) => setTimeout(resolve, 200))
        ctx = await getTenantContext(request)
      } else {
        throw authErr
      }
    }

    if (ctx instanceof NextResponse) {
      if (isBrowserNav) {
        if (ctx.status === 503) {
          return NextResponse.redirect(
            new URL(
              `${returnTo}?error=DATABASE_POOL_SATURATED&message=${encodeURIComponent('The database connection pool is currently saturated. Please wait a few moments and try connecting again.')}`,
              origin
            )
          )
        }
        return NextResponse.redirect(
          new URL(`/login?error=session_expired&returnTo=${encodeURIComponent(returnTo)}`, origin)
        )
      }
      return ctx
    }

    // 1b. Rate limiting: 10 OAuth initiations per org per hour
    const rl = await rateLimit(
      `google:oauth:init:${ctx.orgId}`,
      RATE_LIMITS.googleOAuthInit.limit,
      RATE_LIMITS.googleOAuthInit.windowMs
    )
    if (!rl.allowed) {
      return respondWithError(
        429,
        'RATE_LIMITED',
        'Too many Google OAuth requests. Please wait before trying again.'
      )
    }

    // 2. SEC-01: businessId must be present AND owned by the caller's org
    const businessId = searchParams.get('businessId') || ''

    if (!businessId) {
      return respondWithError(
        400,
        'MISSING_BUSINESS_ID',
        'businessId query parameter is required',
        { error: 'businessId query parameter is required' }
      )
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) {
      if (isBrowserNav) {
        return NextResponse.redirect(
          new URL(
            `${returnTo}?error=BUSINESS_NOT_OWNED&message=${encodeURIComponent('Access denied: You do not have permission to manage this business.')}`,
            origin
          )
        )
      }
      return denied
    }

    // 3. Google OAuth configured?
    if (!isGoogleConfigured()) {
      return respondWithError(
        503,
        'GOOGLE_NOT_CONFIGURED',
        'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Business Profile integration.',
        {
          error: 'Google OAuth not configured',
          message:
            'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Business Profile integration.',
          setupInstructions: {
            step1: 'Go to https://console.cloud.google.com → Create project',
            step2: 'Enable "Google Business Profile API" in APIs & Services → Library',
            step3: 'Create OAuth 2.0 credentials (Web application) in APIs & Services → Credentials',
            step4:
              'Add this URL to Authorized redirect URIs: ' +
              new URL('/api/oauth/google/callback', request.url).origin +
              '/api/oauth/google/callback',
            step5:
              'Submit API access request at https://developers.google.com/my-business/content/prereq-faq (takes 4-6 weeks)',
            step6:
              'Copy Client ID and Client Secret to .env as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
          },
        }
      )
    }

    const redirectUri = `${origin}/api/oauth/google/callback`

    // 4. Generate PKCE verifier and S256 challenge (RFC 7636)
    const { codeVerifier, codeChallenge } = generatePKCE()

    // 5. Generate high-entropy cryptographically random state (>= 32 bytes entropy)
    const state = generateCryptographicEntropy(32)

    // 6. Construct canonical Google authorization URL
    const authUrl = getGoogleAuthUrl({
      redirectUri,
      state,
      codeChallenge,
    })

    // 7. Bind state, PKCE verifier, businessId, and userId into a protected JWE cookie
    const response = NextResponse.redirect(authUrl)
    await setGBPStateCookie(response, {
      state,
      codeVerifier,
      businessId,
      userId: ctx.user.id,
      createdAt: Date.now(),
      returnTo,
    })

    return response
  } catch (error: any) {
    console.error('[GBP OAuth] Initiation failed:', error?.message || 'Unknown error')

    const errorMsg = error?.message || ''
    const isPoolOrDbError =
      isDatabasePoolError(error) ||
      errorMsg.includes('EMAXCONNSESSION') ||
      errorMsg.includes('max clients reached') ||
      errorMsg.includes('PrismaClientInitializationError') ||
      errorMsg.includes('connector')

    if (isPoolOrDbError) {
      return respondWithError(
        503,
        'DATABASE_POOL_SATURATED',
        'The database connection pool is currently saturated. Please wait a few seconds and retry.',
        {
          error: 'Database connection limit reached. Please retry in a few moments.',
        }
      )
    }

    return respondWithError(
      500,
      'OAUTH_INITIATION_FAILED',
      'An unexpected error occurred while initiating Google authorization.',
      {
        error: 'Failed to initiate Google OAuth',
      }
    )
  }
}

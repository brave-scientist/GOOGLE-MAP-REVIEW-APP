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
  // 1. SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // 1b. Rate limiting: 10 OAuth initiations per org per hour
  const rl = await rateLimit(
    `google:oauth:init:${ctx.orgId}`,
    RATE_LIMITS.googleOAuthInit.limit,
    RATE_LIMITS.googleOAuthInit.windowMs
  )
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many Google OAuth requests. Please wait before trying again.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  // 2. SEC-01: businessId must be present AND owned by the caller's org
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId') || ''

  if (!businessId) {
    return NextResponse.json(
      { error: 'businessId query parameter is required' },
      { status: 400 },
    )
  }

  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) return denied

  // 3. Google OAuth configured?
  if (!isGoogleConfigured()) {
    return NextResponse.json({
      error: 'Google OAuth not configured',
      message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Business Profile integration.',
      setupInstructions: {
        step1: 'Go to https://console.cloud.google.com → Create project',
        step2: 'Enable "Google Business Profile API" in APIs & Services → Library',
        step3: 'Create OAuth 2.0 credentials (Web application) in APIs & Services → Credentials',
        step4: 'Add this URL to Authorized redirect URIs: ' + new URL('/api/oauth/google/callback', request.url).origin + '/api/oauth/google/callback',
        step5: 'Submit API access request at https://developers.google.com/my-business/content/prereq-faq (takes 4-6 weeks)',
        step6: 'Copy Client ID and Client Secret to .env as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      },
    }, { status: 503 })
  }

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/oauth/google/callback`

  // 4. Generate PKCE verifier and S256 challenge (RFC 7636)
  const { codeVerifier, codeChallenge } = generatePKCE()

  // 5. Generate high-entropy cryptographically random state (>= 32 bytes entropy)
  const state = generateCryptographicEntropy(32)

  // 6. Bind state, PKCE verifier, businessId, and userId into a protected JWE cookie
  const authUrl = getGoogleAuthUrl({
    redirectUri,
    state,
    codeChallenge,
  })

  const rawReturnTo = searchParams.get('returnTo') || ''
  const returnTo = rawReturnTo === '/onboarding' ? '/onboarding' : '/settings'

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
}

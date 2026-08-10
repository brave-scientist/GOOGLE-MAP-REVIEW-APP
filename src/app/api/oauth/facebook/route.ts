import { NextRequest, NextResponse } from 'next/server'
import { getFacebookAuthUrl, isFacebookConfigured } from '@/lib/integrations/facebook-graph'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/facebook — Redirect to Facebook OAuth consent screen
// SEC-01: requires auth + verifies the caller's org owns the businessId
//         before initiating OAuth (same pattern as Google).
//
// Order of checks (deliberate):
//   1. Auth         (401 if no session)
//   2. businessId present + owned by caller's org (400/403 if not)
//   3. Facebook configured (503 if not — only revealed to authorized callers)
export async function GET(request: NextRequest) {
  // 1. SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

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

  // 3. Facebook OAuth configured?
  if (!isFacebookConfigured()) {
    return NextResponse.json({
      error: 'Facebook OAuth not configured',
      message: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env to enable Facebook Pages integration.',
      setupInstructions: {
        step1: 'Go to https://developers.facebook.com → My Apps → Create App',
        step2: 'Select "Business" as the app type',
        step3: 'Add the "Facebook Login" product to your app',
        step4: 'In Facebook Login settings, add this URL to Valid OAuth Redirect URIs: ' + new URL('/api/oauth/facebook/callback', request.url).origin + '/api/oauth/facebook/callback',
        step5: 'Submit your app for App Review to request pages_read_engagement and pages_manage_engagement permissions (takes 2-4 weeks)',
        step6: 'Copy App ID and App Secret to .env as FACEBOOK_APP_ID and FACEBOOK_APP_SECRET',
      },
    }, { status: 503 })
  }

  const redirectUri = `${new URL('/api/oauth/facebook/callback', request.url).origin}/api/oauth/facebook/callback`

  const authUrl = getFacebookAuthUrl(redirectUri, businessId)
  return NextResponse.redirect(authUrl)
}

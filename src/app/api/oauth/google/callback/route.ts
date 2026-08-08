import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { exchangeCodeForTokens } from '@/lib/integrations/google-business-profile'
import { storeTokens } from '@/lib/oauth-store'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google/callback — Handle OAuth callback from Google
//
// Flow: Google redirects here with ?code=...&state=businessId. We exchange the
// code for tokens and store them against the businessId from state.
//
// SEC-01: We MUST verify the logged-in user owns the businessId from state
// before storing tokens. Otherwise an attacker could initiate OAuth with their
// own Google account but use state=victim_business_id, then this callback
// would store the attacker's tokens against the victim's business — letting
// the attacker sync (and read) the victim's reviews via their own Google
// credentials, OR overwrite the victim's Google connection.
//
// The session cookie is still present because OAuth redirects happen in the
// user's browser, so we can read it here.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // businessId
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/settings?error=google_oauth_denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?error=google_oauth_failed', request.url))
  }

  // SEC-01: require auth — the user must still be logged in when Google redirects back
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) {
    // Not authenticated — redirect to login with a return path
    return NextResponse.redirect(new URL('/login?error=session_expired', request.url))
  }

  const businessId = state

  // SEC-01: verify the caller's org owns this business
  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) {
    return NextResponse.redirect(new URL('/settings?error=business_not_authorized', request.url))
  }

  try {
    const redirectUri = `${new URL('/api/oauth/google/callback', request.url).origin}/api/oauth/google/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    if (!tokens) {
      return NextResponse.redirect(new URL('/settings?error=google_token_failed', request.url))
    }

    // Store tokens in the encrypted OAuthToken table (NOT in googleLocationId)
    await storeTokens({
      businessId,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expires_at),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    // Mark business as Google-connected
    await db.business.update({
      where: { id: businessId },
      data: {
        googleLocationId: 'google_connected',
      },
    })

    // Log the connection
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'google.connected',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({ businessId, provider: 'google' }),
      },
    })

    return NextResponse.redirect(new URL('/settings?google=connected', request.url))
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(new URL('/settings?error=google_callback_failed', request.url))
  }
}

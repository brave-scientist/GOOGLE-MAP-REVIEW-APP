import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { exchangeCodeForTokens } from '@/lib/integrations/google-business-profile'
import { storeTokens } from '@/lib/oauth-store'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google/callback — Handle OAuth callback from Google
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

  try {
    const redirectUri = `${new URL('/api/oauth/google/callback', request.url).origin}/api/oauth/google/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    if (!tokens) {
      return NextResponse.redirect(new URL('/settings?error=google_token_failed', request.url))
    }

    const businessId = state

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

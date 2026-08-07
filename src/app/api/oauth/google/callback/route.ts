import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { exchangeCodeForTokens } from '@/lib/integrations/google-business-profile'

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

    // Store the tokens in the database (encrypted in production)
    // For now, store in the business's googleLocationId field as a JSON blob
    // In production, use a dedicated oauth_tokens table with encryption
    const businessId = state

    await db.business.update({
      where: { id: businessId },
      data: {
        googleLocationId: `google_connected:${JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          connected_at: new Date().toISOString(),
        })}`,
      },
    })

    // Log the connection
    await db.auditLog.create({
      data: {
        action: 'google.connected',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({ businessId }),
      },
    })

    // Redirect back to settings with success
    return NextResponse.redirect(new URL('/settings?google=connected', request.url))
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(new URL('/settings?error=google_callback_failed', request.url))
  }
}

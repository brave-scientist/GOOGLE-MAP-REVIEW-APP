import { NextRequest, NextResponse } from 'next/server'
import {
  getGoogleOAuthConfig,
  generatePKCE,
  generateCryptographicEntropy,
  buildGoogleAuthUrl,
  setOAuthStateCookie,
  OAuthStatePayload,
} from '@/lib/auth/google-oauth'
import { safeRedirectPath } from '@/lib/redirect-allowlist'

export const dynamic = 'force-dynamic'

// GET /api/auth/google — Initiates Google OAuth 2.0 / OIDC Authorization Code Flow with PKCE
export async function GET(request: NextRequest) {
  try {
    const config = getGoogleOAuthConfig()

    if (!config.configured) {
      return NextResponse.json(
        {
          error: 'Google authentication is not configured',
          code: 'GOOGLE_AUTH_UNCONFIGURED',
          message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.',
        },
        { status: 503 }
      )
    }

    const { searchParams } = new URL(request.url)
    const returnTo = safeRedirectPath(searchParams.get('returnTo') || searchParams.get('redirect'), '/dashboard')

    // 1. Generate PKCE verifier & challenge
    const { codeVerifier, codeChallenge } = generatePKCE()

    // 2. Generate cryptographically random state & nonce (>= 32 bytes entropy)
    const state = generateCryptographicEntropy(32)
    const nonce = generateCryptographicEntropy(32)

    // 3. Determine redirect URI
    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    // 4. Construct authorization URL
    const authUrl = buildGoogleAuthUrl({
      clientId: config.clientId,
      redirectUri,
      state,
      nonce,
      codeChallenge,
    })

    // 5. Store temporary transaction in secure HttpOnly cookie
    const statePayload: OAuthStatePayload = {
      state,
      nonce,
      codeVerifier,
      linkUserId: null,
      returnTo,
      createdAt: Date.now(),
    }

    const response = NextResponse.redirect(authUrl)
    await setOAuthStateCookie(response, statePayload)

    return response
  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google authentication' },
      { status: 500 }
    )
  }
}

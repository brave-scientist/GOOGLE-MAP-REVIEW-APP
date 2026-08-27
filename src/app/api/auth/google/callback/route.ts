import { NextRequest, NextResponse } from 'next/server'
import {
  getGoogleOAuthConfig,
  getOAuthStateFromRequest,
  clearOAuthStateCookie,
  exchangeGoogleAuthCode,
  verifyGoogleIdTokenClaims,
  resolveGoogleIdentity,
  buildSessionUser,
} from '@/lib/auth/google-oauth'
import { createSession } from '@/lib/session'
import { safeRedirectPath } from '@/lib/redirect-allowlist'

export const dynamic = 'force-dynamic'

// GET /api/auth/google/callback — Google OAuth 2.0 / OIDC Callback
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const fallbackRedirect = (errCode: string, returnPath: string = '/login') => {
    const res = NextResponse.redirect(new URL(`${returnPath}?error=${encodeURIComponent(errCode)}`, origin))
    clearOAuthStateCookie(res)
    return res
  }

  // Handle user denial / OAuth errors from Google
  if (errorParam) {
    console.warn(`[OAuth] Google returned error parameter: ${errorParam}`)
    return fallbackRedirect(errorParam === 'access_denied' ? 'google_access_denied' : 'google_oauth_failed')
  }

  // Reject missing code or state
  if (!code || !state) {
    return fallbackRedirect('missing_oauth_parameters')
  }

  // Read and validate temporary OAuth state cookie
  const storedTx = await getOAuthStateFromRequest(request)
  if (!storedTx) {
    return fallbackRedirect('oauth_state_missing_or_expired')
  }

  // State validation (CSRF protection) — MUST fail closed
  if (storedTx.state !== state) {
    console.error('[OAuth] State mismatch detected during callback')
    return fallbackRedirect('oauth_state_mismatch')
  }

  // Check config
  const config = getGoogleOAuthConfig()
  if (!config.configured) {
    return fallbackRedirect('google_auth_unconfigured')
  }

  const redirectUri = `${origin}/api/auth/google/callback`

  try {
    // Exchange authorization code for tokens using PKCE verifier
    const tokenResponse = await exchangeGoogleAuthCode({
      code,
      codeVerifier: storedTx.codeVerifier,
      redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })

    if (!tokenResponse.id_token) {
      console.error('[OAuth] Token exchange response missing id_token')
      return fallbackRedirect('invalid_token_response')
    }

    // Validate ID Token claims (issuer, audience, expiration, nonce, email_verified, sub)
    const verifiedUser = await verifyGoogleIdTokenClaims({
      idToken: tokenResponse.id_token,
      expectedAudience: config.clientId,
      expectedNonce: storedTx.nonce,
      fetchTokenInfo: process.env.NODE_ENV === 'production',
    })

    // Resolve identity (authenticate, link, or onboard)
    const { user } = await resolveGoogleIdentity({
      googleUser: verifiedUser,
      linkUserId: storedTx.linkUserId,
    })

    // Build session user and create standard ReviewReply session
    const sessionUser = buildSessionUser(user)
    const destinationPath = safeRedirectPath(storedTx.returnTo, '/dashboard')
    const response = NextResponse.redirect(new URL(destinationPath, origin))

    // Set standard rr_session cookie
    await createSession(response, sessionUser)

    // Clear single-use OAuth state cookie
    clearOAuthStateCookie(response)

    return response
  } catch (err: any) {
    console.error('[OAuth] Callback processing failure:', err.message)
    const targetReturn = storedTx.linkUserId ? '/settings' : '/login'
    return fallbackRedirect('google_auth_failed', targetReturn)
  }
}

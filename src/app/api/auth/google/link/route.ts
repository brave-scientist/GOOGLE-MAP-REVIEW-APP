import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getGoogleOAuthConfig,
  generatePKCE,
  generateCryptographicEntropy,
  buildGoogleAuthUrl,
  setOAuthStateCookie,
  OAuthStatePayload,
} from '@/lib/auth/google-oauth'

export const dynamic = 'force-dynamic'

// Initiate Google Account Linking for an authenticated ReviewReply user
async function handleLinkInitiation(request: NextRequest) {
  // SEC: Derive user identity STRICTLY from authenticated session
  const currentUser = await getCurrentUser(request)
  if (!currentUser) {
    return NextResponse.json(
      { error: 'Authentication required to link accounts', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  const config = getGoogleOAuthConfig()
  if (!config.configured) {
    return NextResponse.json(
      { error: 'Google authentication is not configured', code: 'GOOGLE_AUTH_UNCONFIGURED' },
      { status: 503 }
    )
  }

  // 1. Generate PKCE verifier & challenge
  const { codeVerifier, codeChallenge } = generatePKCE()

  // 2. Generate cryptographically random state & nonce
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

  // 5. Store temporary transaction with linkUserId bound from session
  const statePayload: OAuthStatePayload = {
    state,
    nonce,
    codeVerifier,
    linkUserId: currentUser.id,
    returnTo: '/settings',
    createdAt: Date.now(),
  }

  return { authUrl, statePayload }
}

export async function GET(request: NextRequest) {
  try {
    const result = await handleLinkInitiation(request)
    if (result instanceof NextResponse) return result

    const response = NextResponse.redirect(result.authUrl)
    await setOAuthStateCookie(response, result.statePayload)
    return response
  } catch (error) {
    console.error('Failed to initiate Google account linking:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google account linking' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await handleLinkInitiation(request)
    if (result instanceof NextResponse) return result

    const response = NextResponse.json({ url: result.authUrl })
    await setOAuthStateCookie(response, result.statePayload)
    return response
  } catch (error) {
    console.error('Failed to initiate Google account linking:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google account linking' },
      { status: 500 }
    )
  }
}

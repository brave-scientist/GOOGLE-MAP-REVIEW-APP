import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  exchangeCodeForTokens,
  exchangeForLongLivedToken,
  listFacebookPages,
  getFBStateFromRequest,
  clearFBStateCookie,
  consumeFBTransaction,
} from '@/lib/integrations/facebook-graph'
import { storeTokens } from '@/lib/oauth-store'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/facebook/callback — Handle OAuth callback from Facebook
//
// Cryptographic state lifecycle & security invariants:
// 1. Facebook redirects with ?code=...&state=...
// 2. We read and decrypt the JWE-encrypted rr_oauth_fb_state cookie (AES-256-GCM).
// 3. We verify query.state === storedTx.state (CSRF prevention).
// 4. We verify the session user matches the initiating user: ctx.user.id === storedTx.userId.
// 5. We atomically consume the transaction to enforce single-use semantics and block replays.
// 6. We recover businessId STRICTLY from storedTx.businessId (NEVER trust query state).
// 7. We assert caller's org ownership of businessId (IDOR defense in depth).
// 8. We exchange code for tokens with Facebook and clear the state cookie.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')

  // Read and decrypt the encrypted state transaction from the HttpOnly cookie early to determine returnTo
  const storedTx = await getFBStateFromRequest(request)
  const basePath = storedTx?.returnTo === '/onboarding' ? '/onboarding' : '/settings'

  const fallbackRedirect = (errCode: string, reason?: string) => {
    const target = new URL(basePath, origin)
    target.searchParams.set('error', errCode)
    if (reason) target.searchParams.set('reason', reason)
    const res = NextResponse.redirect(target)
    clearFBStateCookie(res)
    return res
  }

  if (error) {
    return fallbackRedirect(error === 'access_denied' ? 'facebook_oauth_denied' : 'facebook_oauth_failed', errorReason || error)
  }

  if (!code || !state) {
    return fallbackRedirect('missing_oauth_parameters')
  }

  if (!storedTx) {
    console.error('[Facebook OAuth] State cookie missing, expired, or failed decryption')
    return fallbackRedirect('oauth_state_missing_or_expired')
  }

  // 1. Validate returned state matches cryptographically stored state (CSRF check)
  if (storedTx.state !== state) {
    console.error('[Facebook OAuth] State parameter mismatch detected')
    return fallbackRedirect('oauth_state_mismatch')
  }

  // 2. SEC-01: require auth — the user must still be logged in when Facebook redirects back
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) {
    return NextResponse.redirect(new URL('/login?error=session_expired', origin))
  }

  // 3. User binding check — session user must be the exact user who initiated the flow
  if (storedTx.userId !== ctx.user.id) {
    console.error('[Facebook OAuth] User mismatch: initiating user does not match callback session')
    return fallbackRedirect('oauth_user_mismatch')
  }

  // 4. Single-use atomic consumption — prevents replay attacks and race conditions
  const claimed = await consumeFBTransaction(storedTx.state)
  if (!claimed) {
    console.error('[Facebook OAuth] Transaction already consumed or concurrent callback attempt')
    return fallbackRedirect('oauth_transaction_already_consumed')
  }

  // 5. CRITICAL: businessId is recovered STRICTLY from trusted transaction state!
  const businessId = storedTx.businessId

  // 6. SEC-01: verify the caller's org owns this business
  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) {
    return fallbackRedirect('business_not_authorized')
  }

  try {
    const redirectUri = `${origin}/api/oauth/facebook/callback`

    // Step 1: Exchange code for short-lived user token
    const shortLived = await exchangeCodeForTokens(code, redirectUri)
    if (!shortLived) {
      return fallbackRedirect('facebook_token_failed')
    }

    // Step 2: Exchange for long-lived user token (~60 days)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const userToken = longLived?.access_token || shortLived.access_token
    const userTokenExpiry = longLived?.expires_at
      ? new Date(longLived.expires_at)
      : new Date(Date.now() + shortLived.expires_in * 1000)

    // Step 3: List Pages the user manages
    const pages = await listFacebookPages(userToken)

    if (pages.length === 0) {
      return fallbackRedirect('facebook_no_pages')
    }

    // Step 4: If exactly one Page, auto-select it
    if (pages.length === 1) {
      const page = pages[0]
      await connectFacebookPage(businessId, ctx.user.id, page)

      const response = NextResponse.redirect(new URL(`${basePath}?facebook=connected`, origin))
      clearFBStateCookie(response)
      return response
    }

    // Step 5: Multiple Pages — store the user token temporarily and redirect to page-picker
    await storeTokens({
      businessId,
      provider: 'facebook_user',
      accessToken: userToken,
      refreshToken: '',
      expiresAt: userTokenExpiry,
      scopes: 'pages_manage_metadata,pages_read_engagement,pages_manage_engagement',
    })

    const pagesParam = encodeURIComponent(JSON.stringify(pages.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
    }))))
    const response = NextResponse.redirect(
      new URL(`${basePath}?facebook_pick_page=1&businessId=${businessId}&pages=${pagesParam}`, origin)
    )
    clearFBStateCookie(response)
    return response
  } catch (error) {
    console.error('Facebook OAuth callback error:', error)
    return fallbackRedirect('facebook_callback_failed')
  }
}

// Helper: store the page access token and mark the business as Facebook-connected
async function connectFacebookPage(
  businessId: string,
  userId: string,
  page: { id: string; name: string; access_token: string; category: string },
) {
  // Store the PAGE access token (not the user token) — page tokens are
  // long-lived and don't expire unless the user revokes access.
  await storeTokens({
    businessId,
    provider: 'facebook',
    accessToken: page.access_token,
    refreshToken: '',  // Page tokens don't need refresh
    expiresAt: null,   // Page tokens from long-lived user tokens don't expire
    scopes: 'pages_manage_metadata,pages_read_engagement,pages_manage_engagement',
  })

  // Store the Facebook Page ID on the business record (used for sync)
  await db.business.update({
    where: { id: businessId },
    data: {
      facebookPageId: page.id,
    },
  })

  // Clean up the temporary 'facebook_user' token if it exists
  await db.oAuthToken.deleteMany({
    where: { businessId, provider: 'facebook_user' },
  }).catch(() => {})

  // Log the connection
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: 'facebook.connected',
      targetType: 'business',
      targetId: businessId,
      metadata: JSON.stringify({
        businessId,
        provider: 'facebook',
        pageId: page.id,
        pageName: page.name,
      }),
    },
  })
}

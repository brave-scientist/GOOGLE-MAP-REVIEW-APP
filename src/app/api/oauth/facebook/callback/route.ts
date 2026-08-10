import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  exchangeCodeForTokens,
  exchangeForLongLivedToken,
  listFacebookPages,
} from '@/lib/integrations/facebook-graph'
import { storeTokens } from '@/lib/oauth-store'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/facebook/callback — Handle OAuth callback from Facebook
//
// Flow: Facebook redirects here with ?code=...&state=businessId.
//   1. Exchange code for short-lived user access token
//   2. Exchange for long-lived user token (~60 days)
//   3. GET /me/accounts → list of Pages the user manages
//   4. If exactly one Page: auto-select it, store the page access token
//   5. If multiple Pages: redirect to a page-picker UI (?fb_pages=...&businessId=...)
//   6. If zero Pages: redirect to settings with an error
//
// SEC-01: We verify the logged-in user owns the businessId from state
// before storing any tokens — same pattern as the Google callback.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // businessId
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')

  if (error) {
    const desc = errorReason || error
    return NextResponse.redirect(new URL(`/settings?error=facebook_oauth_denied&reason=${encodeURIComponent(desc)}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?error=facebook_oauth_failed', request.url))
  }

  // SEC-01: require auth — the user must still be logged in when Facebook redirects back
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) {
    return NextResponse.redirect(new URL('/login?error=session_expired', request.url))
  }

  const businessId = state

  // SEC-01: verify the caller's org owns this business
  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) {
    return NextResponse.redirect(new URL('/settings?error=business_not_authorized', request.url))
  }

  try {
    const redirectUri = `${new URL('/api/oauth/facebook/callback', request.url).origin}/api/oauth/facebook/callback`

    // Step 1: Exchange code for short-lived user token
    const shortLived = await exchangeCodeForTokens(code, redirectUri)
    if (!shortLived) {
      return NextResponse.redirect(new URL('/settings?error=facebook_token_failed', request.url))
    }

    // Step 2: Exchange for long-lived user token (~60 days)
    // Page access tokens derived from a long-lived user token are also long-lived
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const userToken = longLived?.access_token || shortLived.access_token
    const userTokenExpiry = longLived?.expires_at
      ? new Date(longLived.expires_at)
      : new Date(Date.now() + shortLived.expires_in * 1000)

    // Step 3: List Pages the user manages
    const pages = await listFacebookPages(userToken)

    if (pages.length === 0) {
      return NextResponse.redirect(new URL('/settings?error=facebook_no_pages', request.url))
    }

    // Step 4: If exactly one Page, auto-select it
    if (pages.length === 1) {
      const page = pages[0]
      await connectFacebookPage(businessId, ctx.user.id, page)

      return NextResponse.redirect(new URL('/settings?facebook=connected', request.url))
    }

    // Step 5: Multiple Pages — store the user token temporarily and redirect
    // to a page-picker. We store the user token under a temporary provider name
    // 'facebook_user' so we can retrieve it after the user picks a page, then
    // delete it once a page is selected.
    await storeTokens({
      businessId,
      provider: 'facebook_user',
      accessToken: userToken,
      refreshToken: '',  // Facebook doesn't use refresh tokens — long-lived tokens are used directly
      expiresAt: userTokenExpiry,
      scopes: 'pages_manage_metadata,pages_read_engagement,pages_manage_engagement',
    })

    // Redirect to a page-picker URL. The settings page will fetch the list
    // of pages (passed as query params) and show a selection UI.
    const pagesParam = encodeURIComponent(JSON.stringify(pages.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
    }))))
    return NextResponse.redirect(
      new URL(`/settings?facebook_pick_page=1&businessId=${businessId}&pages=${pagesParam}`, request.url)
    )
  } catch (error) {
    console.error('Facebook OAuth callback error:', error)
    return NextResponse.redirect(new URL('/settings?error=facebook_callback_failed', request.url))
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

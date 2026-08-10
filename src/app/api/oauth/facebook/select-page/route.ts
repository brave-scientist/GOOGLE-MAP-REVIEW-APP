import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listFacebookPages } from '@/lib/integrations/facebook-graph'
import { getTokens, storeTokens } from '@/lib/oauth-store'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// POST /api/oauth/facebook/select-page — Complete Facebook connection by
// selecting which Page to connect after the user has multiple Pages.
//
// Body: { businessId, pageId }
//
// Flow:
//   1. Verify auth + business ownership
//   2. Retrieve the temporary 'facebook_user' token (stored during callback)
//   3. List the user's Pages again (to get the page access token — we don't
//      trust the client-supplied pageId without re-verifying via the API)
//   4. Find the selected Page, store its page access token
//   5. Clean up the temporary user token
export async function POST(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { businessId, pageId } = body

    if (!businessId || !pageId) {
      return NextResponse.json(
        { error: 'businessId and pageId are required' },
        { status: 400 },
      )
    }

    // SEC-01: verify the caller's org owns this business
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // Retrieve the temporary user token
    const userTokens = await getTokens(businessId, 'facebook_user')
    if (!userTokens) {
      return NextResponse.json(
        { error: 'No pending Facebook connection. Please restart the OAuth flow.' },
        { status: 400 },
      )
    }

    // List Pages to get the page access token (don't trust client)
    const pages = await listFacebookPages(userTokens.accessToken)
    const selectedPage = pages.find(p => p.id === pageId)

    if (!selectedPage) {
      return NextResponse.json(
        { error: 'Selected Page not found. You may not manage this Page.' },
        { status: 404 },
      )
    }

    // Store the page access token under the 'facebook' provider
    await storeTokens({
      businessId,
      provider: 'facebook',
      accessToken: selectedPage.access_token,
      refreshToken: '',
      expiresAt: null,
      scopes: 'pages_manage_metadata,pages_read_engagement,pages_manage_engagement',
    })

    // Store the Facebook Page ID on the business record
    await db.business.update({
      where: { id: businessId },
      data: { facebookPageId: selectedPage.id },
    })

    // Clean up the temporary user token
    await db.oAuthToken.deleteMany({
      where: { businessId, provider: 'facebook_user' },
    }).catch(() => {})

    // Log the connection
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'facebook.connected',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          provider: 'facebook',
          pageId: selectedPage.id,
          pageName: selectedPage.name,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Facebook Page "${selectedPage.name}" connected successfully.`,
      pageName: selectedPage.name,
    })
  } catch (error) {
    console.error('Facebook page selection error:', error)
    return NextResponse.json({ error: 'Failed to select Facebook Page' }, { status: 500 })
  }
}

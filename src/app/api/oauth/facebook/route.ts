import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getFacebookAuthUrl,
  isFacebookConfigured,
  generateCryptographicEntropy,
  setFBStateCookie,
  FB_STATE_TTL_SECONDS,
} from '@/lib/integrations/facebook-graph'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/facebook — Redirect to Facebook OAuth consent screen
// SEC-01: requires auth + verifies the caller's org owns the businessId
//         before initiating OAuth (same pattern as Google).
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
    }, { status: 503 })
  }

  const redirectUri = `${new URL('/api/oauth/facebook/callback', request.url).origin}/api/oauth/facebook/callback`

  // 4. Generate high-entropy cryptographically random state (>= 32 bytes entropy)
  const state = generateCryptographicEntropy(32)

  // 5. Persist state in database for distributed atomic single-use across all serverless instances
  try {
    if (db?.oAuthTransactionState) {
      await db.oAuthTransactionState.create({
        data: {
          state,
          provider: 'facebook',
          businessId,
          userId: ctx.user.id,
          expiresAt: new Date(Date.now() + FB_STATE_TTL_SECONDS * 1000),
        },
      })
    }
  } catch (dbErr) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Facebook OAuth] Failed to persist OAuth state in database:', dbErr)
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 })
    }
  }

  const rawReturnTo = searchParams.get('returnTo') || ''
  const returnTo = rawReturnTo === '/onboarding' ? '/onboarding' : '/settings'

  // 6. Bind state, businessId, and userId into a protected JWE cookie
  const authUrl = getFacebookAuthUrl(redirectUri, state)
  const response = NextResponse.redirect(authUrl)

  await setFBStateCookie(response, {
    state,
    businessId,
    userId: ctx.user.id,
    createdAt: Date.now(),
    returnTo,
  })

  return response
}

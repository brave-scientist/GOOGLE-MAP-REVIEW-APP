import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  exchangeCodeForTokens,
  getGBPStateFromRequest,
  clearGBPStateCookie,
  consumeGBPTransaction,
  listGoogleAccounts,
  listGoogleLocations,
} from '@/lib/integrations/google-business-profile'
import { storeTokens } from '@/lib/oauth-store'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google/callback — Handle OAuth callback from Google Business Profile
//
// Cryptographic state lifecycle & security invariants:
// 1. Google redirects with ?code=...&state=...
// 2. We read and decrypt the JWE-encrypted rr_oauth_gbp_state cookie (AES-256-GCM).
// 3. We verify query.state === storedTx.state (CSRF prevention).
// 4. We verify the session user matches the initiating user: ctx.user.id === storedTx.userId.
// 5. We atomically consume the transaction to enforce single-use semantics and block replays.
// 6. We recover businessId STRICTLY from storedTx.businessId (NEVER trust query state).
// 7. We assert caller's org ownership of businessId (IDOR defense in depth).
// 8. We exchange code + codeVerifier with Google using S256 PKCE.
// 9. We store encrypted tokens in OAuthToken and clear the state cookie.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Read and decrypt the encrypted state transaction from the HttpOnly cookie early to determine returnTo
  const storedTx = await getGBPStateFromRequest(request)
  const basePath = storedTx?.returnTo === '/onboarding' ? '/onboarding' : '/settings'

  const fallbackRedirect = (errCode: string) => {
    const res = NextResponse.redirect(new URL(`${basePath}?error=${encodeURIComponent(errCode)}`, origin))
    clearGBPStateCookie(res)
    return res
  }

  if (error) {
    return fallbackRedirect(error === 'access_denied' ? 'google_oauth_denied' : 'google_oauth_failed')
  }

  if (!code || !state) {
    return fallbackRedirect('missing_oauth_parameters')
  }

  if (!storedTx) {
    console.error('[GBP OAuth] State cookie missing, expired, or failed decryption')
    return fallbackRedirect('oauth_state_missing_or_expired')
  }

  // 1. Validate returned state matches cryptographically stored state (CSRF check)
  if (storedTx.state !== state) {
    console.error('[GBP OAuth] State parameter mismatch detected')
    return fallbackRedirect('oauth_state_mismatch')
  }

  // 2. SEC-01: User session validation — user must still be logged in
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) {
    return NextResponse.redirect(new URL('/login?error=session_expired', origin))
  }

  // 3. User binding check — session user must be the exact user who initiated the flow
  if (storedTx.userId !== ctx.user.id) {
    console.error('[GBP OAuth] User mismatch: initiating user does not match callback session')
    return fallbackRedirect('oauth_user_mismatch')
  }

  // 4. Single-use atomic consumption — prevents replay attacks and race conditions
  const claimed = await consumeGBPTransaction(storedTx.state)
  if (!claimed) {
    console.error('[GBP OAuth] Transaction already consumed or concurrent callback attempt')
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
    const redirectUri = `${origin}/api/oauth/google/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri, storedTx.codeVerifier)

    if (!tokens) {
      return fallbackRedirect('google_token_failed')
    }

    // Store tokens in the encrypted OAuthToken table
    await storeTokens({
      businessId,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expires_at),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    })

    // Discover accounts and locations
    try {
      const accounts = await listGoogleAccounts(tokens.access_token)
      let foundLocations: any[] = []
      for (const account of accounts) {
        try {
          const locs = await listGoogleLocations(tokens.access_token, account.id || account.name)
          foundLocations.push(...locs)
        } catch (locErr) {
          console.warn('[GBP OAuth] Location discovery error for account:', locErr)
        }
      }

      if (foundLocations.length === 1) {
        const loc = foundLocations[0]

        // SEC-COLLISION: check if location is already connected to another organization
        const conflictingBusiness = await db.business.findFirst({
          where: {
            googleLocationId: loc.id,
            id: { not: businessId },
            orgId: { not: ctx.orgId },
          },
          select: { id: true, orgId: true },
        })

        if (conflictingBusiness) {
          console.warn(`[GBP OAuth] Discovered location ${loc.id} is already attached to another organization`)
          await db.business.update({
            where: { id: businessId },
            data: {
              googleLocationId: 'google_connected',
              googleLocationVerified: false,
              googleSyncStatus: 'failed',
              googleSyncError: 'This Google location is already connected to another organization.',
            },
          })
          const response = NextResponse.redirect(new URL(`${basePath}?error=location_already_attached&businessId=${businessId}`, origin))
          clearGBPStateCookie(response)
          return response
        }

        // Exactly one location and not conflicting — auto-select it and mark verified since discovered server-side
        await db.business.update({
          where: { id: businessId },
          data: {
            googleLocationId: loc.id,
            googlePlaceId: loc.placeId || null,
            googleLocationVerified: true,
            googleSyncStatus: 'pending',
            googleSyncError: null,
          },
        })

        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'google.connected',
            targetType: 'business',
            targetId: businessId,
            metadata: JSON.stringify({ businessId, provider: 'google', locationId: loc.id, title: loc.title, autoSelected: true }),
          },
        })

        const response = NextResponse.redirect(new URL(`${basePath}?google=connected&location=${encodeURIComponent(loc.title)}&businessId=${businessId}`, origin))
        clearGBPStateCookie(response)
        return response
      }

      if (foundLocations.length > 1) {
        // Multiple locations — redirect to location picker
        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'google.connected',
            targetType: 'business',
            targetId: businessId,
            metadata: JSON.stringify({ businessId, provider: 'google', multipleLocations: foundLocations.length }),
          },
        })

        const response = NextResponse.redirect(new URL(`${basePath}?google=connected&google_picker=true&businessId=${businessId}`, origin))
        clearGBPStateCookie(response)
        return response
      }
    } catch (discErr) {
      console.warn('[GBP OAuth] Auto-discovery during callback failed, proceeding to manual selection:', discErr)
    }

    // Default: Mark as connected without a specific location selected yet
    await db.business.update({
      where: { id: businessId },
      data: {
        googleLocationId: 'google_connected',
        googleLocationVerified: false,
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

    const response = NextResponse.redirect(new URL(`${basePath}?google=connected&google_picker=true&businessId=${businessId}`, origin))
    clearGBPStateCookie(response)
    return response
  } catch (err: any) {
    console.error('Google OAuth callback error:', err)
    return fallbackRedirect('google_callback_failed')
  }
}

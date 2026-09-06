import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { hasTokens, deleteTokens } from '@/lib/oauth-store'
import { isTwilioConfigured } from '@/lib/integrations/twilio'
import { isResendConfigured } from '@/lib/integrations/resend'
import { isGoogleConfigured, revokeGoogleToken, isGoogleConnectionUsable } from '@/lib/integrations/google-business-profile'
import { isFacebookConfigured } from '@/lib/integrations/facebook-graph'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// AUD-01: Integration status reflects REAL state, not hardcoded assumptions.
//
// For each provider, the status is computed as follows:
//   - Review sources (google, facebook): 'connected' iff a real OAuth token
//     exists in the OAuthToken table for this business+provider; 'available'
//     otherwise. With no token in the DB, the UI shows "available", not
//     "connected" — so a user is never misled into thinking their reviews
//     are syncing when they aren't.
//   - Platform services (twilio, resend, stripe): reflect whether the env
//     vars are actually configured. If TWILIO_AUTH_TOKEN is unset, the UI
//     shows "not_configured" — not a fake "Active".
//   - Yelp, Trustpilot, Slack, Teams: not yet implemented → 'available'.

export async function POST(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { provider, action, businessId } = body

    if (!provider || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, action' },
        { status: 400 }
      )
    }

    // SEC-01: if businessId is supplied, verify the caller's org owns it
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: `integration.${action === 'connect' ? 'connected' : 'disconnected'}`,
        targetType: 'integration',
        targetId: provider,
        metadata: JSON.stringify({
          provider,
          action,
          businessId: businessId || null,
          orgId: ctx.orgId,
        }),
      },
    })

    const providerNames: Record<string, string> = {
      google: 'Google Business Profile',
      facebook: 'Facebook Pages',
      twilio: 'Twilio (SMS)',
      resend: 'Resend (Email)',
      stripe: 'Stripe',
      slack: 'Slack',
      teams: 'Microsoft Teams',
    }

    // AUD-01: return the REAL post-action status, not a hardcoded one
    let realStatus: string
    if (action === 'disconnect') {
      if (provider === 'google') {
        const targetBusinessId = businessId || (ctx.businessIds.length > 0 ? ctx.businessIds[0] : null)
        if (targetBusinessId) {
          const denied = assertBusinessOwnership(ctx, targetBusinessId)
          if (denied) return denied

          // 1. Locate existing token
          const existingToken = await db.oAuthToken.findUnique({
            where: {
              businessId_provider: {
                businessId: targetBusinessId,
                provider: 'google',
              },
            },
          })

          // 2. Attempt remote revocation at Google (fails gracefully if token revoked/network offline)
          if (existingToken) {
            try {
              let tokenToRevoke = ''
              try {
                tokenToRevoke = decrypt(existingToken.refreshTokenEnc)
              } catch {}
              if (!tokenToRevoke) {
                try {
                  tokenToRevoke = decrypt(existingToken.accessTokenEnc)
                } catch {}
              }
              if (tokenToRevoke) {
                await revokeGoogleToken(tokenToRevoke)
              }
            } catch {
              // Remote revoke failure must never block database token deletion
            }

            // 3. Delete encrypted OAuthToken row from database
            await deleteTokens(targetBusinessId, 'google')
          }

          // 4. Clear Google Business Profile connection metadata from Business
          await db.business.update({
            where: { id: targetBusinessId },
            data: {
              googleLocationId: null,
              googlePlaceId: null,
              googleLocationVerified: false,
              googleSyncStatus: null,
              googleSyncError: null,
            },
          }).catch(() => {})
        }
      }
      realStatus = 'available'
    } else {
      // For 'connect', compute the actual state — most providers won't
      // actually be connected by this stub call (OAuth flow is separate),
      // so be honest about it.
      if (businessId && (provider === 'google' || provider === 'facebook')) {
        realStatus = (await hasTokens(businessId, provider)) ? 'connected' : 'available'
      } else if (provider === 'twilio') {
        realStatus = isTwilioConfigured() ? 'connected' : 'not_configured'
      } else if (provider === 'resend') {
        realStatus = isResendConfigured() ? 'connected' : 'not_configured'
      } else if (['yelp', 'trustpilot', 'slack', 'teams'].includes(provider)) {
        return NextResponse.json({
          provider,
          status: 'not_configured',
          message: `${providerNames[provider] || provider} is a roadmap item and not yet supported.`,
        })
      } else {
        realStatus = 'available'
      }
    }

    return NextResponse.json({
      provider,
      status: realStatus,
      message: `${providerNames[provider] || provider} ${action === 'connect' ? 'connect attempted' : 'disconnected'}. Status: ${realStatus}.`,
    })
  } catch (error) {
    console.error('Integration error:', error)
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 })
  }
}

// GET /api/integrations — list integration status
// AUD-01: returns REAL status based on DB tokens + env config
export async function GET(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    // AUD-01: compute real status for each provider
    // For OAuth-based review sources (google, facebook), we need a businessId
    // to look up tokens. If none provided, use the first business in the org.
    let tokenLookupBusinessId = businessId
    if (!tokenLookupBusinessId && ctx.businessIds.length > 0) {
      tokenLookupBusinessId = ctx.businessIds[0]
    }

    const googleConnected = tokenLookupBusinessId
      ? await hasTokens(tokenLookupBusinessId, 'google')
      : false
    const facebookConnected = tokenLookupBusinessId
      ? await hasTokens(tokenLookupBusinessId, 'facebook')
      : false

    // Platform-service statuses reflect actual env config
    const telnyxConfigured = Boolean(
      process.env.TELNYX_API_KEY &&
      (process.env.TELNYX_FROM_PHONE_NUMBER || process.env.TELNYX_MESSAGING_PROFILE_ID)
    )
    const twilioConnected = isTwilioConfigured()
    const resendConnected = isResendConfigured()
    // Stripe: not yet implemented in this codebase — don't fake it
    const stripeConnected = false

    // Google Business Profile API itself (separate from per-business OAuth)
    // — surfaced for the UI's "Google configured but not connected" hint
    const googleApiConfigured = isGoogleConfigured()
    const facebookApiConfigured = isFacebookConfigured()

    const currentBusiness = tokenLookupBusinessId
      ? await db.business.findUnique({
          where: { id: tokenLookupBusinessId },
          select: {
            id: true,
            name: true,
            googleLocationId: true,
            googlePlaceId: true,
            googleLocationVerified: true,
            googleSyncStatus: true,
            googleSyncError: true,
            googleSyncedAt: true,
            facebookPageId: true,
          },
        })
      : null

    const googleLocationSet = !!(currentBusiness?.googleLocationId && currentBusiness.googleLocationId !== 'google_connected')
    const googleLocationId = currentBusiness?.googleLocationId || null
    const googleLocationVerified = Boolean(currentBusiness?.googleLocationVerified)

    // Verify whether the Google connection is actually usable (decryptable + valid/refreshable token)
    const isGoogleUsable = (googleConnected && tokenLookupBusinessId)
      ? await isGoogleConnectionUsable(tokenLookupBusinessId)
      : false
    const isAuthFailed = Boolean(
      currentBusiness?.googleSyncStatus === 'failed' &&
      (currentBusiness?.googleSyncError?.includes('expired') ||
       currentBusiness?.googleSyncError?.includes('reconnect') ||
       currentBusiness?.googleSyncError?.includes('revoked'))
    )
    const googleConnectionHealthy = Boolean(googleConnected && isGoogleUsable && !isAuthFailed)

    const facebookPageSet = !!currentBusiness?.facebookPageId
    const facebookPageId = currentBusiness?.facebookPageId || null

    return NextResponse.json({
      businessId: tokenLookupBusinessId,
      integrations: [
        {
          provider: 'google',
          name: 'Google Business Profile',
          status: googleConnected ? 'connected' : 'available',
          connectionHealthy: googleConnectionHealthy,
          usable: googleConnectionHealthy,
          locationId: googleLocationId,
          hasLocation: googleLocationSet,
          verified: googleLocationVerified,
          syncStatus: currentBusiness?.googleSyncStatus || (googleLocationVerified ? 'ready' : 'not_started'),
          syncedAt: currentBusiness?.googleSyncedAt?.toISOString() || null,
          desc: googleConnected
            ? !googleConnectionHealthy
              ? 'Google authorization expired or revoked — please reconnect your Google account'
              : googleLocationVerified && googleLocationId
                ? `Connected & Verified (${googleLocationId.split('/').pop()}) — ready for sync`
                : googleLocationSet && googleLocationId
                  ? `Location selected (${googleLocationId.split('/').pop()}) — verification pending`
                  : 'Google authorized — please select your business location'
            : googleApiConfigured
              ? 'Google API configured — click Connect to authorize'
              : 'Google API not configured (set GOOGLE_CLIENT_ID/SECRET in .env)',
          icon: '🔍',
          category: 'review-source',
          userFacing: true,
        },
        {
          provider: 'facebook',
          name: 'Facebook Pages',
          status: facebookConnected ? 'connected' : 'available',
          pageId: facebookPageId,
          hasPage: facebookPageSet,
          desc: facebookConnected
            ? facebookPageSet
              ? `Connected Page (${facebookPageId}) — pulling reviews`
              : 'Facebook authorized — please select your Page'
            : facebookApiConfigured
              ? 'Facebook API configured — click Connect to authorize'
              : 'Facebook API not configured (set FACEBOOK_APP_ID/SECRET in .env)',
          icon: '📘',
          category: 'review-source',
          userFacing: true,
        },
        { provider: 'yelp', name: 'Yelp', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '⭐', category: 'review-source', userFacing: true },
        { provider: 'trustpilot', name: 'Trustpilot', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '✓', category: 'review-source', userFacing: true },
        { provider: 'slack', name: 'Slack', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '💬', category: 'alerts', userFacing: true },
        { provider: 'teams', name: 'Microsoft Teams', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '👥', category: 'alerts', userFacing: true },
        // Platform-managed — reflect REAL config state
        {
          provider: 'telnyx',
          name: 'Telnyx (SMS)',
          status: telnyxConfigured ? 'connected' : 'not_configured',
          desc: telnyxConfigured
            ? 'Primary SMS delivery — managed by ReviewReply platform'
            : 'Not configured — set TELNYX_API_KEY and TELNYX_FROM_PHONE_NUMBER in .env',
          icon: '📱',
          category: 'communication',
          userFacing: false,
        },
        {
          provider: 'twilio',
          name: 'Twilio (SMS Fallback)',
          status: twilioConnected ? 'connected' : 'not_configured',
          desc: twilioConnected
            ? 'Secondary SMS fallback — managed by ReviewReply platform'
            : 'Not configured — optional secondary SMS provider',
          icon: '📱',
          category: 'communication',
          userFacing: false,
        },
        {
          provider: 'resend',
          name: 'Resend (Email)',
          status: resendConnected ? 'connected' : 'not_configured',
          desc: resendConnected
            ? 'Email delivery — managed by ReviewReply platform'
            : 'Not configured — set RESEND_API_KEY in .env',
          icon: '✉',
          category: 'communication',
          userFacing: false,
        },
        {
          provider: 'stripe',
          name: 'Stripe',
          status: stripeConnected ? 'connected' : 'not_configured',
          desc: stripeConnected
            ? 'Payment processing — managed by ReviewReply platform'
            : 'Not configured — Stripe integration not yet implemented',
          icon: '💳',
          category: 'billing',
          userFacing: false,
        },
      ],
    })
  } catch (error) {
    console.error('Integrations list error:', error)
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  getValidGoogleAccessToken,
  listGoogleAccounts,
  listGoogleLocations,
  GoogleLocation,
  GoogleAccount,
} from '@/lib/integrations/google-business-profile'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google/locations?businessId=...
//
// SEC-01: Requires auth + verifies caller's org owns the businessId.
// Resolves decrypted access token from DB, queries Google GBP API for
// accounts and locations, and returns them for user selection.
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json(
      { error: 'businessId query parameter is required' },
      { status: 400 }
    )
  }

  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) return denied

  // Rate limiting: 10 discovery calls per business per minute
  const rl = await rateLimit(
    `google:discovery:${businessId}`,
    RATE_LIMITS.googleDiscovery.limit,
    RATE_LIMITS.googleDiscovery.windowMs
  )
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many discovery requests. Please wait before retrying.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  // 1. Get valid Google access token (auto-refreshed if needed)
  const tokenRes = await getValidGoogleAccessToken(businessId)
  if (!tokenRes.success) {
    const status = tokenRes.code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 400
    return NextResponse.json(
      { error: tokenRes.error, code: tokenRes.code },
      { status }
    )
  }

  try {
    // 2. Discover accounts
    const accounts = await listGoogleAccounts(tokenRes.accessToken)

    if (accounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        locations: [],
        message: 'No Google Business Profile accounts found for this Google user.',
      })
    }

    // 3. Discover locations across all accounts
    const allLocations: GoogleLocation[] = []
    for (const account of accounts) {
      try {
        const locations = await listGoogleLocations(tokenRes.accessToken, account.id || account.name)
        for (const loc of locations) {
          allLocations.push({
            ...loc,
            accountName: account.accountName || account.name,
          })
        }
      } catch (locErr) {
        console.warn(`[GBP] Failed to fetch locations for account ${account.name}:`, locErr)
      }
    }

    return NextResponse.json({
      accounts,
      locations: allLocations,
    })
  } catch (error: any) {
    console.error('[GBP] Failed to discover Google locations:', error?.message || 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to discover Google locations', code: 'DISCOVERY_FAILED' },
      { status: 502 }
    )
  }
}

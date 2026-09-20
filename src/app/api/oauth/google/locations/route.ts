import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  getValidGoogleAccessToken,
  listGoogleAccounts,
  listGoogleLocations,
  GoogleLocation,
  GoogleAccount,
  GoogleApiError,
} from '@/lib/integrations/google-business-profile'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google/locations?businessId=...
//
// SEC-01: Requires auth + verifies caller's org owns the businessId.
// Resolves decrypted access token from DB, queries Google GBP API for
// accounts and locations, and returns them for user selection.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantContext(request)
    if (ctx instanceof NextResponse) return ctx

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { error: 'businessId query parameter is required', code: 'MISSING_BUSINESS_ID' },
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

    // 2. Discover accounts
    const accounts = await listGoogleAccounts(tokenRes.accessToken)

    if (accounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        locations: [],
        emptyReason: 'NO_ACCOUNTS',
        message: 'No Google Business Profile accounts found for this Google user. Please ensure you connected the Google account that owns or manages your business listing.',
      })
    }

    // 3. Discover locations across all accounts
    const allLocations: GoogleLocation[] = []
    let failedAccountCount = 0
    let lastAccountErrorMsg = ''

    for (const account of accounts) {
      try {
        const locations = await listGoogleLocations(tokenRes.accessToken, account.id || account.name)
        for (const loc of locations) {
          allLocations.push({
            ...loc,
            accountName: account.accountName || account.name,
          })
        }
      } catch (locErr: any) {
        failedAccountCount++
        lastAccountErrorMsg = locErr?.message || ''
        console.warn(`[GBP] Failed to fetch locations for account ${account.name}:`, locErr?.message || locErr)
      }
    }

    // If accounts were found, but every account query threw an error:
    if (accounts.length > 0 && allLocations.length === 0 && failedAccountCount === accounts.length) {
      return NextResponse.json(
        {
          error: 'Failed to retrieve locations from Google Business Profile.',
          code: 'GOOGLE_LOCATION_FETCH_FAILED',
          message: lastAccountErrorMsg || 'Could not fetch locations from your Google Business Profile accounts. Please verify your permissions and try again.',
        },
        { status: 502 }
      )
    }

    // Legitimate empty locations under the accounts
    if (allLocations.length === 0) {
      return NextResponse.json({
        accounts,
        locations: [],
        emptyReason: 'NO_LOCATIONS',
        message: 'No business locations found under your Google Business Profile account. Please create or verify a location in Google Business Profile.',
      })
    }

    return NextResponse.json({
      accounts,
      locations: allLocations,
    })
  } catch (error: any) {
    console.error('[GBP] Failed to discover Google locations:', error?.message || 'Unknown error')

    if (error instanceof GoogleApiError || error?.name === 'GoogleApiError') {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code || 'GOOGLE_API_ERROR',
          message: error.message,
        },
        { status: error.statusCode || 502 }
      )
    }

    const errorMsg = error?.message || ''
    const isPoolOrDbError =
      errorMsg.includes('EMAXCONNSESSION') ||
      errorMsg.includes('max clients reached') ||
      errorMsg.includes('PrismaClientInitializationError') ||
      errorMsg.includes('connector')

    if (isPoolOrDbError) {
      return NextResponse.json(
        {
          error: 'Database connection limit reached. Please retry in a few moments.',
          code: 'DATABASE_POOL_SATURATED',
          message: 'The database connection pool is currently saturated. Please wait a few seconds and retry.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to discover Google locations', code: 'DISCOVERY_FAILED', message: errorMsg },
      { status: 502 }
    )
  }
}

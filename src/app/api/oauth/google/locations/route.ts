import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
import { isDatabasePoolError, createDatabasePoolResponse } from '@/lib/db-errors'

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
        autoSelected: false,
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
        autoSelected: false,
        message: 'No business locations found under your Google Business Profile account. Please create or verify a location in Google Business Profile.',
      })
    }

    // Single-location automatic selection:
    // If exactly one location is discovered for this authenticated business,
    // verify collision against other orgs, auto-select, and persist verified state.
    let autoSelected = false
    let autoSelectError: string | null = null

    if (allLocations.length === 1) {
      const singleLoc = allLocations[0]

      // Cross-tenant collision check: location cannot be attached to another organization
      const bareId = singleLoc.id.includes('/') ? singleLoc.id.split('/').pop()! : singleLoc.id
      const idVariants = [
        singleLoc.id,
        singleLoc.name,
        bareId,
        `locations/${bareId}`,
      ].filter(Boolean)

      const conflictingBusiness = await db.business.findFirst({
        where: {
          OR: [
            { googleLocationId: { in: idVariants } },
            { googleLocationId: { endsWith: bareId } },
          ],
          id: { not: businessId },
          orgId: { not: ctx.orgId },
        },
        select: { id: true, orgId: true },
      })

      if (conflictingBusiness) {
        return NextResponse.json(
          {
            error: 'This Google Business Profile location is already connected to another organization.',
            code: 'LOCATION_ALREADY_MAPPED',
          },
          { status: 409 }
        )
      } else {
        await db.business.update({
          where: { id: businessId },
          data: {
            googleLocationId: singleLoc.id,
            googlePlaceId: singleLoc.placeId || null,
            googleLocationVerified: true,
            googleSyncStatus: 'pending',
            googleSyncError: null,
          },
        })

        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'google.location_verified',
            targetType: 'business',
            targetId: businessId,
            metadata: JSON.stringify({
              businessId,
              locationId: singleLoc.id,
              locationTitle: singleLoc.title,
              placeId: singleLoc.placeId,
              autoSelected: true,
              source: 'locations_discovery_single',
            }),
          },
        })

        autoSelected = true
      }
    }

    return NextResponse.json({
      accounts,
      locations: allLocations,
      autoSelected,
      autoSelectError,
      selectedLocation: autoSelected
        ? {
            ...allLocations[0],
            locationId: allLocations[0].id,
            locationTitle: allLocations[0].title,
          }
        : null,
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

    if (isDatabasePoolError(error)) {
      return createDatabasePoolResponse()
    }

    const errorMsg = error?.message || ''
    return NextResponse.json(
      { error: 'Failed to discover Google locations', code: 'DISCOVERY_FAILED', message: errorMsg },
      { status: 502 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  getValidGoogleAccessToken,
  verifyGoogleLocation,
} from '@/lib/integrations/google-business-profile'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST /api/oauth/google/select-location
//
// Associates the selected Google Business Profile location with the business.
//
// SEC-01: Requires auth + asserts caller's org owns the businessId.
// SEC-02: CRITICAL — calls Google server-side to verify the locationId is actually
//         accessible before persisting. Prevents:
//         - Arbitrary Google location ID injection from client
//         - Cross-tenant location attachment
//         - Forged connection state
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const businessId = body.businessId || ctx.businessIds[0]
    const { locationId, locationTitle, placeId } = body

    // 1. Validate required fields
    if (!businessId || !locationId) {
      return NextResponse.json(
        { error: 'businessId and locationId are required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (typeof locationId !== 'string' || locationId.trim().length === 0) {
      return NextResponse.json(
        { error: 'locationId must be a non-empty string', code: 'INVALID_LOCATION_ID' },
        { status: 400 }
      )
    }

    // 2. SEC-01: Verify caller's org owns this business
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // 3. Rate limiting: 10 select-location calls per business per minute
    const rl = await rateLimit(
      `google:discovery:${businessId}`,
      RATE_LIMITS.googleDiscovery.limit,
      RATE_LIMITS.googleDiscovery.windowMs
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many location selection requests. Please wait before retrying.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    // 4. Get a valid Google access token for this business
    const tokenRes = await getValidGoogleAccessToken(businessId)
    if (!tokenRes.success) {
      const status = tokenRes.code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 400
      return NextResponse.json(
        {
          error: tokenRes.error,
          code: tokenRes.code,
        },
        { status }
      )
    }

    // 5. SEC-02: CRITICAL — verify the locationId against the Google API server-side.
    //    The client cannot supply a forged locationId and have it persisted.
    const verifiedLocation = await verifyGoogleLocation(tokenRes.accessToken, locationId)
    if (!verifiedLocation) {
      return NextResponse.json(
        {
          error: 'The selected Google location could not be verified. It may not be accessible with your Google account.',
          code: 'LOCATION_NOT_VERIFIED',
        },
        { status: 403 }
      )
    }

    // 6. Use server-verified canonical location data (not client-supplied title/placeId)
    const canonicalLocationId = verifiedLocation.id
    const canonicalPlaceId = verifiedLocation.placeId || placeId || null
    const canonicalTitle = verifiedLocation.title || locationTitle || canonicalLocationId

    // 6b. Conflict prevention: block attaching the same external location to conflicting tenants
    const conflictingBusiness = await db.business.findFirst({
      where: {
        OR: [
          { googleLocationId: canonicalLocationId },
          { googleLocationId: locationId },
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
          code: 'LOCATION_ALREADY_ATTACHED',
        },
        { status: 409 }
      )
    }

    // 7. Persist the verified location — mark googleLocationVerified = true
    await db.business.update({
      where: { id: businessId },
      data: {
        googleLocationId: canonicalLocationId,
        googlePlaceId: canonicalPlaceId,
        googleLocationVerified: true,
        googleSyncStatus: 'pending',
        googleSyncError: null,
      },
    })

    // 8. Audit log — contains no tokens or credentials
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'google.location_verified',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          locationId: canonicalLocationId,
          locationTitle: canonicalTitle,
          placeId: canonicalPlaceId,
          verifiedServerSide: true,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Google Business Profile location "${canonicalTitle}" verified and connected successfully.`,
      locationId: canonicalLocationId,
      locationTitle: canonicalTitle,
      placeId: canonicalPlaceId,
      googleLocationVerified: true,
    })
  } catch (error: any) {
    console.error('[GBP] Error selecting/verifying location:', error)
    return NextResponse.json(
      { error: 'Failed to verify and select Google location', code: 'VERIFICATION_ERROR' },
      { status: 500 }
    )
  }
}

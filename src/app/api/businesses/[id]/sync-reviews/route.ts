import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchGoogleReviews, googleStarRatingToInt, refreshAccessToken, isGoogleConfigured } from '@/lib/integrations/google-business-profile'
import { getTokens, updateAccessToken } from '@/lib/oauth-store'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/businesses/[id]/sync-reviews — Fetch reviews from Google Business Profile
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SEC-01: require auth + verify business belongs to caller's org
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params

  // SEC-01: verify the caller's org owns this business
  const denied = assertBusinessOwnership(ctx, id)
  if (denied) return denied

  if (!isGoogleConfigured()) {
    return NextResponse.json({
      error: 'Google Business Profile API not configured',
      message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
    }, { status: 503 })
  }

  try {
    const business = await db.business.findUnique({ where: { id } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Fetch encrypted tokens from the OAuthToken table
    const tokens = await getTokens(id, 'google')
    if (!tokens) {
      return NextResponse.json({
        error: 'Google Business Profile not connected',
        message: 'Connect your Google account in Settings → Integrations first.',
      }, { status: 400 })
    }

    // Check if token is expired, refresh if needed
    let accessToken = tokens.accessToken
    if (tokens.expiresAt && tokens.expiresAt < new Date()) {
      const refreshed = await refreshAccessToken(tokens.refreshToken)
      if (!refreshed) {
        return NextResponse.json({
          error: 'Google token expired and refresh failed',
          message: 'Please reconnect your Google account in Settings → Integrations.',
        }, { status: 401 })
      }
      accessToken = refreshed.access_token

      // Update the stored access token (encrypted)
      await updateAccessToken(id, 'google', refreshed.access_token, new Date(refreshed.expires_at))
    }

    // Fetch reviews from Google
    // Note: accountName and locationName need to be discovered via the GBP API
    // For now, we use placeholder values — in production, discover via accounts.list and locations.list
    const accountName = 'accounts/placeholder'
    const locationName = 'locations/placeholder'

    try {
      const googleReviews = await fetchGoogleReviews(accessToken, accountName, locationName)

      let newCount = 0
      let updatedCount = 0

      for (const gr of googleReviews) {
        const rating = googleStarRatingToInt(gr.starRating)
        const existing = await db.review.findUnique({
          where: {
            source_externalId: {
              source: ReviewSource.GOOGLE,
              externalId: gr.reviewId,
            },
          },
        })

        if (existing) {
          await db.review.update({
            where: { id: existing.id },
            data: {
              rating,
              text: gr.comment || '',
              replyText: gr.reviewReply?.comment || null,
              repliedAt: gr.reviewReply?.updateTime ? new Date(gr.reviewReply.updateTime) : null,
              draftStatus: gr.reviewReply ? DraftStatus.POSTED : DraftStatus.NONE,
            },
          })
          updatedCount++
        } else {
          await db.review.create({
            data: {
              businessId: id,
              source: ReviewSource.GOOGLE,
              externalId: gr.reviewId,
              author: gr.reviewer?.displayName || 'Anonymous',
              authorAvatar: gr.reviewer?.profilePhotoUrl || null,
              rating,
              text: gr.comment || '',
              draftStatus: DraftStatus.NONE,
              createdAt: gr.createTime ? new Date(gr.createTime) : new Date(),
              fetchedAt: new Date(),
            },
          })
          newCount++
        }
      }

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'google.sync_reviews',
          targetType: 'business',
          targetId: id,
          metadata: JSON.stringify({
            businessId: id,
            newReviews: newCount,
            updatedReviews: updatedCount,
            totalFetched: googleReviews.length,
          }),
        },
      })

      return NextResponse.json({
        success: true,
        newReviews: newCount,
        updatedReviews: updatedCount,
        totalFetched: googleReviews.length,
        message: `Synced ${googleReviews.length} reviews from Google (${newCount} new, ${updatedCount} updated)`,
      })
    } catch (apiError) {
      return NextResponse.json({
        error: 'Google API call failed',
        message: 'Your Google Business Profile API access may still be pending approval (4-6 weeks), or account/location discovery is needed.',
        details: String(apiError),
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Google sync error:', error)
    return NextResponse.json({ error: 'Failed to sync reviews', details: String(error) }, { status: 500 })
  }
}

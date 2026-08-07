import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchGoogleReviews, googleStarRatingToInt, refreshAccessToken, isGoogleConfigured } from '@/lib/integrations/google-business-profile'
import { ReviewSource, DraftStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/businesses/[id]/sync-reviews — Fetch reviews from Google Business Profile
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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

    // Check if Google is connected (googleLocationId contains the token JSON)
    if (!business.googleLocationId || !business.googleLocationId.startsWith('google_connected:')) {
      return NextResponse.json({
        error: 'Google Business Profile not connected',
        message: 'Connect your Google account in Settings → Integrations first.',
      }, { status: 400 })
    }

    // Parse stored tokens
    const tokenJson = business.googleLocationId.replace('google_connected:', '')
    const tokens = JSON.parse(tokenJson)

    // Check if token is expired, refresh if needed
    let accessToken = tokens.access_token
    if (tokens.expires_at < Date.now()) {
      const refreshed = await refreshAccessToken(tokens.refresh_token)
      if (!refreshed) {
        return NextResponse.json({
          error: 'Google token expired and refresh failed',
          message: 'Please reconnect your Google account in Settings → Integrations.',
        }, { status: 401 })
      }
      accessToken = refreshed.access_token

      // Update stored tokens
      await db.business.update({
        where: { id },
        data: {
          googleLocationId: `google_connected:${JSON.stringify({
            ...tokens,
            access_token: refreshed.access_token,
            expires_at: refreshed.expires_at,
          })}`,
        },
      })
    }

    // Fetch reviews from Google
    // Note: accountName and locationName need to be discovered via the GBP API
    // For now, we use the business name as a placeholder
    // In production, you'd call accounts.list and locations.list first
    const accountName = 'accounts/placeholder' // TODO: Discover via API
    const locationName = 'locations/placeholder' // TODO: Discover via API

    try {
      const googleReviews = await fetchGoogleReviews(accessToken, accountName, locationName)

      // Upsert reviews into the database
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
          // Update existing review
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
          // Create new review
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

      // Log the sync
      await db.auditLog.create({
        data: {
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
      // Google API not yet approved or account/location discovery needed
      return NextResponse.json({
        error: 'Google API call failed',
        message: 'Your Google Business Profile API access may still be pending approval (typically 4-6 weeks), or account/location discovery is needed.',
        details: String(apiError),
        setupNote: 'After Google approves your API access, you need to: (1) Call accounts.list to get your account name, (2) Call locations.list to get your location name, (3) Update the sync-reviews route with these values.',
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Google sync error:', error)
    return NextResponse.json({ error: 'Failed to sync reviews', details: String(error) }, { status: 500 })
  }
}

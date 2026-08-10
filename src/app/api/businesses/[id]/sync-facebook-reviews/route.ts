import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchFacebookReviews, isFacebookConfigured } from '@/lib/integrations/facebook-graph'
import { getTokens } from '@/lib/oauth-store'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/businesses/[id]/sync-facebook-reviews — Fetch reviews from Facebook Pages
//
// SEC-01: requires auth + verifies business belongs to caller's org (same as Google sync)
//
// Flow:
//   1. Verify auth + business ownership
//   2. Check Facebook env vars are configured
//   3. Retrieve the stored page access token from OAuthToken table
//   4. Use the business's facebookPageId to call GET /{page-id}/ratings
//   5. Upsert each review into the Review table (source=FACEBOOK)
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

  if (!isFacebookConfigured()) {
    return NextResponse.json({
      error: 'Facebook Graph API not configured',
      message: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env',
    }, { status: 503 })
  }

  try {
    const business = await db.business.findUnique({ where: { id } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Need a Facebook Page ID stored on the business
    if (!business.facebookPageId) {
      return NextResponse.json({
        error: 'Facebook Page not connected',
        message: 'Connect your Facebook account in Settings → Integrations first.',
      }, { status: 400 })
    }

    // Fetch the stored page access token
    const tokens = await getTokens(id, 'facebook')
    if (!tokens) {
      return NextResponse.json({
        error: 'Facebook not connected',
        message: 'Connect your Facebook account in Settings → Integrations first.',
      }, { status: 400 })
    }

    // Fetch reviews from Facebook
    try {
      const fbReviews = await fetchFacebookReviews(
        business.facebookPageId,
        tokens.accessToken,
        50
      )

      let newCount = 0
      let updatedCount = 0

      for (const fr of fbReviews) {
        const existing = await db.review.findUnique({
          where: {
            source_externalId: {
              source: ReviewSource.FACEBOOK,
              externalId: fr.id,
            },
          },
        })

        if (existing) {
          await db.review.update({
            where: { id: existing.id },
            data: {
              rating: fr.rating,
              text: fr.review_text || '',
            },
          })
          updatedCount++
        } else {
          await db.review.create({
            data: {
              businessId: id,
              source: ReviewSource.FACEBOOK,
              externalId: fr.id,
              author: fr.reviewer?.name || 'Anonymous',
              rating: fr.rating,
              text: fr.review_text || '',
              draftStatus: DraftStatus.NONE,
              createdAt: fr.created_time ? new Date(fr.created_time) : new Date(),
              fetchedAt: new Date(),
            },
          })
          newCount++
        }
      }

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'facebook.sync_reviews',
          targetType: 'business',
          targetId: id,
          metadata: JSON.stringify({
            businessId: id,
            pageId: business.facebookPageId,
            newReviews: newCount,
            updatedReviews: updatedCount,
            totalFetched: fbReviews.length,
          }),
        },
      })

      return NextResponse.json({
        success: true,
        newReviews: newCount,
        updatedReviews: updatedCount,
        totalFetched: fbReviews.length,
        message: `Synced ${fbReviews.length} reviews from Facebook (${newCount} new, ${updatedCount} updated)`,
      })
    } catch (apiError) {
      console.error('Facebook API call failed:', apiError)
      return NextResponse.json({
        error: 'Facebook API call failed',
        message: 'Your Facebook app may still be pending App Review for pages_read_engagement permission, or the Page access token was revoked.',
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Facebook sync error:', error)
    return NextResponse.json({ error: 'Failed to sync reviews' }, { status: 500 })
  }
}

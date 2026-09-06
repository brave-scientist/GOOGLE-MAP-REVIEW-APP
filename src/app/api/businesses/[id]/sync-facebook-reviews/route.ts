import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchFacebookReviews, isFacebookConfigured } from '@/lib/integrations/facebook-graph'
import { getTokens } from '@/lib/oauth-store'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { processReviewAutomations } from '@/lib/automation/rule-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/businesses/[id]/sync-facebook-reviews — Fetch & normalize reviews from Facebook Pages
//
// SEC-01: Requires auth + verifies business belongs to caller's org.
//
// Idempotency:
//   - Uses composite unique key [source, externalId]
//   - Tracks fetched, created, updated, unchanged, and failed stats
//   - Aggregates average rating and review count onto Business model
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Verify authentication
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params

  // 2. SEC-01: Verify caller's org owns this business
  const denied = assertBusinessOwnership(ctx, id)
  if (denied) return denied

  if (!isFacebookConfigured()) {
    return NextResponse.json({
      error: 'Facebook Graph API not configured',
      code: 'FACEBOOK_NOT_CONFIGURED',
      message: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env',
    }, { status: 503 })
  }

  try {
    const business = await db.business.findUnique({ where: { id } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // 3. Verify Facebook Page ID is connected to this business
    if (!business.facebookPageId) {
      return NextResponse.json({
        error: 'Facebook Page not connected',
        code: 'NO_PAGE_CONNECTED',
        message: 'Connect your Facebook Page in Settings → Integrations first.',
      }, { status: 400 })
    }

    // 4. Fetch stored page access token
    const tokens = await getTokens(id, 'facebook')
    if (!tokens || !tokens.accessToken) {
      return NextResponse.json({
        error: 'Facebook access token missing or expired',
        code: 'FACEBOOK_REAUTH_REQUIRED',
        message: 'Please reconnect your Facebook account in Settings → Integrations.',
      }, { status: 401 })
    }

    // 5. Fetch reviews from Facebook Graph API
    let fbReviews: any[] = []
    try {
      fbReviews = await fetchFacebookReviews(
        business.facebookPageId,
        tokens.accessToken,
        100
      )
    } catch (apiError: any) {
      console.error('[FB Sync] Facebook API call failed:', apiError)
      return NextResponse.json({
        error: 'Facebook API call failed',
        code: 'FACEBOOK_API_ERROR',
        message: apiError.message || 'Your Facebook app may be pending App Review for pages_read_engagement, or the token was revoked.',
      }, { status: 502 })
    }

    // 6. Normalize and upsert reviews idempotently
    const stats = {
      fetched: fbReviews.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    }

    for (const fr of fbReviews) {
      try {
        const rating = Math.max(1, Math.min(5, Math.round(fr.rating || 5)))
        const externalId = String(fr.id)
        if (!externalId) {
          stats.failed++
          continue
        }

        const reviewText = fr.review_text || ''
        const authorName = fr.reviewer?.name || 'Anonymous'
        const createdAtDate = fr.created_time ? new Date(fr.created_time) : new Date()

        const existing = await db.review.findUnique({
          where: {
            source_externalId: {
              source: ReviewSource.FACEBOOK,
              externalId,
            },
          },
        })

        if (existing) {
          const isChanged =
            existing.rating !== rating ||
            existing.text !== reviewText ||
            existing.author !== authorName

          if (isChanged) {
            await db.review.update({
              where: { id: existing.id },
              data: {
                rating,
                text: reviewText,
                author: authorName,
                fetchedAt: new Date(),
              },
            })
            stats.updated++
          } else {
            stats.unchanged++
          }
        } else {
          const newReview = await db.review.create({
            data: {
              businessId: id,
              source: ReviewSource.FACEBOOK,
              externalId,
              author: authorName,
              rating,
              text: reviewText,
              draftStatus: DraftStatus.NONE,
              createdAt: createdAtDate,
              fetchedAt: new Date(),
            },
          })
          stats.created++

          // AUTO-01: Trigger automated sentiment classification & escalation routing asynchronously
          processReviewAutomations({
            reviewId: newReview.id,
            businessId: id,
            actorId: ctx.user.id,
            eventSource: 'facebook_sync',
          }).catch((autoErr) => {
            console.error('[FB Sync] Automation trigger non-fatal error:', autoErr)
          })
        }
      } catch (rowErr) {
        console.error('[FB Sync] Failed to upsert review row:', rowErr)
        stats.failed++
      }
    }

    // 7. Recalculate and update business review statistics
    const agg = await db.review.aggregate({
      where: { businessId: id },
      _avg: { rating: true },
      _count: true,
    })

    await db.business.update({
      where: { id },
      data: {
        avgRating: Math.round((agg._avg.rating || 0) * 10) / 10,
        reviewCount: agg._count,
      },
    })

    // 8. Record audit log entry
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'facebook.sync_reviews',
        targetType: 'business',
        targetId: id,
        metadata: JSON.stringify({
          businessId: id,
          pageId: business.facebookPageId,
          stats,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      provider: 'facebook',
      stats,
      message: `Synced ${stats.fetched} reviews from Facebook (${stats.created} new, ${stats.updated} updated, ${stats.unchanged} unchanged)`,
    })
  } catch (error: any) {
    console.error('[FB Sync] Unexpected sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync reviews from Facebook', details: error.message },
      { status: 500 }
    )
  }
}

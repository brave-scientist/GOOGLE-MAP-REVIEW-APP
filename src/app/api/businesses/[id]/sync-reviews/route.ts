import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  fetchGoogleReviews,
  googleStarRatingToInt,
  getValidGoogleAccessToken,
  isGoogleConfigured,
  listGoogleAccounts,
  listGoogleLocations,
  GoogleApiError,
} from '@/lib/integrations/google-business-profile'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { processReviewAutomations } from '@/lib/automation/rule-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/businesses/[id]/sync-reviews — Fetch & normalize reviews from Google Business Profile
//
// SEC-01: Requires auth + verifies business belongs to caller's org.
//
// Idempotency:
//   - Uses composite unique key [source, externalId]
//   - Identical reviews are counted as 'unchanged' without redundant DB writes
//   - Updates reviews if text, rating, or reply changed
//   - Aggregates new average rating and review count onto Business model
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authentication
    const ctx = await getTenantContext(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params

    // 2. SEC-01: Verify caller's org owns this business
    const denied = assertBusinessOwnership(ctx, id)
    if (denied) return denied

    if (!isGoogleConfigured()) {
      return NextResponse.json({
        error: 'Google Business Profile API not configured',
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
      }, { status: 503 })
    }

    const business = await db.business.findUnique({ where: { id } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // 3. Resolve decrypted Google access token (auto-refreshes if expired)
    const tokenRes = await getValidGoogleAccessToken(id)
    if (!tokenRes.success) {
      const statusCode = tokenRes.code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 400
      return NextResponse.json({
        error: tokenRes.error,
        code: tokenRes.code,
      }, { status: statusCode })
    }

    const accessToken = tokenRes.accessToken

    // 4. Resolve Google Location resource path
    let locationResource = business.googleLocationId

    // If location is missing or legacy placeholder, attempt automatic discovery
    if (!locationResource || locationResource === 'google_connected') {
      try {
        const accounts = await listGoogleAccounts(accessToken)
        const allLocations: any[] = []
        for (const acc of accounts) {
          const locs = await listGoogleLocations(accessToken, acc.id || acc.name)
          allLocations.push(...locs)
        }

        if (allLocations.length === 1) {
          locationResource = allLocations[0].id
          await db.business.update({
            where: { id },
            data: { googleLocationId: locationResource },
          })
        } else if (allLocations.length > 1) {
          return NextResponse.json({
            error: 'Multiple Google locations found. Please select your location in Settings → Integrations.',
            code: 'MULTIPLE_LOCATIONS_FOUND',
            multipleLocations: allLocations,
          }, { status: 400 })
        } else {
          return NextResponse.json({
            error: 'No Google Business Profile location selected.',
            code: 'NO_LOCATION_SELECTED',
            message: 'Please connect your Google account and select a location in Settings → Integrations.',
          }, { status: 400 })
        }
      } catch (discErr: any) {
        if (discErr instanceof GoogleApiError || discErr?.name === 'GoogleApiError') {
          return NextResponse.json({
            error: discErr.message,
            code: discErr.code || 'LOCATION_RESOLUTION_FAILED',
            message: discErr.message,
          }, { status: discErr.statusCode || 400 })
        }
        return NextResponse.json({
          error: 'Could not resolve Google location for business',
          code: 'LOCATION_RESOLUTION_FAILED',
          message: 'Please select your Google Business Profile location in Settings → Integrations.',
        }, { status: 400 })
      }
    }

    if (!locationResource || locationResource === 'google_connected') {
      return NextResponse.json({
        error: 'No Google Business Profile location selected.',
        code: 'NO_LOCATION_SELECTED',
        message: 'Please connect your Google account and select a location in Settings → Integrations.',
      }, { status: 400 })
    }

    // 5. Fetch reviews from Google GBP API
    let googleReviews: any[] = []
    try {
      googleReviews = await fetchGoogleReviews(accessToken, locationResource)
    } catch (apiError: any) {
      console.error('[GBP Sync] Google API call failed:', apiError)
      return NextResponse.json({
        error: 'Google API call failed',
        code: 'GOOGLE_API_ERROR',
        message: apiError.message || 'Failed to fetch reviews from Google Business Profile API',
      }, { status: 502 })
    }

    // 6. Normalize and upsert reviews idempotently
    const stats = {
      fetched: googleReviews.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    }

    for (const gr of googleReviews) {
      try {
        const rating = googleStarRatingToInt(gr.starRating)
        const externalId = gr.reviewId || (gr.name ? gr.name.split('/').pop() : '')
        if (!externalId) {
          stats.failed++
          continue
        }

        const commentText = gr.comment || ''
        const replyComment = gr.reviewReply?.comment || null
        const repliedAtDate = gr.reviewReply?.updateTime ? new Date(gr.reviewReply.updateTime) : null
        const authorName = gr.reviewer?.displayName || 'Anonymous'
        const authorAvatar = gr.reviewer?.profilePhotoUrl || null
        const createdAtDate = gr.createTime ? new Date(gr.createTime) : new Date()

        const existing = await db.review.findUnique({
          where: {
            source_externalId: {
              source: ReviewSource.GOOGLE,
              externalId,
            },
          },
        })

        if (existing) {
          // SEC-COLLISION: Do not mutate review belonging to another business/tenant
          if (existing.businessId !== id) {
            stats.unchanged++
            continue
          }

          // Check if any normalized content changed
          const isChanged =
            existing.rating !== rating ||
            existing.text !== commentText ||
            existing.replyText !== replyComment ||
            existing.author !== authorName

          if (isChanged) {
            await db.review.update({
              where: { id: existing.id },
              data: {
                rating,
                text: commentText,
                author: authorName,
                authorAvatar,
                replyText: replyComment,
                repliedAt: repliedAtDate,
                draftStatus: replyComment ? DraftStatus.POSTED : existing.draftStatus,
                fetchedAt: new Date(),
              },
            })
            stats.updated++
          } else {
            stats.unchanged++
          }
        } else {
          // Insert new review
          try {
            const newReview = await db.review.create({
              data: {
                businessId: id,
                source: ReviewSource.GOOGLE,
                externalId,
                author: authorName,
                authorAvatar,
                rating,
                text: commentText,
                replyText: replyComment,
                repliedAt: repliedAtDate,
                draftStatus: replyComment ? DraftStatus.POSTED : DraftStatus.NONE,
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
              eventSource: 'google_sync',
            }).catch((autoErr) => {
              console.error('[GBP Sync] Automation trigger non-fatal error:', autoErr)
            })
          } catch (createErr: any) {
            if (createErr?.code === 'P2002') {
              stats.unchanged++
            } else {
              throw createErr
            }
          }
        }
      } catch (rowErr) {
        console.error('[GBP Sync] Failed to upsert review row:', rowErr)
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
        googleSyncStatus: 'completed',
        googleSyncError: null,
        googleSyncedAt: new Date(),
      },
    })

    // 8. Record audit log entry
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'google.sync_reviews',
        targetType: 'business',
        targetId: id,
        metadata: JSON.stringify({
          businessId: id,
          locationResource,
          stats,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      provider: 'google',
      stats,
      message: `Synced ${stats.fetched} reviews from Google (${stats.created} new, ${stats.updated} updated, ${stats.unchanged} unchanged)`,
    })
  } catch (error: any) {
    console.error('[GBP Sync] Unexpected sync error:', error)
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
      {
        error: 'Failed to sync reviews from Google',
        code: 'SYNC_FAILED',
        message: errorMsg || 'An unexpected server error occurred while syncing reviews.',
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
      },
      { status: 500 }
    )
  }
}

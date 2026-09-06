import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  getValidGoogleAccessToken,
  fetchGoogleReviews,
  googleStarRatingToInt,
} from '@/lib/integrations/google-business-profile'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { processReviewAutomations } from '@/lib/automation/rule-engine'

export const dynamic = 'force-dynamic'

// POST /api/reviews/sync
//
// Tenant-initiated initial or manual Google review sync.
//
// Security invariants:
//   - Auth required
//   - businessId must be owned by the caller's org (assertBusinessOwnership)
//   - business.googleLocationVerified must be true (server-set flag)
//   - Rate limited: 3 syncs per business per hour
//   - Never trusts client-supplied review data
//   - Idempotent: DB unique constraint @@unique([source, externalId]) prevents duplicates
//   - Demo reviews (externalId starts with 'seed_') are safely skipped — they won't match
//     real Google review IDs anyway, but we also actively filter INTERNAL source records
//   - Sync status tracking in business.googleSyncStatus / googleSyncedAt
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const businessId = body.businessId || ctx.businessIds[0]

    // 1. Validate businessId
    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json(
        { error: 'businessId is required', code: 'MISSING_BUSINESS_ID' },
        { status: 400 }
      )
    }

    // 2. SEC-01: Verify caller's org owns this business
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // 3. Rate limiting: 3 sync requests per business per hour
    const rl = await rateLimit(
      `google:sync:${businessId}`,
      RATE_LIMITS.googleSync.limit,
      RATE_LIMITS.googleSync.windowMs
    )
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        {
          error: 'Too many sync requests. Please wait before syncing again.',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        }
      )
    }

    // 4. Load business and verify it has a server-verified Google location
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        googleLocationId: true,
        googleLocationVerified: true,
        googleSyncStatus: true,
        updatedAt: true,
      },
    })

    if (!business) {
      return NextResponse.json({ error: 'Business not found', code: 'BUSINESS_NOT_FOUND' }, { status: 404 })
    }

    if (!business.googleLocationId || business.googleLocationId === 'google_connected') {
      return NextResponse.json(
        {
          error: 'No Google Business Profile location selected. Please select a location first.',
          code: 'LOCATION_NOT_SELECTED',
        },
        { status: 400 }
      )
    }

    // 5. CRITICAL: googleLocationVerified must be true (server-set, cannot be forged by client)
    if (!business.googleLocationVerified) {
      return NextResponse.json(
        {
          error: 'Google location has not been verified. Please select and verify your Google Business Profile location before syncing.',
          code: 'LOCATION_NOT_VERIFIED',
        },
        { status: 400 }
      )
    }

    // 5b. Concurrency Guard: Block concurrent duplicate syncs while actively running
    // Allows recovery if prior sync was left stale for more than 2 minutes (e.g. process crash or timeout)
    if (business.googleSyncStatus === 'syncing') {
      const isStale = business.updatedAt && (Date.now() - business.updatedAt.getTime() > 120000)
      if (!isStale) {
        return NextResponse.json(
          {
            error: 'A review sync is currently in progress. Please wait for it to complete.',
            code: 'SYNC_IN_PROGRESS',
            status: 'syncing',
          },
          { status: 409 }
        )
      }
      console.warn(`[Sync] Stale sync detected for business ${businessId} (> 2m). Recovering and re-executing.`)
    }

    // 6. Mark sync as started
    await db.business.update({
      where: { id: businessId },
      data: { googleSyncStatus: 'syncing', googleSyncError: null },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'google.sync_started',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          locationId: business.googleLocationId,
          triggeredBy: 'user',
        }),
      },
    })

    // 7. Get a valid access token (auto-refreshes if expired)
    const tokenRes = await getValidGoogleAccessToken(businessId)
    if (!tokenRes.success) {
      await db.business.update({
        where: { id: businessId },
        data: {
          googleSyncStatus: 'failed',
          googleSyncError: tokenRes.code === 'GOOGLE_REAUTH_REQUIRED'
            ? 'Google authorization expired. Please reconnect your Google account.'
            : 'Failed to obtain Google credentials.',
        },
      })

      const status = tokenRes.code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 400
      return NextResponse.json({ error: tokenRes.error, code: tokenRes.code }, { status })
    }

    // 8. Fetch reviews from Google API with pagination
    let googleReviews: Awaited<ReturnType<typeof fetchGoogleReviews>>
    try {
      googleReviews = await fetchGoogleReviews(
        tokenRes.accessToken,
        business.googleLocationId,
        undefined,
        { maxPages: 10, pageSize: 50 }
      )
    } catch (fetchErr: any) {
      const errMsg = fetchErr?.message || 'Google API error'
      const isAuthErr = errMsg.includes('401') || errMsg.includes('403')
      const isRateLimit = errMsg.includes('429')

      const safeErr = isAuthErr
        ? 'Google authorization expired or revoked. Please reconnect.'
        : isRateLimit
          ? 'Google API rate limit reached. Please try again later.'
          : 'Failed to fetch reviews from Google. Please try again.'

      await db.business.update({
        where: { id: businessId },
        data: { googleSyncStatus: 'failed', googleSyncError: safeErr },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'google.sync_failed',
          targetType: 'business',
          targetId: businessId,
          metadata: JSON.stringify({
            businessId,
            errorCode: isAuthErr ? 'AUTH_ERROR' : isRateLimit ? 'RATE_LIMITED' : 'API_ERROR',
          }),
        },
      })

      const httpStatus = isAuthErr ? 401 : isRateLimit ? 429 : 502
      return NextResponse.json({ error: safeErr, code: 'GOOGLE_API_ERROR' }, { status: httpStatus })
    }

    // 9. Idempotent upsert of reviews.
    //    The DB @@unique([source, externalId]) constraint is the authoritative dedup guard.
    //    We use an upsert pattern to update existing records rather than skipping them.
    //
    //    Demo reviews (externalId = 'seed_${businessId}_...') have a different format
    //    from real Google review IDs and will never match, so no filtering is needed.
    //    INTERNAL source reviews are also separate from GOOGLE source.
    const syncResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      total: googleReviews.length,
    }

    for (const gr of googleReviews) {
      const externalId = gr.reviewId || (gr.name ? gr.name.split('/').pop() || '' : '')
      if (!externalId) continue

      const rating = googleStarRatingToInt(gr.starRating)
      const commentText = gr.comment || ''
      const replyComment = gr.reviewReply?.comment || null
      const repliedAtDate = gr.reviewReply?.updateTime ? new Date(gr.reviewReply.updateTime) : null
      const authorName = gr.reviewer?.displayName || 'Anonymous'
      const authorAvatar = gr.reviewer?.profilePhotoUrl || null
      const createdAtDate = gr.createTime ? new Date(gr.createTime) : new Date()

      // findUnique to determine if we need create or update
      const existing = await db.review.findUnique({
        where: {
          source_externalId: {
            source: ReviewSource.GOOGLE,
            externalId,
          },
        },
        select: { id: true, businessId: true, rating: true, text: true, replyText: true, author: true },
      })

      if (existing) {
        // SEC-COLLISION: Do not mutate a review belonging to another business/tenant
        if (existing.businessId !== businessId) {
          console.warn(`[Sync] Review with externalId "${externalId}" belongs to another business (${existing.businessId}), skipping`)
          syncResult.unchanged++
          continue
        }

        // Only update if something changed — avoid spurious writes
        const changed =
          existing.rating !== rating ||
          existing.text !== commentText ||
          existing.replyText !== replyComment ||
          existing.author !== authorName

        if (changed) {
          await db.review.update({
            where: { id: existing.id },
            data: {
              rating,
              text: commentText,
              author: authorName,
              authorAvatar,
              replyText: replyComment,
              repliedAt: repliedAtDate,
              draftStatus: replyComment ? DraftStatus.POSTED : undefined,
              fetchedAt: new Date(),
            },
          })
          syncResult.updated++
        } else {
          syncResult.unchanged++
        }
      } else {
        // Create new review — if a concurrent request wins first, the unique constraint
        // will throw P2002. We catch that and count it as "unchanged" (idempotent).
        try {
          const newReview = await db.review.create({
            data: {
              businessId,
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
          syncResult.created++

          // Trigger automations asynchronously — don't block the sync response
          processReviewAutomations({
            reviewId: newReview.id,
            businessId,
            eventSource: 'manual_sync_google',
          }).catch(() => {})
        } catch (createErr: any) {
          if (createErr?.code === 'P2002') {
            // Concurrent duplicate — treat as unchanged
            syncResult.unchanged++
          } else {
            throw createErr
          }
        }
      }
    }

    // 10. Update business aggregate stats and mark sync complete
    try {
      const agg = await db.review.aggregate({
        where: { businessId },
        _avg: { rating: true },
        _count: true,
      })
      await db.business.update({
        where: { id: businessId },
        data: {
          avgRating: Math.round((agg._avg.rating || 0) * 10) / 10,
          reviewCount: agg._count,
          googleSyncStatus: 'completed',
          googleSyncError: null,
          googleSyncedAt: new Date(),
        },
      })
    } catch {
      // Don't fail the sync if the aggregate update fails
      await db.business.update({
        where: { id: businessId },
        data: {
          googleSyncStatus: 'completed',
          googleSyncError: null,
          googleSyncedAt: new Date(),
        },
      }).catch(() => {})
    }

    // 11. Audit log — safe metadata only, no tokens
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'google.sync_completed',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          created: syncResult.created,
          updated: syncResult.updated,
          unchanged: syncResult.unchanged,
          total: syncResult.total,
          triggeredBy: 'user',
        }),
      },
    })

    return NextResponse.json({
      success: true,
      syncResult,
      googleSyncStatus: 'completed',
      message: `Sync complete. ${syncResult.created} new, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged.`,
    })
  } catch (error: any) {
    console.error('[Sync] Review sync error:', error?.message || 'Unknown error')

    // Attempt to mark sync as failed
    try {
      const body = await request.json().catch(() => ({}))
      if (body?.businessId) {
        await db.business.update({
          where: { id: body.businessId },
          data: { googleSyncStatus: 'failed', googleSyncError: 'An unexpected error occurred during sync.' },
        }).catch(() => {})
      }
    } catch {}

    return NextResponse.json(
      { error: 'An unexpected error occurred during sync', code: 'SYNC_ERROR' },
      { status: 500 }
    )
  }
}

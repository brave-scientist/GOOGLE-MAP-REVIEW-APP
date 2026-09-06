import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { enforceCronAuth } from '@/lib/cron-auth'
import {
  getValidGoogleAccessToken,
  fetchGoogleReviews,
  googleStarRatingToInt,
} from '@/lib/integrations/google-business-profile'
import { fetchFacebookReviews } from '@/lib/integrations/facebook-graph'
import { getTokens } from '@/lib/oauth-store'
import { ReviewSource, DraftStatus } from '@prisma/client'
import { processReviewAutomations } from '@/lib/automation/rule-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max duration for cron run

async function handleSyncCron(request: NextRequest) {
  // 1. Strict fail-closed Bearer authentication for cron
  const authError = enforceCronAuth(request)
  if (authError) return authError

  const summary = {
    timestamp: new Date().toISOString(),
    businessesChecked: 0,
    googleSyncAttempts: 0,
    googleSyncSuccesses: 0,
    facebookSyncAttempts: 0,
    facebookSyncSuccesses: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalUnchanged: 0,
    errors: [] as Array<{ businessId: string; provider: string; error: string }>,
  }

  try {
    // 2. Enumerate all active businesses
    const businesses = await db.business.findMany({
      select: {
        id: true,
        name: true,
        googleLocationId: true,
        googleLocationVerified: true,
        facebookPageId: true,
      },
    })

    summary.businessesChecked = businesses.length

    for (const business of businesses) {
      // ─────────────────────────────────────────────
      // Google Review Sync
      // ─────────────────────────────────────────────
      if (business.googleLocationId && business.googleLocationId !== 'google_connected' && business.googleLocationVerified) {
        summary.googleSyncAttempts++
        try {
          const tokenRes = await getValidGoogleAccessToken(business.id)
          if (tokenRes.success) {
            const googleReviews = await fetchGoogleReviews(tokenRes.accessToken, business.googleLocationId)
            for (const gr of googleReviews) {
              const externalId = gr.reviewId || (gr.name ? gr.name.split('/').pop() : '')
              if (!externalId) continue

              const rating = googleStarRatingToInt(gr.starRating)
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
                if (existing.businessId !== business.id) {
                  summary.totalUnchanged++
                  continue
                }

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
                  summary.totalUpdated++
                } else {
                  summary.totalUnchanged++
                }
              } else {
                try {
                  const newReview = await db.review.create({
                    data: {
                      businessId: business.id,
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
                  summary.totalCreated++

                  // AUTO-01: Asynchronously evaluate automations
                  processReviewAutomations({
                    reviewId: newReview.id,
                    businessId: business.id,
                    eventSource: 'cron_sync_google',
                  }).catch(() => {})
                } catch (cErr: any) {
                  if (cErr?.code === 'P2002') {
                    summary.totalUnchanged++
                  } else {
                    throw cErr
                  }
                }
              }
            }
            summary.googleSyncSuccesses++
            await db.business.update({
              where: { id: business.id },
              data: {
                googleSyncStatus: 'completed',
                googleSyncError: null,
                googleSyncedAt: new Date(),
              },
            }).catch(() => {})
          }
        } catch (gErr: any) {
          const rawMsg = gErr?.message || ''
          const isAuthErr = rawMsg.includes('401') || rawMsg.includes('403')
          const isRateLimit = rawMsg.includes('429')
          const safeErr = isAuthErr
            ? 'Google authorization expired or revoked. Please reconnect.'
            : isRateLimit
              ? 'Google API rate limit reached. Please try again later.'
              : 'Google review sync failed.'

          console.warn(`[Cron Sync] Google sync failed for business ${business.id}:`, safeErr)
          await db.business.update({
            where: { id: business.id },
            data: {
              googleSyncStatus: 'failed',
              googleSyncError: safeErr,
            },
          }).catch(() => {})
          summary.errors.push({
            businessId: business.id,
            provider: 'google',
            error: safeErr,
          })
        }
      }

      // ─────────────────────────────────────────────
      // Facebook Review Sync
      // ─────────────────────────────────────────────
      if (business.facebookPageId) {
        summary.facebookSyncAttempts++
        try {
          const tokens = await getTokens(business.id, 'facebook')
          if (tokens && tokens.accessToken) {
            const fbReviews = await fetchFacebookReviews(business.facebookPageId, tokens.accessToken, 50)
            for (const fr of fbReviews) {
              const externalId = String(fr.id)
              if (!externalId) continue

              const rating = Math.max(1, Math.min(5, Math.round(fr.rating || 5)))
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
                  summary.totalUpdated++
                } else {
                  summary.totalUnchanged++
                }
              } else {
                const newReview = await db.review.create({
                  data: {
                    businessId: business.id,
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
                summary.totalCreated++

                // AUTO-01: Asynchronously evaluate automations
                processReviewAutomations({
                  reviewId: newReview.id,
                  businessId: business.id,
                  eventSource: 'cron_sync_facebook',
                }).catch(() => {})
              }
            }
            summary.facebookSyncSuccesses++
          }
        } catch (fErr: any) {
          console.warn(`[Cron Sync] Facebook sync failed for business ${business.id}:`, fErr.message)
          summary.errors.push({
            businessId: business.id,
            provider: 'facebook',
            error: fErr.message || 'Facebook sync failed',
          })
        }
      }

      // Update business review count and average rating if anything was created or updated
      try {
        const agg = await db.review.aggregate({
          where: { businessId: business.id },
          _avg: { rating: true },
          _count: true,
        })
        await db.business.update({
          where: { id: business.id },
          data: {
            avgRating: Math.round((agg._avg.rating || 0) * 10) / 10,
            reviewCount: agg._count,
          },
        })
      } catch {}
    }

    // Record cron audit log
    await db.auditLog.create({
      data: {
        action: 'cron.sync_reviews',
        targetType: 'system',
        targetId: 'cron_scheduler',
        metadata: JSON.stringify(summary),
      },
    })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    console.error('[Cron Sync] Global cron failure:', error)
    return NextResponse.json(
      { error: 'Internal cron execution error', details: error.message },
      { status: 500 }
    )
  }
}

// GET /api/cron/sync-reviews (Vercel Cron invokes via GET)
export async function GET(request: NextRequest) {
  return handleSyncCron(request)
}

// POST /api/cron/sync-reviews (External schedulers invoke via POST)
export async function POST(request: NextRequest) {
  return handleSyncCron(request)
}

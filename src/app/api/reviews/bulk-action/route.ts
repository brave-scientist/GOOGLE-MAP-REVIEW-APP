import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { DraftStatus, PublishAttemptStatus, ReviewSource, Role } from '@prisma/client'
import { postGoogleReply, getValidGoogleAccessToken } from '@/lib/integrations/google-business-profile'
import { postFacebookReply } from '@/lib/integrations/facebook-graph'
import { decrypt } from '@/lib/crypto'
import { isOrgAdminRole, isOperatorRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

export interface BulkActionResultItem {
  reviewId: string
  status: string
  publishStatus: 'LIVE' | 'SAVED_LOCALLY' | 'FAILED' | 'UNCONFIRMED' | 'SKIPPED' | 'UNAUTHORIZED' | 'REJECTED'
  publishedLive: boolean
  message?: string
  code?: string
}

// POST /api/reviews/bulk-action — Multi-location atomic bulk review reply approval and platform dispatch
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // RBAC: VIEWER cannot approve, reject, or dispatch reviews
  const isOrgAdmin = isOrgAdminRole(ctx.user.role)
  const isOperator = isOperatorRole(ctx.user.role)

  if (!isOrgAdmin && !isOperator) {
    return NextResponse.json(
      { error: 'Only administrators and authorized operators may perform bulk review actions', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const rawReviewIds = Array.isArray(body.reviewIds) ? (body.reviewIds as string[]) : []
    const action = (body.action as 'approve' | 'publish' | 'reject' | undefined) || 'approve'
    const publishMode = body.publishMode as 'manual' | 'platform' | undefined
    const isExplicitManual = body.manual === true || publishMode === 'manual'

    if (rawReviewIds.length === 0) {
      return NextResponse.json({ error: 'reviewIds must be a non-empty array', code: 'INVALID_INPUT' }, { status: 400 })
    }

    // 1. Deduplicate review IDs (prevents duplicate processing in same bulk batch)
    const uniqueReviewIds = Array.from(new Set(rawReviewIds))

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'reply.bulk_action_initiated',
        targetType: 'review',
        metadata: JSON.stringify({
          action,
          publishMode: isExplicitManual ? 'manual' : 'platform',
          requestedCount: rawReviewIds.length,
          uniqueCount: uniqueReviewIds.length,
        }),
      },
    })

    // 2. Fetch all matching reviews from DB (scoped to caller's org at query level)
    const fetchedReviews = await db.review.findMany({
      where: {
        id: { in: uniqueReviewIds },
        business: { orgId: ctx.orgId },
      },
      include: {
        business: {
          select: {
            id: true,
            orgId: true,
            name: true,
            googleLocationId: true,
          },
        },
      },
    })

    const reviewMap = new Map(fetchedReviews.map((r) => [r.id, r]))

    const results: BulkActionResultItem[] = []
    let publishedCount = 0
    let savedLocallyCount = 0
    let failedCount = 0
    let unconfirmedCount = 0
    let skippedCount = 0
    let unauthorizedCount = 0
    let rejectedCount = 0

    // 3. Process each unique ID with strict authorization and atomic concurrency guards
    for (const reviewId of uniqueReviewIds) {
      const review = reviewMap.get(reviewId)

      // Check 1: Review exists and belongs to this organization (cross-tenant boundary)
      if (!review || !review.business || review.business.orgId !== ctx.orgId) {
        unauthorizedCount++
        results.push({
          reviewId,
          status: 'NOT_FOUND',
          publishStatus: 'UNAUTHORIZED',
          publishedLive: false,
          message: 'Review does not exist in your organization',
          code: 'UNAUTHORIZED_REVIEW',
        })
        continue
      }

      // Check 2: Caller has permission for this specific location
      if (!ctx.businessIds.includes(review.businessId)) {
        unauthorizedCount++
        results.push({
          reviewId,
          status: 'FORBIDDEN',
          publishStatus: 'UNAUTHORIZED',
          publishedLive: false,
          message: 'You are not authorized to dispatch reviews for this location',
          code: 'LOCATION_FORBIDDEN',
        })
        continue
      }

      // Check 3: Check eligibility against already posted or in-flight reviews
      if (review.draftStatus === DraftStatus.POSTED) {
        skippedCount++
        results.push({
          reviewId,
          status: DraftStatus.POSTED,
          publishStatus: 'SKIPPED',
          publishedLive: false,
          message: 'Review reply has already been posted',
          code: 'ALREADY_POSTED',
        })
        continue
      }

      if (review.draftStatus === DraftStatus.POSTING) {
        skippedCount++
        results.push({
          reviewId,
          status: DraftStatus.POSTING,
          publishStatus: 'SKIPPED',
          publishedLive: false,
          message: 'Review reply is currently in flight by another process',
          code: 'ALREADY_POSTING',
        })
        continue
      }

      // Action: REJECT
      if (action === 'reject') {
        const rejectClaim = await db.review.updateMany({
          where: {
            id: reviewId,
            draftStatus: {
              in: [DraftStatus.DRAFT, DraftStatus.PENDING, DraftStatus.NONE, DraftStatus.APPROVED],
            },
          },
          data: { draftStatus: DraftStatus.REJECTED },
        })

        if (rejectClaim.count === 0) {
          skippedCount++
          results.push({
            reviewId,
            status: review.draftStatus,
            publishStatus: 'SKIPPED',
            publishedLive: false,
            message: 'Cannot reject review: in flight or already posted',
            code: 'CONCURRENCY_LOCKED',
          })
          continue
        }

        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'draft.rejected',
            targetType: 'review',
            targetId: reviewId,
            metadata: JSON.stringify({ reviewId, mode: 'bulk' }),
          },
        })
        rejectedCount++
        results.push({
          reviewId,
          status: DraftStatus.REJECTED,
          publishStatus: 'REJECTED',
          publishedLive: false,
        })
        continue
      }

      // Action: APPROVE / PUBLISH
      if (!review.draftText || !review.draftText.trim()) {
        skippedCount++
        results.push({
          reviewId,
          status: review.draftStatus,
          publishStatus: 'SKIPPED',
          publishedLive: false,
          message: 'No draft reply text available to approve',
          code: 'NO_DRAFT_TEXT',
        })
        continue
      }

      // 4. Concurrency Guard: Atomically claim review in POSTING status
      const claim = await db.review.updateMany({
        where: {
          id: reviewId,
          draftStatus: {
            in: [DraftStatus.DRAFT, DraftStatus.PENDING, DraftStatus.NONE, DraftStatus.APPROVED],
          },
        },
        data: {
          draftStatus: DraftStatus.POSTING,
        },
      })

      if (claim.count === 0) {
        skippedCount++
        results.push({
          reviewId,
          status: DraftStatus.POSTING,
          publishStatus: 'SKIPPED',
          publishedLive: false,
          message: 'Concurrent claim conflict; skipped',
          code: 'CONCURRENCY_LOCKED',
        })
        continue
      }

      // 5. Create in-flight publish attempt
      const attempt = await db.reviewPublishAttempt.create({
        data: {
          reviewId,
          platform: review.source,
          status: PublishAttemptStatus.IN_FLIGHT,
        },
      })

      const finalText = review.draftText

      // 6. Branch: Manual copy or Internal reviews
      if (isExplicitManual || review.source === ReviewSource.INTERNAL) {
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: {
              status: PublishAttemptStatus.SUCCESS,
              remoteId: `${isExplicitManual ? 'manual_copy' : 'internal'}_${reviewId}`,
            },
          }),
          db.review.update({
            where: { id: reviewId },
            data: {
              replyText: finalText,
              repliedAt: new Date(),
              repliedBy: ctx.user.id,
              draftStatus: DraftStatus.POSTED,
            },
          }),
          db.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: isExplicitManual ? 'reply.manual_approved' : 'reply.posted',
              targetType: 'review',
              targetId: reviewId,
              metadata: JSON.stringify({ reviewId, source: review.source, mode: 'bulk_manual' }),
            },
          }),
        ])

        savedLocallyCount++
        results.push({
          reviewId,
          status: DraftStatus.POSTED,
          publishStatus: 'SAVED_LOCALLY',
          publishedLive: false,
        })
        continue
      }

      // 7. Branch: Google Platform Dispatch
      if (review.source === ReviewSource.GOOGLE) {
        const tokenResolution = await getValidGoogleAccessToken(review.businessId)

        if (!tokenResolution.success) {
          // Token missing / expired
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage: tokenResolution.error },
            }),
            db.review.update({
              where: { id: reviewId },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_failed',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({
                  reviewId,
                  source: review.source,
                  error: tokenResolution.error,
                  code: tokenResolution.code,
                  mode: 'bulk',
                }),
              },
            }),
          ])

          failedCount++
          results.push({
            reviewId,
            status: DraftStatus.APPROVED,
            publishStatus: 'FAILED',
            publishedLive: false,
            message: tokenResolution.error,
            code: tokenResolution.code,
          })
          continue
        }

        // Live dispatch to Google
        try {
          const postResult = await postGoogleReply(
            tokenResolution.accessToken,
            review.externalId,
            finalText,
            review.business?.googleLocationId || undefined
          )

          if (!postResult.ok) {
            if (postResult.status === 401) {
              throw new Error('GOOGLE_REAUTH_REQUIRED')
            }
            throw new Error(postResult.error || 'Google Business Profile API rejected reply')
          }

          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.SUCCESS, remoteId: review.externalId },
            }),
            db.review.update({
              where: { id: reviewId },
              data: {
                replyText: finalText,
                repliedAt: new Date(),
                repliedBy: ctx.user.id,
                draftStatus: DraftStatus.POSTED,
              },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.posted',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({ reviewId, source: review.source, mode: 'bulk_live' }),
              },
            }),
          ])

          publishedCount++
          results.push({
            reviewId,
            status: DraftStatus.POSTED,
            publishStatus: 'LIVE',
            publishedLive: true,
          })
        } catch (postErr: any) {
          const isReauth = postErr.message === 'GOOGLE_REAUTH_REQUIRED'
          const errorMessage = isReauth
            ? 'Google authorization has expired or was revoked. Please reconnect in Settings.'
            : postErr.message
          const errorCode = isReauth ? 'GOOGLE_REAUTH_REQUIRED' : 'GOOGLE_API_ERROR'

          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage },
            }),
            db.review.update({
              where: { id: reviewId },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_failed',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({ reviewId, source: review.source, error: errorMessage, code: errorCode, mode: 'bulk' }),
              },
            }),
          ])

          failedCount++
          results.push({
            reviewId,
            status: DraftStatus.APPROVED,
            publishStatus: 'FAILED',
            publishedLive: false,
            message: errorMessage,
            code: errorCode,
          })
        }
        continue
      }

      // 8. Branch: Facebook Platform Dispatch
      if (review.source === ReviewSource.FACEBOOK) {
        const token = await db.oAuthToken.findUnique({
          where: {
            businessId_provider: {
              businessId: review.businessId,
              provider: 'facebook',
            },
          },
        })

        if (!token) {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Facebook page not connected for this business' },
            }),
            db.review.update({
              where: { id: reviewId },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_failed',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({ reviewId, source: review.source, error: 'Facebook page not connected', mode: 'bulk' }),
              },
            }),
          ])

          failedCount++
          results.push({
            reviewId,
            status: DraftStatus.APPROVED,
            publishStatus: 'FAILED',
            publishedLive: false,
            message: 'Facebook page not connected for this business',
            code: 'NO_OAUTH_TOKEN',
          })
          continue
        }

        let pageToken: string
        try {
          pageToken = decrypt(token.accessTokenEnc)
        } catch {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Failed to decrypt access token' },
            }),
            db.review.update({
              where: { id: reviewId },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
          ])

          failedCount++
          results.push({
            reviewId,
            status: DraftStatus.APPROVED,
            publishStatus: 'FAILED',
            publishedLive: false,
            message: 'OAuth credential decryption failed',
            code: 'TOKEN_DECRYPT_FAILED',
          })
          continue
        }

        try {
          const fbResult = await postFacebookReply(pageToken, review.externalId, finalText)
          if (!fbResult.ok) {
            const isAuthError = fbResult.status === 401 || fbResult.status === 403
            const isClientError = fbResult.status !== undefined && fbResult.status >= 400 && fbResult.status < 500
            if (isAuthError || isClientError) {
              const errorCode = isAuthError ? 'FACEBOOK_AUTH_ERROR' : 'FACEBOOK_API_ERROR'
              const errorMessage = fbResult.error || 'Facebook Graph API rejected the reply'

              await db.$transaction([
                db.reviewPublishAttempt.update({
                  where: { id: attempt.id },
                  data: { status: PublishAttemptStatus.FAILED, errorMessage },
                }),
                db.review.update({
                  where: { id: reviewId },
                  data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
                }),
                db.auditLog.create({
                  data: {
                    actorId: ctx.user.id,
                    action: 'reply.publish_failed',
                    targetType: 'review',
                    targetId: reviewId,
                    metadata: JSON.stringify({ reviewId, source: review.source, error: errorMessage, code: errorCode, mode: 'bulk' }),
                  },
                }),
              ])

              failedCount++
              results.push({
                reviewId,
                status: DraftStatus.APPROVED,
                publishStatus: 'FAILED',
                publishedLive: false,
                message: errorMessage,
                code: errorCode,
              })
              continue
            }

            // Status is 5xx or undefined (network failure) -> ambiguous
            throw new Error(fbResult.error || 'Ambiguous network error during Facebook dispatch')
          }

          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.SUCCESS, remoteId: fbResult.remoteId || review.externalId },
            }),
            db.review.update({
              where: { id: reviewId },
              data: {
                replyText: finalText,
                repliedAt: new Date(),
                repliedBy: ctx.user.id,
                draftStatus: DraftStatus.POSTED,
              },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.posted',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({ reviewId, source: review.source, mode: 'bulk_live' }),
              },
            }),
          ])

          publishedCount++
          results.push({
            reviewId,
            status: DraftStatus.POSTED,
            publishStatus: 'LIVE',
            publishedLive: true,
          })
        } catch (fbErr: any) {
          // Ambiguous network failure: mark UNCONFIRMED to prevent blind retry or duplicate dispatch
          const errorMessage = fbErr.message || 'Ambiguous network error during dispatch'

          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.UNCONFIRMED, errorMessage },
            }),
            db.review.update({
              where: { id: reviewId },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_unconfirmed',
                targetType: 'review',
                targetId: reviewId,
                metadata: JSON.stringify({ reviewId, source: review.source, error: errorMessage, mode: 'bulk' }),
              },
            }),
          ])

          unconfirmedCount++
          results.push({
            reviewId,
            status: DraftStatus.APPROVED,
            publishStatus: 'UNCONFIRMED',
            publishedLive: false,
            message: errorMessage,
            code: 'AMBIGUOUS_PUBLISH',
          })
        }
        continue
      }

      // Default fallback for other sources (YELP, TRUSTPILOT, etc.)
      await db.$transaction([
        db.reviewPublishAttempt.update({
          where: { id: attempt.id },
          data: { status: PublishAttemptStatus.SUCCESS, remoteId: `manual_copy_${reviewId}` },
        }),
        db.review.update({
          where: { id: reviewId },
          data: {
            replyText: finalText,
            repliedAt: new Date(),
            repliedBy: ctx.user.id,
            draftStatus: DraftStatus.POSTED,
          },
        }),
      ])

      savedLocallyCount++
      results.push({
        reviewId,
        status: DraftStatus.POSTED,
        publishStatus: 'SAVED_LOCALLY',
        publishedLive: false,
      })
    }

    // 9. Record bulk summary audit log
    if (unauthorizedCount > 0) {
      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'reply.bulk_unauthorized_attempt',
          targetType: 'review',
          metadata: JSON.stringify({
            unauthorizedCount,
            totalRequested: uniqueReviewIds.length,
          }),
        },
      })
    }

    const isPartial = failedCount > 0 || unconfirmedCount > 0 || unauthorizedCount > 0
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: isPartial ? 'reply.bulk_publish_partial' : 'reply.bulk_published',
        targetType: 'review',
        metadata: JSON.stringify({
          total: uniqueReviewIds.length,
          authorized: uniqueReviewIds.length - unauthorizedCount,
          published: publishedCount,
          savedLocally: savedLocallyCount,
          failed: failedCount,
          unconfirmed: unconfirmedCount,
          skipped: skippedCount,
          unauthorized: unauthorizedCount,
        }),
      },
    })

    return NextResponse.json({
      total: uniqueReviewIds.length,
      authorized: uniqueReviewIds.length - unauthorizedCount,
      published: publishedCount,
      savedLocally: savedLocallyCount,
      failed: failedCount,
      unconfirmed: unconfirmedCount,
      skipped: skippedCount,
      unauthorized: unauthorizedCount,
      rejected: rejectedCount,
      results,
    })
  } catch (error) {
    console.error('Bulk review action failed:', error)
    return NextResponse.json({ error: 'Bulk review action failed' }, { status: 500 })
  }
}

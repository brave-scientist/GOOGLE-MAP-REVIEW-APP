import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus, PublishAttemptStatus, ReviewSource, Role } from '@prisma/client'
import { getTenantContext, assertReviewOwnership } from '@/lib/tenant-context'
import { postGoogleReply, getValidGoogleAccessToken } from '@/lib/integrations/google-business-profile'
import { postFacebookReply } from '@/lib/integrations/facebook-graph'
import { decrypt } from '@/lib/crypto'

import { isOrgAdminRole, isOperatorRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// POST /api/reviews/[id]/approve — Approve and dispatch reply to external platform
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // Role-based authorization: Org admins and authorized regional operators can approve
  const isOrgAdmin = isOrgAdminRole(ctx.user.role)
  const isOperator = isOperatorRole(ctx.user.role)

  if (!isOrgAdmin && !isOperator) {
    return NextResponse.json(
      { error: 'Only account owners, administrators, and authorized operators may approve and publish review replies', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const editedText = body.editedText as string | undefined
    const action = (body.action as 'approve' | 'reject' | undefined) || 'approve'
    const publishMode = body.publishMode as 'manual' | 'platform' | undefined
    const isExplicitManual = body.manual === true || publishMode === 'manual'
    const isExplicitPlatform = publishMode === 'platform'

    // IDOR protection: verify ownership before allowing approve/reject
    const reviewCheck = await assertReviewOwnership(ctx, id, true)
    if (reviewCheck instanceof NextResponse) return reviewCheck

    const review = await db.review.findUnique({
      where: { id },
      include: { business: true },
    })

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (action === 'reject') {
      if (review.draftStatus === DraftStatus.POSTED) {
        return NextResponse.json(
          { error: 'Cannot reject a review reply that has already been posted', code: 'ALREADY_POSTED' },
          { status: 400 }
        )
      }
      if (review.draftStatus === DraftStatus.POSTING) {
        return NextResponse.json(
          { error: 'Cannot reject a review reply currently in flight', code: 'ALREADY_POSTING' },
          { status: 409 }
        )
      }

      await db.review.update({
        where: { id },
        data: { draftStatus: DraftStatus.REJECTED },
      })
      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'draft.rejected',
          targetType: 'review',
          targetId: id,
          metadata: JSON.stringify({ reviewId: id }),
        },
      })
      return NextResponse.json({ status: DraftStatus.REJECTED })
    }

    // Action is approve
    const finalText = editedText || review.draftText
    if (!finalText) {
      return NextResponse.json({ error: 'No draft text to approve' }, { status: 400 })
    }

    // Prevent concurrent double-posting: atomically claim review in POSTING status
    const claimResult = await db.review.updateMany({
      where: {
        id,
        draftStatus: {
          in: [DraftStatus.DRAFT, DraftStatus.PENDING, DraftStatus.NONE, DraftStatus.APPROVED],
        },
      },
      data: {
        draftStatus: DraftStatus.POSTING,
      },
    })

    if (claimResult.count === 0) {
      return NextResponse.json(
        { error: 'Reply is currently being posted or has already been posted.', code: 'ALREADY_POSTING' },
        { status: 409 }
      )
    }

    // Create in-flight attempt record
    const attempt = await db.reviewPublishAttempt.create({
      data: {
        reviewId: id,
        platform: review.source,
        status: PublishAttemptStatus.IN_FLIGHT,
      },
    })

    // Branch 1: Explicit manual publishing workflow (Approve & Copy)
    if (isExplicitManual) {
      await db.$transaction([
        db.reviewPublishAttempt.update({
          where: { id: attempt.id },
          data: { status: PublishAttemptStatus.SUCCESS, remoteId: `manual_copy_${id}` },
        }),
        db.review.update({
          where: { id },
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
            action: 'reply.manual_approved',
            targetType: 'review',
            targetId: id,
            metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'manual_copy' }),
          },
        }),
      ])

      return NextResponse.json({
        status: DraftStatus.POSTED,
        replyText: finalText,
        repliedAt: new Date().toISOString(),
        manual: true,
        publishedLive: false,
        publishStatus: 'SAVED_LOCALLY',
      })
    }

    // Branch 2: Google Platform Dispatch
    if (review.source === ReviewSource.GOOGLE) {
      const tokenResolution = await getValidGoogleAccessToken(review.businessId)

      // If token resolution failed
      if (!tokenResolution.success) {
        // If caller explicitly requested platform dispatch, return structured failure
        if (isExplicitPlatform) {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage: tokenResolution.error },
            }),
            db.review.update({
              where: { id },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_failed',
                targetType: 'review',
                targetId: id,
                metadata: JSON.stringify({ reviewId: id, source: review.source, error: tokenResolution.error, code: tokenResolution.code }),
              },
            }),
          ])

          const statusCode = tokenResolution.code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 400
          return NextResponse.json(
            {
              error: tokenResolution.error,
              code: tokenResolution.code,
              status: DraftStatus.APPROVED,
              publishedLive: false,
              publishStatus: 'FAILED',
            },
            { status: statusCode }
          )
        }

        // Default / unconfigured fallback when publishMode is not explicitly 'platform':
        // Save locally without faking external platform dispatch
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.SUCCESS, remoteId: `manual_copy_${id}` },
          }),
          db.review.update({
            where: { id },
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
              action: 'reply.saved_locally_unconnected',
              targetType: 'review',
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, reason: tokenResolution.code }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
          manual: true,
          publishedLive: false,
          publishStatus: 'SAVED_LOCALLY',
          message: 'Saved locally. Google account is not connected.',
        })
      }

      // We have a valid Google access token: dispatch live
      const accessToken = tokenResolution.accessToken

      try {
        const postResult = await postGoogleReply(
          accessToken,
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
            where: { id },
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
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'live' }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
          publishedLive: true,
          publishStatus: 'LIVE',
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
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
          }),
          db.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: 'reply.publish_failed',
              targetType: 'review',
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, error: errorMessage, code: errorCode }),
            },
          }),
        ])

        return NextResponse.json(
          {
            error: `Failed to post reply to Google: ${errorMessage}`,
            code: errorCode,
            status: DraftStatus.APPROVED,
            publishedLive: false,
            publishStatus: 'FAILED',
          },
          { status: isReauth ? 401 : 502 }
        )
      }
    }

    // Branch 3: Facebook Platform Dispatch
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
        if (isExplicitPlatform) {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Facebook page not connected for this business' },
            }),
            db.review.update({
              where: { id },
              data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
            }),
            db.auditLog.create({
              data: {
                actorId: ctx.user.id,
                action: 'reply.publish_failed',
                targetType: 'review',
                targetId: id,
                metadata: JSON.stringify({ reviewId: id, source: review.source, error: 'Facebook page not connected' }),
              },
            }),
          ])

          return NextResponse.json(
            {
              error: 'Facebook page not connected for this business. Please connect Facebook in Settings → Integrations.',
              code: 'NO_OAUTH_TOKEN',
              status: DraftStatus.APPROVED,
              publishedLive: false,
              publishStatus: 'FAILED',
            },
            { status: 400 }
          )
        }

        // Default / unconfigured fallback when publishMode is not explicitly 'platform':
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.SUCCESS, remoteId: `manual_copy_${id}` },
          }),
          db.review.update({
            where: { id },
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
              action: 'reply.saved_locally_unconnected',
              targetType: 'review',
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, reason: 'NO_OAUTH_TOKEN' }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
          manual: true,
          publishedLive: false,
          publishStatus: 'SAVED_LOCALLY',
          message: 'Saved locally. Facebook page is not connected.',
        })
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
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
          }),
        ])
        return NextResponse.json({ error: 'OAuth credential error. Please reconnect Facebook.', code: 'TOKEN_DECRYPT_FAILED' }, { status: 500 })
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
                where: { id },
                data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
              }),
              db.auditLog.create({
                data: {
                  actorId: ctx.user.id,
                  action: 'reply.publish_failed',
                  targetType: 'review',
                  targetId: id,
                  metadata: JSON.stringify({ reviewId: id, source: review.source, error: errorMessage, code: errorCode }),
                },
              }),
            ])

            return NextResponse.json(
              {
                error: errorMessage,
                code: errorCode,
                status: PublishAttemptStatus.FAILED,
                publishedLive: false,
                publishStatus: 'FAILED',
              },
              { status: isAuthError ? 401 : 400 }
            )
          }

          throw new Error(fbResult.error || 'Ambiguous network error during Facebook dispatch')
        }

        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.SUCCESS, remoteId: fbResult.remoteId || review.externalId },
          }),
          db.review.update({
            where: { id },
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
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'live' }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
          publishedLive: true,
          publishStatus: 'LIVE',
        })
      } catch (fbErr: any) {
        // Ambiguous network failure: mark UNCONFIRMED to prevent blind retry
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.UNCONFIRMED, errorMessage: fbErr.message },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED, replyText: finalText },
          }),
          db.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: 'reply.publish_unconfirmed',
              targetType: 'review',
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, warning: 'Ambiguous network error. Requires verification.' }),
            },
          }),
        ])

        return NextResponse.json(
          {
            error: 'Ambiguous response from Facebook. Please check Facebook before retrying.',
            code: 'AMBIGUOUS_PUBLISH',
            status: PublishAttemptStatus.UNCONFIRMED,
            publishedLive: false,
            publishStatus: 'UNCONFIRMED',
          },
          { status: 502 }
        )
      }
    }

    // Branch 4: Internal or unsupported direct sync platform (Yelp/Trustpilot/Internal)
    await db.$transaction([
      db.reviewPublishAttempt.update({
        where: { id: attempt.id },
        data: { status: PublishAttemptStatus.SUCCESS, remoteId: `internal_${id}` },
      }),
      db.review.update({
        where: { id },
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
          targetId: id,
          metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'internal' }),
        },
      }),
    ])

    return NextResponse.json({
      status: DraftStatus.POSTED,
      replyText: finalText,
      repliedAt: new Date().toISOString(),
      manual: true,
      publishedLive: false,
      publishStatus: 'SAVED_LOCALLY',
    })
  } catch (error) {
    console.error('Approve error:', error)
    return NextResponse.json(
      { error: 'Failed to approve reply' },
      { status: 500 }
    )
  }
}

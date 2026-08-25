import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus, PublishAttemptStatus, ReviewSource } from '@prisma/client'
import { getTenantContext, assertReviewOwnership } from '@/lib/tenant-context'
import { postGoogleReply } from '@/lib/integrations/google-business-profile'
import { postFacebookReply } from '@/lib/integrations/facebook-graph'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// POST /api/reviews/[id]/approve — Approve and dispatch reply to external platform
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const editedText = body.editedText as string | undefined
    const action = (body.action as 'approve' | 'reject' | undefined) || 'approve'

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

    // If manual publishing workflow is selected (Beta workflow: Approve & Copy)
    if (body.manual === true || body.publishMode === 'manual') {
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
      })
    }

    // Dispatch to external platform adapter
    if (review.source === ReviewSource.GOOGLE) {
      const token = await db.oAuthToken.findUnique({
        where: {
          businessId_provider: {
            businessId: review.businessId,
            provider: 'google',
          },
        },
      })

      if (!token) {
        // Fallback: If in mock/dev mode without connected account, mark success or return error
        if (process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_CLIENT_ID) {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.SUCCESS, remoteId: `mock_reply_${id}` },
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
                metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'mock' }),
              },
            }),
          ])

          return NextResponse.json({
            status: DraftStatus.POSTED,
            replyText: finalText,
            repliedAt: new Date().toISOString(),
          })
        }

        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Google account not connected for this location' },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED },
          }),
        ])

        return NextResponse.json(
          { error: 'Google account not connected for this location. Please connect your Google Business Profile.', code: 'NO_OAUTH_TOKEN' },
          { status: 400 }
        )
      }

      let accessToken: string
      try {
        accessToken = decrypt(token.accessTokenEnc)
      } catch (err: any) {
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Failed to decrypt access token' },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED },
          }),
        ])
        return NextResponse.json({ error: 'OAuth credential error. Please reconnect your account.' }, { status: 500 })
      }

      try {
        const ok = await postGoogleReply(accessToken, review.externalId, finalText)
        if (!ok) {
          throw new Error('Google Business Profile API rejected reply')
        }

        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.SUCCESS },
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
              metadata: JSON.stringify({ reviewId: id, source: review.source }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
        })
      } catch (postErr: any) {
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.FAILED, errorMessage: postErr.message },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED },
          }),
          db.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: 'reply.publish_failed',
              targetType: 'review',
              targetId: id,
              metadata: JSON.stringify({ reviewId: id, source: review.source, error: postErr.message }),
            },
          }),
        ])

        return NextResponse.json({ error: `Failed to post reply to Google: ${postErr.message}` }, { status: 502 })
      }
    } else if (review.source === ReviewSource.FACEBOOK) {
      const token = await db.oAuthToken.findUnique({
        where: {
          businessId_provider: {
            businessId: review.businessId,
            provider: 'facebook',
          },
        },
      })

      if (!token) {
        if (process.env.NODE_ENV !== 'production' && !process.env.FACEBOOK_APP_ID) {
          await db.$transaction([
            db.reviewPublishAttempt.update({
              where: { id: attempt.id },
              data: { status: PublishAttemptStatus.SUCCESS, remoteId: `mock_fb_reply_${id}` },
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
                metadata: JSON.stringify({ reviewId: id, source: review.source, mode: 'mock' }),
              },
            }),
          ])

          return NextResponse.json({
            status: DraftStatus.POSTED,
            replyText: finalText,
            repliedAt: new Date().toISOString(),
          })
        }

        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.FAILED, errorMessage: 'Facebook page not connected' },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED },
          }),
        ])

        return NextResponse.json({ error: 'Facebook page not connected for this business', code: 'NO_OAUTH_TOKEN' }, { status: 400 })
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
            data: { draftStatus: DraftStatus.APPROVED },
          }),
        ])
        return NextResponse.json({ error: 'OAuth credential error. Please reconnect Facebook.' }, { status: 500 })
      }

      try {
        const ok = await postFacebookReply(pageToken, review.externalId, finalText)
        if (!ok) {
          throw new Error('Facebook Graph API returned failure')
        }

        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.SUCCESS },
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
              metadata: JSON.stringify({ reviewId: id, source: review.source }),
            },
          }),
        ])

        return NextResponse.json({
          status: DraftStatus.POSTED,
          replyText: finalText,
          repliedAt: new Date().toISOString(),
        })
      } catch (fbErr: any) {
        // Facebook POST is non-idempotent: flag UNCONFIRMED to prevent blind retry
        await db.$transaction([
          db.reviewPublishAttempt.update({
            where: { id: attempt.id },
            data: { status: PublishAttemptStatus.UNCONFIRMED, errorMessage: fbErr.message },
          }),
          db.review.update({
            where: { id },
            data: { draftStatus: DraftStatus.APPROVED },
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
          },
          { status: 502 }
        )
      }
    } else {
      // Internal or unsupported direct sync platform (Yelp/Trustpilot/Apple)
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
            metadata: JSON.stringify({ reviewId: id, source: review.source }),
          },
        }),
      ])

      return NextResponse.json({
        status: DraftStatus.POSTED,
        replyText: finalText,
        repliedAt: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error('Approve error:', error)
    return NextResponse.json(
      { error: 'Failed to approve reply' },
      { status: 500 }
    )
  }
}

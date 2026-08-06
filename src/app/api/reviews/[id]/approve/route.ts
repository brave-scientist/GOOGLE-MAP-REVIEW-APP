import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST /api/reviews/[id]/approve — Approve and "post" a draft reply
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const editedText = body.editedText as string | undefined
    const action = body.action as 'approve' | 'reject' | undefined || 'approve'

    const review = await db.review.findUnique({
      where: { id },
      include: { business: true },
    })

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (!review.draftText && action === 'approve') {
      return NextResponse.json({ error: 'No draft to approve' }, { status: 400 })
    }

    if (action === 'reject') {
      await db.review.update({
        where: { id },
        data: { draftStatus: DraftStatus.REJECTED },
      })
      await db.auditLog.create({
        data: {
          action: 'draft.rejected',
          targetType: 'review',
          targetId: id,
          metadata: JSON.stringify({ reviewId: id }),
        },
      })
      return NextResponse.json({ status: DraftStatus.REJECTED })
    }

    // Approve
    const finalText = editedText || review.draftText!
    await db.review.update({
      where: { id },
      data: {
        replyText: finalText,
        repliedAt: new Date(),
        repliedBy: 'system',
        draftStatus: DraftStatus.POSTED,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'reply.posted',
        targetType: 'review',
        targetId: id,
        metadata: JSON.stringify({
          reviewId: id,
          source: review.source,
          wasEdited: !!editedText,
        }),
      },
    })

    return NextResponse.json({
      status: DraftStatus.POSTED,
      replyText: finalText,
      repliedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Approve error:', error)
    return NextResponse.json(
      { error: 'Failed to approve reply', details: String(error) },
      { status: 500 }
    )
  }
}

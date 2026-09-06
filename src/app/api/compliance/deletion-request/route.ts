import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const CreateDeletionRequestSchema = z.object({
  reason: z.string().max(500).optional(),
})

// GET /api/compliance/deletion-request
// Returns the user/org's active deletion request if one exists
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request, 'FREE')
  if (ctx instanceof NextResponse) return ctx

  try {
    const activeRequest = await db.deletionRequest.findFirst({
      where: {
        userId: ctx.user.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        reason: true,
        scheduledFor: true,
        requestedAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      hasActiveRequest: !!activeRequest,
      deletionRequest: activeRequest || null,
    })
  } catch (error) {
    console.error('Failed to query deletion request:', error)
    return NextResponse.json({ error: 'Failed to query deletion status' }, { status: 500 })
  }
}

// POST /api/compliance/deletion-request
// Submits a formal GDPR/CCPA Account Deletion Request
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request, 'FREE')
  if (ctx instanceof NextResponse) return ctx

  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // Body is optional
    }

    const parsed = CreateDeletionRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.format() }, { status: 400 })
    }

    // 1. Check for duplicate active deletion requests
    const existing = await db.deletionRequest.findFirst({
      where: {
        userId: ctx.user.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    })

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'A deletion request is already active for this account.',
        deletionRequest: existing,
      })
    }

    // 2. Schedule for 30 days from today (GDPR Article 17 grace period)
    const scheduledFor = new Date()
    scheduledFor.setDate(scheduledFor.getDate() + 30)

    const deletionRequest = await db.deletionRequest.create({
      data: {
        userId: ctx.user.id,
        orgId: ctx.orgId,
        status: 'PENDING',
        reason: parsed.data.reason || 'User requested deletion via Compliance Center',
        scheduledFor,
      },
    })

    // 3. Record immutable audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'compliance.deletion_requested',
        targetType: 'user',
        targetId: ctx.user.id,
        metadata: JSON.stringify({
          orgId: ctx.orgId,
          requestId: deletionRequest.id,
          scheduledFor: scheduledFor.toISOString(),
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Account deletion request submitted. 30-day grace period is active.',
      deletionRequest,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create deletion request:', error)
    return NextResponse.json({ error: 'Failed to submit deletion request' }, { status: 500 })
  }
}

// DELETE /api/compliance/deletion-request
// Cancels a pending deletion request within the grace period
export async function DELETE(request: NextRequest) {
  const ctx = await getTenantContext(request, 'FREE')
  if (ctx instanceof NextResponse) return ctx

  try {
    const activeRequest = await db.deletionRequest.findFirst({
      where: {
        userId: ctx.user.id,
        status: 'PENDING',
      },
    })

    if (!activeRequest) {
      return NextResponse.json({ error: 'No pending deletion request found to cancel' }, { status: 404 })
    }

    const updated = await db.deletionRequest.update({
      where: { id: activeRequest.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    })

    // Record cancellation in audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'compliance.deletion_cancelled',
        targetType: 'user',
        targetId: ctx.user.id,
        metadata: JSON.stringify({
          requestId: activeRequest.id,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Account deletion request has been cancelled.',
      deletionRequest: updated,
    })
  } catch (error) {
    console.error('Failed to cancel deletion request:', error)
    return NextResponse.json({ error: 'Failed to cancel deletion request' }, { status: 500 })
  }
}

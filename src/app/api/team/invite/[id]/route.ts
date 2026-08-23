import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// DELETE /api/team/invite/[id] — Revoke a pending team invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // RBAC: Only OWNER or ADMIN can revoke team invitations
  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners or admins can revoke invitations', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 })
    }

    // Find invitation strictly scoped to this organization
    const invitation = await db.teamInvitation.findUnique({
      where: { id },
    })

    if (!invitation || invitation.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invitation.consumedAt !== null) {
      return NextResponse.json(
        { error: 'Cannot revoke an already accepted invitation', code: 'ALREADY_CONSUMED' },
        { status: 400 }
      )
    }

    // Delete the invitation
    await db.teamInvitation.delete({
      where: { id },
    })

    // Log audit trail
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'team.invitation_revoked',
        targetType: 'team_invitation',
        targetId: id,
        metadata: JSON.stringify({
          orgId: ctx.orgId,
          email: invitation.email,
          role: invitation.role,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Invitation for ${invitation.email} has been revoked.`,
    })
  } catch (error) {
    console.error('Revoke invitation error:', error)
    return NextResponse.json(
      { error: 'Failed to revoke invitation' },
      { status: 500 }
    )
  }
}

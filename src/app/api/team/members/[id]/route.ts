import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// DELETE /api/team/members/[id] — Remove an active member from the organization
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // RBAC: Only OWNER or ADMIN can remove members
  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners or admins can remove team members', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 })
    }

    // Find the OrgMember record strictly scoped to this organization
    const member = await db.orgMember.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    })

    if (!member || member.orgId !== ctx.orgId) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }

    // Safeguard 1: Cannot remove yourself via this endpoint (use account leave/close flow)
    if (member.userId === ctx.user.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the team', code: 'CANNOT_REMOVE_SELF' },
        { status: 400 }
      )
    }

    // Safeguard 2: Organization OWNER cannot be removed
    if (member.role === Role.OWNER) {
      return NextResponse.json(
        { error: 'The organization owner cannot be removed', code: 'CANNOT_REMOVE_OWNER' },
        { status: 400 }
      )
    }

    // Safeguard 3: An ADMIN cannot remove another ADMIN (only OWNER can remove administrators)
    if (ctx.user.role === Role.ADMIN && member.role === Role.ADMIN) {
      return NextResponse.json(
        { error: 'Administrators cannot remove peer administrators. Only the organization owner can remove admins.', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    // Delete the OrgMember record
    await db.orgMember.delete({
      where: { id },
    })

    // Log audit trail
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'team.member_removed',
        targetType: 'user',
        targetId: member.userId,
        metadata: JSON.stringify({
          orgId: ctx.orgId,
          removedMemberId: id,
          removedUserEmail: member.user.email,
          removedRole: member.role,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Team member ${member.user.email} removed from organization.`,
    })
  } catch (error) {
    console.error('Remove member error:', error)
    return NextResponse.json(
      { error: 'Failed to remove team member' },
      { status: 500 }
    )
  }
}

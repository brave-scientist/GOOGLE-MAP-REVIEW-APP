import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { Plan } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Seat limits per plan
const PLAN_SEAT_LIMITS: Record<Plan, number> = {
  [Plan.FREE]: 1,
  [Plan.STARTER]: 2,
  [Plan.PRO]: 5,
  [Plan.ENTERPRISE]: 25,
  [Plan.AGENCY]: 50,
  [Plan.CUSTOM]: 100,
}

// GET /api/team/members — List organization active members and pending invitations
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    // 1. Fetch active organization members
    const orgMembers = await db.orgMember.findMany({
      where: { orgId: ctx.orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const members = orgMembers.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name || m.user.email.split('@')[0],
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      isCurrentUser: m.userId === ctx.user.id,
    }))

    // 2. Fetch pending (unconsumed and non-expired) invitations defensively
    let pendingInvitations: Array<{
      id: string
      email: string
      role: string
      expiresAt: string
      createdAt: string
      invitedBy?: {
        id: string
        name: string | null
        email: string
      }
    }> = []

    try {
      const pendingInvites = await db.teamInvitation.findMany({
        where: {
          orgId: ctx.orgId,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      pendingInvitations = pendingInvites.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        invitedBy: inv.invitedBy
          ? {
              id: inv.invitedBy.id,
              name: inv.invitedBy.name,
              email: inv.invitedBy.email,
            }
          : undefined,
      }))
    } catch (invitationErr) {
      console.warn('[TEAM-MEMBERS] Failed to query team invitations, falling back to empty list:', invitationErr)
    }

    const plan = (ctx.user.orgPlan as Plan) || Plan.PRO
    const seatLimit = PLAN_SEAT_LIMITS[plan] || 5
    const seatsUsed = members.length

    return NextResponse.json({
      members,
      pendingInvitations,
      totalMembers: members.length,
      totalPending: pendingInvitations.length,
      seatLimit,
      seatsUsed,
      canInvite: seatsUsed < seatLimit,
      plan,
    })
  } catch (error) {
    console.error('Failed to fetch team members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { Role } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'
import { createTeamInvitation, INVITATION_ROLE_MATRIX } from '@/lib/team-invitations'

export const dynamic = 'force-dynamic'

// POST /api/team/invite — Invite a team member using cryptographic token flow
export async function POST(request: NextRequest) {
  // SEC-01: require auth + session orgId
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // SEC-02 (role gating): Centralized role relationship check
  const allowedTargetRoles = INVITATION_ROLE_MATRIX[ctx.user.role] || []
  if (allowedTargetRoles.length === 0) {
    return NextResponse.json(
      { error: `Users with role '${ctx.user.role}' cannot invite team members`, code: 'INSUFFICIENT_ROLE' },
      { status: 403 },
    )
  }

  try {
    const body = await request.json()
    const { email, role } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const result = await createTeamInvitation({
      orgId: ctx.orgId,
      inviterUser: ctx.user,
      email,
      role: role || 'STAFF',
    })

    return NextResponse.json(result)
  } catch (error: any) {
    const message = error?.message || 'Failed to invite team member'
    if (message.includes('INSUFFICIENT_ROLE')) {
      return NextResponse.json({ error: message, code: 'INSUFFICIENT_ROLE' }, { status: 403 })
    }
    if (message.includes('PLAN_LIMIT_EXCEEDED')) {
      return NextResponse.json({ error: message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 })
    }
    if (message.includes('ALREADY_MEMBER')) {
      return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 409 })
    }
    if (message.includes('INVALID_EMAIL')) {
      return NextResponse.json({ error: 'Invalid email address provided' }, { status: 400 })
    }
    console.error('Team invite error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


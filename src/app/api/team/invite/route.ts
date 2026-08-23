import { NextRequest, NextResponse } from 'next/server'
import { Role } from '@prisma/client'
import { getTenantContext } from '@/lib/tenant-context'
import { createTeamInvitation } from '@/lib/team-invitations'

export const dynamic = 'force-dynamic'

// POST /api/team/invite — Invite a team member using cryptographic token flow
export async function POST(request: NextRequest) {
  // SEC-01: require auth + session orgId
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // SEC-02 (role gating): only ADMIN or OWNER can invite new members
  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners or admins can invite team members', code: 'INSUFFICIENT_ROLE' },
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


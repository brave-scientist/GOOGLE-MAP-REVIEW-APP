import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// POST /api/team/invite — Invite a team member
// SEC-01: uses ctx.orgId from the session (cannot be spoofed via body param).
// Only ADMIN or OWNER roles can invite.
export async function POST(request: NextRequest) {
  // SEC-01: require auth + use session's orgId (NOT a body-supplied orgId)
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

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const validRoles = ['ADMIN', 'STAFF', 'VIEWER']
    const memberRole = validRoles.includes(role) ? role : 'STAFF'

    // SEC-01: orgId is taken from the session, NEVER from the request body.
    // An attacker cannot manipulate the body to invite someone into a different org.
    const orgId = ctx.orgId

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } })

    if (existingUser) {
      // Check if already a member of this org
      const existingMember = await db.orgMember.findFirst({
        where: { orgId, userId: existingUser.id },
      })

      if (existingMember) {
        return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 409 })
      }

      // Add existing user to org
      await db.orgMember.create({
        data: {
          orgId,
          userId: existingUser.id,
          role: memberRole as Role,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'team.member_added',
          targetType: 'user',
          targetId: existingUser.id,
          metadata: JSON.stringify({ email, role: memberRole, orgId }),
        },
      })

      return NextResponse.json({
        success: true,
        message: `${existingUser.name || email} has been added to your team as ${memberRole}`,
      })
    }

    // New user — create invitation record
    const newUser = await db.user.create({
      data: {
        email,
        name: email.split('@')[0],
      },
    })

    await db.orgMember.create({
      data: {
        orgId,
        userId: newUser.id,
        role: memberRole as Role,
      },
    })

    // Try to send invitation email
    const emailConfigured = isResendConfigured()
    let emailSent = false

    if (emailConfigured) {
      const result = await sendEmail({
        to: email,
        subject: `You've been invited to ${ctx.user.orgName || 'ReviewReply'}`,
        html: `
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2>You've been invited!</h2>
  <p>${ctx.user.name || 'A team member'} has invited you to join ${ctx.user.orgName || 'their organization'} on ReviewReply Enterprise as a ${memberRole}.</p>
  <p>Click the link below to log in and get started:</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login" style="display: inline-block; background: #97781B; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Log In</a>
</div>`,
      })
      emailSent = result.success
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'team.member_invited',
        targetType: 'user',
        targetId: newUser.id,
        metadata: JSON.stringify({ email, role: memberRole, orgId, emailSent }),
      },
    })

    return NextResponse.json({
      success: true,
      message: emailSent
        ? `Invitation sent to ${email}. They can log in with that email.`
        : `${email} has been added to your team as ${memberRole}. ${emailConfigured ? '' : '(Email not sent — Resend not configured)'}`,
      emailSent,
    })
  } catch (error) {
    console.error('Team invite error:', error)
    return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 })
  }
}

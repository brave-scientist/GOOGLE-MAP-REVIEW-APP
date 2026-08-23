import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { SessionUser } from '@/lib/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface GeneratedToken {
  rawToken: string
  tokenHash: string
  expiresAt: Date
}

/**
 * Generates a cryptographically secure random 32-byte token and its SHA-256 hash.
 */
export function generateInvitationToken(): GeneratedToken {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashInvitationToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
  return { rawToken, tokenHash, expiresAt }
}

/**
 * SHA-256 hash helper for invitation tokens.
 */
export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export type TokenVerificationStatus =
  | 'VALID'
  | 'INVALID'
  | 'EXPIRED'
  | 'ALREADY_CONSUMED'
  | 'ALREADY_MEMBER'

export interface VerificationResult {
  status: TokenVerificationStatus
  invitation?: {
    id: string
    orgId: string
    orgName: string
    email: string
    role: Role
    expiresAt: string
    invitedBy?: {
      name: string | null
      email: string
    }
  }
  userExists?: boolean
}

/**
 * Authoritative Inviter-to-Target Role Authorization Matrix.
 * Enforces strict role-escalation prevention:
 * - OWNER can invite all non-OWNER roles.
 * - ADMIN can only invite standard workspace roles (ADMIN, STAFF, VIEWER).
 * - ADMIN cannot invite AGENCY_ADMIN or CLIENT_ADMIN (cross-tenant administrative escalation).
 * - No role can invite OWNER.
 * - STAFF, VIEWER, and staff variants cannot issue invitations.
 */
export const INVITATION_ROLE_MATRIX: Record<Role, Role[]> = {
  [Role.OWNER]: [
    Role.ADMIN,
    Role.STAFF,
    Role.VIEWER,
    Role.AGENCY_ADMIN,
    Role.AGENCY_STAFF,
    Role.CLIENT_ADMIN,
    Role.CLIENT_STAFF,
  ],
  [Role.ADMIN]: [
    Role.ADMIN,
    Role.STAFF,
    Role.VIEWER,
  ],
  [Role.AGENCY_ADMIN]: [
    Role.AGENCY_ADMIN,
    Role.AGENCY_STAFF,
    Role.CLIENT_ADMIN,
    Role.CLIENT_STAFF,
    Role.STAFF,
    Role.VIEWER,
  ],
  [Role.CLIENT_ADMIN]: [
    Role.CLIENT_ADMIN,
    Role.CLIENT_STAFF,
    Role.STAFF,
    Role.VIEWER,
  ],
  [Role.STAFF]: [],
  [Role.VIEWER]: [],
  [Role.AGENCY_STAFF]: [],
  [Role.CLIENT_STAFF]: [],
}

/**
 * Checks whether an inviter with inviterRole is authorized to invite targetRole.
 */
export function canInviteRole(inviterRole: Role, targetRole: Role): boolean {
  const allowed = INVITATION_ROLE_MATRIX[inviterRole] || []
  return allowed.includes(targetRole)
}

/**
 * Verifies an invitation token and returns its status and metadata without consuming it.
 */
export async function verifyInvitation(rawToken: string): Promise<VerificationResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return { status: 'INVALID' }
  }

  const tokenHash = hashInvitationToken(rawToken.trim())

  const invitation = await db.teamInvitation.findUnique({
    where: { tokenHash },
    include: {
      org: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  })

  if (!invitation) {
    return { status: 'INVALID' }
  }

  if (invitation.consumedAt !== null) {
    return { status: 'ALREADY_CONSUMED' }
  }

  if (invitation.expiresAt < new Date()) {
    return { status: 'EXPIRED' }
  }

  // Check if a user with this email already belongs to the org
  const existingUser = await db.user.findUnique({
    where: { email: invitation.email },
    include: {
      memberships: {
        where: { orgId: invitation.orgId },
      },
    },
  })

  if (existingUser && existingUser.memberships.length > 0) {
    return { status: 'ALREADY_MEMBER' }
  }

  return {
    status: 'VALID',
    invitation: {
      id: invitation.id,
      orgId: invitation.orgId,
      orgName: invitation.org.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      invitedBy: invitation.invitedBy
        ? {
            name: invitation.invitedBy.name,
            email: invitation.invitedBy.email,
          }
        : undefined,
    },
    userExists: !!existingUser,
  }
}

export interface CreateInvitationParams {
  orgId: string
  inviterUser: SessionUser
  email: string
  role: string
}

export interface CreateInvitationResult {
  success: boolean
  message: string
  invitationId?: string
  emailSent: boolean
}

/**
 * Creates and persists a TeamInvitation with cryptographic token hashing, role matrix validation, and email dispatch.
 */
export async function createTeamInvitation(
  params: CreateInvitationParams,
): Promise<CreateInvitationResult> {
  const { orgId, inviterUser, email, role } = params

  // 1. Role authorization check via matrix
  const targetRoleEnum = Object.values(Role).find(r => r === role) as Role | undefined
  if (!targetRoleEnum) {
    throw new Error(`INVALID_ROLE: Role '${role}' is not recognized`)
  }

  if (!canInviteRole(inviterUser.role, targetRoleEnum)) {
    throw new Error(
      `INSUFFICIENT_ROLE: Users with role '${inviterUser.role}' cannot invite '${targetRoleEnum}'`,
    )
  }

  // 2. Email validation
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error('INVALID_EMAIL: Please provide a valid email address')
  }

  // 3. Check if user already exists and is a member of this organization
  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        where: { orgId },
      },
    },
  })

  if (existingUser && existingUser.memberships.length > 0) {
    throw new Error('ALREADY_MEMBER: User is already a member of this organization')
  }

  // 4. Generate secure random token
  const { rawToken, tokenHash, expiresAt } = generateInvitationToken()

  // 5. Persist invitation (replace any prior pending invitations for this email + org)
  const invitation = await db.$transaction(async (tx) => {
    // Delete older unconsumed invitations for this email in this org to avoid stale tokens
    await tx.teamInvitation.deleteMany({
      where: {
        orgId,
        email: normalizedEmail,
        consumedAt: null,
      },
    })

    return await tx.teamInvitation.create({
      data: {
        orgId,
        email: normalizedEmail,
        role: targetRoleEnum,
        tokenHash,
        invitedById: inviterUser.id,
        expiresAt,
      },
    })
  })

  // 6. Dispatch invitation email via Resend
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/invite/accept?token=${rawToken}`
  const emailConfigured = isResendConfigured()
  let emailSent = false

  if (emailConfigured) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    })
    const orgName = org?.name || inviterUser.orgName || 'ReviewReply'

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: `You've been invited to join ${orgName}`,
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 12px;">You've been invited!</h2>
  <p style="font-size: 14px; line-height: 1.6; color: #444; margin-bottom: 20px;">
    <strong>${inviterUser.name || inviterUser.email}</strong> has invited you to join <strong>${orgName}</strong> on ReviewReply as <strong>${targetRoleEnum}</strong>.
  </p>
  <div style="margin-bottom: 24px;">
    <a href="${inviteUrl}" style="display: inline-block; background: #97781B; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
      Accept Invitation
    </a>
  </div>
  <p style="font-size: 12px; color: #888; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
    This invitation link will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
  </p>
</div>`,
    })
    emailSent = emailResult.success
  }

  // 7. Log audit trail (do NOT log rawToken)
  await db.auditLog.create({
    data: {
      actorId: inviterUser.id,
      action: 'team.invitation_created',
      targetType: 'team_invitation',
      targetId: invitation.id,
      metadata: JSON.stringify({
        orgId,
        email: normalizedEmail,
        role: targetRoleEnum,
        emailSent,
      }),
    },
  })

  return {
    success: true,
    message: emailSent
      ? `Invitation sent to ${normalizedEmail}.`
      : `Invitation created for ${normalizedEmail}. ${emailConfigured ? '' : '(Resend not configured — use acceptance link in test)'}`,
    invitationId: invitation.id,
    emailSent,
  }
}

export interface AcceptInvitationParams {
  rawToken: string
  password?: string
  name?: string
  currentUser?: SessionUser | null
}

export interface AcceptInvitationResult {
  success: boolean
  user: SessionUser
  message: string
}

/**
 * Atomically accepts an invitation, provisions membership/user, and marks token consumed.
 */
export async function acceptTeamInvitation(
  params: AcceptInvitationParams,
): Promise<AcceptInvitationResult> {
  const { rawToken, password, name, currentUser } = params

  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('INVALID_TOKEN: Invitation token is required')
  }

  const tokenHash = hashInvitationToken(rawToken.trim())

  // Run atomic verification and consumption in a transaction
  return await db.$transaction(async (tx) => {
    const invitation = await tx.teamInvitation.findUnique({
      where: { tokenHash },
      include: {
        org: { select: { id: true, name: true, plan: true } },
      },
    })

    if (!invitation) {
      throw new Error('INVALID_TOKEN: Invitation not found or token is invalid')
    }

    if (invitation.consumedAt !== null) {
      throw new Error('ALREADY_CONSUMED: This invitation has already been accepted')
    }

    if (invitation.expiresAt < new Date()) {
      throw new Error('EXPIRED: This invitation has expired')
    }

    let targetUser = await tx.user.findUnique({
      where: { email: invitation.email },
      include: { memberships: { where: { orgId: invitation.orgId } } },
    })

    if (targetUser && targetUser.memberships.length > 0) {
      // User is already a member — mark invitation consumed and return
      await tx.teamInvitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date() },
      })

      return {
        success: true,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          role: targetUser.memberships[0].role,
          orgId: invitation.org.id,
          orgName: invitation.org.name,
          orgPlan: invitation.org.plan,
          sessionVersion: targetUser.sessionVersion,
        },
        message: `You are already a member of ${invitation.org.name}.`,
      }
    }

    // New user creation vs existing user confirmation
    if (!targetUser) {
      // Flow A: New user registration requires password
      if (!password || password.length < 8) {
        throw new Error('PASSWORD_REQUIRED: Password is required and must be at least 8 characters')
      }

      const passwordHash = await bcrypt.hash(password, 10)
      targetUser = await tx.user.create({
        data: {
          email: invitation.email,
          name: name || invitation.email.split('@')[0],
          passwordHash,
          sessionVersion: 1,
        },
        include: { memberships: true },
      })
    } else {
      // Flow B: Existing account confirmation
      // If user has an active session: verify session matches invitation email
      if (currentUser) {
        if (currentUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
          throw new Error(
            `EMAIL_MISMATCH: Logged in as ${currentUser.email}, but this invitation was sent to ${invitation.email}. Please switch accounts or log out.`,
          )
        }
      } else {
        // Unauthenticated existing user must prove credentials with password
        if (targetUser.passwordHash) {
          if (!password) {
            throw new Error(
              'PASSWORD_REQUIRED: An account with this email already exists. Please enter your password to accept.',
            )
          }

          const passwordValid = await bcrypt.compare(password, targetUser.passwordHash)
          if (!passwordValid) {
            throw new Error(
              'INVALID_CREDENTIALS: Incorrect password for existing account. Please confirm your password.',
            )
          }
        } else {
          // Account exists without password hash (set new password)
          if (!password || password.length < 8) {
            throw new Error('PASSWORD_REQUIRED: Please set a password (min 8 characters) to activate your account')
          }
          const passwordHash = await bcrypt.hash(password, 10)
          targetUser = await tx.user.update({
            where: { id: targetUser.id },
            data: {
              passwordHash,
              name: name || targetUser.name,
            },
            include: { memberships: true },
          })
        }
      }
    }

    // Create organization membership
    const membership = await tx.orgMember.create({
      data: {
        orgId: invitation.orgId,
        userId: targetUser.id,
        role: invitation.role,
      },
    })

    // Atomically mark invitation as consumed (concurrency gate)
    const updateCount = await tx.teamInvitation.updateMany({
      where: {
        id: invitation.id,
        consumedAt: null, // Atomic single-use check
      },
      data: {
        consumedAt: new Date(),
      },
    })

    if (updateCount.count === 0) {
      throw new Error('CONCURRENT_CONSUMPTION: Invitation was already consumed in another session')
    }

    // Audit log event
    await tx.auditLog.create({
      data: {
        actorId: targetUser.id,
        action: 'team.invitation_accepted',
        targetType: 'user',
        targetId: targetUser.id,
        metadata: JSON.stringify({
          orgId: invitation.orgId,
          email: invitation.email,
          role: invitation.role,
          invitationId: invitation.id,
        }),
      },
    })

    return {
      success: true,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: membership.role,
        orgId: invitation.org.id,
        orgName: invitation.org.name,
        orgPlan: invitation.org.plan,
        sessionVersion: targetUser.sessionVersion,
      },
      message: `Welcome to ${invitation.org.name}! Your account is now active.`,
    }
  })
}


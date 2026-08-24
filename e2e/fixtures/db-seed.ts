import { PrismaClient, Plan, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

import { getAuthoritativeE2EDatabaseUrl } from './db-guard'

const E2E_DATABASE_URL = getAuthoritativeE2EDatabaseUrl()

// Explicit startup assertion proving the database target is the test database
console.log(`[E2E-DB-SEED] Initializing Prisma with isolated test database: ${E2E_DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`)

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: E2E_DATABASE_URL,
    },
  },
})

export interface TestSeedResult {
  user: {
    id: string
    email: string
    name: string | null
    passwordHash: string | null
    sessionVersion: number
  }
  org: {
    id: string
    name: string
    plan: Plan
  }
  business: {
    id: string
    name: string
    slug: string
  }
  membership: {
    id: string
    role: Role
  }
  rawPassword?: string
}

export function generateTestEmail(prefix = 'e2e'): string {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  return `${prefix}_${nonce}@example.com`
}

/**
 * Seed a complete isolated tenant hierarchy (User + Org + OrgMember + Business)
 */
export async function seedTestTenant(options: {
  email?: string
  password?: string
  name?: string
  businessName?: string
  role?: Role
  plan?: Plan
  isLegacy?: boolean
  isNullPassword?: boolean
  sessionVersion?: number
} = {}): Promise<TestSeedResult> {
  const email = options.email || generateTestEmail('user')
  const rawPassword = options.password || 'TestPassword2026!'
  const name = options.name || 'E2E Test User'
  const businessName = options.businessName || `E2E Business ${Date.now()}`
  const slug = `e2e-biz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const role = options.role || Role.OWNER
  const plan = options.plan || Plan.PRO
  const sessionVersion = options.sessionVersion ?? 1

  let passwordHash: string | null = null
  if (options.isNullPassword) {
    passwordHash = null
  } else if (options.isLegacy) {
    passwordHash = `demo_hash_${Buffer.from(rawPassword).toString('base64').slice(0, 32)}`
  } else {
    passwordHash = await bcrypt.hash(rawPassword, 10)
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        sessionVersion,
      },
    })

    const org = await tx.organization.create({
      data: {
        name: `${name}'s Org`,
        plan,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    })

    const membership = await tx.orgMember.create({
      data: {
        orgId: org.id,
        userId: user.id,
        role,
      },
    })

    const business = await tx.business.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: businessName,
        slug,
        industry: 'restaurant',
      },
    })

    return { user, org, business, membership }
  })

  return {
    user: result.user,
    org: result.org,
    business: result.business,
    membership: result.membership,
    rawPassword,
  }
}

/**
 * Seed an active single-use PasswordResetToken for a given user
 */
export async function seedPasswordResetToken(userId: string, options: {
  rawToken?: string
  expiresInMs?: number
  consumed?: boolean
} = {}): Promise<{ rawToken: string; tokenHash: string; id: string }> {
  const rawToken = options.rawToken || crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresInMs = options.expiresInMs ?? 60 * 60 * 1000 // 1 hour default
  const expiresAt = new Date(Date.now() + expiresInMs)
  const consumedAt = options.consumed ? new Date() : null

  const record = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      consumedAt,
    },
  })

  return { rawToken, tokenHash, id: record.id }
}

/**
 * Cleanly teardown a test organization and all cascading dependencies
 */
export async function cleanupTestTenant(orgId: string): Promise<void> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { members: true },
    })

    if (!org) return

    const userIds = org.members.map(m => m.userId)

    // Deleting organization cascades to: Business, Review, Campaign, OrgMember, ScheduledReport, TeamInvitation, etc.
    await prisma.organization.delete({
      where: { id: orgId },
    })

    // Delete users associated with this test org if they have no other memberships
    for (const userId of userIds) {
      const otherMemberships = await prisma.orgMember.count({
        where: { userId },
      })
      if (otherMemberships === 0) {
        await prisma.passwordResetToken.deleteMany({ where: { userId } })
        await prisma.auditLog.deleteMany({ where: { actorId: userId } })
        await prisma.user.delete({ where: { id: userId } }).catch(() => {})
      }
    }
  } catch (e) {
    console.warn(`[E2E Cleanup] Warning during cleanup of org ${orgId}:`, e)
  }
}

import { PrismaClient, Plan, Role, DraftStatus, ReviewSource, ReportSchedule, ReportFormat, ReportStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

import { getAuthoritativeE2EDatabaseUrl } from './db-guard'

const E2E_DATABASE_URL = getAuthoritativeE2EDatabaseUrl()
process.env.DATABASE_URL = E2E_DATABASE_URL

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
    slug: string | null
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
  userEmail?: string
  password?: string
  name?: string
  businessName?: string
  businessSlug?: string
  role?: Role
  plan?: Plan
  isLegacy?: boolean
  isNullPassword?: boolean
  sessionVersion?: number
} = {}): Promise<TestSeedResult> {
  const email = options.userEmail || options.email || generateTestEmail('user')
  const rawPassword = options.password || 'TestPassword2026!'
  const name = options.name || 'E2E Test User'
  const businessName = options.businessName || `E2E Business ${Date.now()}`
  const slug = options.businessSlug || `e2e-biz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
  }, { timeout: 15000, maxWait: 10000 })

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
 * Seed a test review for a business
 */
export async function seedTestReview(businessId: string, options: {
  author?: string
  rating?: number
  text?: string
  title?: string
  source?: ReviewSource
  draftText?: string | null
  draftStatus?: DraftStatus
  replyText?: string | null
  repliedAt?: Date | null
  externalId?: string
} = {}) {
  const author = options.author || 'Jane Smith'
  const rating = options.rating ?? 5
  const text = options.text || 'Absolutely fantastic experience! The staff was courteous and service was top-notch.'
  const title = options.title || 'Great Service'
  const source = options.source || ReviewSource.GOOGLE
  const draftStatus = options.draftStatus || DraftStatus.DRAFT
  const externalId = options.externalId || `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  return prisma.review.create({
    data: {
      businessId,
      author,
      rating,
      text,
      title,
      source,
      draftText: options.draftText ?? null,
      draftStatus,
      replyText: options.replyText ?? null,
      repliedAt: options.repliedAt ?? null,
      externalId,
    },
  })
}

/**
 * Seed a tracked competitor with initial snapshot
 */
export async function seedTestCompetitor(businessId: string, options: {
  name?: string
  rating?: number
  reviewCount?: number
  responseRate?: number
  sentimentScore?: number
  googleMapsUrl?: string
} = {}) {
  const name = options.name || `Competitor ${Date.now()}`
  const rating = options.rating ?? 4.2
  const reviewCount = options.reviewCount ?? 120
  const responseRate = options.responseRate ?? 65
  const sentimentScore = options.sentimentScore ?? 0.55

  const competitor = await prisma.competitor.create({
    data: {
      businessId,
      name,
      rating,
      reviewCount,
      responseRate,
      sentimentScore,
      googleMapsUrl: options.googleMapsUrl || 'https://maps.google.com/?cid=12345',
    },
  })

  await prisma.competitorSnapshot.create({
    data: {
      competitorId: competitor.id,
      rating,
      reviewCount,
      sentimentScore,
    },
  })

  return competitor
}

/**
 * Seed a scheduled report
 */
export async function seedTestReport(orgId: string, options: {
  name?: string
  schedule?: ReportSchedule
  recipients?: string[]
  format?: ReportFormat
  status?: ReportStatus
  businessId?: string
} = {}) {
  const name = options.name || 'Weekly Performance Digest'
  const schedule = options.schedule || ReportSchedule.WEEKLY
  const recipients = options.recipients || ['reports@example.com']
  const format = options.format || ReportFormat.EMAIL_HTML
  const status = options.status || ReportStatus.ACTIVE

  return prisma.scheduledReport.create({
    data: {
      orgId,
      businessId: options.businessId || null,
      name,
      schedule,
      recipients: JSON.stringify(recipients),
      format,
      status,
    },
  })
}

/**
 * Seed a cryptographic team invitation
 */
export async function seedTestTeamInvitation(orgId: string, invitedById: string, email: string, options: {
  role?: Role
  rawToken?: string
  expiresInMs?: number
  consumed?: boolean
} = {}) {
  const role = options.role || Role.STAFF
  const rawToken = options.rawToken || crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresInMs = options.expiresInMs ?? 7 * 24 * 60 * 60 * 1000 // 7 days
  const expiresAt = new Date(Date.now() + expiresInMs)
  const consumedAt = options.consumed ? new Date() : null

  const invitation = await prisma.teamInvitation.create({
    data: {
      orgId,
      invitedById,
      email,
      role,
      tokenHash,
      expiresAt,
      consumedAt,
    },
  })

  return { invitation, rawToken, tokenHash }
}

/**
 * Seed a review platform link for a business
 */
export async function seedTestPlatformLink(businessId: string, options: {
  platformId?: string
  customName?: string
  url?: string
  enabled?: boolean
  sortOrder?: number
} = {}) {
  const platformId = options.platformId || 'google'
  const url = options.url || 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'
  const enabled = options.enabled ?? true
  const sortOrder = options.sortOrder ?? 0

  return prisma.reviewPlatformLink.create({
    data: {
      businessId,
      platformId,
      customName: options.customName || null,
      url,
      enabled,
      sortOrder,
    },
  })
}

/**
 * Seed an opt-out contact entry
 */
export async function seedTestOptOut(contact: string, options: {
  reason?: string
  channel?: string
} = {}) {
  const normalized = contact.trim().toLowerCase()
  return prisma.optOut.upsert({
    where: { contact: normalized },
    update: {
      reason: options.reason || 'USER_REQUEST',
      channel: options.channel || 'all',
    },
    create: {
      contact: normalized,
      reason: options.reason || 'USER_REQUEST',
      channel: options.channel || 'all',
    },
  })
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

    // Explicitly delete businesses belonging to this org (cascades to Review, Campaign, OAuthToken, etc.)
    await prisma.business.deleteMany({
      where: { orgId },
    })

    // Deleting organization cascades to: OrgMember, ScheduledReport, TeamInvitation, etc.
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

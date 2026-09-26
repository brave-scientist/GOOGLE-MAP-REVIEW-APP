import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role, Plan } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

// POST /api/auth/signup
export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting defense-in-depth
    const ip = getClientIP(request)
    const rateCheck = await rateLimit(`signup:${ip}`, RATE_LIMITS.signup.limit, RATE_LIMITS.signup.windowMs)
    if (!rateCheck.allowed) {
      const retryAfter = Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        {
          error: 'Too many signup attempts. Please wait before trying again.',
          code: 'RATE_LIMITED',
          retryAfter,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { email, password, name, businessName, industry, plan } = body

    // 2. Validate required fields
    if (!email || !password || !name || !businessName) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, name, businessName', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    // 3. Normalize & validate email
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 255) {
      return NextResponse.json(
        { error: 'Invalid email address format', code: 'INVALID_EMAIL' },
        { status: 400 }
      )
    }

    // 4. Validate name & businessName
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return NextResponse.json(
        { error: 'Name must be between 1 and 100 characters', code: 'INVALID_NAME' },
        { status: 400 }
      )
    }

    const trimmedBusinessName = typeof businessName === 'string' ? businessName.trim() : ''
    if (trimmedBusinessName.length < 1 || trimmedBusinessName.length > 100) {
      return NextResponse.json(
        { error: 'Business name must be between 1 and 100 characters', code: 'INVALID_BUSINESS_NAME' },
        { status: 400 }
      )
    }

    // 5. Validate password
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters', code: 'INVALID_PASSWORD' },
        { status: 400 }
      )
    }

    if (password.length > 72) {
      return NextResponse.json(
        { error: 'Password cannot exceed 72 characters', code: 'INVALID_PASSWORD' },
        { status: 400 }
      )
    }

    // 6. Validate plan if supplied (never silently default invalid plan to FREE)
    const ALLOWED_PLANS: Plan[] = [Plan.FREE, Plan.STARTER, Plan.PRO, Plan.ENTERPRISE, Plan.AGENCY]
    let targetPlan: Plan = Plan.PRO
    let trialEndsAt: Date | null = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

    if (plan !== undefined && plan !== null) {
      const upperPlan = String(plan).trim().toUpperCase()
      const matchedPlan = ALLOWED_PLANS.find(p => p === upperPlan)
      if (!matchedPlan) {
        return NextResponse.json(
          {
            error: `Invalid plan selected: "${plan}". Choose from: FREE, STARTER, PRO, ENTERPRISE, AGENCY`,
            code: 'INVALID_PLAN',
          },
          { status: 400 }
        )
      }
      targetPlan = matchedPlan
      if (targetPlan === Plan.FREE) {
        trialEndsAt = null
      }
    }

    // 7. Check existing account (prevent duplicate-account ambiguity)
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // 8. Atomic transaction creation: User + Organization + OrgMember (OWNER) + Business + Demo reviews
    // Client-supplied orgId or role is strictly ignored (server-authoritative)
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: trimmedName,
          passwordHash,
          sessionVersion: 1,
        },
      })

      const org = await tx.organization.create({
        data: {
          name: `${trimmedName}'s Organization`,
          plan: targetPlan,
          trialEndsAt,
          onboardingStep: 1,
          onboardingCompletedAt: null,
        },
      })

      // Server-authoritative role assignment: initial user is always OWNER
      await tx.orgMember.create({
        data: { orgId: org.id, userId: user.id, role: Role.OWNER },
      })

      const business = await tx.business.create({
        data: {
          orgId: org.id,
          ownerId: user.id,
          name: trimmedBusinessName,
          industry: typeof industry === 'string' ? industry.trim() : 'restaurant',
          timezone: 'America/New_York',
        },
      })

      // Seed INTERNAL demo reviews for immediate product exploration.
      // Rules enforced here:
      //   - source: INTERNAL (never GOOGLE/FACEBOOK — these are NOT real reviews)
      //   - externalId: 'seed_{businessId}_{random}' (prevents sync collision)
      //   - These reviews are clearly identifiable as sample data by the seed_ prefix
      //   - They CANNOT be replied to through Google/Facebook APIs (wrong source)
      //   - They MUST NOT appear on public-facing pages without explicit demo labelling
      const DEMO_AUTHOR_NAMES = ['Sarah Chen', 'Marcus Webb', 'Priya Patel', 'James Rodriguez', 'Emily Watson']
      const demoReviews = [
        { rating: 5, text: 'Amazing experience! The staff was incredibly welcoming and the service was top-notch.', topics: ['service', 'staff'] },
        { rating: 4, text: 'Great food and atmosphere. Will definitely be back!', topics: ['food', 'atmosphere'] },
        { rating: 5, text: 'Best in the area. Highly recommend to anyone looking for quality.', topics: ['food', 'value'] },
        { rating: 3, text: 'Decent experience. Service was a bit slow but the food made up for it.', topics: ['service', 'food'] },
        { rating: 5, text: 'Outstanding! This is what customer service should look like.', topics: ['service', 'staff'] },
      ]
      for (let idx = 0; idx < demoReviews.length; idx++) {
        const r = demoReviews[idx]
        await tx.review.create({
          data: {
            businessId: business.id,
            source: 'INTERNAL',  // SEC: NEVER use GOOGLE — these are demo/sample records only
            externalId: `seed_${business.id}_${idx}`,  // deterministic for idempotency
            author: DEMO_AUTHOR_NAMES[idx % DEMO_AUTHOR_NAMES.length],
            rating: r.rating,
            title: r.rating >= 4 ? 'Great experience!' : 'Mixed experience',
            text: r.text,
            sentimentScore: r.rating >= 4 ? 0.7 + Math.random() * 0.3 : r.rating === 3 ? 0.1 : -0.4,
            topics: JSON.stringify(r.topics),
            draftStatus: 'NONE',
            createdAt: new Date(Date.now() - (demoReviews.length - idx) * 24 * 60 * 60 * 1000),
            fetchedAt: new Date(),
          },
        })
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'user.signup',
          targetType: 'user',
          targetId: user.id,
          metadata: JSON.stringify({ email: normalizedEmail, businessName: trimmedBusinessName, plan: targetPlan }),
        },
      })

      return { user, org, business }
    })

    const sessionUser: SessionUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: Role.OWNER,
      orgId: result.org.id,
      orgName: result.org.name,
      orgPlan: result.org.plan,
      sessionVersion: result.user.sessionVersion,
    }

    const response = NextResponse.json({
      user: sessionUser,
      plan: result.org.plan,
      trialEndsAt: result.org.trialEndsAt?.toISOString() || null,
      redirectTo: '/onboarding',
    })
    await createSession(response, sessionUser)
    return response
  } catch (error) {
    console.error('Signup error:', error instanceof Error ? error.message : 'Unknown signup error')
    return NextResponse.json(
      { error: 'Failed to create account', code: 'SIGNUP_FAILED' },
      { status: 500 }
    )
  }
}

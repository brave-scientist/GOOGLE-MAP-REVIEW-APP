import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role, Plan } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'

// POST /api/auth/signup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name, businessName, industry } = body

    if (!email || !password || !name || !businessName) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, name, businessName' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in.' },
        { status: 409 }
      )
    }

    const passwordHash = `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      })

      const org = await tx.organization.create({
        data: {
          name: `${name}'s Organization`,
          plan: Plan.PRO,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      })

      await tx.orgMember.create({
        data: { orgId: org.id, userId: user.id, role: Role.OWNER },
      })

      const business = await tx.business.create({
        data: {
          orgId: org.id,
          ownerId: user.id,
          name: businessName,
          industry: industry || 'restaurant',
          timezone: 'America/New_York',
        },
      })

      // Seed demo reviews
      const demoReviews = [
        { rating: 5, text: 'Amazing experience! The staff was incredibly welcoming and the service was top-notch.', topics: ['service', 'staff'] },
        { rating: 4, text: 'Great food and atmosphere. Will definitely be back!', topics: ['food', 'atmosphere'] },
        { rating: 5, text: 'Best in the area. Highly recommend to anyone looking for quality.', topics: ['food', 'value'] },
        { rating: 3, text: 'Decent experience. Service was a bit slow but the food made up for it.', topics: ['service', 'food'] },
        { rating: 5, text: 'Outstanding! This is what customer service should look like.', topics: ['service', 'staff'] },
      ]
      for (const r of demoReviews) {
        await tx.review.create({
          data: {
            businessId: business.id,
            source: 'GOOGLE',
            externalId: `seed_${business.id}_${Math.random().toString(36).slice(2)}`,
            author: ['Sarah Chen', 'Marcus Webb', 'Priya Patel', 'James Rodriguez', 'Emily Watson'][Math.floor(Math.random() * 5)],
            rating: r.rating,
            title: r.rating >= 4 ? 'Great experience!' : 'Mixed experience',
            text: r.text,
            sentimentScore: r.rating >= 4 ? 0.7 + Math.random() * 0.3 : r.rating === 3 ? 0.1 : -0.4,
            topics: JSON.stringify(r.topics),
            draftStatus: 'NONE',
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
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
          metadata: JSON.stringify({ email, businessName }),
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
    }

    const response = NextResponse.json({
      user: sessionUser,
      redirectTo: '/dashboard',
    })
    await createSession(response, sessionUser)
    return response
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    )
  }
}

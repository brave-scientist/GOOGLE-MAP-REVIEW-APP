import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/auth/google — Simulate Google OAuth login
// In production, this would redirect to Google's OAuth consent screen
// For demo, we accept a googleEmail and create/log in the user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, picture } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required for Google login' }, { status: 400 })
    }

    // Find or create user
    let user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            org: { select: { id: true, name: true, plan: true } },
          },
        },
      },
    })

    if (!user) {
      // Create new user via Google OAuth
      const result = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name: name || email.split('@')[0],
            avatarUrl: picture || null,
          },
        })

        const org = await tx.organization.create({
          data: {
            name: `${newUser.name}'s Organization`,
            plan: 'PRO',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        })

        await tx.orgMember.create({
          data: { orgId: org.id, userId: newUser.id, role: Role.OWNER },
        })

        const business = await tx.business.create({
          data: {
            orgId: org.id,
            ownerId: newUser.id,
            name: 'My Business',
            industry: 'restaurant',
            timezone: 'America/New_York',
          },
        })

        // Seed demo reviews
        const demoReviews = [
          { rating: 5, text: 'Amazing experience! The staff was incredibly welcoming.', topics: ['service', 'staff'] },
          { rating: 4, text: 'Great food and atmosphere. Will be back!', topics: ['food', 'atmosphere'] },
          { rating: 5, text: 'Best in the area. Highly recommend.', topics: ['food', 'value'] },
        ]
        for (const r of demoReviews) {
          await tx.review.create({
            data: {
              businessId: business.id,
              source: 'GOOGLE',
              externalId: `google_${business.id}_${Math.random().toString(36).slice(2)}`,
              author: ['Sarah Chen', 'Marcus Webb', 'Priya Patel'][Math.floor(Math.random() * 3)],
              rating: r.rating,
              title: r.rating >= 4 ? 'Great experience!' : 'Mixed experience',
              text: r.text,
              sentimentScore: r.rating >= 4 ? 0.7 + Math.random() * 0.3 : 0.1,
              topics: JSON.stringify(r.topics),
              draftStatus: 'NONE',
              createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
              fetchedAt: new Date(),
            },
          })
        }

        await tx.auditLog.create({
          data: {
            actorId: newUser.id,
            action: 'user.signup',
            targetType: 'user',
            targetId: newUser.id,
            metadata: JSON.stringify({ email, method: 'google' }),
          },
        })

        return { user: newUser, org }
      })

      user = {
        ...result.user,
        memberships: [{
          orgId: result.org.id,
          userId: result.user.id,
          role: Role.OWNER,
          org: result.org,
        }],
      } as typeof user
    }

    const membership = user!.memberships[0]
    const sessionUser: SessionUser = {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: membership?.role || Role.VIEWER,
      orgId: membership?.org.id || null,
      orgName: membership?.org.name || null,
      orgPlan: membership?.org.plan || null,
    }

    // Log login
    await db.auditLog.create({
      data: {
        actorId: user!.id,
        action: 'user.login',
        targetType: 'user',
        targetId: user!.id,
        metadata: JSON.stringify({ method: 'google' }),
      },
    })

    const response = NextResponse.json({
      user: sessionUser,
      redirectTo: '/dashboard',
    })
    await createSession(response, sessionUser)
    return response
  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.json(
      { error: 'Failed to authenticate with Google', details: String(error) },
      { status: 500 }
    )
  }
}

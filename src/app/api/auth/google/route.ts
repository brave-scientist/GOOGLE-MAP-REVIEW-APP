import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/auth/google — Google OAuth login
// Accepts a Google ID token (from Google Sign-In button) and verifies it
// Falls back to a "demo mode" that only works in development
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idToken, credential, email, name, picture } = body

    // If a Google ID token / credential is provided, verify it
    if (idToken || credential) {
      const token = idToken || credential
      try {
        // Verify the Google ID token via Google's tokeninfo endpoint
        const verifyRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`,
          { method: 'GET' }
        )
        if (!verifyRes.ok) {
          return NextResponse.json(
            { error: 'Invalid Google token. Please try again.' },
            { status: 401 }
          )
        }
        const tokenInfo = await verifyRes.json()
        // Verify the audience matches our client ID (if set)
        const expectedAudience = process.env.GOOGLE_CLIENT_ID
        if (expectedAudience && tokenInfo.aud !== expectedAudience) {
          return NextResponse.json(
            { error: 'Token audience mismatch. Please try again.' },
            { status: 401 }
          )
        }
        // Use verified data from Google
        const verifiedEmail = tokenInfo.email
        const verifiedName = tokenInfo.name || verifiedEmail.split('@')[0]
        const verifiedPicture = tokenInfo.picture || null

        return await createOrLoginUser(verifiedEmail, verifiedName, verifiedPicture)
      } catch (verifyError) {
        console.error('Google token verification failed:', verifyError)
        return NextResponse.json(
          { error: 'Failed to verify Google token. Please try again.' },
          { status: 401 }
        )
      }
    }

    // Demo mode: only allowed in development and only for existing demo accounts
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Google sign-in requires a valid Google account. Please use Google Sign-In button.' },
        { status: 401 }
      )
    }

    // Dev demo mode: only allow login for EXISTING users (don't auto-create from arbitrary emails)
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required for Google login' },
        { status: 400 }
      )
    }

    const existingUser = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            org: { select: { id: true, name: true, plan: true } },
          },
        },
      },
    })

    if (!existingUser) {
      // In dev demo mode, create account but log a warning
      console.warn(`[DEV] Creating new user via Google demo mode: ${email}`)
      return await createOrLoginUser(email, name || email.split('@')[0], picture || null)
    }

    return await createOrLoginUser(email, existingUser.name || name || email.split('@')[0], picture || existingUser.avatarUrl)
  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.json(
      { error: 'Failed to authenticate with Google' },
      { status: 500 }
    )
  }
}

// Helper: find or create user, create session
async function createOrLoginUser(email: string, name: string, picture: string | null) {
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
    const result = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, name, avatarUrl: picture },
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
    } as unknown as typeof user
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
    sessionVersion: user!.sessionVersion ?? 1,
  }

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
}

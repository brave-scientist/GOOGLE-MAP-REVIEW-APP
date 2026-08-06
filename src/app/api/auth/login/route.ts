import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Find user
    const user = await db.user.findUnique({
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
      // For demo: auto-create a demo account if email matches demo pattern
      if (email === 'owner@bamboogarden.com') {
        // Find existing seeded data
        const seededUser = await db.user.findFirst({
          where: { email: 'owner@bamboogarden.com' },
          include: {
            memberships: {
              include: {
                org: { select: { id: true, name: true, plan: true } },
              },
            },
          },
        })
        if (seededUser) {
          const sessionUser: SessionUser = {
            id: seededUser.id,
            email: seededUser.email,
            name: seededUser.name,
            role: seededUser.memberships[0]?.role || Role.OWNER,
            orgId: seededUser.memberships[0]?.org.id || null,
            orgName: seededUser.memberships[0]?.org.name || null,
            orgPlan: seededUser.memberships[0]?.org.plan || null,
          }
          const response = NextResponse.json({ user: sessionUser, redirectTo: '/dashboard' })
          await createSession(response, sessionUser)
          return response
        }
      }
      return NextResponse.json(
        { error: 'No account found with this email. Please sign up.' },
        { status: 404 }
      )
    }

    // Verify password (demo: compare hashes)
    const expectedHash = `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`
    if (user.passwordHash && user.passwordHash !== expectedHash) {
      // For demo accounts without password, allow any password
      if (!user.passwordHash) {
        // OK, proceed
      } else {
        return NextResponse.json(
          { error: 'Incorrect password' },
          { status: 401 }
        )
      }
    }

    const membership = user.memberships[0]
    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: membership?.role || Role.VIEWER,
      orgId: membership?.org.id || null,
      orgName: membership?.org.name || null,
      orgPlan: membership?.org.plan || null,
    }

    // Log login
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.login',
        targetType: 'user',
        targetId: user.id,
        metadata: JSON.stringify({ method: 'password' }),
      },
    })

    const response = NextResponse.json({
      user: sessionUser,
      redirectTo: '/dashboard',
    })
    await createSession(response, sessionUser)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Failed to log in', details: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

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

    const normalizedEmail = email.trim().toLowerCase()

    // Find user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: {
            org: { select: { id: true, name: true, plan: true } },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email. Please sign up.' },
        { status: 404 }
      )
    }

    // SEC-001: Reject password login if passwordHash is null (e.g. OTP-only or Google-only accounts)
    if (!user.passwordHash) {
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: 'user.login_failed',
          targetType: 'user',
          targetId: user.id,
          metadata: JSON.stringify({ reason: 'null_password_hash', method: 'password' }),
        },
      })
      return NextResponse.json(
        { error: 'Password authentication not configured for this account. Please sign in with Email OTP or Google.' },
        { status: 401 }
      )
    }

    // Verify password with legacy migration support
    let passwordValid = false
    if (user.passwordHash.startsWith('demo_hash_')) {
      const expectedLegacy = `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`
      if (user.passwordHash === expectedLegacy) {
        passwordValid = true
        // Seamlessly upgrade legacy hash to bcrypt in background
        const upgradedHash = await bcrypt.hash(password, 10)
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: upgradedHash, updatedAt: new Date() },
        })
      }
    } else {
      passwordValid = await bcrypt.compare(password, user.passwordHash)
    }

    if (!passwordValid) {
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: 'user.login_failed',
          targetType: 'user',
          targetId: user.id,
          metadata: JSON.stringify({ reason: 'invalid_password', method: 'password' }),
        },
      })
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      )
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
      sessionVersion: user.sessionVersion ?? 1,
    }

    // Log successful login
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
      { error: 'Failed to log in' },
      { status: 500 }
    )
  }
}

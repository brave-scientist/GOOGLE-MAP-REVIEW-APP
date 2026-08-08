import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { createSession, SessionUser } from '@/lib/auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// In-memory OTP store (in production, use Redis with 10-minute TTL)
const otpStore = new Map<string, { code: string; expires: number; name?: string; businessName?: string; isNewUser?: boolean }>()

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// POST /api/auth/otp — Send or verify OTP
//
// SEC-04: Rate-limited to prevent abuse:
//   - Send:    max 3 per email per 10 minutes (prevents email bombing via OTP)
//   - Verify:  max 5 per email per 10 minutes (prevents OTP brute-forcing —
//              a 6-digit code has 1M combinations; 5 attempts in 10 min means
//              even a sustained attacker needs ~14 days to brute-force, and
//              the code rotates every 10 min anyway)
//
// Rate-limit key is the email (lowercased) so a single attacker cannot
// rotate IPs to bypass — they'd need to control many email addresses.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, email, name, businessName } = body
    // action: 'send' | 'verify'

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (action === 'send') {
      // SEC-04: Rate-limit OTP send (3 per email per 10 min)
      const rl = rateLimit(
        `otp:send:${normalizedEmail}`,
        RATE_LIMITS.otpSend.limit,
        RATE_LIMITS.otpSend.windowMs,
      )
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: 'Too many OTP requests. Please wait a few minutes before requesting another code.',
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            },
          },
        )
      }

      // Generate 6-digit OTP
      const code = generateOTP()
      const expires = Date.now() + 10 * 60 * 1000 // 10 minutes

      // Check if user exists
      const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } })
      const isNewUser = !existingUser

      otpStore.set(normalizedEmail, {
        code,
        expires,
        name: name || existingUser?.name || undefined,
        businessName: businessName || undefined,
        isNewUser,
      })

      // In production, send the OTP via email (Resend)
      // For dev: log it server-side so it can be viewed in terminal
      console.log(`[OTP] ${normalizedEmail}: ${code}`)

      return NextResponse.json({
        message: isNewUser
          ? 'OTP sent! Check the server console (dev mode) or your email (production).'
          : 'OTP sent! Check the server console (dev mode) or your email (production).',
        isNewUser,
      })
    }

    if (action === 'verify') {
      const { code } = body
      if (!code) {
        return NextResponse.json({ error: 'OTP code is required' }, { status: 400 })
      }

      // SEC-04: Rate-limit OTP verify (5 per email per 10 min) — applies
      // REGARDLESS of whether the OTP exists, so an attacker can't probe
      // which emails have pending OTPs by counting different error messages.
      const rl = rateLimit(
        `otp:verify:${normalizedEmail}`,
        RATE_LIMITS.otpVerify.limit,
        RATE_LIMITS.otpVerify.windowMs,
      )
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: 'Too many verification attempts. Please wait a few minutes before trying again.',
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            },
          },
        )
      }

      const stored = otpStore.get(normalizedEmail)
      if (!stored) {
        return NextResponse.json({ error: 'No OTP found. Please request a new one.' }, { status: 400 })
      }

      if (Date.now() > stored.expires) {
        otpStore.delete(normalizedEmail)
        return NextResponse.json({ error: 'OTP expired. Please request a new one.' }, { status: 400 })
      }

      if (code !== stored.code) {
        return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
      }

      // OTP verified — create or find user, create session
      otpStore.delete(normalizedEmail)

      let user = await db.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          memberships: {
            include: {
              org: { select: { id: true, name: true, plan: true } },
            },
          },
        },
      })

      // If new user, create account + org + business
      if (!user) {
        const result = await db.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: { email: normalizedEmail, name: stored.name || normalizedEmail.split('@')[0] },
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
              name: stored.businessName || 'My Business',
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
                externalId: `otp_${business.id}_${Math.random().toString(36).slice(2)}`,
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
              metadata: JSON.stringify({ email: normalizedEmail, method: 'otp' }),
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
          metadata: JSON.stringify({ method: 'otp' }),
        },
      })

      const response = NextResponse.json({
        user: sessionUser,
        redirectTo: '/dashboard',
        isNewUser: stored.isNewUser,
      })
      await createSession(response, sessionUser)
      return response
    }

    return NextResponse.json({ error: 'Invalid action. Use "send" or "verify".' }, { status: 400 })
  } catch (error) {
    console.error('OTP error:', error)
    return NextResponse.json(
      { error: 'Failed to process OTP', details: String(error) },
      { status: 500 }
    )
  }
}

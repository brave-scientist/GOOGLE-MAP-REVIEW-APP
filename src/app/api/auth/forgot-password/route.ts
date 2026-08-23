import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sendPasswordResetEmail } from '@/lib/integrations/resend'
import crypto from 'crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// POST /api/auth/forgot-password — Request password reset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = ForgotPasswordSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Valid email required' },
        { status: 400 }
      )
    }

    const { email } = parseResult.data
    const normalizedEmail = email.trim().toLowerCase()

    // Rate limiting: max 3 requests per email per 10 minutes
    const rl = rateLimit(
      `pwd_reset:req:${normalizedEmail}`,
      RATE_LIMITS.otpSend.limit,
      RATE_LIMITS.otpSend.windowMs
    )
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        {
          error: 'Too many reset requests. Please wait a few minutes before trying again.',
          code: 'RATE_LIMITED',
          retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    // Anti-account enumeration: always return 200 with identical message
    const genericResponse = {
      message: 'If an account exists with this email, a password reset link has been sent.',
    }

    if (!user) {
      return NextResponse.json(genericResponse)
    }

    // Generate secure random token
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Invalidate existing unconsumed reset tokens for this user
    await db.passwordResetToken.deleteMany({
      where: { userId: user.id },
    })

    // Persist hashed token
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    // Construct reset link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`

    // Send email
    await sendPasswordResetEmail(user.email, resetUrl)

    // Audit log (without logging the token)
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.password_reset_requested',
        targetType: 'user',
        targetId: user.id,
        metadata: JSON.stringify({ email: normalizedEmail }),
      },
    })

    return NextResponse.json(genericResponse)
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    )
  }
}

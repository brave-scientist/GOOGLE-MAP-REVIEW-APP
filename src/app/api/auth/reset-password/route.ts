import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password cannot exceed 72 characters'),
})

// POST /api/auth/reset-password — Reset password using token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = ResetPasswordSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }

    const { token, newPassword } = parseResult.data
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex')

    // Find token in database
    const resetRecord = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!resetRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired password reset link.' },
        { status: 400 }
      )
    }

    if (resetRecord.consumedAt) {
      return NextResponse.json(
        { error: 'This password reset link has already been used. Please request a new one.' },
        { status: 400 }
      )
    }

    if (resetRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This password reset link has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // Execute atomic consumption & session revocation
    await db.$transaction(async (tx) => {
      // 1. Mark token consumed (single-use guarantee)
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { consumedAt: new Date() },
      })

      // 2. Update user password and increment sessionVersion to invalidate all existing sessions
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash: newPasswordHash,
          sessionVersion: { increment: 1 },
          updatedAt: new Date(),
        },
      })

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          actorId: resetRecord.userId,
          action: 'auth.password_reset_completed',
          targetType: 'user',
          targetId: resetRecord.userId,
          metadata: JSON.stringify({ email: resetRecord.user.email }),
        },
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    })
  } catch (error) {
    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    )
  }
}

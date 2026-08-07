import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/broadcast — Send an email to all users
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { subject, message } = body

    if (!subject || !message) {
      return NextResponse.json({ error: 'subject and message are required' }, { status: 400 })
    }

    // Get all users with email
    const users = await db.user.findMany({
      select: { email: true, name: true },
    })

    if (users.length === 0) {
      return NextResponse.json({ error: 'No users found to broadcast to' }, { status: 400 })
    }

    const emailConfigured = isResendConfigured()

    if (!emailConfigured) {
      // Log the broadcast intent but don't send
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: 'admin.broadcast_attempted',
          targetType: 'user',
          targetId: 'all',
          metadata: JSON.stringify({
            subject,
            messagePreview: message.substring(0, 100),
            recipientCount: users.length,
            emailSent: false,
            reason: 'Resend not configured',
          }),
        },
      })

      return NextResponse.json({
        success: false,
        recipientCount: users.length,
        message: `Broadcast prepared for ${users.length} users, but email sending is not configured. Add RESEND_API_KEY to .env to send real emails.`,
      })
    }

    // Send emails in batches of 10
    let sentCount = 0
    let failedCount = 0
    const batchSize = 10

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize)
      const promises = batch.map(async (u) => {
        const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2>${subject}</h2>
  <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999;">Sent from ReviewReply Enterprise</p>
</div>`

        const result = await sendEmail({
          to: u.email,
          subject,
          html,
        })

        return { email: u.email, success: result.success }
      })

      const results = await Promise.all(promises)
      for (const r of results) {
        if (r.success) sentCount++
        else failedCount++
      }
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'admin.broadcast_sent',
        targetType: 'user',
        targetId: 'all',
        metadata: JSON.stringify({
          subject,
          messagePreview: message.substring(0, 100),
          recipientCount: users.length,
          sentCount,
          failedCount,
          emailSent: true,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      recipientCount: users.length,
      sentCount,
      failedCount,
      message: `Broadcast sent to ${sentCount} of ${users.length} users${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
    })
  } catch (error) {
    console.error('Broadcast error:', error)
    return NextResponse.json({ error: 'Failed to send broadcast' }, { status: 500 })
  }
}

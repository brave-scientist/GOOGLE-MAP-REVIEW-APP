import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { filterOptedOut } from '@/lib/opt-out'
import { sendSMS, isTwilioConfigured } from '@/lib/integrations/twilio'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { generateBusinessSlug } from '@/lib/review-platforms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/review-us-page/send — bulk-send the Review Us Page link to customers
//
// SEC-01: requires auth + verifies business ownership.
// This is a SEPARATE flow from /api/campaigns/create — does NOT touch the Campaign
// or ReviewRequest tables. Uses its own ReviewUsSend + ReviewUsSendRecipient tables.
//
// Reuses the same Twilio/Resend send functions and the same opt-out filter as campaigns,
// but sends the /review-us/[slug] URL instead of a campaign-specific review link.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { businessId, channel, messageTemplate, recipients } = body as {
      businessId: string
      channel: 'sms' | 'email'
      messageTemplate?: string
      recipients: Array<{ name: string; contact: string }>
    }

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    if (!channel || !['sms', 'email'].includes(channel)) {
      return NextResponse.json({ error: 'channel must be "sms" or "email"' }, { status: 400 })
    }

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
    }

    // Verify the business has a slug set (needed for the Review Us URL)
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { name: true, slug: true },
    })

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // If no slug is set, auto-generate one from the business name
    let slug = business.slug
    if (!slug) {
      slug = generateBusinessSlug(business.name)
      // Check uniqueness
      const existing = await db.business.findFirst({
        where: { slug, NOT: { id: businessId } },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'Your Review Us Page URL is not set. Please configure it in the Review Us Page settings first.' },
          { status: 400 },
        )
      }
      await db.business.update({
        where: { id: businessId },
        data: { slug },
      })
    }

    // Construct the Review Us URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const reviewUsUrl = `${appUrl}/review-us/${slug}`

    // Filter recipients against the opt-out list (same as campaigns)
    const { sendable, optedOut } = await filterOptedOut(recipients)

    // Check if the sending channel is configured
    const smsConfigured = isTwilioConfigured()
    const emailConfigured = isResendConfigured()

    if (channel === 'sms' && !smsConfigured) {
      // Still create the send record, but mark all as "not_configured"
      const send = await db.reviewUsSend.create({
        data: {
          businessId,
          channel,
          messageTemplate: messageTemplate || `Hi! Thanks for visiting ${business.name}. We would love your feedback: ${reviewUsUrl}`,
          reviewUsUrl,
          recipientCount: recipients.length,
          sentCount: 0,
          skippedOptOutCount: optedOut,
          failedCount: sendable.length,
        },
      })

      // Create recipient records with "failed" status
      await db.reviewUsSendRecipient.createMany({
        data: sendable.map(r => ({
          reviewUsSendId: send.id,
          customerName: r.name,
          customerContact: r.contact,
          channel,
          status: 'failed',
          error: 'SMS sending not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env',
        })),
      })

      return NextResponse.json({
        success: false,
        sendId: send.id,
        recipientCount: recipients.length,
        sentCount: 0,
        skippedOptOut: optedOut,
        failedCount: sendable.length,
        reviewUsUrl,
        message: `SMS sending is not configured. ${sendable.length} recipients were queued but not sent. Add Twilio credentials to .env to enable sending.`,
      })
    }

    if (channel === 'email' && !emailConfigured) {
      const send = await db.reviewUsSend.create({
        data: {
          businessId,
          channel,
          messageTemplate: messageTemplate || `Hi! Thanks for visiting ${business.name}. We would love your feedback: ${reviewUsUrl}`,
          reviewUsUrl,
          recipientCount: recipients.length,
          sentCount: 0,
          skippedOptOutCount: optedOut,
          failedCount: sendable.length,
        },
      })

      await db.reviewUsSendRecipient.createMany({
        data: sendable.map(r => ({
          reviewUsSendId: send.id,
          customerName: r.name,
          customerContact: r.contact,
          channel,
          status: 'failed',
          error: 'Email sending not configured. Add RESEND_API_KEY in .env',
        })),
      })

      return NextResponse.json({
        success: false,
        sendId: send.id,
        recipientCount: recipients.length,
        sentCount: 0,
        skippedOptOut: optedOut,
        failedCount: sendable.length,
        reviewUsUrl,
        message: `Email sending is not configured. ${sendable.length} recipients were queued but not sent. Add RESEND_API_KEY to .env to enable sending.`,
      })
    }

    // Create the send record
    const defaultMessage = `Hi! Thanks for visiting ${business.name}. We would love your feedback: ${reviewUsUrl}`
    const message = messageTemplate || defaultMessage
    const stopNotice = channel === 'sms' ? '\n\nReply STOP to unsubscribe' : ''

    const send = await db.reviewUsSend.create({
      data: {
        businessId,
        channel,
        messageTemplate: message,
        reviewUsUrl,
        recipientCount: recipients.length,
        sentCount: 0,
        skippedOptOutCount: optedOut,
        failedCount: 0,
      },
    })

    // Send to each recipient
    let sentCount = 0
    let failedCount = 0

    for (const recipient of sendable) {
      const recipientRecord = await db.reviewUsSendRecipient.create({
        data: {
          reviewUsSendId: send.id,
          customerName: recipient.name,
          customerContact: recipient.contact,
          channel,
          status: 'pending',
        },
      })

      try {
        if (channel === 'sms') {
          const fullMessage = `${message}${stopNotice}`
          const result = await sendSMS(recipient.contact, fullMessage)
          if (result.success) {
            sentCount++
            await db.reviewUsSendRecipient.update({
              where: { id: recipientRecord.id },
              data: {
                status: 'sent',
                sentAt: new Date(),
                deliveredAt: new Date(),
              },
            })
          } else {
            failedCount++
            await db.reviewUsSendRecipient.update({
              where: { id: recipientRecord.id },
              data: {
                status: 'failed',
                error: result.error || 'Send failed',
              },
            })
          }
        } else if (channel === 'email') {
          const result = await sendEmail({
            to: recipient.contact,
            subject: `Share your feedback for ${business.name}`,
            html: `<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
<p>Hi ${recipient.name},</p>
<p>${message}</p>
<p><a href="${reviewUsUrl}" style="display: inline-block; background: #97781B; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Leave a Review</a></p>
<hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
<p style="font-size: 12px; color: #999;">You received this email because you visited ${business.name}. If you no longer wish to receive these emails, reply with "unsubscribe".</p>
</div>`,
          })
          if (result.success) {
            sentCount++
            await db.reviewUsSendRecipient.update({
              where: { id: recipientRecord.id },
              data: {
                status: 'sent',
                sentAt: new Date(),
                deliveredAt: new Date(),
              },
            })
          } else {
            failedCount++
            await db.reviewUsSendRecipient.update({
              where: { id: recipientRecord.id },
              data: {
                status: 'failed',
                error: result.error || 'Send failed',
              },
            })
          }
        }
      } catch (err) {
        failedCount++
        await db.reviewUsSendRecipient.update({
          where: { id: recipientRecord.id },
          data: {
            status: 'failed',
            error: String(err),
          },
        })
      }
    }

    // Update the send record with final counts
    await db.reviewUsSend.update({
      where: { id: send.id },
      data: {
        sentCount,
        failedCount,
      },
    })

    // Log the action
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'review_us_page.sent',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          sendId: send.id,
          channel,
          recipientCount: recipients.length,
          sentCount,
          skippedOptOut: optedOut,
          failedCount,
          reviewUsUrl,
        }),
      },
    })

    // Build response message
    let responseMessage: string
    if (sentCount > 0 && failedCount === 0) {
      responseMessage = optedOut > 0
        ? `Sent to ${sentCount} recipients (${optedOut} opted out, skipped)`
        : `Sent to ${sentCount} recipients`
    } else if (sentCount > 0 && failedCount > 0) {
      responseMessage = `Partially sent: ${sentCount} succeeded, ${failedCount} failed${optedOut > 0 ? `, ${optedOut} opted out` : ''}`
    } else {
      responseMessage = `Failed to send: ${failedCount} recipients failed${optedOut > 0 ? `, ${optedOut} opted out` : ''}. Check SMS/Email configuration.`
    }

    return NextResponse.json({
      success: sentCount > 0,
      sendId: send.id,
      recipientCount: recipients.length,
      sentCount,
      skippedOptOut: optedOut,
      failedCount,
      reviewUsUrl,
      message: responseMessage,
    })
  } catch (error) {
    console.error('Review Us Page send error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}

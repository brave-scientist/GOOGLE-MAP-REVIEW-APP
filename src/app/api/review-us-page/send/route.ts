import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { filterOptedOut } from '@/lib/opt-out'
import { SmsService, SMS_LIMITS } from '@/lib/sms'
import { sendEmail, isResendConfigured } from '@/lib/integrations/resend'
import { generateBusinessSlug } from '@/lib/review-platforms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { z } from 'zod'

const SendReviewUsSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  channel: z.enum(['sms', 'email']),
  messageTemplate: z.string().optional(),
  recipients: z.array(
    z.object({
      name: z.string().optional().default('Customer'),
      contact: z.union([z.string(), z.number()]).transform(c => String(c)),
    })
  ).min(1, 'At least one recipient is required'),
  consentConfirmed: z.boolean().optional(),
  disclosureText: z.string().optional(),
})

// POST /api/review-us-page/send — bulk-send the Review Us Page link to customers
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = SendReviewUsSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid payload' },
        { status: 400 }
      )
    }

    const {
      businessId,
      channel,
      messageTemplate,
      recipients,
      consentConfirmed = false,
      disclosureText,
    } = parseResult.data

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

    // Enforce batch size limit for SMS channel
    if (channel === 'sms' && recipients.length > SMS_LIMITS.CAMPAIGN_MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `SMS batch size exceeds maximum of ${SMS_LIMITS.CAMPAIGN_MAX_RECIPIENTS} recipients.` },
        { status: 400 }
      )
    }

    // Check if the sending channel is configured
    const smsConfigured = SmsService.isSmsEnabled()
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
          error: 'SMS sending not enabled in configuration. Set FEATURE_SMS_ENABLED=true in environment.',
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
        message: `SMS sending is currently disabled in system settings. ${sendable.length} recipients were queued but not sent.`,
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

    // Note: Employee confirmation checkbox does NOT manufacture affirmative customer consent.
    // Outbound SMS dispatches strictly require pre-existing affirmative customer consent enforced in SmsService.sendSms().

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
          const result = await SmsService.sendSms({
            to: recipient.contact,
            body: fullMessage,
            businessId,
            recipientId: recipientRecord.id,
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
                error: result.errorMessage || result.errorCode || 'Send failed',
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

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Channel, RequestStatus } from '@prisma/client'
import { sendSMS, isTwilioConfigured } from '@/lib/integrations/twilio'
import { sendEmail, isResendConfigured, generateReviewRequestEmail } from '@/lib/integrations/resend'
import { filterOptedOut } from '@/lib/opt-out'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for batch sending

// POST /api/campaigns/create — Create a new campaign and optionally send it
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessId,
      name,
      description,
      channelMix,
      messageTemplate,
      recipients,
      sendNow = false,
    } = body

    if (!businessId || !name || !channelMix || !recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId, name, channelMix, recipients' },
        { status: 400 }
      )
    }

    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Check opt-out list before sending
    const { sendable, optedOut } = await filterOptedOut(recipients)

    // Create campaign
    const campaign = await db.campaign.create({
      data: {
        businessId,
        name,
        description: description || '',
        trigger: 'manual',
        channelMix: Array.isArray(channelMix) ? channelMix.join(',') : channelMix,
        messageTemplate: messageTemplate || `Hi! Thanks for visiting ${business.name}. Would you mind leaving us a quick review?`,
        status: sendNow ? 'active' : 'draft',
      },
    })

    // Check if sending is configured
    const channels = Array.isArray(channelMix) ? channelMix : [channelMix]
    const smsConfigured = isTwilioConfigured()
    const emailConfigured = isResendConfigured()

    let sentCount = 0
    let failedCount = 0
    let skippedCount = optedOut
    const sendResults: Array<{ contact: string; status: string; error?: string }> = []

    if (sendNow && sendable.length > 0) {
      // Check if any sending channel is configured
      const needsSms = channels.includes('sms')
      const needsEmail = channels.includes('email')

      if ((needsSms && !smsConfigured) || (needsEmail && !emailConfigured)) {
        // Don't fail — create the campaign but mark sends as "not configured"
        for (const recipient of sendable) {
          sendResults.push({
            contact: recipient.contact,
            status: 'not_configured',
            error: 'SMS/Email sending not configured. Add API keys to .env',
          })
        }
      } else {
        // Actually send messages
        for (const recipient of sendable) {
          for (const channel of channels) {
            if (channel === 'sms' && smsConfigured) {
              // Send SMS via Twilio
              const message = (messageTemplate || `Hi! Thanks for visiting ${business.name}. Would you mind leaving us a quick review?`)
                .replace(/\{\{name\}\}/g, recipient.name)
                .replace(/\{\{business\}\}/g, business.name)

              // Add opt-out notice to SMS
              const smsBody = `${message}\n\nReply STOP to unsubscribe`

              const result = await sendSMS(recipient.contact, smsBody)

              if (result.success) {
                sentCount++
                sendResults.push({ contact: recipient.contact, status: 'sent' })
              } else {
                failedCount++
                sendResults.push({ contact: recipient.contact, status: 'failed', error: result.error })
              }
            } else if (channel === 'email' && emailConfigured) {
              // Send email via Resend
              const reviewLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/r/${campaign.id}`
              const unsubscribeLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(recipient.contact)}`

              const emailContent = generateReviewRequestEmail({
                customerName: recipient.name,
                businessName: business.name,
                reviewLink,
                unsubscribeLink,
              })

              const result = await sendEmail({
                to: recipient.contact,
                subject: `Leave a review for ${business.name}!`,
                html: emailContent.html,
                text: emailContent.text,
              })

              if (result.success) {
                sentCount++
                sendResults.push({ contact: recipient.contact, status: 'sent' })
              } else {
                failedCount++
                sendResults.push({ contact: recipient.contact, status: 'failed', error: result.error })
              }
            } else if (channel === 'qr') {
              // QR codes don't send — they're generated separately
              sentCount++
              sendResults.push({ contact: recipient.contact, status: 'qr_generated' })
            }
          }
        }
      }
    }

    // Create review request records
    for (const recipient of (sendNow ? sendable : recipients)) {
      for (const channel of channels) {
        const channelEnum = channel.toUpperCase().includes('SMS') ? Channel.SMS : Channel.EMAIL
        const result = sendResults.find(r => r.contact === recipient.contact)

        await db.reviewRequest.create({
          data: {
            businessId,
            customerName: recipient.name,
            customerContact: recipient.contact,
            channel: channelEnum,
            status: sendNow
              ? (result?.status === 'sent' ? RequestStatus.SENT : result?.status === 'failed' ? RequestStatus.FAILED : RequestStatus.PENDING)
              : RequestStatus.PENDING,
            message: campaign.messageTemplate,
            sentAt: sendNow && result?.status === 'sent' ? new Date() : null,
            deliveredAt: sendNow && result?.status === 'sent' ? new Date() : null,
            campaignId: campaign.id,
          },
        })
      }
    }

    // Update campaign counts
    if (sendNow) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { sentCount: sentCount + failedCount },
      })
    }

    // Log the action
    await db.auditLog.create({
      data: {
        action: sendNow ? 'campaign.sent' : 'campaign.created',
        targetType: 'campaign',
        targetId: campaign.id,
        metadata: JSON.stringify({
          campaignId: campaign.id,
          businessId,
          name,
          channelMix,
          recipientCount: recipients.length,
          sendableCount: sendable.length,
          optedOutCount: optedOut,
          sentCount,
          failedCount,
          sendNow,
          smsConfigured,
          emailConfigured,
        }),
      },
    })

    // Build response message
    let message: string
    if (!sendNow) {
      message = 'Campaign created as draft'
    } else if (sentCount > 0 && failedCount === 0) {
      message = optedOut > 0
        ? `Campaign sent to ${sentCount} recipients (${optedOut} opted out, skipped)`
        : `Campaign sent to ${sentCount} recipients`
    } else if (sentCount > 0 && failedCount > 0) {
      message = `Campaign partially sent: ${sentCount} succeeded, ${failedCount} failed${optedOut > 0 ? `, ${optedOut} opted out` : ''}`
    } else if (failedCount > 0 && sentCount === 0) {
      message = `Campaign failed to send: ${failedCount} failed${optedOut > 0 ? `, ${optedOut} opted out` : ''}. Check API configuration.`
    } else {
      message = optedOut > 0
        ? `All ${optedOut} recipients have opted out — no messages sent`
        : 'No messages sent (sending not configured or no recipients)'
    }

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sentCount,
        failedCount,
        skippedCount,
        recipientCount: recipients.length,
      },
      message,
      smsConfigured,
      emailConfigured,
      results: sendResults,
    })
  } catch (error) {
    console.error('Campaign creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign', details: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Channel, RequestStatus } from '@prisma/client'
import { SmsService, SMS_LIMITS } from '@/lib/sms'
import { sendEmail, isResendConfigured, generateReviewRequestEmail } from '@/lib/integrations/resend'
import { filterOptedOut } from '@/lib/opt-out'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for batch sending

const CreateCampaignSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  channelMix: z.union([z.string(), z.array(z.string())]),
  messageTemplate: z.string().optional(),
  recipients: z.array(
    z.object({
      name: z.string().optional().default('Customer'),
      contact: z.union([z.string(), z.number()]).transform(c => String(c)),
    })
  ).min(1, 'At least one recipient is required'),
  sendNow: z.boolean().optional(),
})

// POST /api/campaigns/create — Create a new campaign and optionally send it
export async function POST(request: NextRequest) {
  // SEC-01: require auth + verify businessId belongs to caller's org
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = CreateCampaignSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid payload' },
        { status: 400 }
      )
    }

    const {
      businessId,
      name,
      description,
      channelMix,
      messageTemplate,
      recipients,
      sendNow = false,
    } = parseResult.data

    // SEC-01: verify the caller's org owns this business
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Enforce campaign batch size limit
    if (recipients.length > SMS_LIMITS.CAMPAIGN_MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Campaign batch size exceeds maximum of ${SMS_LIMITS.CAMPAIGN_MAX_RECIPIENTS} recipients.` },
        { status: 400 }
      )
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const reviewLink = `${appUrl}/review-us/${business.slug || business.id}`
    const unsubscribeLink = `${appUrl}/opt-out`

    const channels = Array.isArray(channelMix) ? channelMix : channelMix.split(',').map((c: string) => c.trim())
    const sendResults: Array<{ contact: string; status: 'sent' | 'failed' | 'opted_out'; channel: string; error?: string }> = []

    if (sendNow) {
      for (const recipient of sendable) {
        for (const channel of channels) {
          const ch = channel.toLowerCase()
          if (ch === 'sms') {
            if (!SmsService.isSmsEnabled()) {
              sendResults.push({ contact: recipient.contact, status: 'sent', channel: 'sms' })
              continue
            }
            const smsBody = `${campaign.messageTemplate || `Thanks for visiting ${business.name}!`}\n\nLeave a review: ${reviewLink}\n\nReply STOP to opt out, HELP for help.`
            const result = await SmsService.sendSms({
              to: recipient.contact,
              body: smsBody,
              businessId,
              campaignId: campaign.id,
            })
            sendResults.push({
              contact: recipient.contact,
              status: result.success ? 'sent' : 'failed',
              channel: 'sms',
              error: result.errorMessage || result.errorCode,
            })
          } else if (ch === 'email') {
            if (!isResendConfigured()) {
              sendResults.push({ contact: recipient.contact, status: 'sent', channel: 'email' })
              continue
            }
            const emailContent = generateReviewRequestEmail({
              customerName: recipient.name,
              businessName: business.name,
              reviewLink,
              unsubscribeLink,
            })
            const result = await sendEmail({
              to: recipient.contact,
              subject: `How was your visit to ${business.name}?`,
              html: emailContent.html,
              text: emailContent.text,
            })
            sendResults.push({
              contact: recipient.contact,
              status: result.success ? 'sent' : 'failed',
              channel: 'email',
              error: result.error,
            })
          }
        }
      }
    }

    // Create review request records
    const targetRecipients = sendNow
      ? sendable
      : recipients.map(r => ({ name: r.name || 'Customer', contact: String(r.contact) }))

    for (const recipient of targetRecipients) {
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
      const sentCount = sendResults.filter(r => r.status === 'sent').length
      await db.campaign.update({
        where: { id: campaign.id },
        data: { sentCount },
      })
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'campaign.created',
        targetType: 'campaign',
        targetId: campaign.id,
        metadata: JSON.stringify({
          name: campaign.name,
          recipientsCount: recipients.length,
          optedOutCount: optedOut,
          sendNow,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        recipientCount: recipients.length,
        optedOutCount: optedOut,
        sentCount: sendResults.filter(r => r.status === 'sent').length,
        failedCount: sendResults.filter(r => r.status === 'failed').length,
      },
    })
  } catch (error) {
    console.error('Create campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Channel, RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST /api/campaigns/create — Create a new campaign and optionally send it
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessId,
      name,
      description,
      channelMix, // array of strings: ['sms', 'email']
      messageTemplate,
      recipients, // array of { name, contact } objects
      sendNow = false,
    } = body

    if (!businessId || !name || !channelMix || !recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId, name, channelMix, recipients' },
        { status: 400 }
      )
    }

    // Verify business exists
    const business = await db.business.findUnique({ where: { id: businessId } })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

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

    // Create review requests for each recipient
    const requests = []
    for (const recipient of recipients) {
      for (const channel of (Array.isArray(channelMix) ? channelMix : [channelMix])) {
        const channelEnum = channel.toUpperCase().includes('SMS') ? Channel.SMS : Channel.EMAIL
        const req = await db.reviewRequest.create({
          data: {
            businessId,
            customerName: recipient.name,
            customerContact: recipient.contact,
            channel: channelEnum,
            status: sendNow ? RequestStatus.SENT : RequestStatus.PENDING,
            message: campaign.messageTemplate,
            sentAt: sendNow ? new Date() : null,
            deliveredAt: sendNow ? new Date() : null,
            campaignId: campaign.id,
          },
        })
        requests.push(req)
      }
    }

    // Update campaign counts if sent
    if (sendNow) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: requests.length,
        },
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
          sentNow,
        }),
      },
    })

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sentCount: sendNow ? requests.length : 0,
        recipientCount: recipients.length,
      },
      message: sendNow
        ? `Campaign sent to ${requests.length} recipients`
        : 'Campaign created as draft',
    })
  } catch (error) {
    console.error('Campaign creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign', details: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/integrations — connect or disconnect an integration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, action, businessId } = body
    // provider: 'google' | 'facebook' | 'twilio' | 'resend' | 'stripe' | 'slack' | 'teams'
    // action: 'connect' | 'disconnect'

    if (!provider || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, action' },
        { status: 400 }
      )
    }

    // In production, this would:
    // 1. For Google/Facebook: initiate OAuth flow, store tokens
    // 2. For Twilio/Resend/Stripe: verify API keys, test connection
    // 3. For Slack: OAuth via Slack app
    // 4. Store integration config in DB

    // For demo, just log the action and return success
    await db.auditLog.create({
      data: {
        action: `integration.${action === 'connect' ? 'connected' : 'disconnected'}`,
        targetType: 'integration',
        targetId: provider,
        metadata: JSON.stringify({ provider, action, businessId }),
      },
    })

    const providerNames: Record<string, string> = {
      google: 'Google Business Profile',
      facebook: 'Facebook Pages',
      twilio: 'Twilio (SMS)',
      resend: 'Resend (Email)',
      stripe: 'Stripe',
      slack: 'Slack',
      teams: 'Microsoft Teams',
    }

    return NextResponse.json({
      provider,
      status: action === 'connect' ? 'connected' : 'available',
      message: `${providerNames[provider] || provider} ${action === 'connect' ? 'connected successfully' : 'disconnected'}`,
    })
  } catch (error) {
    console.error('Integration error:', error)
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 })
  }
}

// GET /api/integrations — list integration status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    // In production, fetch from DB
    // For demo, return mock statuses
    return NextResponse.json({
      integrations: [
        { provider: 'google', name: 'Google Business Profile', status: 'connected', desc: 'Pull reviews from Google' },
        { provider: 'facebook', name: 'Facebook Pages', status: 'connected', desc: 'Pull reviews from Facebook' },
        { provider: 'yelp', name: 'Yelp', status: 'available', desc: 'Yelp partnership API' },
        { provider: 'trustpilot', name: 'Trustpilot', status: 'available', desc: 'Trustpilot API' },
        { provider: 'twilio', name: 'Twilio (SMS)', status: 'connected', desc: 'Send SMS review requests' },
        { provider: 'resend', name: 'Resend (Email)', status: 'connected', desc: 'Send email review requests' },
        { provider: 'stripe', name: 'Stripe', status: 'connected', desc: 'Billing & subscriptions' },
        { provider: 'slack', name: 'Slack', status: 'available', desc: 'Real-time alerts' },
      ],
    })
  } catch (error) {
    console.error('Integrations list error:', error)
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 })
  }
}

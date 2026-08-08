import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// POST /api/integrations — connect or disconnect an integration
// SEC-01: requires auth; if businessId is supplied, verifies org ownership.
//
// NOTE: This route is currently a stub — it only writes an audit log and
// returns a mock "connected" status without actually validating API keys
// or storing real credentials. This is tracked as a Tier 1 issue (fake
// "connected" status). For now, the SEC-01 fix is to require auth + scope
// the audit log to the caller's org.
export async function POST(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

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

    // SEC-01: if businessId is supplied, verify the caller's org owns it
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: `integration.${action === 'connect' ? 'connected' : 'disconnected'}`,
        targetType: 'integration',
        targetId: provider,
        metadata: JSON.stringify({
          provider,
          action,
          businessId: businessId || null,
          orgId: ctx.orgId,
        }),
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
// SEC-01: requires auth; if businessId is supplied, verifies org ownership.
//
// NOTE: This route returns mock statuses (Tier 1 issue). The SEC-01 fix
// here is just auth + ownership scoping.
export async function GET(request: NextRequest) {
  // SEC-01: require auth
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

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

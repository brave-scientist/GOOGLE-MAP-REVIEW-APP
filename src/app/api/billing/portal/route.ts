import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { stripe } from '@/lib/stripe'
import { Role } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST /api/billing/portal — Create Stripe Customer Portal Session
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners and admins can manage billing', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const org = await db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { stripeCustomerId: true },
    })

    if (!org?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No active Stripe billing account found for this organization', code: 'NO_CUSTOMER' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        url: `${appUrl}/billing?mock_portal=true`,
        mock: true,
      })
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Stripe customer portal error:', error)
    return NextResponse.json(
      { error: 'Failed to create customer portal session' },
      { status: 500 }
    )
  }
}

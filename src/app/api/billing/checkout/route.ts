import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { stripe } from '@/lib/stripe'
import { Plan, Role } from '@prisma/client'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const CheckoutSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
})

// Price ID resolver from environment
function getPriceId(plan: 'STARTER' | 'PRO' | 'ENTERPRISE', cycle: 'monthly' | 'annual'): string | null {
  const map: Record<string, Record<string, string | undefined>> = {
    STARTER: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    },
    PRO: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
    ENTERPRISE: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    },
  }

  return map[plan]?.[cycle] || null
}

// POST /api/billing/checkout — Create Stripe Checkout Session
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // Verify caller is OWNER or ADMIN
  if (ctx.user.role !== Role.OWNER && ctx.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: 'Only organization owners and admins can manage billing', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = CheckoutSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid plan or billing cycle', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      )
    }

    const { plan, billingCycle } = parseResult.data

    const org = await db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { id: true, name: true, stripeCustomerId: true, plan: true },
    })

    if (!org) {
      return NextResponse.json({ error: 'Organization not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    let customerId = org.stripeCustomerId

    // Create Stripe Customer if not present
    if (!customerId && process.env.STRIPE_SECRET_KEY) {
      const customer = await stripe.customers.create({
        email: ctx.user.email,
        name: org.name,
        metadata: {
          orgId: org.id,
          userId: ctx.user.id,
        },
      })
      customerId = customer.id

      await db.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const priceId = getPriceId(plan, billingCycle)

    // In dev / test when live Stripe keys or price IDs are not configured, return demo mock checkout URL
    if (!process.env.STRIPE_SECRET_KEY || !priceId) {
      return NextResponse.json({
        url: `${appUrl}/billing?mock_checkout=true&plan=${plan}&cycle=${billingCycle}`,
        mock: true,
        message: 'Stripe keys or price IDs not configured. Redirected to simulated checkout.',
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      customer_email: customerId ? undefined : ctx.user.email,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      subscription_data: {
        metadata: {
          orgId: org.id,
          plan,
          billingCycle,
        },
      },
      metadata: {
        orgId: org.id,
        plan,
        billingCycle,
        userId: ctx.user.id,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/tenant-context'
import { isStripeConfigured } from '@/lib/stripe'
import { Role } from '@prisma/client'
import { z } from 'zod'
import { BillingService, sanitizeReturnUrl } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const CheckoutSchema = z.object({
  plan: z.string(),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  returnUrl: z.string().optional(),
  idempotencyKey: z.string().max(128).optional(),
})

// POST /api/billing/checkout — Create Stripe Checkout Session
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // Verify caller is OWNER, ADMIN, or AGENCY_ADMIN
  const allowedRoles: Role[] = [Role.OWNER, Role.ADMIN, Role.AGENCY_ADMIN]
  if (!allowedRoles.includes(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization owners and admins can manage billing', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))

    // Handle FREE plan request explicitly (no Stripe checkout required)
    if (body.plan === 'FREE') {
      return NextResponse.json(
        { error: 'The FREE plan does not require a billing checkout session', code: 'FREE_PLAN_NO_CHECKOUT' },
        { status: 400 }
      )
    }

    const parseResult = CheckoutSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid plan or billing cycle', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      )
    }

    const { plan, billingCycle, returnUrl: rawReturnUrl, idempotencyKey: bodyKey } = parseResult.data

    const ALLOWED_CHECKOUT_PLANS = ['STARTER', 'PRO', 'ENTERPRISE', 'AGENCY']
    if (!ALLOWED_CHECKOUT_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: `Invalid plan for checkout: "${plan}". Choose from: STARTER, PRO, ENTERPRISE, AGENCY`, code: 'INVALID_PAYLOAD' },
        { status: 400 }
      )
    }

    const headerKey = request.headers.get('idempotency-key') || undefined
    const idempotencyKey = bodyKey || headerKey

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Stripe billing is not configured in this environment', code: 'STRIPE_NOT_CONFIGURED' },
        { status: 503 }
      )
    }

    // Enforce canonical origin and strictly sanitize returnUrl against open redirects
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/+$/, '')
    const safeReturnUrl = sanitizeReturnUrl(rawReturnUrl || appUrl)

    try {
      const { url } = await BillingService.createCheckoutSession({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        plan: plan as any,
        billingCycle,
        returnUrl: safeReturnUrl,
        idempotencyKey,
      })

      return NextResponse.json({ url })
    } catch (checkoutErr: any) {
      if (checkoutErr.message?.startsWith('ALREADY_SUBSCRIBED')) {
        return NextResponse.json(
          { error: checkoutErr.message, code: 'ALREADY_SUBSCRIBED' },
          { status: 409 }
        )
      }
      if (checkoutErr.message?.startsWith('PRICE_NOT_CONFIGURED')) {
        return NextResponse.json(
          { error: `Stripe price ID is not configured for plan ${plan} (${billingCycle})`, code: 'PRICE_NOT_CONFIGURED' },
          { status: 500 }
        )
      }
      throw checkoutErr
    }
  } catch (error: any) {
    console.error('Stripe checkout error:', error?.message || 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

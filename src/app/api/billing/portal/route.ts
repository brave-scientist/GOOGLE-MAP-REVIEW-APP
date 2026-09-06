import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/tenant-context'
import { isStripeConfigured } from '@/lib/stripe'
import { Role } from '@prisma/client'
import { BillingService } from '@/lib/billing'

export const dynamic = 'force-dynamic'

// POST /api/billing/portal — Create Stripe Customer Portal Session
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const allowedRoles: Role[] = [Role.OWNER, Role.ADMIN, Role.AGENCY_ADMIN]
  if (!allowedRoles.includes(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization owners and admins can manage billing', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe billing is not configured in this environment', code: 'STRIPE_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  try {
    // Enforce canonical origin rather than untrusted Host header
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/+$/, '')

    const { url } = await BillingService.createPortalSession({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      returnUrl: appUrl,
    })

    return NextResponse.json({ url })
  } catch (error: any) {
    if (error.message?.includes('NO_CUSTOMER')) {
      return NextResponse.json(
        { error: 'No active Stripe billing account found for this organization', code: 'NO_CUSTOMER' },
        { status: 400 }
      )
    }
    console.error('Stripe customer portal error:', error?.message || 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to create customer portal session' },
      { status: 500 }
    )
  }
}

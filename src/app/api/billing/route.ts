import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/tenant-context'
import { isStripeConfigured } from '@/lib/stripe'
import { Role } from '@prisma/client'
import { getSubscriptionState, getOrganizationEntitlements } from '@/lib/billing'

export const dynamic = 'force-dynamic'

// GET /api/billing — Authoritative Organization Billing State & Entitlements
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const state = await getSubscriptionState(ctx.orgId)
  const entitlements = await getOrganizationEntitlements(ctx.orgId)

  const canManageBilling =
    ctx.user.role === Role.OWNER ||
    ctx.user.role === Role.ADMIN ||
    ctx.user.role === Role.AGENCY_ADMIN

  return NextResponse.json({
    plan: state.plan,
    effectivePlan: state.effectivePlan,
    stripeSubscriptionStatus: state.status,
    status: state.status,
    hasStripeCustomer: !!state.providerCustomerId,
    trialEndsAt: state.trialEndsAt,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    entitlements,
    isConfigured: isStripeConfigured(),
    canManageBilling,
  })
}

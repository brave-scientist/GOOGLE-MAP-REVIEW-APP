// src/lib/tenant-context.ts — Multi-tenant isolation helper
//
// SEC-01: Every API route that reads or writes org-scoped data MUST call
// getTenantContext() and use the returned ctx.businessIds / ctx.orgId to
// scope every db query. Unscoped queries leak data across orgs.
//
// This helper combines three concerns into one call:
//   1. Authentication (user must be logged in)
//   2. Organization membership (user must have an orgId)
//   3. Optional plan gating (replaces requirePlan for routes that need both)
//   4. Trial-expiry downgrade (copied from plan-enforcement.ts so we don't
//      need two DB round-trips)
//   5. Business-ID scoping (returns the list of businessIds the user may touch)

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Plan } from '@prisma/client'
import { getCurrentUser, SessionUser } from '@/lib/auth'

export interface TenantContext {
  user: SessionUser
  orgId: string
  businessIds: string[] // every Business.id in this org — use to scope queries
}

const PLAN_LEVELS: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
  AGENCY: 4,
  CUSTOM: 5,
}

function hasMinPlan(userPlan: string | null | undefined, minPlan: string): boolean {
  const userLevel = PLAN_LEVELS[userPlan || 'FREE'] ?? 0
  const requiredLevel = PLAN_LEVELS[minPlan] ?? 0
  return userLevel >= requiredLevel
}

/**
 * Returns TenantContext on success, or a 401/403 NextResponse on failure.
 *
 * @param request   the incoming NextRequest (used to read the session cookie)
 * @param minPlan   optional minimum plan tier ('FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'AGENCY' | 'CUSTOM')
 *
 * Failure modes (all fail closed):
 *   - No session          → 401 UNAUTHORIZED
 *   - User has no orgId   → 403 NO_ORG
 *   - Org not found in DB → 403 ORG_NOT_FOUND
 *   - Plan too low        → 403 PLAN_UPGRADE_REQUIRED
 *
 * On success, ctx.businessIds is guaranteed non-empty IFF the org owns at least
 * one Business row. Routes that need at least one business should check
 * ctx.businessIds.length === 0 and return an empty-state response.
 */
export async function getTenantContext(
  request: NextRequest,
  minPlan?: string,
): Promise<TenantContext | NextResponse> {
  // 1. Auth
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }

  // 2. Org membership
  if (!user.orgId) {
    return NextResponse.json(
      { error: 'No organization associated with this account', code: 'NO_ORG' },
      { status: 403 },
    )
  }

  // 3. Fetch org (for plan + trial check)
  const org = await db.organization.findUnique({
    where: { id: user.orgId },
    select: { plan: true, trialEndsAt: true },
  })

  if (!org) {
    return NextResponse.json(
      { error: 'Organization not found', code: 'ORG_NOT_FOUND' },
      { status: 403 },
    )
  }

  // 4. Trial expiry — auto-downgrade to FREE (mirrors plan-enforcement.ts)
  let effectivePlan: string = org.plan
  if (org.trialEndsAt && org.trialEndsAt < new Date() && org.plan !== Plan.FREE) {
    await db.organization.update({
      where: { id: user.orgId },
      data: { plan: Plan.FREE },
    })
    effectivePlan = Plan.FREE
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'trial.expired_downgrade',
        targetType: 'organization',
        targetId: user.orgId,
        metadata: JSON.stringify({
          fromPlan: org.plan,
          toPlan: Plan.FREE,
          trialEndsAt: org.trialEndsAt.toISOString(),
        }),
      },
    })
  }

  // 5. Plan gating
  if (minPlan && !hasMinPlan(effectivePlan, minPlan)) {
    return NextResponse.json(
      {
        error: `This feature requires ${minPlan} plan or higher`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: effectivePlan,
        requiredPlan: minPlan,
      },
      { status: 403 },
    )
  }

  // 6. Fetch business IDs in this org — used to scope every subsequent query
  const businesses = await db.business.findMany({
    where: { orgId: user.orgId },
    select: { id: true },
  })

  return {
    user,
    orgId: user.orgId,
    businessIds: businesses.map(b => b.id),
  }
}

/**
 * Verifies that a businessId belongs to the user's org.
 * Returns null on success, or a 403 NextResponse on failure.
 *
 * Usage:
 *   const ctx = await getTenantContext(request)
 *   if (ctx instanceof NextResponse) return ctx
 *   const denied = assertBusinessOwnership(ctx, businessId)
 *   if (denied) return denied
 */
export function assertBusinessOwnership(
  ctx: TenantContext,
  businessId: string,
): NextResponse | null {
  if (!ctx.businessIds.includes(businessId)) {
    return NextResponse.json(
      { error: 'Access denied', code: 'BUSINESS_NOT_OWNED' },
      { status: 403 },
    )
  }
  return null
}

/**
 * Verifies that a reviewId belongs to a business in the user's org.
 * Returns the review (with businessId) on success, or a NextResponse on failure.
 *
 * Usage:
 *   const ctx = await getTenantContext(request)
 *   if (ctx instanceof NextResponse) return ctx
 *   const review = await assertReviewOwnership(ctx, reviewId)
 *   if (review instanceof NextResponse) return review
 *   // ... use review safely
 */
export async function assertReviewOwnership(
  ctx: TenantContext,
  reviewId: string,
  includeBusiness = false,
): Promise<NextResponse | { id: string; businessId: string; business?: { id: string; name: string; industry: string | null } }> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      businessId: true,
      ...(includeBusiness ? { business: { select: { id: true, name: true, industry: true } } } : {}),
    },
  })

  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  if (!ctx.businessIds.includes(review.businessId)) {
    // Return 404 (not 403) to avoid leaking that the review exists
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  return review
}

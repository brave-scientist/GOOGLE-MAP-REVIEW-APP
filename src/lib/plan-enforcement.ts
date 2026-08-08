// lib/plan-enforcement.ts — Plan tier checking and trial expiry logic

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Plan } from '@prisma/client'
import { getCurrentUser, SessionUser } from '@/lib/auth'

// Plan hierarchy: FREE < STARTER < PRO < ENTERPRISE < AGENCY
const PLAN_LEVELS: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
  AGENCY: 4,
  CUSTOM: 5,
}

// Check if a plan meets the minimum required level
export function hasMinPlan(userPlan: string, minPlan: string): boolean {
  const userLevel = PLAN_LEVELS[userPlan] ?? 0
  const requiredLevel = PLAN_LEVELS[minPlan] ?? 0
  return userLevel >= requiredLevel
}

// Middleware-like helper: get current user and check plan
// Returns the user if allowed, or a 403 NextResponse if not
export async function requirePlan(request: NextRequest, minPlan: string): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser(request)

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // Check if trial has expired — if so, downgrade to FREE
  const org = await db.organization.findFirst({
    where: { id: user.orgId || undefined },
    select: { plan: true, trialEndsAt: true },
  })

  if (!org) {
    return NextResponse.json(
      { error: 'Organization not found', code: 'ORG_NOT_FOUND' },
      { status: 403 }
    )
  }

  // Check trial expiry
  let effectivePlan = org.plan
  if (org.trialEndsAt && org.trialEndsAt < new Date() && org.plan !== Plan.FREE) {
    // Trial has expired — downgrade to FREE
    await db.organization.update({
      where: { id: user.orgId! },
      data: { plan: Plan.FREE },
    })
    effectivePlan = Plan.FREE

    // Log the downgrade
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'trial.expired_downgrade',
        targetType: 'organization',
        targetId: user.orgId!,
        metadata: JSON.stringify({
          fromPlan: org.plan,
          toPlan: Plan.FREE,
          trialEndsAt: org.trialEndsAt.toISOString(),
        }),
      },
    })
  }

  if (!hasMinPlan(effectivePlan, minPlan)) {
    return NextResponse.json(
      {
        error: `This feature requires ${minPlan} plan or higher`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: effectivePlan,
        requiredPlan: minPlan,
      },
      { status: 403 }
    )
  }

  return user
}

// Downgrade expired trials — can be called by a cron job or manually
export async function downgradeExpiredTrials(): Promise<{ downgraded: number }> {
  const now = new Date()

  const expiredOrgs = await db.organization.findMany({
    where: {
      trialEndsAt: { lt: now },
      plan: { not: Plan.FREE },
    },
    select: { id: true, plan: true, trialEndsAt: true },
  })

  for (const org of expiredOrgs) {
    await db.organization.update({
      where: { id: org.id },
      data: { plan: Plan.FREE },
    })

    await db.auditLog.create({
      data: {
        action: 'trial.expired_downgrade',
        targetType: 'organization',
        targetId: org.id,
        metadata: JSON.stringify({
          fromPlan: org.plan,
          toPlan: Plan.FREE,
          trialEndsAt: org.trialEndsAt?.toISOString(),
        }),
      },
    })
  }

  return { downgraded: expiredOrgs.length }
}

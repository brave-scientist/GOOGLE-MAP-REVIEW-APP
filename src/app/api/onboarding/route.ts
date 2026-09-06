import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role, Plan } from '@prisma/client'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { generateBusinessSlug } from '@/lib/review-platforms'
import { isValidIanaTimezone } from '@/lib/reports/timezone-scheduler'
import { isGoogleConnectionUsable, isGoogleConfigured } from '@/lib/integrations/google-business-profile'
import { isFacebookConfigured } from '@/lib/integrations/facebook-graph'

export const dynamic = 'force-dynamic'

export type LocationReadinessState =
  | 'no_location'
  | 'location_setup_required'
  | 'location_configured'
  | 'integration_pending'
  | 'ready_for_sync'

export function resolveLocationReadiness(params: {
  hasBusiness: boolean
  hasName: boolean
  hasIndustry: boolean
  googleConnected: boolean
  googleLocationVerified?: boolean
  facebookConnected: boolean
  linksConfigured: boolean
  reviewCount?: number
  realReviewCount?: number
}): LocationReadinessState {
  if (!params.hasBusiness) return 'no_location'
  if (!params.hasName || !params.hasIndustry) return 'location_setup_required'
  // ready_for_sync MUST mean the selected location has been server-verified and system can actually sync.
  // Mere token existence, link configuration, or demo reviews must NOT produce ready_for_sync.
  if (params.googleLocationVerified) return 'ready_for_sync'
  if (params.googleConnected || params.facebookConnected || params.linksConfigured) return 'integration_pending'
  return 'location_configured'
}

import { resolveDashboardReadiness, getBusinessDashboardReadiness, type DashboardReadiness } from '@/lib/readiness'
export { resolveDashboardReadiness, getBusinessDashboardReadiness, type DashboardReadiness }


// GET /api/onboarding — Fetch complete onboarding state for authenticated tenant
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const org = await db.organization.findUnique({
      where: { id: ctx.orgId },
      select: {
        id: true,
        name: true,
        plan: true,
        trialEndsAt: true,
        onboardingStep: true,
        onboardingCompletedAt: true,
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          take: 1,
        },
      },
    })

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const requestedBusinessId = searchParams.get('businessId')

    let businessId: string | null = null
    if (requestedBusinessId) {
      const denied = assertBusinessOwnership(ctx, requestedBusinessId)
      if (denied) return denied
      businessId = requestedBusinessId
    } else if (ctx.businessIds.length > 0) {
      businessId = ctx.businessIds[0]
    }

    let business: {
      id: string
      name: string
      industry: string | null
      slug: string | null
      timezone?: string | null
      googleLocationId?: string | null
      googlePlaceId?: string | null
      googleLocationVerified?: boolean
      googleSyncStatus?: string | null
      googleSyncError?: string | null
      googleSyncedAt?: string | null
      facebookPageId?: string | null
    } | null = null
    let links: Array<{
      id: string
      platformId: string | null
      customName: string | null
      customIconUrl: string | null
      url: string
      enabled: boolean
      sortOrder: number
    }> = []
    let brandVoice: { id: string; toneGuidelines: string; signature: string; forbiddenPhrases: string; examples: string } | null = null
    let testInviteSent = false
    let googleConnected = false
    let googleOAuthConnected = false
    let googleLocationSelected = false
    let googleLocationVerified = false
    let googleConnectionHealthy = false
    let googleSyncStatus: string = 'not_started'
    let googleSyncError: string | null = null
    let googleSyncedAt: string | null = null
    let initialSyncStarted = false
    let initialSyncCompleted = false
    let facebookConnected = false
    let reviewCount = 0
    let realGoogleReviewCount = 0

    if (businessId) {
      const [biz, dbLinks, bv, sendsCount, reqCount, googleToken, fbToken, revCount, realGoogleCount] = await Promise.all([
        db.business.findUnique({
          where: { id: businessId },
          select: {
            id: true,
            name: true,
            industry: true,
            slug: true,
            timezone: true,
            facebookPageId: true,
            googleLocationId: true,
            googlePlaceId: true,
            googleLocationVerified: true,
            googleSyncStatus: true,
            googleSyncError: true,
            googleSyncedAt: true,
          },
        }),
        db.reviewPlatformLink.findMany({
          where: { businessId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        db.brandVoiceProfile.findUnique({
          where: { businessId },
        }),
        db.reviewUsSend.count({
          where: { businessId },
        }),
        db.reviewRequest.count({
          where: { businessId },
        }),
        db.oAuthToken.findUnique({
          where: {
            businessId_provider: {
              businessId,
              provider: 'google',
            },
          },
        }),
        db.oAuthToken.findUnique({
          where: {
            businessId_provider: {
              businessId,
              provider: 'facebook',
            },
          },
        }),
        db.review.count({
          where: { businessId },
        }),
        db.review.count({
          where: {
            businessId,
            source: 'GOOGLE',
            externalId: { not: { startsWith: 'seed_' } },
          },
        }),
      ])

      business = biz ? {
        id: biz.id,
        name: biz.name,
        industry: biz.industry,
        slug: biz.slug,
        timezone: biz.timezone,
        googleLocationId: biz.googleLocationId,
        googlePlaceId: biz.googlePlaceId,
        googleLocationVerified: biz.googleLocationVerified,
        googleSyncStatus: biz.googleSyncStatus,
        googleSyncError: biz.googleSyncError,
        googleSyncedAt: biz.googleSyncedAt ? biz.googleSyncedAt.toISOString() : null,
        facebookPageId: biz.facebookPageId,
      } : null

      links = dbLinks.map(l => ({
        id: l.id,
        platformId: l.platformId,
        customName: l.customName,
        customIconUrl: l.customIconUrl,
        url: l.url,
        enabled: l.enabled,
        sortOrder: l.sortOrder,
      }))
      brandVoice = bv
      testInviteSent = sendsCount > 0 || reqCount > 0

      googleOAuthConnected = Boolean(googleToken)
      googleConnected = googleOAuthConnected
      googleLocationSelected = Boolean(biz?.googleLocationId && biz.googleLocationId !== 'google_connected')
      googleLocationVerified = Boolean(biz?.googleLocationVerified)
      const isAuthRevoked = Boolean(
        biz?.googleSyncStatus === 'failed' &&
        (biz?.googleSyncError?.includes('expired') ||
         biz?.googleSyncError?.includes('reconnect') ||
         biz?.googleSyncError?.includes('revoked'))
      )
      const isGoogleUsable = (googleOAuthConnected && businessId)
        ? await isGoogleConnectionUsable(businessId)
        : false
      googleConnectionHealthy = Boolean(googleOAuthConnected && isGoogleUsable && !isAuthRevoked)
      googleSyncStatus = biz?.googleSyncStatus || (googleLocationVerified ? 'ready' : 'not_started')
      googleSyncError = biz?.googleSyncError || null
      googleSyncedAt = biz?.googleSyncedAt ? biz.googleSyncedAt.toISOString() : null
      initialSyncStarted = Boolean(biz?.googleSyncStatus === 'syncing' || biz?.googleSyncStatus === 'completed' || biz?.googleSyncedAt)
      initialSyncCompleted = Boolean(biz?.googleSyncStatus === 'completed')

      facebookConnected = Boolean(fbToken || biz?.facebookPageId)
      reviewCount = revCount
      realGoogleReviewCount = realGoogleCount
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const effectiveSlug = business?.slug || (business?.name ? generateBusinessSlug(business.name) : '')
    const reviewUsUrl = effectiveSlug ? `${appUrl}/review-us/${effectiveSlug}` : null
    const reviewLinksConfigured = links.some(l => l.enabled && l.url.trim().length > 0)

    const hasBusiness = Boolean(business)
    const hasName = Boolean(business?.name && business.name.trim().length > 0)
    const hasIndustry = Boolean(business?.industry && business.industry.trim().length > 0)

    const locationReadiness = resolveLocationReadiness({
      hasBusiness,
      hasName,
      hasIndustry,
      googleConnected,
      googleLocationVerified,
      facebookConnected,
      linksConfigured: reviewLinksConfigured,
      reviewCount,
      realReviewCount: realGoogleReviewCount,
    })

    const isPaidPlan = org.plan !== Plan.FREE
    const isTrialActive = Boolean(org.trialEndsAt && org.trialEndsAt > new Date())
    const activeSub = org.subscriptions?.[0]
    const billingSetupCompleted = !isPaidPlan || isTrialActive || Boolean(activeSub)
    const billingActionRequired = (!org.plan || (org.plan === Plan.FREE && org.onboardingStep === 2))
      ? 'select_plan'
      : !billingSetupCompleted
      ? 'checkout'
      : 'none'

    // Unified Server-Authoritative Dashboard Readiness
    const dashboardReadiness = resolveDashboardReadiness({
      hasSession: Boolean(ctx.user),
      hasBusiness: Boolean(hasBusiness && hasName),
      googleOAuthConnected,
      googleConnectionHealthy,
      googleLocationSelected,
      googleLocationVerified,
      initialSyncCompleted,
      googleSyncStatus,
      realGoogleReviewCount,
    })

    // Unified Server-Authoritative Integration Health representation
    const googleConfigured = isGoogleConfigured()
    const googleActionRequired = !googleConfigured
      ? 'configure'
      : !googleOAuthConnected
      ? 'connect'
      : !googleConnectionHealthy
      ? 'reconnect'
      : !googleLocationSelected
      ? 'select_location'
      : !googleLocationVerified
      ? 'verify_location'
      : !initialSyncCompleted
      ? 'initial_sync'
      : 'none'

    const fbActionRequired = !isFacebookConfigured()
      ? 'configure'
      : !facebookConnected
      ? 'connect'
      : !business?.facebookPageId
      ? 'select_page'
      : 'none'

    const integrationHealth = [
      {
        provider: 'google',
        name: 'Google Business Profile',
        connected: googleOAuthConnected,
        healthy: googleConnectionHealthy,
        actionRequired: googleActionRequired,
        lastSuccessfulSync: googleSyncedAt,
        syncStatus: googleSyncStatus,
        safeErrorMessage: googleSyncError,
        locationId: googleLocationSelected ? business?.googleLocationId : null,
        locationVerified: googleLocationVerified,
        realReviewCount: realGoogleReviewCount,
        usable: googleConnectionHealthy,
        configured: googleConfigured,
      },
      {
        provider: 'facebook',
        name: 'Facebook Pages',
        connected: facebookConnected,
        healthy: facebookConnected && isFacebookConfigured(),
        actionRequired: fbActionRequired,
        lastSuccessfulSync: null,
        syncStatus: facebookConnected ? 'ready' : 'not_configured',
        safeErrorMessage: null,
        configured: isFacebookConfigured(),
      },
    ]

    const onboardingStatus = {
      accountSetupCompleted: true,
      orgSetupCompleted: true,
      planConfirmed: Boolean(org.plan),
      selectedPlan: org.plan,
      billingSetupCompleted,
      billingActionRequired,
      googleConnected,
      googleConfigured,
      googleOAuthConnected,
      googleLocationSelected,
      googleLocationVerified,
      googleConnectionHealthy,
      googleSyncStatus,
      googleSyncError,
      googleSyncedAt,
      initialSyncStarted,
      initialSyncCompleted,
      realGoogleReviewCount,
      facebookConnected,
      firstLocationConfigured: hasBusiness && hasName,
      primaryBusinessId: business?.id || null,
      step: org.onboardingStep,
      initialSyncCompletedServer: initialSyncCompleted,
      locationReadiness,
      isReadyForCompletion: Boolean(hasBusiness && hasName),
      dashboardReadiness,
      isDashboardReady: dashboardReadiness.isReady,
      dashboardReadinessReason: dashboardReadiness.reason,
    }

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
        onboardingStep: org.onboardingStep,
        onboardingCompleted: Boolean(org.onboardingCompletedAt),
        onboardingCompletedAt: org.onboardingCompletedAt ? org.onboardingCompletedAt.toISOString() : null,
      },
      business,
      reviewLinks: links,
      brandVoice: brandVoice ? {
        toneGuidelines: brandVoice.toneGuidelines,
        signature: brandVoice.signature,
        forbiddenPhrases: brandVoice.forbiddenPhrases,
        examples: JSON.parse(brandVoice.examples || '[]'),
      } : null,
      firstValue: {
        reviewUsUrl,
        reviewLinksConfigured,
        testInviteSent,
        googleConnected,
        googleLocationVerified,
        realGoogleReviewCount,
      },
      onboardingStatus,
      locationReadiness,
      integrationHealth,
      dashboardReadiness,
    })
  } catch (error) {
    console.error('Onboarding GET error:', error)
    return NextResponse.json({ error: 'Failed to retrieve onboarding state' }, { status: 500 })
  }
}

// POST /api/onboarding — Update onboarding step, plan, location, or persist completion
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // SEC-ROLE: Only OWNER, ADMIN, AGENCY_ADMIN, CLIENT_ADMIN may mutate organization onboarding state
  const ALLOWED_ONBOARDING_ROLES: Role[] = [
    Role.OWNER,
    Role.ADMIN,
    Role.AGENCY_ADMIN,
    Role.CLIENT_ADMIN,
  ]
  if (!ALLOWED_ONBOARDING_ROLES.includes(ctx.user.role)) {
    return NextResponse.json(
      {
        error: 'Permission denied. Only organization owners and administrators can configure onboarding.',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { action } = body

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'Action is required', code: 'MISSING_ACTION' }, { status: 400 })
    }

    if (action === 'set-step') {
      const stepNumber = Number(body.step)
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 4) {
        return NextResponse.json({ error: 'Step must be an integer between 1 and 4', code: 'INVALID_STEP' }, { status: 400 })
      }

      await db.organization.update({
        where: { id: ctx.orgId },
        data: { onboardingStep: stepNumber },
      })

      return NextResponse.json({ success: true, step: stepNumber })
    }

    if (action === 'select-plan') {
      const requestedPlan = body.plan
      const ALLOWED_PLANS: Plan[] = [Plan.FREE, Plan.STARTER, Plan.PRO, Plan.ENTERPRISE, Plan.AGENCY]
      const upperPlan = typeof requestedPlan === 'string' ? requestedPlan.trim().toUpperCase() : ''
      const matchedPlan = ALLOWED_PLANS.find(p => p === upperPlan)

      if (!matchedPlan) {
        return NextResponse.json(
          {
            error: `Invalid plan: "${requestedPlan}". Choose from: FREE, STARTER, PRO, ENTERPRISE, AGENCY`,
            code: 'INVALID_PLAN',
          },
          { status: 400 }
        )
      }

      // Fetch existing organization state to evaluate trial and subscription lifecycle
      const org = await db.organization.findUnique({
        where: { id: ctx.orgId },
        select: {
          id: true,
          plan: true,
          trialEndsAt: true,
          stripeSubscriptionStatus: true,
          subscriptions: {
            where: { status: { in: ['active', 'trialing'] } },
            take: 1,
          },
        },
      })

      if (!org) {
        return NextResponse.json({ error: 'Organization not found', code: 'NOT_FOUND' }, { status: 404 })
      }

      const hasActiveSub = Boolean(
        org.stripeSubscriptionStatus === 'active' ||
        org.subscriptions?.[0]
      )
      const hasActiveTrial = Boolean(org.trialEndsAt && org.trialEndsAt > new Date())

      // 1. Switching to FREE is explicitly supported
      if (matchedPlan === Plan.FREE) {
        await db.organization.update({
          where: { id: ctx.orgId },
          data: {
            plan: Plan.FREE,
            trialEndsAt: null,
          },
        })

        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'organization.plan_selected',
            targetType: 'organization',
            targetId: ctx.orgId,
            metadata: JSON.stringify({
              userId: ctx.user.id,
              plan: Plan.FREE,
              trialEndsAt: null,
            }),
          },
        })

        return NextResponse.json({
          success: true,
          plan: Plan.FREE,
          trialEndsAt: null,
          requiresCheckout: false,
        })
      }

      // 2. Paid plan requested
      // Hardening against JOB-20.1 vulnerability:
      // - Active trial (established at signup): allow evaluating selected plan, strictly PRESERVE trialEndsAt.
      // - No active trial & no subscription (FREE or expired): client POST must NOT escalate entitlements.
      //   Entitled plan remains Plan.FREE until confirmed by Stripe checkout.
      let effectiveTrialEndsAt: Date | null = org.trialEndsAt
      let updatedPlan: Plan = org.plan

      if (hasActiveTrial) {
        updatedPlan = matchedPlan
        // Update plan evaluation during trial, but strictly preserve existing trialEndsAt (no reset!)
        await db.organization.update({
          where: { id: ctx.orgId },
          data: {
            plan: updatedPlan,
          },
        })
      } else if (hasActiveSub) {
        // Active Stripe subscriber: subscription plan governed by Stripe, not direct POST
        updatedPlan = org.plan
      } else {
        // Org on FREE without active trial: cannot escalate entitlements merely by client POST
        updatedPlan = Plan.FREE
        effectiveTrialEndsAt = null
      }

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'organization.plan_selected',
          targetType: 'organization',
          targetId: ctx.orgId,
          metadata: JSON.stringify({
            userId: ctx.user.id,
            requestedPlan: matchedPlan,
            entitledPlan: updatedPlan,
            trialEndsAt: effectiveTrialEndsAt?.toISOString() || null,
            hasActiveTrial,
            hasActiveSub,
          }),
        },
      })

      return NextResponse.json({
        success: true,
        plan: matchedPlan,
        entitledPlan: updatedPlan,
        trialEndsAt: effectiveTrialEndsAt?.toISOString() || null,
        requiresCheckout: true,
      })
    }

    if (action === 'setup-location') {
      const { businessId, name, industry, address, phone, timezone } = body
      const trimmedName = typeof name === 'string' ? name.trim() : ''

      if (!trimmedName || trimmedName.length > 100) {
        return NextResponse.json(
          { error: 'Location name is required and must be under 100 characters', code: 'INVALID_LOCATION_NAME' },
          { status: 400 }
        )
      }

      // PHASE 11: Validate IANA timezone string reusing existing JOB-18 helper
      if (timezone !== undefined && timezone !== null) {
        if (typeof timezone !== 'string' || !isValidIanaTimezone(timezone)) {
          return NextResponse.json(
            { error: 'Invalid IANA timezone identifier', code: 'INVALID_TIMEZONE' },
            { status: 400 }
          )
        }
      }

      let targetBusinessId: string
      const validatedTimezone = typeof timezone === 'string' && isValidIanaTimezone(timezone)
        ? timezone.trim()
        : undefined

      if (businessId) {
        // Enforce strict tenant ownership on business updates
        const denied = assertBusinessOwnership(ctx, businessId)
        if (denied) return denied

        const updated = await db.business.update({
          where: { id: businessId },
          data: {
            name: trimmedName,
            industry: typeof industry === 'string' ? industry.trim() : undefined,
            address: typeof address === 'string' ? address.trim() : undefined,
            phone: typeof phone === 'string' ? phone.trim() : undefined,
            timezone: validatedTimezone,
          },
          select: { id: true, name: true, industry: true, slug: true },
        })
        targetBusinessId = updated.id
      } else {
        // If org already has a business, update the primary to prevent duplicates
        if (ctx.businessIds.length > 0) {
          const primaryId = ctx.businessIds[0]
          const updated = await db.business.update({
            where: { id: primaryId },
            data: {
              name: trimmedName,
              industry: typeof industry === 'string' ? industry.trim() : undefined,
              address: typeof address === 'string' ? address.trim() : undefined,
              phone: typeof phone === 'string' ? phone.trim() : undefined,
              timezone: validatedTimezone,
            },
            select: { id: true, name: true, industry: true, slug: true },
          })
          targetBusinessId = updated.id
        } else {
          // Create initial business for tenant
          const created = await db.business.create({
            data: {
              orgId: ctx.orgId,
              ownerId: ctx.user.id,
              name: trimmedName,
              industry: typeof industry === 'string' ? industry.trim() : 'restaurant',
              address: typeof address === 'string' ? address.trim() : null,
              phone: typeof phone === 'string' ? phone.trim() : null,
              timezone: validatedTimezone || 'America/New_York',
            },
            select: { id: true, name: true, industry: true, slug: true },
          })
          targetBusinessId = created.id
        }
      }

      return NextResponse.json({
        success: true,
        businessId: targetBusinessId,
        locationReadiness: 'location_configured',
      })
    }

    if (action === 'complete') {
      // SEC-FORGERY: Verify server-derived readiness before allowing completion.
      // An empty organization without any configured business cannot mark onboarding complete.
      const businessCount = await db.business.count({
        where: {
          orgId: ctx.orgId,
          name: { not: '' },
        },
      })

      if (businessCount === 0) {
        return NextResponse.json(
          {
            error: 'Cannot complete onboarding: At least one business location must be configured.',
            code: 'LOCATION_REQUIRED',
          },
          { status: 400 }
        )
      }

      const org = await db.organization.findUnique({
        where: { id: ctx.orgId },
        select: { onboardingCompletedAt: true },
      })

      // Compute authoritative dashboard readiness for the primary business
      const primaryBiz = ctx.businessIds.length > 0
        ? await db.business.findUnique({ where: { id: ctx.businessIds[0] } })
        : null
      const dashboardReadiness = await getBusinessDashboardReadiness(primaryBiz, Boolean(ctx.user))

      if (!org?.onboardingCompletedAt && dashboardReadiness.isReady) {
        const completedAt = new Date()
        await db.organization.update({
          where: { id: ctx.orgId },
          data: {
            onboardingCompletedAt: completedAt,
            onboardingStep: 3,
          },
        })

        await db.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'organization.onboarding_completed',
            targetType: 'organization',
            targetId: ctx.orgId,
            metadata: JSON.stringify({
              userId: ctx.user.id,
              completedAt: completedAt.toISOString(),
            }),
          },
        })
      }

      return NextResponse.json({
        success: true,
        onboardingCompleted: dashboardReadiness.isReady,
        redirectTo: dashboardReadiness.isReady ? '/dashboard' : '/onboarding',
        dashboardReady: dashboardReadiness.isReady,
        dashboardReadiness,
      })
    }

    return NextResponse.json({ error: `Unsupported action: ${action}`, code: 'UNSUPPORTED_ACTION' }, { status: 400 })
  } catch (error) {
    console.error('Onboarding POST error:', error)
    return NextResponse.json({ error: 'Failed to update onboarding state', code: 'ONBOARDING_ERROR' }, { status: 500 })
  }
}

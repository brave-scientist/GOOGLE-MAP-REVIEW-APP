import { db } from '@/lib/db'
import { isGoogleConnectionUsable } from '@/lib/integrations/google-business-profile'

export interface DashboardReadiness {
  isReady: boolean
  status: 'ready' | 'not_ready'
  headline: string
  reason: string
  message: string
  actionRequired: string | null
  realGoogleReviewCount: number
  googleLocationVerified: boolean
  initialSyncCompleted: boolean
  googleConnectionHealthy: boolean
  googleConnected: boolean
  locationVerified: boolean
}

/**
 * Pure evaluation function for dashboard readiness state.
 * Shared between /api/onboarding and /api/dashboard to guarantee
 * identical, server-authoritative readiness semantics across endpoints.
 */
export function resolveDashboardReadiness(params: {
  hasSession: boolean
  hasBusiness: boolean
  googleOAuthConnected: boolean
  googleConnectionHealthy: boolean
  googleLocationSelected: boolean
  googleLocationVerified: boolean
  initialSyncCompleted: boolean
  googleSyncStatus: string
  realGoogleReviewCount: number
}): DashboardReadiness {
  if (!params.hasSession || !params.hasBusiness) {
    return {
      isReady: false,
      status: 'not_ready',
      headline: 'Setup Required',
      reason: 'Business location configuration required',
      message: 'Business location configuration required',
      actionRequired: 'Configure business location',
      realGoogleReviewCount: 0,
      googleLocationVerified: false,
      initialSyncCompleted: false,
      googleConnectionHealthy: false,
      googleConnected: false,
      locationVerified: false,
    }
  }

  if (!params.googleOAuthConnected) {
    return {
      isReady: false,
      status: 'not_ready',
      headline: 'Connect Google Business Profile',
      reason: 'Connect Google Business Profile to enable review synchronization',
      message: 'Connect Google Business Profile to enable review synchronization',
      actionRequired: 'Connect Google Business Profile',
      realGoogleReviewCount: 0,
      googleLocationVerified: false,
      initialSyncCompleted: false,
      googleConnectionHealthy: false,
      googleConnected: false,
      locationVerified: false,
    }
  }

  if (!params.googleConnectionHealthy) {
    return {
      isReady: false,
      status: 'not_ready',
      headline: 'Connection Action Required',
      reason: 'Google authorization expired or revoked. Please reconnect your account.',
      message: 'Google authorization expired or revoked. Please reconnect your account.',
      actionRequired: 'Reconnect Google account',
      realGoogleReviewCount: 0,
      googleLocationVerified: params.googleLocationVerified,
      initialSyncCompleted: params.initialSyncCompleted,
      googleConnectionHealthy: false,
      googleConnected: true,
      locationVerified: params.googleLocationVerified,
    }
  }

  if (!params.googleLocationSelected) {
    return {
      isReady: false,
      status: 'not_ready',
      headline: 'Location Selection Required',
      reason: 'Please select your business location from your Google account',
      message: 'Please select your business location from your Google account',
      actionRequired: 'Select your business location',
      realGoogleReviewCount: 0,
      googleLocationVerified: false,
      initialSyncCompleted: false,
      googleConnectionHealthy: true,
      googleConnected: true,
      locationVerified: false,
    }
  }

  if (!params.googleLocationVerified) {
    return {
      isReady: false,
      status: 'not_ready',
      headline: 'Location Verification Required',
      reason: 'Selected location requires server verification before synchronization',
      message: 'Selected location requires server verification before synchronization',
      actionRequired: 'Location verification required',
      realGoogleReviewCount: 0,
      googleLocationVerified: false,
      initialSyncCompleted: false,
      googleConnectionHealthy: true,
      googleConnected: true,
      locationVerified: false,
    }
  }

  if (!params.initialSyncCompleted) {
    const isSyncing = params.googleSyncStatus === 'syncing'
    const isFailed = params.googleSyncStatus === 'failed'
    return {
      isReady: false,
      status: 'not_ready',
      headline: isSyncing ? 'Sync In Progress' : isFailed ? 'Sync Failed' : 'Initial Sync Pending',
      reason: isSyncing
        ? 'Initial review sync is currently in progress'
        : isFailed
        ? 'Initial review sync failed. Please retry.'
        : 'Initial review sync must be completed before dashboard activation',
      message: isSyncing
        ? 'Initial review sync is currently in progress'
        : isFailed
        ? 'Initial review sync failed. Please retry.'
        : 'Initial review sync must be completed before dashboard activation',
      actionRequired: isSyncing
        ? 'Initial sync in progress'
        : isFailed
        ? 'Retry initial sync'
        : 'Start initial sync',
      realGoogleReviewCount: 0,
      googleLocationVerified: true,
      initialSyncCompleted: false,
      googleConnectionHealthy: true,
      googleConnected: true,
      locationVerified: true,
    }
  }

  // Authoritative READY state — 0 reviews found is a completely valid and ready synchronization state
  const reviewCountMsg = params.realGoogleReviewCount === 0
    ? '0 Google reviews found'
    : `${params.realGoogleReviewCount} Google review${params.realGoogleReviewCount === 1 ? '' : 's'} synchronized`

  return {
    isReady: true,
    status: 'ready',
    headline: 'Dashboard Ready',
    reason: `Ready — ${reviewCountMsg}`,
    message: `Ready — ${reviewCountMsg}`,
    actionRequired: null,
    realGoogleReviewCount: params.realGoogleReviewCount,
    googleLocationVerified: true,
    initialSyncCompleted: true,
    googleConnectionHealthy: true,
    googleConnected: true,
    locationVerified: true,
  }
}

/**
 * Server-side helper to compute authoritative dashboard readiness for a business.
 * Validates actual token usability via isGoogleConnectionUsable(), enforces server-verified location,
 * and requires googleSyncStatus === 'completed'.
 */
export async function getBusinessDashboardReadiness(
  business: {
    id: string
    name?: string | null
    googleLocationId?: string | null
    googleLocationVerified?: boolean | null
    googleSyncStatus?: string | null
    googleSyncError?: string | null
  } | null | undefined,
  hasSession = true
): Promise<DashboardReadiness> {
  if (!business) {
    return resolveDashboardReadiness({
      hasSession,
      hasBusiness: false,
      googleOAuthConnected: false,
      googleConnectionHealthy: false,
      googleLocationSelected: false,
      googleLocationVerified: false,
      initialSyncCompleted: false,
      googleSyncStatus: 'not_started',
      realGoogleReviewCount: 0,
    })
  }

  const googleToken = await db.oAuthToken.findUnique({
    where: {
      businessId_provider: {
        businessId: business.id,
        provider: 'google',
      },
    },
    select: { id: true },
  })
  const googleOAuthConnected = Boolean(googleToken)
  const isGoogleUsable = (googleOAuthConnected && business.id)
    ? await isGoogleConnectionUsable(business.id)
    : false

  const isAuthRevoked = Boolean(
    business.googleSyncStatus === 'failed' &&
    (business.googleSyncError?.includes('expired') ||
     business.googleSyncError?.includes('reconnect') ||
     business.googleSyncError?.includes('revoked'))
  )
  const googleConnectionHealthy = Boolean(googleOAuthConnected && isGoogleUsable && !isAuthRevoked)
  const googleLocationSelected = Boolean(business.googleLocationId && business.googleLocationId !== 'google_connected')
  const googleLocationVerified = Boolean(business.googleLocationVerified)

  // Authoritative readiness invariant: initialSyncCompleted strictly requires googleSyncStatus === 'completed'
  const initialSyncCompleted = Boolean(business.googleSyncStatus === 'completed')

  const realGoogleReviewCount = await db.review.count({
    where: {
      businessId: business.id,
      source: 'GOOGLE',
      externalId: { not: { startsWith: 'seed_' } },
    },
  })

  return resolveDashboardReadiness({
    hasSession,
    hasBusiness: Boolean(business.name && business.name.trim().length > 0),
    googleOAuthConnected,
    googleConnectionHealthy,
    googleLocationSelected,
    googleLocationVerified,
    initialSyncCompleted,
    googleSyncStatus: business.googleSyncStatus || (googleLocationVerified ? 'ready' : 'not_started'),
    realGoogleReviewCount,
  })
}

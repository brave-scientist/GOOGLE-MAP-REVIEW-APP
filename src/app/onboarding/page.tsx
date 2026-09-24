'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Star, ArrowRight, ArrowLeft, Check, Sparkles, Globe, MessageSquare,
  Copy, CheckCircle2, AlertCircle, Loader2, ExternalLink,
  ShieldCheck, Send, RefreshCw, MapPin, Building2, CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  REVIEW_PLATFORMS,
  generateBusinessSlug,
  type ReviewPlatform,
} from '@/lib/review-platforms'
import QRCodeLib from 'qrcode'

interface ReviewLinkItem {
  id?: string
  platformId?: string | null
  customName?: string | null
  customIconUrl?: string | null
  url: string
  enabled: boolean
  sortOrder: number
}

interface DiscoveredLocation {
  id: string
  name: string
  title: string
  placeId?: string
  accountName?: string
}

interface OnboardingState {
  organization: {
    id: string
    name: string
    plan: string
    onboardingStep: number
    onboardingCompleted: boolean
    onboardingCompletedAt: string | null
  }
  business: {
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
  } | null
  reviewLinks: ReviewLinkItem[]
  brandVoice: {
    toneGuidelines: string
    signature: string
    forbiddenPhrases: string
    examples: Array<{ reviewText: string; replyText: string }>
  } | null
  firstValue: {
    reviewUsUrl: string | null
    reviewLinksConfigured: boolean
    testInviteSent: boolean
    googleConnected: boolean
    googleLocationVerified?: boolean
    realGoogleReviewCount?: number
  }
  onboardingStatus?: {
    accountSetupCompleted: boolean
    orgSetupCompleted: boolean
    planConfirmed: boolean
    selectedPlan: string
    billingSetupCompleted: boolean
    billingActionRequired?: string
    googleConnected: boolean
    googleConfigured?: boolean
    googleOAuthConnected: boolean
    googleLocationSelected: boolean
    googleLocationVerified: boolean
    googleConnectionHealthy: boolean
    googleSyncStatus: string
    googleSyncError: string | null
    googleSyncedAt: string | null
    initialSyncStarted: boolean
    initialSyncCompleted: boolean
    realGoogleReviewCount: number
    facebookConnected: boolean
    firstLocationConfigured: boolean
    primaryBusinessId?: string | null
    initialSyncCompletedServer: boolean
    locationReadiness: string
    isReadyForCompletion: boolean
    dashboardReadiness?: {
      isReady: boolean
      status: 'ready' | 'not_ready'
      headline: string
      reason: string
      realGoogleReviewCount: number
      googleLocationVerified: boolean
      initialSyncCompleted: boolean
      googleConnectionHealthy: boolean
    }
  }
  locationReadiness?: string
  integrationHealth?: Array<{
    provider: string
    name: string
    connected: boolean
    healthy: boolean
    actionRequired: string
    lastSuccessfulSync: string | null
    syncStatus: string
    safeErrorMessage: string | null
    locationId?: string | null
    locationVerified?: boolean
    realReviewCount?: number
    configured?: boolean
    usable?: boolean
  }>
  dashboardReadiness?: {
    isReady: boolean
    status: 'ready' | 'not_ready'
    headline: string
    reason: string
    realGoogleReviewCount: number
    googleLocationVerified: boolean
    initialSyncCompleted: boolean
    googleConnectionHealthy: boolean
  }
}

const TONE_PRESETS = [
  {
    name: 'Warm & Welcoming',
    desc: 'Friendly, personalized, grateful, and hospitable.',
    text: 'We are warm, welcoming, and deeply appreciative of our guests. We greet them by first name, mention specific details they shared, keep replies to 2-3 heartfelt sentences, and always warmly invite them back.',
  },
  {
    name: 'Professional & Direct',
    desc: 'Polite, efficient, resolution-focused, and authoritative.',
    text: 'We maintain a professional, respectful, and solution-oriented tone. We thank the reviewer, address their specific feedback with clarity and precision, and maintain brand authority.',
  },
  {
    name: 'Casual & Local',
    desc: 'Down-to-earth, energetic, conversational neighborhood vibe.',
    text: 'We are casual, authentic, and proud of our community. We speak like a helpful neighbor, using relaxed language while remaining respectful, energetic, and engaging.',
  },
]

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)

  // Server state
  const [data, setData] = useState<OnboardingState | null>(null)

  // Step 1 Form State
  const [slug, setSlug] = useState('')
  const [links, setLinks] = useState<ReviewLinkItem[]>([])

  // Location discovery & sync state
  const [discoveredLocations, setDiscoveredLocations] = useState<DiscoveredLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [selectingLocation, setSelectingLocation] = useState(false)
  const [syncingReviews, setSyncingReviews] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<{
    status: 'success' | 'error' | 'syncing'
    message: string
  } | null>(null)

  // Step 2 Form State
  const [toneGuidelines, setToneGuidelines] = useState('')
  const [signature, setSignature] = useState('')
  const [forbiddenPhrases, setForbiddenPhrases] = useState('')

  // Step 3 State
  const [testContact, setTestContact] = useState('')
  const [testChannel, setTestChannel] = useState<'sms' | 'email'>('email')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testSendResult, setTestSendResult] = useState<{
    status: 'success' | 'error'
    message: string
  } | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Session & Recovery state
  const [sessionExpired, setSessionExpired] = useState(false)

  // Primary Business Setup Form State (for zero-business tenants)
  const [bizName, setBizName] = useState('')
  const [bizIndustry, setBizIndustry] = useState('restaurant')
  const [bizTimezone, setBizTimezone] = useState('America/New_York')
  const [settingUpBiz, setSettingUpBiz] = useState(false)

  // Derive query parameter notices and errors without setState in effect
  const [dismissedError, setDismissedError] = useState(false)
  const [dismissedNotice, setDismissedNotice] = useState(false)

  const errorParam = searchParams.get('error')
  const googleParam = searchParams.get('google')
  const locationParam = searchParams.get('location')
  const pickerParam = searchParams.get('google_picker')

  const oauthError = (!dismissedError && errorParam) ? (
    errorParam === 'google_oauth_denied' ? 'Google authorization was cancelled. You can connect your Google account anytime.' :
    errorParam === 'access_denied' ? 'Access was denied during authorization.' :
    errorParam === 'location_already_attached' ? 'The selected Google location is already connected to another organization in ReviewReply.' :
    errorParam === 'oauth_state_missing_or_expired' ? 'Your authorization session expired. Please click Connect to try again.' :
    errorParam === 'oauth_state_mismatch' ? 'Security validation failed (state mismatch). Please try again.' :
    errorParam === 'oauth_user_mismatch' ? 'User session mismatch detected during authorization. Please reconnect.' :
    errorParam === 'google_token_failed' ? 'Failed to exchange authorization code with Google. Please retry.' :
    errorParam === 'google_callback_failed' ? 'An error occurred during authorization callback. Please retry.' :
    errorParam === 'google_not_configured' ? 'Google OAuth is not configured in this environment.' :
    `Authorization error: ${errorParam}`
  ) : null

  const oauthNotice = (!dismissedNotice && googleParam === 'connected') ? (
    locationParam
      ? `Google Business Profile connected and location verified: ${locationParam}`
      : pickerParam === 'true'
      ? 'Google account authorized. Please select your business location below.'
      : 'Google account connected successfully.'
  ) : null

  // Discover Google locations
  const fetchDiscoveredLocations = async (bizId?: string) => {
    const targetBizId = bizId || data?.business?.id
    if (!targetBizId) return
    setLocationsLoading(true)
    try {
      const res = await fetch(`/api/oauth/google/locations?businessId=${targetBizId}`)
      if (res.status === 401) {
        setSessionExpired(true)
        return
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to fetch locations')
      }
      const locData = await res.json()
      setDiscoveredLocations(locData.locations || [])
      if (locData.locations?.length > 0 && !selectedLocationId) {
        setSelectedLocationId(locData.locations[0].id)
      }
    } catch (err: any) {
      console.warn('Locations discovery error:', err?.message)
    } finally {
      setLocationsLoading(false)
    }
  }

  // Load server state
  const loadOnboardingState = async (_refreshOnly?: boolean) => {
    try {
      const res = await fetch('/api/onboarding')
      if (res.status === 401) {
        setSessionExpired(true)
        return
      }
      if (!res.ok) throw new Error('Failed to load onboarding state')
      const json: OnboardingState = await res.json()

      setData(json)

      // Hydrate Step 1
      const initialSlug = json.business?.slug || (json.business?.name ? generateBusinessSlug(json.business.name) : '')
      setSlug(initialSlug)

      if (json.reviewLinks && json.reviewLinks.length > 0) {
        setLinks(json.reviewLinks)
      } else {
        const popular = REVIEW_PLATFORMS.filter(p => p.popular).slice(0, 3)
        setLinks(popular.map((p, idx) => ({
          platformId: p.id,
          url: '',
          enabled: true,
          sortOrder: idx,
        })))
      }

      // Hydrate Step 2
      if (json.brandVoice) {
        setToneGuidelines(json.brandVoice.toneGuidelines || '')
        setSignature(json.brandVoice.signature || '')
        setForbiddenPhrases(json.brandVoice.forbiddenPhrases || '')
      } else if (json.business?.name) {
        setSignature(`— The ${json.business.name} Team`)
      }

      // Hydrate Step position from server-authoritative state
      if (json.organization?.onboardingStep && json.organization.onboardingStep >= 1 && json.organization.onboardingStep <= 3) {
        setStep(json.organization.onboardingStep)
      }

      // Auto-load locations if OAuth connected but no location selected yet
      if (json.business?.id && json.onboardingStatus?.googleOAuthConnected && !json.onboardingStatus?.googleLocationSelected) {
        fetchDiscoveredLocations(json.business.id)
      }
    } catch (err) {
      console.error('Onboarding load error:', err)
      toast.error('Unable to load onboarding state.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOnboardingState()
  }, [])

  // Create or update primary business location (for zero-business tenants)
  const handleSetupLocation = async () => {
    if (!bizName.trim()) {
      toast.error('Location name is required.')
      return
    }

    setSettingUpBiz(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setup-location',
          name: bizName.trim(),
          industry: bizIndustry.trim() || 'restaurant',
          timezone: bizTimezone.trim() || 'America/New_York',
        }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to save location.')
        return
      }

      toast.success('Location created successfully!')
      await loadOnboardingState(true)
    } catch {
      toast.error('Network error creating location.')
    } finally {
      setSettingUpBiz(false)
    }
  }

  // Switch to free plan if billing checkout is incomplete
  const handleSwitchToFreePlan = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select-plan', plan: 'FREE' }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to switch to Free plan.')
        return
      }

      toast.success('Plan set to Free.')
      await loadOnboardingState(true)
    } catch {
      toast.error('Network error switching to Free plan.')
    } finally {
      setSaving(false)
    }
  }

  // Select and verify Google location
  const handleSelectLocation = async () => {
    if (!data?.business?.id || !selectedLocationId) {
      toast.error('Please select a business location.')
      return
    }

    const loc = discoveredLocations.find(l => l.id === selectedLocationId)
    setSelectingLocation(true)
    try {
      const res = await fetch('/api/oauth/google/select-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: data.business.id,
          locationId: selectedLocationId,
          locationTitle: loc?.title || selectedLocationId,
          placeId: loc?.placeId || null,
        }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to verify location with Google.')
        return
      }

      toast.success('Location verified successfully!')
      await loadOnboardingState(true)
    } catch {
      toast.error('Network error verifying location.')
    } finally {
      setSelectingLocation(false)
    }
  }

  // Trigger initial review sync
  const handleStartInitialSync = async () => {
    if (!data?.business?.id) return
    if (syncingReviews) return // Duplicate click protection

    setSyncingReviews(true)
    setSyncFeedback({ status: 'syncing', message: 'Sync running... Querying Google Business Profile for customer reviews.' })

    try {
      const res = await fetch('/api/reviews/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: data.business.id }),
      })

      const json = await res.json()
      if (!res.ok) {
        if (res.status === 401 && json.code === 'UNAUTHORIZED') {
          setSessionExpired(true)
          return
        }
        const isAuthErr = res.status === 401 || json.code === 'GOOGLE_REAUTH_REQUIRED'
        const isRateLimit = res.status === 429 || json.code === 'RATE_LIMITED'
        const errMsg = isRateLimit
          ? 'Google API rate limit reached. Please wait a moment before retrying.'
          : isAuthErr
          ? 'Google authorization expired or revoked. Please reconnect your Google account.'
          : json.error || 'Review synchronization failed.'
        setSyncFeedback({
          status: 'error',
          message: errMsg,
        })
        toast.error('Review sync failed', { description: errMsg })
        await loadOnboardingState(true)
        return
      }

      const total = json.syncResult?.total ?? 0
      const countMsg = total === 0 ? '0 Google reviews found' : `${total} Google reviews synchronized`
      setSyncFeedback({
        status: 'success',
        message: `Sync completed successfully! ${countMsg}. Your business is ready.`,
      })
      toast.success('Initial review sync completed!', { description: countMsg })
      await loadOnboardingState(true)
    } catch {
      setSyncFeedback({
        status: 'error',
        message: 'Network error communicating with review synchronization service. Please retry.',
      })
      toast.error('Network error during review sync')
    } finally {
      setSyncingReviews(false)
    }
  }

  // Generate QR code when slug changes or step 3 is reached
  useEffect(() => {
    if (step === 3 && slug) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const fullUrl = `${origin}/review-us/${slug}`
      QRCodeLib.toDataURL(fullUrl, { width: 240, margin: 1 })
        .then(url => setQrCodeDataUrl(url))
        .catch(() => setQrCodeDataUrl(null))
    }
  }, [step, slug])

  const handleCopyReviewLink = () => {
    if (typeof window === 'undefined' || !slug) return
    const fullUrl = `${window.location.origin}/review-us/${slug}`
    navigator.clipboard.writeText(fullUrl)
    setCopiedLink(true)
    toast.success('Review link copied to clipboard!')
    setTimeout(() => setCopiedLink(false), 2500)
  }

  // Toggle platform in Step 1
  const togglePlatform = (p: ReviewPlatform) => {
    const existing = links.find(l => l.platformId === p.id)
    if (existing) {
      setLinks(links.map(l => l.platformId === p.id ? { ...l, enabled: !l.enabled } : l))
    } else {
      setLinks([...links, {
        platformId: p.id,
        url: '',
        enabled: true,
        sortOrder: links.length,
      }])
    }
  }

  const updateLinkUrl = (platformId: string, url: string) => {
    setLinks(links.map(l => l.platformId === platformId ? { ...l, url } : l))
  }

  // Persist step update to server
  const persistStep = async (newStep: number) => {
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-step', step: newStep }),
      })
    } catch {
      // Non-blocking step update
    }
  }

  // Save Step 1: Review Links
  const handleSaveStep1 = async () => {
    if (!data?.business?.id) {
      toast.error('No business associated with account.')
      return
    }

    const enabledLinks = links.filter(l => l.enabled && l.url.trim().length > 0)
    if (enabledLinks.length === 0) {
      toast.error('Please configure at least one review platform link.')
      return
    }

    // Validate URL protocol
    for (const link of enabledLinks) {
      try {
        const parsed = new URL(link.url)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          toast.error(`Invalid link protocol for ${link.platformId || 'custom'}. Must be http:// or https://`)
          return
        }
      } catch {
        toast.error(`Invalid URL: "${link.url}". Please enter a valid URL.`)
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/review-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: data.business.id,
          slug: slug.trim(),
          links: enabledLinks,
        }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to save review links')
        return
      }

      toast.success('Review destinations saved!')
      setStep(2)
      await persistStep(2)
    } catch {
      toast.error('Network error while saving review links')
    } finally {
      setSaving(false)
    }
  }

  // Save Step 2: Brand Voice
  const handleSaveStep2 = async () => {
    if (!data?.business?.id) {
      toast.error('No business associated with account.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/brand-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: data.business.id,
          toneGuidelines: toneGuidelines.trim(),
          signature: signature.trim(),
          forbiddenPhrases: forbiddenPhrases.trim(),
          examples: data.brandVoice?.examples || [],
        }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to save brand voice')
        return
      }

      toast.success('Brand voice profile saved!')
      setStep(3)
      await persistStep(3)
    } catch {
      toast.error('Network error while saving brand voice')
    } finally {
      setSaving(false)
    }
  }

  // Send Test Review Request
  const handleSendTestInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.business?.id) return
    if (!testContact.trim()) {
      toast.error('Please enter a phone number or email address.')
      return
    }
    if (!consentConfirmed) {
      toast.error('Please confirm consent before sending the test invitation.')
      return
    }

    setSendingTest(true)
    setTestSendResult(null)

    try {
      const res = await fetch('/api/review-us-page/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: data.business.id,
          channel: testChannel,
          recipients: [{ name: 'Test Customer', contact: testContact.trim() }],
          consentConfirmed: true,
        }),
      })

      const json = await res.json()
      if (res.ok) {
        setTestSendResult({
          status: 'success',
          message: `Test invitation dispatched to ${testContact.trim()}. Sent count: ${json.sentCount ?? 1}. Check your inbox or phone!`,
        })
        toast.success('Test invitation sent!')
      } else {
        setTestSendResult({
          status: 'error',
          message: json.error || 'Test invite could not be delivered. Please verify messaging service configuration.',
        })
        toast.error('Test invite dispatch failed', { description: json.error })
      }
    } catch {
      setTestSendResult({
        status: 'error',
        message: 'Network failure communicating with invite dispatch endpoint.',
      })
      toast.error('Network error during test dispatch')
    } finally {
      setSendingTest(false)
    }
  }

  // Complete Onboarding (Authoritative Server-Verified Completion)
  const handleCompleteOnboarding = async () => {
    if (!isDashboardReady) {
      toast.error('Cannot proceed: integrations must be server-verified and initial sync completed.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })

      if (res.status === 401) {
        setSessionExpired(true)
        return
      }

      const json = await res.json()
      if (!res.ok || !json.dashboardReady) {
        toast.error(json.error || json.dashboardReadiness?.reason || 'Failed to complete setup: required integrations not ready')
        return
      }

      toast.success('Setup Complete!', {
        description: 'Welcome to your ReviewReply dashboard.',
      })
      router.push(json.redirectTo || '/dashboard')
    } catch {
      toast.error('Network error completing setup')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center aurora-bg">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[var(--brass)] animate-spin mx-auto" />
          <p className="text-sm font-mono text-muted-foreground">Loading onboarding wizard...</p>
        </div>
      </div>
    )
  }

  if (sessionExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center aurora-bg p-4">
        <Card className="max-w-md w-full p-6 glass-card space-y-4 border-amber-500/30 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold">Session Expired</h2>
            <p className="text-xs text-muted-foreground">
              Your authentication session has expired. Sign in to resume your onboarding setup right where you left off.
            </p>
          </div>
          <Button asChild className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-9">
            <Link href="/login?redirect=/onboarding">
              Sign In to Resume
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </Card>
      </div>
    )
  }

  const reviewUsFullUrl = typeof window !== 'undefined' && slug
    ? `${window.location.origin}/review-us/${slug}`
    : `/review-us/${slug || 'your-business'}`

  const googleStatus = data?.onboardingStatus
  const isGoogleConfigured = googleStatus?.googleConfigured !== false
  const isGoogleConnected = Boolean(googleStatus?.googleOAuthConnected)
  const isGoogleLocationSelected = Boolean(googleStatus?.googleLocationSelected)
  const isGoogleLocationVerified = Boolean(googleStatus?.googleLocationVerified)
  const isGoogleConnectionHealthy = Boolean(googleStatus?.googleConnectionHealthy)
  const isInitialSyncCompleted = Boolean(googleStatus?.initialSyncCompleted)
  const isSyncRunning = Boolean(syncingReviews || googleStatus?.googleSyncStatus === 'syncing')
  const realReviewCount = googleStatus?.realGoogleReviewCount ?? 0
  const isDashboardReady = Boolean(data?.dashboardReadiness?.isReady)
  const hasConfiguredBusiness = Boolean(data?.business?.id && data?.onboardingStatus?.firstLocationConfigured)
  const isBillingIncomplete = Boolean(data?.onboardingStatus?.billingSetupCompleted === false)

  return (
    <div className="min-h-screen flex flex-col aurora-bg relative">
      <div className="absolute inset-0 grid-overlay opacity-25 pointer-events-none" />

      {/* Top Navigation */}
      <header className="relative z-10 border-b border-border/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
            <Star className="w-4 h-4 text-white fill-white" />
          </div>
          <div>
            <div className="font-display font-bold text-sm tracking-tight leading-tight">ReviewReply</div>
            <div className="text-[10px] text-muted-foreground font-mono">Setup Wizard</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data?.organization?.plan && (
            <Badge variant="outline" className="text-[10px] font-mono border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/10">
              Plan: {data.organization.plan}
            </Badge>
          )}
          {data?.locationReadiness && (
            <Badge variant="secondary" className="text-[10px] font-mono capitalize">
              {data.locationReadiness.replace(/_/g, ' ')}
            </Badge>
          )}
          {data?.dashboardReadiness && (
            <Badge
              variant={isDashboardReady ? 'default' : 'outline'}
              className={cn(
                'text-[10px] font-mono',
                isDashboardReady
                  ? 'bg-green-600 text-white border-green-600/30'
                  : 'text-amber-500 border-amber-500/40'
              )}
            >
              {isDashboardReady ? `Ready (${realReviewCount} reviews)` : 'Action Required'}
            </Badge>
          )}
          {isDashboardReady && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-between">
        <div className="space-y-6">
          {/* OAuth Feedback Alerts */}
          {oauthError && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold mb-0.5">Authorization Notice</div>
                <div>{oauthError}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-red-400 hover:text-red-300"
                onClick={() => setDismissedError(true)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {oauthNotice && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-600 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold mb-0.5">Integration Update</div>
                <div>{oauthNotice}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-green-700 hover:text-green-800"
                onClick={() => setDismissedNotice(true)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Billing Incomplete Recovery Alert */}
          {isBillingIncomplete && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {data?.onboardingStatus?.billingActionRequired === 'select_plan'
                      ? 'Subscription Plan Selection Required'
                      : `Subscription Payment Action Required — Plan: ${data?.organization?.plan || 'Selected Plan'}`}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-800 bg-amber-500/10">
                  {data?.onboardingStatus?.billingActionRequired === 'select_plan' ? 'PLAN SELECTION REQUIRED' : 'PAYMENT REQUIRED'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {data?.onboardingStatus?.billingActionRequired === 'select_plan'
                  ? 'Please select a subscription plan for your organization to proceed. You can choose the Free plan or any paid tier.'
                  : `Your organization is configured for the ${data?.organization?.plan || 'paid'} tier. Checkout is pending confirmation or payment is required to activate full features.`}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button asChild size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-8">
                  <Link href="/billing">
                    {data?.onboardingStatus?.billingActionRequired === 'select_plan' ? 'Choose Plan' : 'Complete Billing'}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={handleSwitchToFreePlan}
                  className="text-xs h-8"
                >
                  Continue with Free Plan
                </Button>
              </div>
            </div>
          )}

          {/* Progress Indicators */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span className="text-[var(--brass)] font-semibold">Step {step} of 3</span>
              <span>{step === 1 ? 'Location & Integrations' : step === 2 ? 'Brand Voice' : 'First Value & Readiness'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    s < step
                      ? 'bg-green-500'
                      : s === step
                      ? 'bg-[var(--brass)] shadow-sm shadow-[var(--brass)]/50'
                      : 'bg-muted/40'
                  )}
                />
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 1: FIRST LOCATION & INTEGRATION CONNECTION                          */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1">
                  Connect Your First Location & Review Sources
                </h1>
                <p className="text-sm text-muted-foreground">
                  ReviewReply needs access to your verified location to monitor incoming reviews and draft intelligent responses.
                </p>
              </div>

              {/* 1. Primary Business Location Profile / Setup Form */}
              {!hasConfiguredBusiness ? (
                <Card className="p-5 glass-card space-y-4 border-amber-500/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 border border-amber-500/30">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold leading-tight">
                          Primary Location Setup Required
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Configure your primary business location before connecting review sources.
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-600 bg-amber-500/10">
                      SETUP REQUIRED
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="biz-name" className="text-xs font-semibold">Location / Business Name *</Label>
                      <Input
                        id="biz-name"
                        value={bizName}
                        onChange={e => setBizName(e.target.value)}
                        placeholder="e.g. Copper Spoon Bistro"
                        className="text-xs h-8 glass-card"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="biz-industry" className="text-xs font-semibold">Industry</Label>
                      <Input
                        id="biz-industry"
                        value={bizIndustry}
                        onChange={e => setBizIndustry(e.target.value)}
                        placeholder="e.g. restaurant, dental, legal"
                        className="text-xs h-8 glass-card"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSetupLocation}
                    disabled={settingUpBiz || !bizName.trim()}
                    className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-8"
                  >
                    {settingUpBiz ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Check className="w-3 h-3 mr-1.5" />}
                    Save Business Location
                  </Button>
                </Card>
              ) : (
                <Card className="p-5 glass-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center text-[var(--brass)] border border-[var(--brass)]/30">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold leading-tight">
                          {data?.business?.name || 'Primary Business Location'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Industry: {data?.business?.industry || 'General'} · Timezone: {data?.business?.timezone || 'America/New_York'}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-green-500/40 text-green-600 bg-green-500/10">
                      Active Location
                    </Badge>
                  </div>
                </Card>
              )}

              {/* 2. Google Business Profile Integration State Machine */}
              <Card className="p-5 glass-card space-y-4 border-[var(--brass)]/30 bg-background/40">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 font-bold text-base">
                      G
                    </div>
                    <div>
                      <div className="text-sm font-bold flex items-center gap-2">
                        Google Business Profile
                        {isInitialSyncCompleted ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px] font-mono">
                            <Check className="w-2.5 h-2.5 mr-1" />
                            SYNCED
                          </Badge>
                        ) : isGoogleLocationVerified ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px] font-mono">
                            <Check className="w-2.5 h-2.5 mr-1" />
                            VERIFIED
                          </Badge>
                        ) : isGoogleConnected && !isGoogleConnectionHealthy ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-mono">
                            ACTION REQUIRED
                          </Badge>
                        ) : isGoogleConnected ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px] font-mono">
                            CONNECTED
                          </Badge>
                        ) : !isGoogleConfigured ? (
                          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                            NOT CONFIGURED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                            NOT CONNECTED
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Official Google API integration for automated review ingestion and verified location ownership.
                      </p>
                    </div>
                  </div>
                </div>

                {/* State 0: Google OAuth Not Configured on Server */}
                {!isGoogleConfigured && (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Google Integration Not Configured
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Google Business Profile OAuth credentials are not configured in this environment. You can complete setup for other review destinations below.
                    </p>
                  </div>
                )}

                {/* State A: Configured, but Not Connected */}
                {isGoogleConfigured && !isGoogleConnected && (
                  <div className="p-4 rounded-lg bg-accent/20 border border-border/40 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Connect your Google account to discover locations associated with your business.
                    </p>
                    {data?.business?.id && (
                      <Button asChild size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-9">
                        <Link href={`/api/oauth/google?businessId=${data.business.id}&returnTo=/onboarding`}>
                          Connect Google Business Profile
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                )}

                {/* State B: Connected, but unhealthy (expired or revoked token) */}
                {isGoogleConnected && !isGoogleConnectionHealthy && (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Google Authorization Expired or Revoked
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your Google access token is no longer valid. Please reconnect your Google account to re-authorize ReviewReply.
                    </p>
                    {data?.business?.id && (
                      <Button asChild size="sm" variant="outline" className="border-amber-500/40 text-xs h-8">
                        <Link href={`/api/oauth/google?businessId=${data.business.id}&returnTo=/onboarding`}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Reconnect Google Account
                        </Link>
                      </Button>
                    )}
                  </div>
                )}

                {/* State C: Connected & Healthy, but Location NOT Selected */}
                {isGoogleConnected && isGoogleConnectionHealthy && !isGoogleLocationSelected && (
                  <div className="p-4 rounded-lg bg-accent/20 border border-border/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        Select your business location
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchDiscoveredLocations()}
                        disabled={locationsLoading}
                        className="text-xs h-6 text-[var(--brass)]"
                      >
                        {locationsLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        Refresh List
                      </Button>
                    </div>

                    {locationsLoading ? (
                      <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--brass)]" />
                        Discovering Google locations...
                      </div>
                    ) : discoveredLocations.length > 0 ? (
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          {discoveredLocations.map(loc => (
                            <label
                              key={loc.id}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-md border text-xs cursor-pointer transition-colors',
                                selectedLocationId === loc.id
                                  ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                                  : 'border-border/40 hover:bg-accent/30'
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="radio"
                                  name="google-location-select"
                                  value={loc.id}
                                  checked={selectedLocationId === loc.id}
                                  onChange={() => setSelectedLocationId(loc.id)}
                                  className="text-[var(--brass)]"
                                />
                                <div>
                                  <div className="font-semibold text-foreground">{loc.title}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    ID: {loc.id.split('/').pop()} {loc.accountName ? `· ${loc.accountName}` : ''}
                                  </div>
                                </div>
                              </div>
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                            </label>
                          ))}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSelectLocation}
                          disabled={selectingLocation || !selectedLocationId}
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-9 mt-2"
                        >
                          {selectingLocation ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                          Select & Verify Location
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 font-semibold text-amber-700">
                          <AlertCircle className="w-4 h-4" />
                          No Accessible Google Business Profile Locations
                        </div>
                        <p>
                          No accessible Google Business Profile locations were found for this Google account. Ensure this Google account has manager or owner access to a published Business Profile, or try connecting another Google account.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => fetchDiscoveredLocations()}
                            disabled={locationsLoading}
                            className="text-xs h-8 text-[var(--brass)]"
                          >
                            {locationsLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                            Refresh Discovery
                          </Button>
                          {(data?.business?.id || data?.onboardingStatus?.primaryBusinessId) && (
                            <Button asChild size="sm" variant="outline" className="text-xs h-8">
                              <Link href={`/api/oauth/google?businessId=${data?.business?.id || data?.onboardingStatus?.primaryBusinessId}&prompt=select_account&returnTo=/onboarding`}>
                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                Try Another Google Account
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* State D: Location Selected but NOT verified */}
                {isGoogleConnected && isGoogleLocationSelected && !isGoogleLocationVerified && (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      Verification Required
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The selected location ({data?.business?.googleLocationId}) requires server verification before synchronization can begin.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedLocationId(data?.business?.googleLocationId || '')
                          handleSelectLocation()
                        }}
                        disabled={selectingLocation}
                        className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-8"
                      >
                        {selectingLocation ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                        Verify Location Now
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fetchDiscoveredLocations()}
                        disabled={locationsLoading}
                        className="text-xs h-8"
                      >
                        Choose Another Location
                      </Button>
                    </div>
                  </div>
                )}

                {/* State E: Location Verified */}
                {isGoogleLocationVerified && (
                  <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        Location Verified ({data?.business?.googleLocationId?.split('/').pop()})
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono text-green-600 border-green-500/30">
                        Server-Verified
                      </Badge>
                    </div>

                    {/* Sync Controls: Failed State */}
                    {!isInitialSyncCompleted && !isSyncRunning && (googleStatus?.googleSyncStatus === 'failed' || syncFeedback?.status === 'error') && (
                      <div className="pt-2 border-t border-border/30 space-y-3">
                        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-600 flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold">Initial Review Sync Failed</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {syncFeedback?.message || googleStatus?.googleSyncError || 'Sync encountered a temporary failure. Retrying will safely resume without creating duplicate reviews.'}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleStartInitialSync}
                          disabled={syncingReviews}
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-8 px-3"
                        >
                          {syncingReviews ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                          Retry Initial Sync
                        </Button>
                      </div>
                    )}

                    {/* Sync Controls: Pending Initial Start */}
                    {!isInitialSyncCompleted && !isSyncRunning && googleStatus?.googleSyncStatus !== 'failed' && syncFeedback?.status !== 'error' && (
                      <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Initial sync has not started yet.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleStartInitialSync}
                          disabled={syncingReviews}
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-8 px-3"
                        >
                          Start initial sync
                        </Button>
                      </div>
                    )}

                    {isSyncRunning && (
                      <div className="pt-2 border-t border-border/30 flex items-center gap-2.5 text-xs text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--brass)]" />
                        <span>Sync running... Querying Google Business Profile for customer reviews.</span>
                      </div>
                    )}

                    {isInitialSyncCompleted && (
                      <div className="pt-2 border-t border-border/30 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                          <div>
                            <strong>Real Review Count:</strong>{' '}
                            <span className="text-foreground font-semibold">
                              {realReviewCount === 0 ? '0 Google reviews found' : `${realReviewCount} reviews synchronized`}
                            </span>
                          </div>
                          <div>
                            <strong>Synced At:</strong>{' '}
                            <span className="text-foreground font-mono">
                              {data?.business?.googleSyncedAt
                                ? new Date(data.business.googleSyncedAt).toLocaleString()
                                : 'Just now'}
                            </span>
                          </div>
                          <div>
                            <strong>Connection Health:</strong>{' '}
                            <span className="text-green-600 font-semibold">Healthy</span>
                          </div>
                          <div>
                            <strong>Dashboard Readiness:</strong>{' '}
                            <span className="text-green-600 font-semibold">Ready</span>
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleStartInitialSync}
                            disabled={syncingReviews}
                            className="text-xs h-7"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Re-sync Reviews
                          </Button>
                        </div>
                      </div>
                    )}

                    {syncFeedback && syncFeedback.status !== 'error' && (
                      <div
                        className={cn(
                          'p-3 rounded-md text-xs border',
                          syncFeedback.status === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-600'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-600'
                        )}
                      >
                        {syncFeedback.message}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* 3. Facebook Pages Status Card */}
              <Card className="p-4 glass-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 font-bold text-sm">
                    f
                  </div>
                  <div>
                    <div className="text-xs font-semibold flex items-center gap-2">
                      Facebook Pages
                      {data?.onboardingStatus?.facebookConnected ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Optional Source
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {data?.onboardingStatus?.facebookConnected
                        ? `Connected Page (${data.business?.facebookPageId || 'Configured'})`
                        : 'Facebook Pages can be connected anytime in Settings. Does not block Google onboarding.'}
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="text-xs h-7">
                  <Link href="/settings?tab=integrations">
                    Configure
                  </Link>
                </Button>
              </Card>

              {/* 4. Public Landing Page Slug Card */}
              <Card className="p-5 glass-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="slug" className="text-xs uppercase tracking-wider font-mono text-muted-foreground">
                      Public Landing Page URL
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your customers visit this link to pick their preferred review platform.
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-[var(--brass)] border-[var(--brass)]/40">
                    /review-us/[slug]
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground select-none">
                    reviewreply.pw/review-us/
                  </span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="my-business-name"
                    className="font-mono text-sm glass-card h-9"
                  />
                </div>
              </Card>

              {/* 5. Review Platforms Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider font-mono text-muted-foreground">
                    Select Your Supported Platforms
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {links.filter(l => l.enabled && l.url.trim()).length} configured
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {REVIEW_PLATFORMS.filter(p => p.popular).map(platform => {
                    const activeLink = links.find(l => l.platformId === platform.id)
                    const isEnabled = Boolean(activeLink?.enabled)

                    return (
                      <Card
                        key={platform.id}
                        className={cn(
                          'p-4 glass-card transition-all space-y-3',
                          isEnabled ? 'border-[var(--brass)]/60 bg-accent/20' : 'border-border/30 opacity-75'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border border-border/40 font-bold text-xs">
                              {platform.name[0]}
                            </div>
                            <div>
                              <div className="text-sm font-semibold leading-tight">{platform.name}</div>
                              <div className="text-[10px] text-muted-foreground">Review destination</div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant={isEnabled ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                              'h-7 text-xs',
                              isEnabled ? 'bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]' : ''
                            )}
                            onClick={() => togglePlatform(platform)}
                          >
                            {isEnabled ? <Check className="w-3.5 h-3.5 mr-1" /> : null}
                            {isEnabled ? 'Active' : 'Add'}
                          </Button>
                        </div>

                        {isEnabled && (
                          <div className="space-y-1.5 pt-1 border-t border-border/30">
                            <Label className="text-[10px] font-mono text-muted-foreground uppercase">
                              Review Page URL
                            </Label>
                            <Input
                              value={activeLink?.url || ''}
                              onChange={e => updateLinkUrl(platform.id, e.target.value)}
                              placeholder={`https://${platform.id}.com/review/...`}
                              className="text-xs h-8 glass-card font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {platform.urlHint}
                            </p>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/30 border border-border/30 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-[var(--brass)] flex-shrink-0" />
                <span>
                  <strong>Truth in Configuration:</strong> Customer review destinations link directly to public review submission pages. Syncing reviews from Google uses the server-verified integration above.
                </span>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: BRAND VOICE & SIGNATURE                                          */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1">
                  Tune Your AI Brand Voice
                </h1>
                <p className="text-sm text-muted-foreground">
                  Teach ReviewReply how you want your review responses to sound. AI drafts will follow these tone guidelines, use your sign-off, and strictly avoid forbidden phrases.
                </p>
              </div>

              {/* Tone Presets */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-mono text-muted-foreground">
                  Quick Select a Tone Archetype
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TONE_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setToneGuidelines(preset.text)}
                      className={cn(
                        'p-3.5 rounded-lg text-left glass-card border transition-all',
                        toneGuidelines === preset.text
                          ? 'border-[var(--brass)] bg-[var(--brass)]/10 ring-1 ring-[var(--brass)]'
                          : 'border-border/40 hover:border-border/80'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{preset.name}</span>
                        {toneGuidelines === preset.text && (
                          <Check className="w-3.5 h-3.5 text-[var(--brass)]" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Tone Guidelines */}
              <Card className="p-5 glass-card space-y-4">
                <div>
                  <Label htmlFor="toneGuidelines" className="text-xs font-semibold">
                    Tone & Voice Instructions
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Specify length, demeanor, rules for resolving complaints, or specific phrases you like to use.
                  </p>
                  <textarea
                    id="toneGuidelines"
                    rows={4}
                    value={toneGuidelines}
                    onChange={e => setToneGuidelines(e.target.value)}
                    placeholder="e.g. Keep replies under 3 sentences. Express genuine gratitude. If a rating is below 4 stars, offer to make it right via email."
                    className="w-full text-sm rounded-md border border-border/40 bg-background/50 p-3 focus:outline-none focus:ring-1 focus:ring-[var(--brass)]/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="signature" className="text-xs font-semibold">
                      Custom Review Signature
                    </Label>
                    <Input
                      id="signature"
                      value={signature}
                      onChange={e => setSignature(e.target.value)}
                      placeholder="e.g. — Sarah, General Manager"
                      className="mt-1.5 text-xs glass-card"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Appended to the end of every approved reply.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="forbiddenPhrases" className="text-xs font-semibold">
                      Forbidden Phrases (comma-separated)
                    </Label>
                    <Input
                      id="forbiddenPhrases"
                      value={forbiddenPhrases}
                      onChange={e => setForbiddenPhrases(e.target.value)}
                      placeholder="e.g. Unfortunately, We apologize for any inconvenience"
                      className="mt-1.5 text-xs glass-card"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      The AI will strictly avoid using these canned phrases.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/30 border border-border/30 text-xs text-muted-foreground">
                <Sparkles className="w-4 h-4 text-[var(--brass)] flex-shrink-0" />
                <span>
                  You can further refine your brand voice anytime in <strong>Settings &gt; Brand Voice</strong> with real past review/reply examples.
                </span>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: FIRST VALUE & DASHBOARD READINESS                                 */}
          {/* ========================================================================= */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1">
                  Activate Your Review Acceleration & Verify Readiness
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your review setup is ready. Perform your first real action to verify the customer experience before entering your dashboard.
                </p>
              </div>

              {/* Action 1: Verify & Copy Live Review Page Link */}
              <Card className="p-5 glass-card space-y-4 border-[var(--brass)]/40 bg-[var(--brass)]/5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[var(--brass)]" />
                      <h3 className="font-display font-bold text-sm">Action 1: Your Live Review Page</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your multi-platform review landing page is live and ready for customers.
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px] font-mono">
                    <Check className="w-2.5 h-2.5 mr-1" />
                    LIVE
                  </Badge>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1 w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono truncate text-foreground">
                    {reviewUsFullUrl}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCopyReviewLink}
                      className="text-xs h-9 flex-1 sm:flex-none"
                    >
                      {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="default"
                      className="text-xs h-9 bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] flex-1 sm:flex-none"
                    >
                      <a href={`/review-us/${slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Preview Page
                      </a>
                    </Button>
                  </div>
                </div>

                {qrCodeDataUrl && (
                  <div className="flex items-center gap-4 pt-3 border-t border-border/30">
                    <div className="w-16 h-16 bg-white p-1 rounded-md shadow-sm flex-shrink-0">
                      <img src={qrCodeDataUrl} alt="Review Us QR Code" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <strong className="text-foreground">In-Store QR Code Generated:</strong> Print this QR code at checkout, on table tents, or on receipts to allow in-person visitors to scan and review instantly.
                    </div>
                  </div>
                )}
              </Card>

              {/* Action 2: Send Legitimate Test Review Request */}
              <Card className="p-5 glass-card space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-500" />
                    <h3 className="font-display font-bold text-sm">Action 2: Send a Real Test Review Invitation</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Send an authentic review invite to your own phone or email to inspect what your customers will receive.
                  </p>
                </div>

                <form onSubmit={handleSendTestInvite} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center rounded-lg border border-border/40 bg-background/50 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTestChannel('email')
                          setConsentConfirmed(false)
                        }}
                        className={cn(
                          'px-3 py-1 text-xs rounded-md font-medium transition-colors',
                          testChannel === 'email' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground'
                        )}
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTestChannel('sms')
                          setConsentConfirmed(false)
                        }}
                        className={cn(
                          'px-3 py-1 text-xs rounded-md font-medium transition-colors',
                          testChannel === 'sms' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground'
                        )}
                      >
                        SMS
                      </button>
                    </div>

                    <Input
                      value={testContact}
                      onChange={e => setTestContact(e.target.value)}
                      placeholder={testChannel === 'email' ? 'your.email@example.com' : '+1 (555) 000-0000'}
                      className="text-xs glass-card h-9 flex-1"
                    />

                    <Button
                      type="submit"
                      disabled={sendingTest || !testContact.trim() || !consentConfirmed}
                      size="sm"
                      className="text-xs h-9 bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                    >
                      {sendingTest ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                      Send Test
                    </Button>
                  </div>

                  {/* Explicit TCPA / Email Affirmative Consent Confirmation */}
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/40 bg-accent/20">
                    <Checkbox
                      id="onboarding-consent-checkbox"
                      checked={consentConfirmed}
                      onCheckedChange={checked => setConsentConfirmed(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="onboarding-consent-checkbox"
                      className="text-xs text-muted-foreground leading-relaxed cursor-pointer"
                    >
                      {testChannel === 'sms' ? (
                        <span>
                          <strong className="text-foreground">Explicit SMS Consent:</strong> I confirm that this is my own personal mobile number or that I have obtained express written affirmative consent to send this test review invitation. Message and data rates may apply. Message frequency varies. Reply STOP to opt out.
                        </span>
                      ) : (
                        <span>
                          <strong className="text-foreground">Explicit Email Consent:</strong> I confirm that this is my own business/personal email address or that I have obtained explicit permission to send this test review invitation.
                        </span>
                      )}
                    </Label>
                  </div>
                </form>

                {testSendResult && (
                  <div
                    className={cn(
                      'p-3 rounded-lg border text-xs flex items-start gap-2.5',
                      testSendResult.status === 'success'
                        ? 'bg-green-500/10 border-green-500/30 text-green-600'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                    )}
                  >
                    {testSendResult.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="leading-relaxed">{testSendResult.message}</div>
                  </div>
                )}
              </Card>

              {/* Action 3: Review Platform Sync & Truthful Dashboard Readiness */}
              <Card className="p-5 glass-card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Google Business Profile Review Ingestion</div>
                      <div className="text-[11px] text-muted-foreground">
                        {isInitialSyncCompleted
                          ? `Synchronized with Google. ${realReviewCount === 0 ? '0 Google reviews found' : `${realReviewCount} reviews synchronized`}.`
                          : isGoogleLocationVerified
                          ? 'Location verified. Ready for initial review synchronization.'
                          : 'Connect and verify your Google account to enable review synchronization.'}
                      </div>
                    </div>
                  </div>

                  {isInitialSyncCompleted ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px] font-mono">
                      <Check className="w-2.5 h-2.5 mr-1" />
                      READY
                    </Badge>
                  ) : isGoogleLocationVerified ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleStartInitialSync}
                      disabled={syncingReviews}
                      className="text-xs h-7 bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                    >
                      {syncingReviews ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Sync Reviews
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="text-xs h-7">
                      <Link href="/settings?tab=integrations">
                        Connect in Settings
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Dashboard Readiness Summary Banner */}
                <div className={cn(
                  'p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3',
                  isDashboardReady
                    ? 'bg-green-500/10 border-green-500/30 text-green-700'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                )}>
                  <div className="flex items-start sm:items-center gap-2.5">
                    {isDashboardReady ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {isDashboardReady ? 'Dashboard Status: Ready' : 'Dashboard Status: Setup Incomplete'}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {data?.dashboardReadiness?.reason || (isDashboardReady ? 'All integrations server-verified' : 'Action required')}
                      </div>
                    </div>
                  </div>
                  
                  {!isDashboardReady && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isGoogleLocationVerified && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStep(1)
                            persistStep(1)
                          }}
                          className="text-xs h-7 border-amber-500/40 text-amber-800"
                        >
                          Go to Location Setup
                        </Button>
                      )}
                      {isGoogleLocationVerified && !isInitialSyncCompleted && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleStartInitialSync}
                          disabled={syncingReviews}
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-7"
                        >
                          {syncingReviews ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Start Initial Sync
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Guidance Notice */}
              <div className="p-3.5 rounded-lg border border-border/40 bg-accent/20 flex items-start gap-2.5 text-xs text-muted-foreground">
                <Sparkles className="w-4 h-4 text-[var(--brass)] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">First-Value Guidance:</strong> You can preview your review link and dispatch a test invite. Complete required setup steps to activate your dashboard.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Wizard Controls */}
        <div className="pt-8 border-t border-border/40 flex items-center justify-between mt-8">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const prev = step - 1
                  setStep(prev)
                  persistStep(prev)
                }}
                disabled={saving}
                className="text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
            ) : (
              <div />
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 1 && (
              <Button
                type="button"
                onClick={handleSaveStep1}
                disabled={saving}
                className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-9 px-4"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Continue to Brand Voice
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}

            {step === 2 && (
              <Button
                type="button"
                onClick={handleSaveStep2}
                disabled={saving}
                className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs h-9 px-4"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Continue to Value Action
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}

            {step === 3 && (
              <div className="flex items-center gap-2">
                {isDashboardReady ? (
                  <Button
                    type="button"
                    onClick={handleCompleteOnboarding}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 px-5 font-semibold shadow-md shadow-green-600/30"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Complete Setup & Go to Dashboard
                  </Button>
                ) : (
                  (!data?.business || !data?.business?.id) ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(1)
                        persistStep(1)
                      }}
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <Building2 className="w-3.5 h-3.5 mr-1.5" />
                      Create Business
                    </Button>
                  ) : isBillingIncomplete ? (
                    <Button
                      asChild
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <Link href="/billing">
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                        {data?.onboardingStatus?.billingActionRequired === 'select_plan' ? 'Choose Plan' : 'Complete Billing'}
                      </Link>
                    </Button>
                  ) : !isGoogleConnected ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(1)
                        persistStep(1)
                      }}
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                      Connect Google
                    </Button>
                  ) : !isGoogleLocationSelected ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(1)
                        persistStep(1)
                      }}
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1.5" />
                      Choose Location
                    </Button>
                  ) : !isGoogleLocationVerified ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(1)
                        persistStep(1)
                      }}
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                      Select & Verify Location
                    </Button>
                  ) : !isInitialSyncCompleted ? (
                    googleStatus?.googleSyncStatus === 'failed' ? (
                      <Button
                        type="button"
                        onClick={handleStartInitialSync}
                        disabled={syncingReviews}
                        className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                      >
                        {syncingReviews ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                        Retry Initial Sync
                      </Button>
                    ) : (syncingReviews || isSyncRunning) ? (
                      <Button
                        type="button"
                        disabled
                        className="bg-blue-600 text-white text-xs h-9 px-4 font-semibold shadow-md"
                      >
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Syncing Reviews...
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleStartInitialSync}
                        disabled={syncingReviews}
                        className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                      >
                        {syncingReviews ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                        Start Initial Sync
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(1)
                        persistStep(1)
                      }}
                      className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs h-9 px-4 font-semibold shadow-md"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                      Return to Step 1
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center aurora-bg">
        <Loader2 className="w-8 h-8 text-[var(--brass)] animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}

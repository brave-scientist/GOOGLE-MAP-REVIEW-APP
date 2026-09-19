'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, User, CreditCard, Plug, Shield, Bell, Loader2, Check, Sparkles, Plus, Trash2, Mail, Clock, UserMinus, RefreshCw, MapPin, FileText, Sliders, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { InviteMemberModal } from '@/components/app/admin-modals'
import { useActiveBusiness } from '@/lib/business-context'
import { ReplyTemplatesTab } from '@/components/app/reply-templates-tab'
import { AiPresetsTab } from '@/components/app/ai-presets-tab'
import { AutomationsTab } from '@/components/app/automations-tab'
import { Zap } from 'lucide-react'

interface TeamMemberItem {
  id: string
  userId: string
  email: string
  name: string
  role: string
  joinedAt: string
  isCurrentUser: boolean
}

interface PendingInviteItem {
  id: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
  invitedBy?: {
    id: string
    name: string | null
    email: string
  }
}

interface TeamData {
  members: TeamMemberItem[]
  pendingInvitations: PendingInviteItem[]
  totalMembers: number
  totalPending: number
  seatLimit: number
  seatsUsed: number
  canInvite: boolean
  plan: string
}

interface Integration {
  provider: string
  name: string
  status: 'connected' | 'available' | 'not_configured'
  desc: string
  icon: string
  category: 'review-source' | 'communication' | 'billing' | 'alerts'
  userFacing: boolean // false = managed by platform (admin-only)
  locationId?: string | null
  hasLocation?: boolean
  pageId?: string | null
  hasPage?: boolean
}

// AUD-01: Initial state is the SAFE default — everything starts 'available'/'not_configured'.
// The real statuses are fetched from /api/integrations on mount (see useEffect below)
// so we never hardcode 'connected' for things that may not actually be connected.
const INITIAL_INTEGRATIONS: Integration[] = [
  { provider: 'google', name: 'Google Business Profile', status: 'available', desc: 'Loading…', icon: '🔍', category: 'review-source', userFacing: true },
  { provider: 'facebook', name: 'Facebook Pages', status: 'available', desc: 'Loading…', icon: '📘', category: 'review-source', userFacing: true },
  { provider: 'yelp', name: 'Yelp', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '⭐', category: 'review-source', userFacing: true },
  { provider: 'trustpilot', name: 'Trustpilot', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '✓', category: 'review-source', userFacing: true },
  { provider: 'slack', name: 'Slack', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '💬', category: 'alerts', userFacing: true },
  { provider: 'teams', name: 'Microsoft Teams', status: 'not_configured', desc: 'Roadmap item — not yet supported', icon: '👥', category: 'alerts', userFacing: true },
  // Platform-managed integrations (not user-configurable)
  { provider: 'telnyx', name: 'Telnyx (SMS)', status: 'not_configured', desc: 'Loading…', icon: '📱', category: 'communication', userFacing: false },
  { provider: 'twilio', name: 'Twilio (SMS Fallback)', status: 'not_configured', desc: 'Loading…', icon: '📱', category: 'communication', userFacing: false },
  { provider: 'resend', name: 'Resend (Email)', status: 'not_configured', desc: 'Loading…', icon: '✉', category: 'communication', userFacing: false },
  { provider: 'stripe', name: 'Stripe', status: 'not_configured', desc: 'Loading…', icon: '💳', category: 'billing', userFacing: false },
]

export default function SettingsPage() {
  const { businesses, activeBusiness, activeBusinessId, setActiveBusinessId, refreshBusinesses } = useActiveBusiness()
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)
  const [processingProvider, setProcessingProvider] = useState<string | null>(null)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [businessForm, setBusinessForm] = useState({
    name: '',
    industry: '',
    timezone: 'America/New_York',
    address: '',
    phone: '',
  })

  // Synchronize form when activeBusiness changes
  useEffect(() => {
    ;(async () => {
      if (activeBusiness) {
        setBusinessForm({
          name: activeBusiness.name || '',
          industry: activeBusiness.industry || '',
          timezone: activeBusiness.timezone || 'America/New_York',
          address: activeBusiness.address || '',
          phone: activeBusiness.phone || '',
        })
      }
    })()
  }, [activeBusinessId, activeBusiness])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamActionLoading, setTeamActionLoading] = useState<string | null>(null)
  const [fbPagePicker, setFbPagePicker] = useState<{ businessId: string; pages: Array<{ id: string; name: string; category: string }> } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('facebook_pick_page') === '1') {
        const businessId = params.get('businessId')
        const pagesParam = params.get('pages')
        if (businessId && pagesParam) {
          const pages = JSON.parse(decodeURIComponent(pagesParam))
          return { businessId, pages }
        }
      }
    } catch {
      // ignore
    }
    return null
  })
  const [fbSelecting, setFbSelecting] = useState(false)
  const [googlePicker, setGooglePicker] = useState<{
    businessId: string
    locations: Array<{ id: string; title: string; address?: string; placeId?: string; accountName?: string }>
    loading: boolean
  } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('google_picker') === 'true') {
        const businessId = params.get('businessId')
        if (businessId) {
          return { businessId, locations: [], loading: true }
        }
      }
    } catch {
      // ignore
    }
    return null
  })
  const [googleSelecting, setGoogleSelecting] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)

  const fetchTeamMembers = useCallback(async () => {
    try {
      setTeamLoading(true)
      const res = await fetch('/api/team/members')
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.members)) {
          setTeamData(data)
          setTeamError(null)
        } else {
          setTeamError('Received invalid team data format from server')
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        setTeamError(errData.error || `Failed to load team members (${res.status})`)
      }
    } catch (e) {
      console.error('Failed to fetch team members:', e)
      setTeamError('Network error loading team members')
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    fetch('/api/team/members')
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          if (!ignore) setTeamError(errData.error || `Failed to load team members (${res.status})`)
          if (!res.ok) return null
        }
        return res.json()
      })
      .then(data => {
        if (!ignore) {
          if (data && Array.isArray(data.members)) {
            setTeamData(data)
            setTeamError(null)
          } else {
            setTeamError('Received invalid team data format from server')
          }
        }
      })
      .catch(e => {
        if (!ignore) {
          console.error('Failed to fetch team members:', e)
          setTeamError(e.message || 'Failed to load team members')
        }
      })
      .finally(() => {
        if (!ignore) setTeamLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleRevokeInvite = async (invite: PendingInviteItem) => {
    if (!confirm(`Revoke invitation for ${invite.email}?`)) return
    setTeamActionLoading(invite.id)
    try {
      const res = await fetch(`/api/team/invite/${invite.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Invitation revoked')
        fetchTeamMembers()
      } else {
        toast.error('Failed to revoke invitation', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTeamActionLoading(null)
    }
  }

  const handleRemoveMember = async (member: TeamMemberItem) => {
    if (!confirm(`Remove ${member.name} (${member.email}) from the team?`)) return
    setTeamActionLoading(member.id)
    try {
      const res = await fetch(`/api/team/members/${member.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Member removed')
        fetchTeamMembers()
      } else {
        toast.error('Failed to remove member', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTeamActionLoading(null)
    }
  }

  // URL query param cleanup for OAuth redirects on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)

    if (params.get('facebook_pick_page') === '1' || params.get('google_picker') === 'true') {
      window.history.replaceState({}, '', '/settings')
    }

    if (params.get('google') === 'connected') {
      const location = params.get('location')
      toast.success('Google Business Profile connected!', {
        description: location ? `Connected to ${location}` : 'Account authorized.',
      })
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  useEffect(() => {
    if (!googlePicker?.loading) return
    let ignore = false
    fetch(`/api/oauth/google/locations?businessId=${googlePicker.businessId}`)
      .then(res => res.json())
      .then(data => {
        if (!ignore) {
          if (data?.locations) {
            setGooglePicker({ businessId: googlePicker.businessId, locations: data.locations || [], loading: false })
          } else {
            toast.error('Failed to load Google locations', { description: data?.error })
            setGooglePicker(null)
          }
        }
      })
      .catch(() => {
        if (!ignore) {
          toast.error('Network error loading locations')
          setGooglePicker(null)
        }
      })
    return () => {
      ignore = true
    }
  }, [googlePicker?.loading, googlePicker?.businessId])

  const openGooglePicker = useCallback((businessId: string) => {
    setGooglePicker({ businessId, locations: [], loading: true })
  }, [])


  const handleSelectGoogleLocation = async (locationId: string, locationTitle: string, placeId?: string) => {
    if (!googlePicker) return
    setGoogleSelecting(true)
    try {
      const res = await fetch('/api/oauth/google/select-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: googlePicker.businessId,
          locationId,
          locationTitle,
          placeId: placeId || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Google Location "${locationTitle}" connected!`)
        setGooglePicker(null)
        // Refresh integration statuses
        refreshIntegrations()
      } else {
        toast.error('Failed to connect location', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setGoogleSelecting(false)
    }
  }

  const handleSelectFbPage = async (pageId: string, pageName: string) => {
    if (!fbPagePicker) return
    setFbSelecting(true)
    try {
      const res = await fetch('/api/oauth/facebook/select-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: fbPagePicker.businessId, pageId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Facebook Page "${pageName}" connected!`)
        setFbPagePicker(null)
        // Refresh integration statuses
        refreshIntegrations()
      } else {
        toast.error('Failed to connect Facebook Page', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setFbSelecting(false)
    }
  }

  const refreshIntegrations = async () => {
    try {
      const intRes = await fetch('/api/integrations')
      if (intRes.ok) {
        const intData = await intRes.json()
        if (Array.isArray(intData.integrations)) {
          setIntegrations(prev =>
            prev.map(int => {
              const fresh = intData.integrations.find((i: { provider: string; status?: string; desc?: string; locationId?: string; hasLocation?: boolean }) => i.provider === int.provider)
              if (!fresh) return int
              return {
                ...int,
                status: (fresh.status as Integration['status']) || int.status,
                desc: fresh.desc || int.desc,
                locationId: fresh.locationId,
                hasLocation: fresh.hasLocation,
              }
            }),
          )
        }
      }
    } catch {}
  }

  const handleSyncReviews = async (provider: 'google' | 'facebook') => {
    try {
      const businessId = activeBusinessId
      if (!businessId) {
        toast.error('No active business selected', { description: 'Please select a location to sync reviews.' })
        return
      }

      setSyncingProvider(provider)
      toast.info(`Syncing reviews from ${provider === 'google' ? 'Google' : 'Facebook'}...`)

      const endpoint = provider === 'google'
        ? `/api/businesses/${businessId}/sync-reviews`
        : `/api/businesses/${businessId}/sync-facebook-reviews`

      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || `Successfully synced ${provider} reviews!`)
        refreshIntegrations()
      } else {
        if (data.code === 'NO_LOCATION_SELECTED' || data.code === 'MULTIPLE_LOCATIONS_FOUND') {
          openGooglePicker(businessId)
        } else {
          toast.error(`Sync failed`, { description: data.message || data.error })
        }
      }
    } catch {
      toast.error('Network error syncing reviews')
    } finally {
      setSyncingProvider(null)
    }
  }

  // AUD-01: Fetch real integration statuses from the API on mount.
  // Replaces the hardcoded 'connected' values in INITIAL_INTEGRATIONS.
  useEffect(() => {
    let ignore = false
    fetch('/api/integrations')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(intData => {
        if (!ignore && Array.isArray(intData?.integrations)) {
          setIntegrations(prev =>
            prev.map(int => {
              const fresh = intData.integrations.find((i: { provider: string; status?: string; desc?: string; locationId?: string; hasLocation?: boolean }) => i.provider === int.provider)
              if (!fresh) return int
              return {
                ...int,
                status: (fresh.status as Integration['status']) || int.status,
                desc: fresh.desc || int.desc,
                locationId: fresh.locationId,
                hasLocation: fresh.hasLocation,
              }
            }),
          )
        }
      })
      .catch(() => {
        if (!ignore) {
          setIntegrations(prev =>
            prev.map(int => (int.desc === 'Loading…' ? { ...int, desc: 'Status unavailable' } : int))
          )
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleToggleIntegration = async (int: Integration) => {
    // Google OAuth — redirect to the real OAuth flow
    if (int.provider === 'google' && int.status !== 'connected') {
      const businessId = activeBusinessId
      if (businessId) {
        window.location.assign(new URL(`/api/oauth/google?businessId=${businessId}`, window.location.origin).href)
        return
      } else {
        toast.error('No active business selected', { description: 'Please select a business location first.' })
        return
      }
    }

    // Facebook OAuth — redirect to the real OAuth flow
    if (int.provider === 'facebook' && int.status !== 'connected') {
      const businessId = activeBusinessId
      if (businessId) {
        window.location.assign(new URL(`/api/oauth/facebook?businessId=${businessId}`, window.location.origin).href)
        return
      } else {
        toast.error('No active business selected', { description: 'Please select a business location first.' })
        return
      }
    }


    // Roadmap providers are not yet supported
    if (['yelp', 'trustpilot', 'slack', 'teams'].includes(int.provider)) {
      toast.info(`${int.name} is a roadmap item and not yet supported. Only Google Business Profile and Facebook Pages are currently supported.`)
      return
    }

    setProcessingProvider(int.provider)
    const action = int.status === 'connected' ? 'disconnect' : 'connect'
    try {
      const businessId: string | undefined = activeBusinessId || undefined

      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: int.provider, action, businessId }),
      })
      const data = await res.json()
      if (res.ok) {
        setIntegrations(prev => prev.map(i =>
          i.provider === int.provider
            ? { ...i, status: (data.status as Integration['status']) || (action === 'disconnect' ? 'available' : i.status) }
            : i
        ))
        toast.success(data.message || `${int.name} ${action}ed`)
      } else {
        toast.error(`Failed to ${action} ${int.name}`, { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setProcessingProvider(null)
    }
  }

  const handleSaveBusiness = async () => {
    if (!activeBusinessId) {
      toast.error('No active business selected', { description: 'Please select a business location first.' })
      return
    }
    if (!businessForm.name.trim()) {
      toast.error('Validation error', { description: 'Business name cannot be empty.' })
      return
    }

    setSavingBusiness(true)
    try {
      const res = await fetch(`/api/businesses/${activeBusinessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessForm.name.trim(),
          industry: businessForm.industry.trim() || null,
          timezone: businessForm.timezone.trim() || 'America/New_York',
          address: businessForm.address.trim() || null,
          phone: businessForm.phone.trim() || null,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Business profile updated', { description: 'Your changes have been saved.' })
        await refreshBusinesses()
      } else {
        toast.error('Failed to update business profile', {
          description: data.error || 'An unexpected error occurred while saving.',
        })
      }
    } catch (e) {
      console.error('Error saving business profile:', e)
      toast.error('Network error', { description: 'Failed to connect to the server.' })
    } finally {
      setSavingBusiness(false)
    }
  }

  const userIntegrations = integrations.filter(i => i.userFacing)
  const platformIntegrations = integrations.filter(i => !i.userFacing)
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Settings"
          description="Manage your business profile, integrations, billing, and team"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {businesses.length > 1 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-accent/20 border border-border/40 text-xs flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--brass)] flex-shrink-0" />
                <span className="font-medium text-foreground">Configuring Location:</span>
                <Badge variant="outline" className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30 font-mono text-[10px]">
                  {activeBusiness?.name}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">Switch location:</span>
                <select
                  value={activeBusinessId || ''}
                  onChange={e => setActiveBusinessId(e.target.value)}
                  className="bg-card border border-border/60 rounded px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
                >
                  {businesses.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Tabs defaultValue="business" className="space-y-6">
            <TabsList className="glass-card flex-wrap">
              <TabsTrigger value="business" className="text-xs">
                <Building2 className="w-3.5 h-3.5 mr-1.5" />
                Business
              </TabsTrigger>
              <TabsTrigger value="automations" className="text-xs">
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Automations
              </TabsTrigger>
              <TabsTrigger value="ai-presets" className="text-xs">
                <Sliders className="w-3.5 h-3.5 mr-1.5" />
                AI Presets
              </TabsTrigger>
              <TabsTrigger value="templates" className="text-xs">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Reply Templates
              </TabsTrigger>
              <TabsTrigger value="brand-voice" className="text-xs">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Brand Voice
              </TabsTrigger>
              <TabsTrigger value="integrations" className="text-xs">
                <Plug className="w-3.5 h-3.5 mr-1.5" />
                Integrations
              </TabsTrigger>
              <TabsTrigger value="billing" className="text-xs">
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                Billing
              </TabsTrigger>
              <TabsTrigger value="team" className="text-xs">
                <User className="w-3.5 h-3.5 mr-1.5" />
                Team
              </TabsTrigger>
              <TabsTrigger value="security" className="text-xs">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="business">
              <Card className="p-6 glass-card max-w-2xl">
                <h3 className="font-display font-bold mb-1">Business Profile</h3>
                <p className="text-xs text-muted-foreground mb-5">This information appears on review replies and customer-facing pages.</p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Business Name</Label>
                    <Input
                      id="name"
                      value={businessForm.name}
                      onChange={e => setBusinessForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Bamboo Garden"
                      className="mt-1.5 glass-card"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="industry">Industry</Label>
                      <Input
                        id="industry"
                        value={businessForm.industry}
                        onChange={e => setBusinessForm(prev => ({ ...prev, industry: e.target.value }))}
                        placeholder="e.g. restaurant, dental, retail"
                        className="mt-1.5 glass-card capitalize"
                      />
                    </div>
                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={businessForm.timezone}
                        onChange={e => setBusinessForm(prev => ({ ...prev, timezone: e.target.value }))}
                        placeholder="e.g. America/New_York"
                        className="mt-1.5 glass-card"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={businessForm.address}
                      onChange={e => setBusinessForm(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="100 Main Street, Suite 1, San Francisco, CA 94102"
                      className="mt-1.5 glass-card"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={businessForm.phone}
                        onChange={e => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+1 (415) 555-1000"
                        className="mt-1.5 glass-card"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Reply-from Email</Label>
                      <Input
                        id="email"
                        defaultValue="hello@reviewreply.com"
                        disabled
                        title="Reply email is managed by your account email configuration"
                        className="mt-1.5 glass-card opacity-70 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleSaveBusiness} disabled={savingBusiness}>
                    {savingBusiness ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {savingBusiness ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="automations">
              <AutomationsTab />
            </TabsContent>

            <TabsContent value="ai-presets">
              <AiPresetsTab />
            </TabsContent>

            <TabsContent value="templates">
              <ReplyTemplatesTab />
            </TabsContent>

            <TabsContent value="brand-voice">
              <BrandVoiceTab />
            </TabsContent>

            <TabsContent value="integrations">
              <div className="max-w-4xl space-y-6">
                {/* Your integrations (user-configurable) */}
                <div>
                  <h3 className="font-display font-bold mb-1">Your Integrations</h3>
                  <p className="text-xs text-muted-foreground mb-4">Connect your accounts to pull reviews and send alerts. You control these.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userIntegrations.map(int => (
                      <Card key={int.provider} className="p-4 glass-card hover:border-[var(--brass)]/30 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent/40 flex items-center justify-center text-lg flex-shrink-0">
                            {int.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-medium">{int.name}</h4>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  int.status === 'connected'
                                    ? 'bg-green-500/10 text-green-600 border-green-500/30'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {['yelp', 'trustpilot', 'slack', 'teams'].includes(int.provider) ? 'roadmap' : int.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{int.desc}</p>
                            <div className="flex gap-1.5 flex-wrap items-center">
                              {['yelp', 'trustpilot', 'slack', 'teams'].includes(int.provider) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] opacity-60 cursor-not-allowed"
                                  disabled
                                >
                                  Roadmap
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => handleToggleIntegration(int)}
                                  disabled={processingProvider === int.provider || syncingProvider === int.provider}
                                >
                                  {processingProvider === int.provider ? (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  ) : int.status === 'connected' ? (
                                    'Disconnect'
                                  ) : (
                                    'Connect'
                                  )}
                                </Button>
                              )}

                              {int.status === 'connected' && (int.provider === 'google' || int.provider === 'facebook') && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-6 text-[10px] bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                                  onClick={() => handleSyncReviews(int.provider as 'google' | 'facebook')}
                                  disabled={syncingProvider === int.provider}
                                >
                                  {syncingProvider === int.provider ? (
                                    <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-2.5 h-2.5 mr-1" />
                                  )}
                                  {syncingProvider === int.provider ? 'Syncing...' : 'Sync Reviews'}
                                </Button>
                              )}

                              {int.status === 'connected' && int.provider === 'google' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const bId = activeBusinessId
                                    if (bId) openGooglePicker(bId)
                                    else toast.error('No active business selected')
                                  }}
                                >
                                  <MapPin className="w-2.5 h-2.5 mr-1" />
                                  {int.hasLocation ? 'Change Location' : 'Select Location'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Platform-managed integrations (read-only) */}
                <div>
                  <h3 className="font-display font-bold mb-1">Platform Services</h3>
                  <p className="text-xs text-muted-foreground mb-4">These are managed by ReviewReply. You do not need to configure them.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {platformIntegrations.map(int => (
                      <Card key={int.provider} className="p-3 glass-card">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
                            int.status === 'connected' ? 'bg-green-500/10' : 'bg-muted/40',
                          )}>
                            {int.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{int.name}</div>
                            {int.status === 'connected' ? (
                              <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30">
                                <Check className="w-2.5 h-2.5 mr-0.5" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                Not configured
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    SMS, email, and payment processing are handled by ReviewReply. You are billed for usage overage only.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="billing">
              <div className="max-w-2xl space-y-4">
                <Card className="p-6 glass-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-display font-bold">Subscription Status</h3>
                      <p className="text-xs text-muted-foreground">Managed Organization Plan</p>
                    </div>
                    <Badge variant="outline" className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30 font-mono text-[10px]">
                      ACTIVE
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Online self-serve billing is currently deferred. Your plan tiers and active location quotas
                    are managed directly with your organization agreement.
                  </p>
                  <Button
                    variant="outline"
                    className="text-xs text-muted-foreground cursor-not-allowed opacity-80"
                    disabled
                  >
                    Billing Managed by Administrator
                  </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="team">
              <Card className="p-6 glass-card max-w-2xl">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <div>
                    <h3 className="font-display font-bold">Team Members</h3>
                    <p className="text-xs text-muted-foreground">
                      {teamLoading
                        ? 'Loading team...'
                        : `${teamData?.seatsUsed || 0} of ${teamData?.seatLimit || 5} seats used on ${teamData?.plan || 'PRO'} plan`}
                    </p>
                  </div>
                  <Button
                    className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                    onClick={() => setInviteOpen(true)}
                    disabled={teamData ? !teamData.canInvite : false}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Invite member
                  </Button>
                </div>

                {teamLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 text-[var(--brass)] mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-muted-foreground">Loading members...</p>
                  </div>
                ) : teamError ? (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="truncate">{teamError}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-destructive/30 hover:bg-destructive/10 shrink-0"
                      onClick={fetchTeamMembers}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Active Members */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Active Members ({teamData?.members?.length ?? 0})
                      </h4>
                      {Array.isArray(teamData?.members) && teamData.members.map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20 hover:bg-accent/30 transition-colors group">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(m.name || m.email || 'U').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              <span>{m.name || m.email || 'Team Member'}</span>
                              {m.isCurrentUser && (
                                <Badge variant="outline" className="text-[9px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                                  You
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{m.email}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize font-mono">
                            {m.role}
                          </Badge>
                          {!m.isCurrentUser && m.role !== 'OWNER' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove member"
                              disabled={teamActionLoading === m.id}
                              onClick={() => handleRemoveMember(m)}
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Pending Invitations */}
                    {Array.isArray(teamData?.pendingInvitations) && teamData.pendingInvitations.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Pending Invitations ({teamData.pendingInvitations.length ?? 0})
                        </h4>
                        {teamData.pendingInvitations.map(inv => {
                          let expiresDisplay = 'N/A'
                          try {
                            if (inv.expiresAt) {
                              const d = new Date(inv.expiresAt)
                              if (!isNaN(d.getTime())) expiresDisplay = d.toLocaleDateString()
                            }
                          } catch {}

                          return (
                            <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                              <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 flex-shrink-0">
                                <Mail className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <span className="truncate">{inv.email}</span>
                                  <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                    Pending
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                  <span>Role: {inv.role}</span>
                                  <span>·</span>
                                  <span>Expires: {expiresDisplay}</span>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                disabled={teamActionLoading === inv.id}
                                onClick={() => handleRevokeInvite(inv)}
                              >
                                Revoke
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="security">
              <div className="max-w-2xl space-y-4">
                <Card className="p-6 glass-card">
                  <h3 className="font-display font-bold mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--brass)]" />
                    Security
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Two-factor authentication', desc: 'Add an extra layer of security', enabled: false },
                      { label: 'Login alerts', desc: 'Get notified of new sign-ins', enabled: true },
                      { label: 'Session timeout', desc: 'Auto-logout after 30 minutes', enabled: true },
                      { label: 'IP allowlist', desc: 'Restrict access to specific IPs', enabled: false },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                        <div>
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                        </div>
                        <Badge variant="outline" className={s.enabled ? 'bg-green-500/10 text-green-600 border-green-500/30' : ''}>
                          {s.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <SecurityAuditLogSection />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={fetchTeamMembers} />

      {/* Facebook Page Picker — shown when user has multiple FB Pages after OAuth */}
      {fbPagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-display font-bold text-lg mb-2">Select a Facebook Page</h3>
            <p className="text-xs text-muted-foreground mb-4">
              You manage {fbPagePicker.pages.length} Facebook Pages. Choose which one to connect for review syncing.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {fbPagePicker.pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => handleSelectFbPage(page.id, page.name)}
                  disabled={fbSelecting}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all text-left disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {(page.name || 'P').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{page.name}</div>
                    <div className="text-[10px] text-muted-foreground">{page.category}</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setFbPagePicker(null)}
              disabled={fbSelecting}
              className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Google Location Picker — shown when user has multiple GBP Locations or clicks Change Location */}
      {googlePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-[var(--brass)]" />
              <h3 className="font-display font-bold text-lg">Select Google Location</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Choose which Google Business Profile location to connect for review ingestion.
            </p>

            {googlePicker.loading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 text-[var(--brass)] mx-auto mb-2 animate-spin" />
                <p className="text-xs text-muted-foreground">Discovering locations from Google...</p>
              </div>
            ) : googlePicker.locations.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">No locations found under your Google Business account.</p>
                <Button variant="outline" size="sm" onClick={() => setGooglePicker(null)}>Close</Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {googlePicker.locations.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => handleSelectGoogleLocation(loc.id, loc.title, loc.placeId)}
                    disabled={googleSelecting}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{loc.title}</div>
                      {loc.address && (
                        <div className="text-[10px] text-muted-foreground truncate">{loc.address}</div>
                      )}
                      <div className="text-[9px] text-muted-foreground font-mono mt-0.5">
                        {typeof loc.id === 'string' ? loc.id.split('/').pop() : String(loc.id || '')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setGooglePicker(null)}
              disabled={googleSelecting}
              className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Brand Voice Training Tab
// ─────────────────────────────────────────────────────────
interface BrandVoiceProfile {
  id?: string
  businessId?: string
  examples: Array<{ reviewText: string; replyText: string }>
  toneGuidelines: string
  signature: string
  forbiddenPhrases: string
  updatedAt?: string | Date
}

function BrandVoiceTab() {
  const { activeBusinessId, activeBusiness } = useActiveBusiness()
  const [profile, setProfile] = useState<BrandVoiceProfile | null>(null)
  const [loading, setLoading] = useState(Boolean(activeBusinessId))
  const [saving, setSaving] = useState(false)

  // Form state
  const [toneGuidelines, setToneGuidelines] = useState('')
  const [signature, setSignature] = useState('')
  const [forbiddenPhrases, setForbiddenPhrases] = useState('')
  const [examples, setExamples] = useState<Array<{ reviewText: string; replyText: string }>>([
    { reviewText: '', replyText: '' },
  ])

  useEffect(() => {
    if (!activeBusinessId) return
    let ignore = false
    fetch(`/api/brand-voice?businessId=${activeBusinessId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!ignore) {
          if (d?.profile) {
            setProfile(d.profile)
            setToneGuidelines(d.profile.toneGuidelines || '')
            setSignature(d.profile.signature || '')
            setForbiddenPhrases(d.profile.forbiddenPhrases || '')
            setExamples(d.profile.examples?.length > 0 ? d.profile.examples : [{ reviewText: '', replyText: '' }])
          } else {
            setProfile(null)
            setToneGuidelines('')
            setSignature('')
            setForbiddenPhrases('')
            setExamples([{ reviewText: '', replyText: '' }])
          }
        }
      })
      .catch(() => {
        if (!ignore) setProfile(null)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [activeBusinessId])


  const handleSave = async () => {
    if (!activeBusinessId) {
      toast.error('No active business selected')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/brand-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: activeBusinessId,
          examples: examples.filter(e => e.reviewText && e.replyText),
          toneGuidelines,
          signature,
          forbiddenPhrases,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Brand voice saved!', {
          description: data.message,
        })
        setProfile(data.profile)
      } else {
        toast.error('Failed to save', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const addExample = () => {
    setExamples([...examples, { reviewText: '', replyText: '' }])
  }

  const removeExample = (i: number) => {
    setExamples(examples.filter((_, idx) => idx !== i))
  }

  const updateExample = (i: number, field: 'reviewText' | 'replyText', value: string) => {
    setExamples(examples.map((ex, idx) => idx === i ? { ...ex, [field]: value } : ex))
  }

  if (loading) {
    return (
      <Card className="p-6 glass-card max-w-3xl">
        <div className="h-4 w-32 bg-muted/40 rounded mb-4 animate-pulse" />
        <div className="h-32 bg-muted/20 rounded animate-pulse" />
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="p-6 glass-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-[var(--brass)]" />
          </div>
          <div>
            <h3 className="font-display font-bold">Brand Voice Training</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Train the AI to write replies that sound like you. Paste examples of your tone, add guidelines, and the AI will match your voice on every draft.
            </p>
          </div>
        </div>

        {profile && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-600">
              Profile active — last updated {new Date(profile.updatedAt || Date.now()).toLocaleDateString()}
            </span>
          </div>
        )}

        <div className="space-y-4">
          {/* Tone Guidelines */}
          <div>
            <Label htmlFor="tone">Tone & Voice Guidelines</Label>
            <textarea
              id="tone"
              rows={3}
              placeholder="e.g., We're warm and friendly but professional. We use the customer's first name. We keep replies to 2-3 sentences. We always invite them back."
              value={toneGuidelines}
              onChange={e => setToneGuidelines(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Describe how you want replies to sound. The AI will follow these rules.</p>
          </div>

          {/* Signature */}
          <div>
            <Label htmlFor="signature">Default Signature (optional)</Label>
            <Input
              id="signature"
              placeholder="e.g., — The Bamboo Garden Team"
              value={signature}
              onChange={e => setSignature(e.target.value)}
              className="mt-1.5 glass-card"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Appended to the end of every reply.</p>
          </div>

          {/* Forbidden Phrases */}
          <div>
            <Label htmlFor="forbidden">Forbidden Phrases (comma-separated)</Label>
            <Input
              id="forbidden"
              placeholder="e.g., Unfortunately, We apologize for any inconvenience, To whom it may concern"
              value={forbiddenPhrases}
              onChange={e => setForbiddenPhrases(e.target.value)}
              className="mt-1.5 glass-card"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Phrases the AI will never use in replies.</p>
          </div>
        </div>
      </Card>

      {/* Example Replies */}
      <Card className="p-6 glass-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold">Example Replies</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste 3-5 examples of review + your reply. The AI will match this style.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addExample}>
            <Plus className="w-3 h-3 mr-1" />
            Add example
          </Button>
        </div>

        <div className="space-y-3">
          {examples.map((ex, i) => (
            <div key={i} className="p-3 rounded-lg bg-accent/20 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Example {i + 1}</span>
                {examples.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeExample(i)}>
                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
              <div>
                <Label className="text-[10px]">Customer Review</Label>
                <textarea
                  rows={2}
                  placeholder="Paste the customer's review here..."
                  value={ex.reviewText}
                  onChange={e => updateExample(i, 'reviewText', e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brass)]/30"
                />
              </div>
              <div>
                <Label className="text-[10px]">Your Reply</Label>
                <textarea
                  rows={2}
                  placeholder="Paste your reply here..."
                  value={ex.replyText}
                  onChange={e => updateExample(i, 'replyText', e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brass)]/30"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {examples.filter(e => e.reviewText && e.replyText).length} valid example{examples.filter(e => e.reviewText && e.replyText).length !== 1 ? 's' : ''} ready
        </p>
        <Button
          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {saving ? 'Saving...' : 'Save brand voice profile'}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Security Audit Log Section (Tenant-Scoped)
// ─────────────────────────────────────────────────────────
interface SecurityAuditEntry {
  id: string
  actorId: string | null
  actorEmail: string | null
  actorName: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: string | null
  ip: string | null
  createdAt: string
}

function formatAuditTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function SecurityAuditLogSection() {
  const [entries, setEntries] = useState<SecurityAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    async function loadAuditLog() {
      try {
        const res = await fetch('/api/audit-log?limit=10')
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!ignore) {
          setEntries(Array.isArray(data.entries) ? data.entries : [])
          setError(null)
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load audit events')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadAuditLog()
    return () => {
      ignore = true
    }
  }, [])

  return (
    <Card className="p-6 glass-card">
      <h3 className="font-display font-bold mb-4 flex items-center gap-2">
        <Bell className="w-4 h-4 text-[var(--brass)]" />
        Audit Log
      </h3>
      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brass)]" />
          Loading audit events...
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No audit log events recorded for this organization yet.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(log => (
            <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg bg-accent/10 text-xs gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Badge variant="outline" className="font-mono text-[10px] text-[var(--brass)] border-[var(--brass)]/30 shrink-0">
                  {log.action}
                </Badge>
                <span className="truncate text-muted-foreground">
                  {log.actorName || log.actorEmail || 'System'}
                  {log.targetType ? ` · ${log.targetType}` : ''}
                  {log.targetId ? ` (${log.targetId.slice(0, 12)})` : ''}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono shrink-0" title={new Date(log.createdAt).toLocaleString()}>
                {formatAuditTime(log.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

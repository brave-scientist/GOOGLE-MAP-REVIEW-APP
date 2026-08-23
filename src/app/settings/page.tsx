'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, User, CreditCard, Plug, Shield, Bell, Loader2, Check, Sparkles, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { InviteMemberModal } from '@/components/app/admin-modals'

interface Integration {
  provider: string
  name: string
  status: 'connected' | 'available' | 'not_configured'
  desc: string
  icon: string
  category: 'review-source' | 'communication' | 'billing' | 'alerts'
  userFacing: boolean // false = managed by platform (admin-only)
}

// AUD-01: Initial state is the SAFE default — everything starts 'available'/'not_configured'.
// The real statuses are fetched from /api/integrations on mount (see useEffect below)
// so we never hardcode 'connected' for things that may not actually be connected.
const INITIAL_INTEGRATIONS: Integration[] = [
  { provider: 'google', name: 'Google Business Profile', status: 'available', desc: 'Loading…', icon: '🔍', category: 'review-source', userFacing: true },
  { provider: 'facebook', name: 'Facebook Pages', status: 'available', desc: 'Loading…', icon: '📘', category: 'review-source', userFacing: true },
  { provider: 'yelp', name: 'Yelp', status: 'available', desc: 'Yelp partnership API', icon: '⭐', category: 'review-source', userFacing: true },
  { provider: 'trustpilot', name: 'Trustpilot', status: 'available', desc: 'Trustpilot API', icon: '✓', category: 'review-source', userFacing: true },
  { provider: 'slack', name: 'Slack', status: 'available', desc: 'Real-time alerts in your Slack channels', icon: '💬', category: 'alerts', userFacing: true },
  { provider: 'teams', name: 'Microsoft Teams', status: 'available', desc: 'Alerts via Power Automate', icon: '👥', category: 'alerts', userFacing: true },
  // Platform-managed integrations (not user-configurable)
  { provider: 'twilio', name: 'Twilio (SMS)', status: 'not_configured', desc: 'Loading…', icon: '📱', category: 'communication', userFacing: false },
  { provider: 'resend', name: 'Resend (Email)', status: 'not_configured', desc: 'Loading…', icon: '✉', category: 'communication', userFacing: false },
  { provider: 'stripe', name: 'Stripe', status: 'not_configured', desc: 'Loading…', icon: '💳', category: 'billing', userFacing: false },
]

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)
  const [processingProvider, setProcessingProvider] = useState<string | null>(null)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [fbPagePicker, setFbPagePicker] = useState<{ businessId: string; pages: Array<{ id: string; name: string; category: string }> } | null>(null)
  const [fbSelecting, setFbSelecting] = useState(false)

  // Facebook page-picker: check URL for ?facebook_pick_page=1 on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('facebook_pick_page') === '1') {
      const businessId = params.get('businessId')
      const pagesParam = params.get('pages')
      if (businessId && pagesParam) {
        try {
          const pages = JSON.parse(decodeURIComponent(pagesParam))
          setFbPagePicker({ businessId, pages })
          // Clean the URL so this doesn't re-trigger on refresh
          window.history.replaceState({}, '', '/settings')
        } catch {
          // Malformed pages param — ignore
        }
      }
    }
  }, [])

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
        const intRes = await fetch('/api/integrations')
        if (intRes.ok) {
          const intData = await intRes.json()
          if (Array.isArray(intData.integrations)) {
            setIntegrations(prev =>
              prev.map(int => {
                const fresh = intData.integrations.find((i: { provider: string; status?: string; desc?: string }) => i.provider === int.provider)
                if (!fresh) return int
                return { ...int, status: (fresh.status as Integration['status']) || int.status, desc: fresh.desc || int.desc }
              }),
            )
          }
        }
      } else {
        toast.error('Failed to connect Facebook Page', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setFbSelecting(false)
    }
  }

  // AUD-01: Fetch real integration statuses from the API on mount.
  // Replaces the hardcoded 'connected' values in INITIAL_INTEGRATIONS.
  useEffect(() => {
    let cancelled = false
    async function fetchIntegrations() {
      try {
        const res = await fetch('/api/integrations')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data.integrations)) {
          setIntegrations(prev =>
            prev.map(int => {
              const fresh = data.integrations.find(
                (i: { provider: string; status?: string; desc?: string }) => i.provider === int.provider,
              )
              if (!fresh) return int
              return {
                ...int,
                status: (fresh.status as Integration['status']) || int.status,
                desc: fresh.desc || int.desc,
              }
            }),
          )
        }
      } catch {
        // Network error — leave the safe-default initial state in place
      }
    }
    fetchIntegrations()
    return () => { cancelled = true }
  }, [])

  const handleToggleIntegration = async (int: Integration) => {
    // Google OAuth — redirect to the real OAuth flow
    if (int.provider === 'google' && int.status !== 'connected') {
      // Fetch the first business ID for the OAuth state param
      try {
        const dashRes = await fetch('/api/dashboard')
        const dashData = await dashRes.json()
        const businessId = dashData.businesses?.[0]?.id
        if (businessId) {
          window.location.href = `/api/oauth/google?businessId=${businessId}`
          return
        }
      } catch {
        toast.error('Failed to start Google OAuth')
        return
      }
    }

    // Facebook OAuth — redirect to the real OAuth flow
    if (int.provider === 'facebook' && int.status !== 'connected') {
      try {
        const dashRes = await fetch('/api/dashboard')
        const dashData = await dashRes.json()
        const businessId = dashData.businesses?.[0]?.id
        if (businessId) {
          window.location.href = `/api/oauth/facebook?businessId=${businessId}`
          return
        }
      } catch {
        toast.error('Failed to start Facebook OAuth')
        return
      }
    }

    setProcessingProvider(int.provider)
    const action = int.status === 'connected' ? 'disconnect' : 'connect'
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: int.provider, action }),
      })
      const data = await res.json()
      if (res.ok) {
        setIntegrations(prev => prev.map(i =>
          i.provider === int.provider
            ? { ...i, status: action === 'connect' ? 'connected' : 'available' }
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
    setSavingBusiness(true)
    await new Promise(r => setTimeout(r, 1000))
    setSavingBusiness(false)
    toast.success('Settings saved', { description: 'Business profile updated' })
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
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="business" className="space-y-6">
            <TabsList className="glass-card flex-wrap">
              <TabsTrigger value="business" className="text-xs">
                <Building2 className="w-3.5 h-3.5 mr-1.5" />
                Business
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
                    <Input id="name" defaultValue="Bamboo Garden Restaurant" className="mt-1.5 glass-card" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="industry">Industry</Label>
                      <Input id="industry" defaultValue="restaurant" className="mt-1.5 glass-card capitalize" />
                    </div>
                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input id="timezone" defaultValue="America/Los_Angeles" className="mt-1.5 glass-card" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" defaultValue="100 Main Street, Suite 1, San Francisco, CA 94102" className="mt-1.5 glass-card" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" defaultValue="+1 (415) 555-1000" className="mt-1.5 glass-card" />
                    </div>
                    <div>
                      <Label htmlFor="email">Reply-from Email</Label>
                      <Input id="email" defaultValue="hello@bamboogarden.com" className="mt-1.5 glass-card" />
                    </div>
                  </div>
                  <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleSaveBusiness} disabled={savingBusiness}>
                    {savingBusiness ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {savingBusiness ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </Card>
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
                                {int.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{int.desc}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={() => handleToggleIntegration(int)}
                              disabled={processingProvider === int.provider}
                            >
                              {processingProvider === int.provider ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : int.status === 'connected' ? (
                                'Disconnect'
                              ) : (
                                'Connect'
                              )}
                            </Button>
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
                      <h3 className="font-display font-bold">Current Plan</h3>
                      <p className="text-xs text-muted-foreground">Pro plan · $99/month</p>
                    </div>
                    <Badge variant="outline" className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                      Trial · 12 days left
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Businesses', value: '3 of 3' },
                      { label: 'SMS sent', value: '142 of 500' },
                      { label: 'AI drafts', value: '47 of ∞' },
                    ].map(s => (
                      <div key={s.label} className="p-3 rounded-lg bg-accent/20">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">{s.label}</div>
                        <div className="text-sm font-bold">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">Upgrade to Enterprise</Button>
                    <Button variant="outline">Manage billing</Button>
                  </div>
                </Card>

                <Card className="p-6 glass-card">
                  <h3 className="font-display font-bold mb-3">Recent Invoices</h3>
                  <div className="space-y-2">
                    {[
                      { date: 'Aug 1, 2026', amount: '$0.00', status: 'Trial' },
                      { date: 'Jul 1, 2026', amount: '$0.00', status: 'Trial' },
                    ].map(inv => (
                      <div key={inv.date} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                        <div>
                          <div className="text-sm font-medium">{inv.date}</div>
                          <div className="text-[10px] text-muted-foreground">{inv.status}</div>
                        </div>
                        <div className="text-sm font-mono">{inv.amount}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="team">
              <Card className="p-6 glass-card max-w-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-display font-bold">Team Members</h3>
                    <p className="text-xs text-muted-foreground">3 of 5 seats used on Pro plan</p>
                  </div>
                  <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setInviteOpen(true)}>Invite member</Button>
                </div>
                <div className="space-y-2">
                  {[
                    { name: 'Sarah Chen', email: 'owner@bamboogarden.com', role: 'Owner', avatar: 'SC' },
                    { name: 'Marcus Webb', email: 'manager@bamboogarden.com', role: 'Admin', avatar: 'MW' },
                    { name: 'Priya Patel', email: 'staff@bamboogarden.com', role: 'Staff', avatar: 'PP' },
                  ].map(m => (
                    <div key={m.email} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20 hover:bg-accent/30 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {m.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">{m.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                    </div>
                  ))}
                </div>
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

                <Card className="p-6 glass-card">
                  <h3 className="font-display font-bold mb-4 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[var(--brass)]" />
                    Audit Log
                  </h3>
                  <div className="space-y-2">
                    {[
                      { action: 'reply.posted', target: 'Review from Sarah C.', time: '2m ago' },
                      { action: 'draft.generated', target: 'Review from Marcus W.', time: '14m ago' },
                      { action: 'campaign.sent', target: 'Post-visit follow-up', time: '1h ago' },
                      { action: 'user.login', target: 'Sarah Chen', time: '3h ago' },
                    ].map((log, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors text-xs">
                        <div className="font-mono text-[10px] text-[var(--brass)] w-32 truncate">{log.action}</div>
                        <div className="flex-1 truncate text-muted-foreground">{log.target}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{log.time}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} />

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
                    {page.name.charAt(0).toUpperCase()}
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Brand Voice Training Tab
// ─────────────────────────────────────────────────────────
function BrandVoiceTab() {
  const [profile, setProfile] = useState<{
    id?: string
    businessId?: string
    examples: Array<{ reviewText: string; replyText: string }>
    toneGuidelines: string
    signature: string
    forbiddenPhrases: string
    updatedAt?: string | Date
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [businessId, setBusinessId] = useState<string>('')

  // Form state
  const [toneGuidelines, setToneGuidelines] = useState('')
  const [signature, setSignature] = useState('')
  const [forbiddenPhrases, setForbiddenPhrases] = useState('')
  const [examples, setExamples] = useState<Array<{ reviewText: string; replyText: string }>>([
    { reviewText: '', replyText: '' },
  ])

  useEffect(() => {
    // Fetch business ID first
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.businesses?.[0]) {
          setBusinessId(d.businesses[0].id)
          return fetch(`/api/brand-voice?businessId=${d.businesses[0].id}`)
        }
      })
      .then(r => r?.json())
      .then(d => {
        if (d?.profile) {
          setProfile(d.profile)
          setToneGuidelines(d.profile.toneGuidelines || '')
          setSignature(d.profile.signature || '')
          setForbiddenPhrases(d.profile.forbiddenPhrases || '')
          setExamples(d.profile.examples?.length > 0 ? d.profile.examples : [{ reviewText: '', replyText: '' }])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/brand-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
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

'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CreditCard, Check, Crown, Zap, Calendar, AlertCircle, Building2, Shield, Info, ExternalLink, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface MeResponse {
  user: { name: string | null; email: string; orgPlan: string | null; role: string } | null
  isAdmin: boolean
}

interface DashboardResponse {
  businesses?: Array<{ id: string; name: string }>
}

interface BillingResponse {
  plan: string
  stripeSubscriptionStatus: string | null
  hasStripeCustomer: boolean
  trialEndsAt: string | null
  isConfigured: boolean
  canManageBilling: boolean
}

const PLANS = [
  {
    name: 'Free',
    planKey: 'FREE',
    price: 0,
    desc: 'For solo operators',
    features: ['1 business', '50 reviews/mo', 'Manual reply', 'Basic analytics'],
  },
  {
    name: 'Starter',
    planKey: 'STARTER',
    price: 49,
    desc: 'For single-location',
    features: ['1 business', '500 reviews/mo', 'AI draft replies', '1 widget', 'Email support'],
  },
  {
    name: 'Pro',
    planKey: 'PRO',
    price: 99,
    desc: 'For multi-location teams',
    features: ['3 businesses', 'Unlimited reviews', 'Brand voice training', 'All widgets', 'Competitor intel', 'Priority support'],
  },
  {
    name: 'Enterprise',
    planKey: 'ENTERPRISE',
    price: 299,
    desc: 'For agencies & chains',
    features: ['Unlimited businesses', 'Agency mode', 'White-label', 'Dedicated CSM', '99.9% SLA', 'Bulk actions across clients'],
  },
]

export default function BillingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [currentPlanKey, setCurrentPlanKey] = useState<string>('STARTER')
  const [businessCount, setBusinessCount] = useState<number>(0)
  const [billingData, setBillingData] = useState<BillingResponse | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bannerNotice] = useState<{ type: 'success' | 'canceled'; message: string } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'true') {
        return {
          type: 'success',
          message: 'Stripe checkout completed successfully! Your subscription is synchronizing with your organization account.',
        }
      }
      if (params.get('canceled') === 'true') {
        return {
          type: 'canceled',
          message: 'Checkout session was canceled. No changes were made to your subscription.',
        }
      }
    } catch {
      // ignore
    }
    return null
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/dashboard').then(r => r.ok ? r.json() : null),
      fetch('/api/billing').then(r => r.ok ? r.json() : null),
    ])
      .then(([meData, dashData, billData]: [MeResponse | null, DashboardResponse | null, BillingResponse | null]) => {
        if (billData?.plan) {
          setCurrentPlanKey(billData.plan.toUpperCase())
        } else if (meData?.user?.orgPlan) {
          setCurrentPlanKey(meData.user.orgPlan.toUpperCase())
        }
        if (billData) {
          setBillingData(billData)
        }
        if (Array.isArray(dashData?.businesses)) {
          setBusinessCount(dashData.businesses.length)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCheckout(targetPlan: string) {
    if (targetPlan === 'FREE') return
    setActionLoading(`checkout_${targetPlan}`)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan, billingCycle }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to initiate checkout session')
        return
      }
      if (data.url) {
        window.location.assign(data.url)
      }
    } catch {
      toast.error('Network error connecting to Stripe checkout service')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleOpenPortal() {
    setActionLoading('portal')
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to open Stripe billing portal')
        return
      }
      if (data.url) {
        window.location.assign(data.url)
      }
    } catch {
      toast.error('Network error connecting to customer portal')
    } finally {
      setActionLoading(null)
    }
  }

  const currentPlanObj = PLANS.find(p => p.planKey === currentPlanKey) || PLANS[1]
  const isOwnerOrAdmin = billingData?.canManageBilling ?? false

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Billing & Plans"
          description="View your active subscription tier and plan features"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Status banner from Stripe redirect */}
          {bannerNotice && (
            <div className={cn(
              'p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed',
              bannerNotice.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}>
              {bannerNotice.type === 'success' ? (
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
              )}
              <div>
                <p className="font-semibold text-sm text-foreground">
                  {bannerNotice.type === 'success' ? 'Payment Completed' : 'Checkout Canceled'}
                </p>
                <p>{bannerNotice.message}</p>
              </div>
            </div>
          )}

          {/* Configuration / Environment Notice if Stripe is not configured */}
          {billingData && !billingData.isConfigured && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 flex items-start gap-3">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
              <div className="text-xs leading-relaxed space-y-1">
                <p className="font-semibold text-sm text-foreground">Stripe Live Configuration Pending</p>
                <p className="text-muted-foreground">
                  Production Stripe API keys are awaiting environment deployment. Self-serve credit card checkout will activate automatically once Stripe credentials are configured.
                </p>
              </div>
            </div>
          )}

          <Tabs defaultValue="plans" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="plans" className="text-xs">
                <Crown className="w-3.5 h-3.5 mr-1.5" />
                Plans
              </TabsTrigger>
              <TabsTrigger value="usage" className="text-xs">
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Usage
              </TabsTrigger>
              <TabsTrigger value="invoices" className="text-xs">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="payment" className="text-xs">
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                Payment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plans">
              {/* Current plan card */}
              <Card className="p-5 glass-card mb-6 border-[var(--brass)]/30">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/20">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-bold text-lg">{currentPlanObj.name} Plan</h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-mono text-[10px]',
                            billingData?.stripeSubscriptionStatus === 'past_due'
                              ? 'bg-destructive/10 text-destructive border-destructive/30'
                              : 'bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30'
                          )}
                        >
                          {billingData?.stripeSubscriptionStatus?.toUpperCase() || 'ACTIVE'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {currentPlanObj.desc} · {billingData?.hasStripeCustomer ? 'Connected to Stripe Billing' : 'Organization Tier'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {billingData?.hasStripeCustomer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={handleOpenPortal}
                        disabled={actionLoading === 'portal' || !isOwnerOrAdmin}
                      >
                        {actionLoading === 'portal' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Manage in Stripe Portal
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Billing cycle toggle */}
              <div className="flex items-center justify-center mb-6">
                <div className="inline-flex items-center gap-1 p-1 glass-card rounded-full">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                      billingCycle === 'monthly' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('annual')}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5',
                      billingCycle === 'annual' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Annual
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-[var(--brass)]/40 text-[var(--brass)]">Save 20%</Badge>
                  </button>
                </div>
              </div>

              {/* Plans grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLANS.map(plan => {
                  const price = billingCycle === 'annual' ? Math.round(plan.price * 0.8) : plan.price
                  const isCurrent = plan.planKey === currentPlanKey
                  const isCheckoutLoading = actionLoading === `checkout_${plan.planKey}`

                  return (
                    <Card
                      key={plan.name}
                      className={cn(
                        'p-5 glass-card flex flex-col',
                        isCurrent && 'border-2 border-[var(--brass)]/40 shadow-lg shadow-[var(--brass)]/10'
                      )}
                    >
                      {isCurrent && (
                        <div className="mb-3">
                          <Badge className="bg-[var(--brass)] text-white text-[10px]">Current Plan</Badge>
                        </div>
                      )}
                      <div className="mb-3">
                        <h3 className="font-display font-bold text-lg mb-1">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground">{plan.desc}</p>
                      </div>
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-3xl font-bold">${price}</span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        {billingCycle === 'annual' && plan.price > 0 && (
                          <p className="text-[10px] text-[var(--brass)] mt-1">Billed annually (${price * 12}/yr)</p>
                        )}
                      </div>

                      {isCurrent ? (
                        <Button
                          className="w-full mb-4 text-xs font-medium bg-muted/30 text-muted-foreground cursor-default"
                          disabled
                        >
                          Current Active Tier
                        </Button>
                      ) : plan.planKey === 'FREE' ? (
                        <Button
                          className="w-full mb-4 text-xs font-medium"
                          variant="outline"
                          onClick={handleOpenPortal}
                          disabled={!billingData?.hasStripeCustomer || !isOwnerOrAdmin}
                        >
                          {billingData?.hasStripeCustomer ? 'Change in Portal' : 'Included'}
                        </Button>
                      ) : (
                        <Button
                          className="w-full mb-4 text-xs font-medium bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white shadow-sm"
                          onClick={() => handleCheckout(plan.planKey)}
                          disabled={isCheckoutLoading || !isOwnerOrAdmin}
                        >
                          {isCheckoutLoading ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Connecting...
                            </span>
                          ) : !isOwnerOrAdmin ? (
                            'Admin Only'
                          ) : (
                            `Upgrade to ${plan.name}`
                          )}
                        </Button>
                      )}

                      <ul className="space-y-2 flex-1">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-[var(--brass)] flex-shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>

            <TabsContent value="usage">
              <div className="space-y-4">
                <Card className="p-5 glass-card">
                  <h3 className="font-display font-bold mb-2">Usage & Limits</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Active resources associated with your organization tenant.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="p-4 glass-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">Active Businesses</div>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="font-display text-2xl font-bold">{businessCount}</span>
                        <span className="text-xs text-muted-foreground">locations</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Queried from live tenant database</div>
                    </Card>

                    <Card className="p-4 glass-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">SMS Quota</div>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="font-display text-2xl font-bold">Audit-Gated</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Enforced via daily TCPA rate limits</div>
                    </Card>

                    <Card className="p-4 glass-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">AI Drafts</div>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="font-display text-2xl font-bold">Active</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">ReviewReply AI brand voice generation enabled</div>
                    </Card>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="invoices">
              <Card className="p-8 glass-card text-center max-w-xl mx-auto">
                <div className="w-12 h-12 rounded-full bg-accent/40 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-display font-bold text-base mb-1">Invoices & Receipts</h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto leading-relaxed">
                  {billingData?.hasStripeCustomer
                    ? 'All past billing statements and official invoices are securely hosted in your Stripe Customer Portal.'
                    : 'Electronic invoices will be available once your organization initiates a paid subscription via Stripe.'}
                </p>
                {billingData?.hasStripeCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 mx-auto"
                    onClick={handleOpenPortal}
                    disabled={actionLoading === 'portal' || !isOwnerOrAdmin}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Stripe Portal
                  </Button>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <Card className="p-8 glass-card text-center max-w-xl mx-auto">
                <div className="w-12 h-12 rounded-full bg-accent/40 flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-display font-bold text-base mb-1">Payment Methods</h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto leading-relaxed">
                  {billingData?.hasStripeCustomer
                    ? 'Payment cards and bank accounts are managed directly through Stripe PCI-compliant infrastructure.'
                    : 'Payment methods will be attached upon starting your first Stripe subscription.'}
                </p>
                {billingData?.hasStripeCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 mx-auto"
                    onClick={handleOpenPortal}
                    disabled={actionLoading === 'portal' || !isOwnerOrAdmin}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Manage Cards in Stripe Portal
                  </Button>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

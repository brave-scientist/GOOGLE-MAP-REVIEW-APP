'use client'

import { useState } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CreditCard, Check, Download, Zap, Crown, Building2, Star, TrendingUp,
  ArrowRight, Calendar, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PLANS = [
  {
    name: 'Free',
    price: 0,
    desc: 'For solo operators',
    features: ['1 business', '50 reviews/mo', 'Manual reply', 'Basic analytics'],
    current: false,
  },
  {
    name: 'Starter',
    price: 49,
    desc: 'For single-location',
    features: ['1 business', '500 reviews/mo', 'AI draft replies', '1 widget', 'Email support'],
    current: false,
  },
  {
    name: 'Pro',
    price: 99,
    desc: 'For multi-location teams',
    features: ['3 businesses', 'Unlimited reviews', 'Brand voice training', 'All widgets', 'Competitor intel', 'Priority support'],
    current: true,
  },
  {
    name: 'Enterprise',
    price: 299,
    desc: 'For agencies & chains',
    features: ['Unlimited businesses', 'Agency mode', 'SSO/SAML', 'White-label', 'Dedicated CSM', '99.9% SLA'],
    current: false,
  },
]

export default function BillingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Billing & Plans"
          description="Manage your subscription, usage, and invoices"
        />
        <div className="p-4 sm:p-6">
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
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-bold text-lg">Pro Plan</h3>
                        <Badge variant="outline" className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                          Trial · 12 days left
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">$99/month · billed monthly · renews Aug 18, 2026</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => toast.info('Opening customer portal...')}>Manage subscription</Button>
                    <Button size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-8" onClick={() => toast.success('Redirecting to checkout...', { description: 'Enterprise plan · $299/month' })}>
                      Upgrade to Enterprise
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
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
                  return (
                    <Card
                      key={plan.name}
                      className={cn(
                        'p-5 glass-card flex flex-col',
                        plan.current && 'border-2 border-[var(--brass)]/40 shadow-lg shadow-[var(--brass)]/10'
                      )}
                    >
                      {plan.current && (
                        <div className="mb-3">
                          <Badge className="bg-[var(--brass)] text-white">Current Plan</Badge>
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
                      <Button
                        className={cn(
                          'w-full mb-4',
                          plan.current
                            ? 'bg-muted/20 text-muted-foreground cursor-default'
                            : plan.name === 'Enterprise'
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]'
                        )}
                        disabled={plan.current}
                        onClick={() => !plan.current && toast.success(`Upgrading to ${plan.name}...`, { description: 'Redirecting to checkout' })}
                      >
                        {plan.current ? 'Current plan' : `Upgrade to ${plan.name}`}
                      </Button>
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
                  <h3 className="font-display font-bold mb-4">Current Billing Period</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Period</div>
                      <div className="text-sm font-medium">Aug 6 — Sep 6, 2026</div>
                      <div className="text-[10px] text-muted-foreground">12 days remaining</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Plan limit</div>
                      <div className="text-sm font-medium">$99/month</div>
                      <div className="text-[10px] text-muted-foreground">Pro plan</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Next charge</div>
                      <div className="text-sm font-medium">Sep 6, 2026</div>
                      <div className="text-[10px] text-muted-foreground">$99.00</div>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Businesses', used: 3, limit: 3, unit: '' },
                    { label: 'SMS Sent', used: 142, limit: 500, unit: 'messages' },
                    { label: 'AI Drafts', used: 47, limit: null, unit: 'drafts' },
                  ].map(u => {
                    const pct = u.limit ? (u.used / u.limit) * 100 : 0
                    return (
                      <Card key={u.label} className="p-5 glass-card">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">{u.label}</div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <span className="font-display text-2xl font-bold">{u.used}</span>
                          {u.limit && <span className="text-sm text-muted-foreground">/ {u.limit} {u.unit}</span>}
                          {!u.limit && <span className="text-sm text-muted-foreground">{u.unit}</span>}
                        </div>
                        {u.limit && (
                          <>
                            <div className="w-full h-1.5 rounded-full bg-muted/30 mb-1 overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', pct > 80 ? 'bg-amber-500' : 'bg-[var(--brass)]')}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-muted-foreground">{Math.round(pct)}% used</div>
                          </>
                        )}
                        {!u.limit && <div className="text-[10px] text-muted-foreground">Unlimited</div>}
                      </Card>
                    )
                  })}
                </div>

                <Card className="p-5 glass-card">
                  <h3 className="font-display font-bold mb-1">Overage Rates</h3>
                  <p className="text-xs text-muted-foreground mb-4">If you exceed your plan limits, these rates apply automatically.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Additional SMS', rate: '$0.035', unit: 'per message' },
                      { label: 'Additional AI draft', rate: '$0.02', unit: 'per draft' },
                      { label: 'Additional business', rate: '$29', unit: 'per month' },
                    ].map(o => (
                      <div key={o.label} className="p-3 rounded-lg bg-accent/20">
                        <div className="text-xs text-muted-foreground mb-1">{o.label}</div>
                        <div className="flex items-baseline gap-1">
                          <span className="font-bold text-lg">{o.rate}</span>
                          <span className="text-[10px] text-muted-foreground">{o.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="invoices">
              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-4">Invoice History</h3>
                <div className="space-y-2">
                  {[
                    { id: 'INV-2026-08', date: 'Aug 6, 2026', amount: '$0.00', status: 'Trial', desc: 'Pro plan — 14-day trial' },
                    { id: 'INV-2026-07', date: 'Jul 6, 2026', amount: '$0.00', status: 'Trial', desc: 'Pro plan — 14-day trial' },
                  ].map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20 hover:bg-accent/30 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{inv.id}</div>
                        <div className="text-[10px] text-muted-foreground">{inv.date} · {inv.desc}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                      <span className="text-sm font-mono w-16 text-right">{inv.amount}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toast.info('Downloading invoice...')}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-accent/20 text-center">
                  <p className="text-xs text-muted-foreground">
                    Need a custom invoice or receipt?{' '}
                    <button className="text-[var(--brass)] hover:underline">Contact billing</button>
                  </p>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <Card className="p-5 glass-card max-w-lg">
                <h3 className="font-display font-bold mb-1">Payment Method</h3>
                <p className="text-xs text-muted-foreground mb-5">No payment method on file — you&apos;re on a free trial.</p>

                <div className="p-4 rounded-lg border-2 border-dashed border-border/40 text-center mb-4">
                  <CreditCard className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium mb-1">Add a payment method</p>
                  <p className="text-xs text-muted-foreground mb-3">We&apos;ll charge $99 when your trial ends on Aug 18, 2026</p>
                  <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => toast.success('Redirecting to Stripe...', { description: 'Secure checkout via Stripe' })}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add credit card
                  </Button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    Secured by Stripe (PCI DSS Level 1)
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    Cancel anytime — no contracts
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    30-day money-back guarantee
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { CampaignBuilder } from '@/components/app/campaign-builder'
import { useActiveBusiness } from '@/lib/business-context'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Target, TrendingUp, Star, MessageSquare, AlertCircle,
  ArrowUp, ArrowDown, Lightbulb, Plus, Loader2, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

interface Competitor {
  id: string
  name: string
  rating: number
  ratingTrend: number
  reviews: number
  reviewVelocity: number
  responseRate: number
  sentimentScore: number
  isYou?: boolean
}

interface StrategySuggestion {
  priority: 'High' | 'Medium' | 'Low'
  title: string
  desc: string
  impact: string
  actionType?: string
  actionLabel?: string
}

interface AlertData {
  type: 'warning' | 'info' | 'success'
  competitorName: string
  title: string
  message: string
  actionText?: string
  actionType?: string
}

export default function CompetitorsPage() {
  const { activeBusiness, activeBusinessId } = useActiveBusiness()
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [strategySuggestions, setStrategySuggestions] = useState<StrategySuggestion[]>([])
  const [alertData, setAlertData] = useState<AlertData | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newRating, setNewRating] = useState('4.2')
  const [newReviews, setNewReviews] = useState('50')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let ignore = false
    async function loadCompetitors() {
      setLoading(true)
      try {
        const query = activeBusinessId ? `?businessId=${encodeURIComponent(activeBusinessId)}` : ''
        const [compRes, dashRes] = await Promise.all([
          fetch(`/api/competitors${query}`),
          fetch('/api/dashboard').catch(() => null),
        ])

        const compData = await compRes.json().catch(() => ({ competitors: [] }))
        const dashData = dashRes && dashRes.ok ? await dashRes.json().catch(() => null) : null

        // Derive primary business stats from activeBusiness context or dashboard
        const matchedBiz = activeBusiness || (dashData?.businesses?.find((b: { id: string }) => b.id === activeBusinessId) || dashData?.businesses?.[0])
        const bizName = matchedBiz?.name || compData.business?.name || 'Your Business'
        const bizRating = matchedBiz?.avgRating ?? (compData.business?.avgRating ?? 0)
        const bizReviews = matchedBiz?.reviewCount ?? (compData.business?.reviewCount ?? 0)
        const bizVelocity = compData.business?.reviewVelocity ?? Math.max(0, Math.round(bizReviews / 20))
        const bizResponseRate = compData.business?.responseRate ?? (dashData?.metrics?.responseRate ? Math.round(dashData.metrics.responseRate) : 0)

        const youEntry: Competitor = {
          id: 'you',
          name: `${bizName} (You)`,
          rating: Math.round(bizRating * 10) / 10,
          ratingTrend: 0,
          reviews: bizReviews,
          reviewVelocity: bizVelocity,
          responseRate: bizResponseRate,
          sentimentScore: 0.7,
          isYou: true,
        }

        if (!ignore) {
          const remoteCompetitors: Competitor[] = compData.competitors || []
          setCompetitors([youEntry, ...remoteCompetitors])
          setStrategySuggestions(compData.suggestions || [])
          setAlertData(compData.alert || null)
        }
      } catch (e) {
        if (!ignore) {
          console.error('Failed to fetch competitors:', e)
          toast.error('Failed to load competitor data')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadCompetitors()
    return () => {
      ignore = true
    }
  }, [activeBusiness, activeBusinessId])

  const handleDeleteCompetitor = async (comp: Competitor) => {
    if (comp.isYou) return
    if (!confirm(`Are you sure you want to stop tracking "${comp.name}"?`)) return
    try {
      const res = await fetch(`/api/competitors?id=${encodeURIComponent(comp.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Competitor "${comp.name}" removed`)
        setCompetitors(prev => prev.filter(c => c.id !== comp.id))
      } else {
        toast.error('Failed to remove competitor', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    }
  }

  const handleAddCompetitor = async () => {
    if (!newName.trim()) {
      toast.error('Name required', { description: 'Please enter a competitor name' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          googleMapsUrl: newUrl.trim() || undefined,
          businessId: activeBusinessId || undefined,
          rating: newRating ? parseFloat(newRating) : undefined,
          reviewCount: newReviews ? parseInt(newReviews, 10) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.competitor) {
        toast.success('Competitor added!', {
          description: `Now tracking ${data.competitor.name}. Snapshots will be recorded weekly.`,
        })
        const created: Competitor = {
          id: data.competitor.id,
          name: data.competitor.name,
          rating: Math.round(data.competitor.rating * 10) / 10,
          ratingTrend: 0,
          reviews: data.competitor.reviews ?? data.competitor.reviewCount ?? 0,
          reviewVelocity: data.competitor.reviewVelocity ?? 0,
          responseRate: data.competitor.responseRate ?? 0,
          sentimentScore: data.competitor.sentimentScore ?? 0.5,
        }
        setCompetitors(prev => [...prev, created])
        setNewName('')
        setNewUrl('')
        setNewRating('4.2')
        setNewReviews('50')
        setAddOpen(false)
      } else {
        toast.error('Failed to add competitor', { description: data.error || 'Unknown error' })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setAdding(false)
    }
  }

  const you = competitors.find(c => c.isYou) || competitors[0]
  const competitorsOnly = competitors.filter(c => !c.isYou)

  const avgCompRating = competitorsOnly.length > 0
    ? Math.round((competitorsOnly.reduce((s, c) => s + c.rating, 0) / competitorsOnly.length) * 10) / 10
    : 0
  const ratingGap = competitorsOnly.length > 0 && you
    ? Math.round((you.rating - avgCompRating) * 10) / 10
    : null
  const avgCompResponse = competitorsOnly.length > 0
    ? Math.round(competitorsOnly.reduce((s, c) => s + c.responseRate, 0) / competitorsOnly.length)
    : 0
  const avgCompVelocity = competitorsOnly.length > 0
    ? Math.round(competitorsOnly.reduce((s, c) => s + c.reviewVelocity, 0) / competitorsOnly.length)
    : 0

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Competitor Intelligence"
          description="Weekly benchmark against your local competitors"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Dynamic Alert Banner or Clean Onboarding State */}
          {competitorsOnly.length === 0 ? (
            <Card className="p-4 glass-card border-border/30 bg-muted/10">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 text-[var(--brass)]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-sm mb-1">Track your local competitors</h3>
                  <p className="text-xs text-muted-foreground">
                    Add competitors in your local area to benchmark your rating, monitor review velocity, and unlock automated strategic suggestions.
                  </p>
                </div>
                <Button size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs flex-shrink-0" onClick={() => setAddOpen(true)}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add competitor
                </Button>
              </div>
            </Card>
          ) : alertData ? (
            <Card className={cn(
              "p-4 glass-card",
              alertData.type === 'warning' ? "border-amber-500/30 bg-amber-500/5" : "border-blue-500/30 bg-blue-500/5"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  alertData.type === 'warning' ? "bg-amber-500/10" : "bg-blue-500/10"
                )}>
                  <AlertCircle className={cn("w-4 h-4", alertData.type === 'warning' ? "text-amber-500" : "text-blue-500")} />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-sm mb-1">{alertData.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {alertData.message}
                  </p>
                </div>
                {alertData.actionType === 'campaign' ? (
                  <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600 h-7 text-xs flex-shrink-0" onClick={() => setCampaignOpen(true)}>
                    {alertData.actionText || 'Launch campaign'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" asChild>
                    <Link href="/inbox">
                      {alertData.actionText || 'View inbox'}
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ) : null}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Your Rank',
                value: competitorsOnly.length > 0 ? `#${competitors.filter(c => !c.isYou && c.rating > (you?.rating || 0)).length + 1}` : '—',
                sub: competitorsOnly.length > 0 ? `of ${competitors.length} in benchmark` : 'No competitors tracked',
                icon: Target,
                color: 'text-[var(--brass)]',
              },
              {
                label: 'Rating Gap',
                value: ratingGap !== null ? (ratingGap >= 0 ? `+${ratingGap.toFixed(1)}` : `${ratingGap.toFixed(1)}`) : '—',
                sub: ratingGap !== null ? (ratingGap >= 0 ? 'above competitor avg' : 'below competitor avg') : 'Track competitors to compare',
                icon: Star,
                color: ratingGap !== null && ratingGap >= 0 ? 'text-green-500' : 'text-amber-500',
              },
              {
                label: 'Response Rate',
                value: `${you?.responseRate || 0}%`,
                sub: competitorsOnly.length > 0
                  ? `${Math.abs(Math.round((you?.responseRate || 0) - avgCompResponse))}% ${(you?.responseRate || 0) >= avgCompResponse ? 'above' : 'below'} competitors`
                  : 'Your business reply rate',
                icon: MessageSquare,
                color: 'text-blue-500',
              },
              {
                label: 'Review Velocity',
                value: `${you?.reviewVelocity || 0}/wk`,
                sub: competitorsOnly.length > 0
                  ? `${Math.abs(Math.round((you?.reviewVelocity || 0) - avgCompVelocity))}/wk ${(you?.reviewVelocity || 0) >= avgCompVelocity ? 'above' : 'below'} competitors`
                  : 'Your weekly review pace',
                icon: TrendingUp,
                color: 'text-amber-500',
              },
            ].map(s => (
              <Card key={s.label} className="p-4 glass-card">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                  <s.icon className={cn('w-3.5 h-3.5', s.color)} />
                </div>
                <div className="font-display text-2xl font-bold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
              </Card>
            ))}
          </div>

          {/* Competitor comparison table */}
          <Card className="p-5 glass-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display font-bold">Competitive Benchmark</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Benchmark your business against tracked local competitors. Weekly snapshots capture rating and velocity trends.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                <Plus className="w-3 h-3 mr-1" />
                Add competitor
              </Button>
            </div>

            <div className="overflow-x-auto scrollbar-premium -mx-4 sm:mx-0 px-4 sm:px-0">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-12 gap-2 pb-3 border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <div className="col-span-4">Business</div>
                  <div className="col-span-2 text-center">Rating</div>
                  <div className="col-span-2 text-center">Reviews</div>
                  <div className="col-span-2 text-center">Velocity</div>
                  <div className="col-span-2 text-center">Response</div>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--brass)]" />
                    Loading competitors...
                  </div>
                ) : (
                  <>
                    {competitors.map(c => (
                      <div
                        key={c.id}
                        className={cn(
                          'grid grid-cols-12 gap-2 py-3 border-b border-border/20 items-center group transition-colors',
                          c.isYou ? 'bg-[var(--brass)]/5 -mx-2 px-2 rounded' : 'hover:bg-muted/10'
                        )}
                      >
                        <div className="col-span-4 flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                            c.isYou ? 'bg-[var(--brass)] text-white' : 'bg-muted/40'
                          )}>
                            {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                              {c.name}
                              {c.isYou && (
                                <Badge variant="outline" className="text-[9px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                                  You
                                </Badge>
                              )}
                            </div>
                          </div>
                          {!c.isYou && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete competitor"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteCompetitor(c)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
                            <span className="font-bold text-sm">{c.rating}</span>
                          </div>
                          <div className={cn(
                            'text-[10px] font-mono flex items-center justify-center gap-0.5',
                            c.ratingTrend > 0 ? 'text-green-500' : c.ratingTrend < 0 ? 'text-red-500' : 'text-muted-foreground'
                          )}>
                            {c.ratingTrend > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : c.ratingTrend < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : null}
                            {c.ratingTrend !== 0 ? Math.abs(c.ratingTrend) : '—'}
                          </div>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="font-bold text-sm">{c.reviews}</div>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="font-bold text-sm">{c.reviewVelocity}/wk</div>
                          <div className="text-[10px] text-muted-foreground">reviews</div>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="font-bold text-sm">{c.responseRate}%</div>
                          <div className="w-full h-1 rounded-full bg-muted/30 mt-1 overflow-hidden">
                            <div className="h-full bg-[var(--brass)]" style={{ width: `${Math.min(100, Math.max(0, c.responseRate))}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {competitorsOnly.length === 0 && (
                      <div className="py-8 text-center border-t border-border/20">
                        <Target className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs font-medium">No external competitors added yet</p>
                        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto mt-1 mb-3">
                          Add your top local competitors to benchmark ratings and weekly review velocity.
                        </p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                          <Plus className="w-3 h-3 mr-1" />
                          Add your first competitor
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Authentic Strategy Suggestions */}
          <Card className="p-5 glass-card">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-[var(--brass)]" />
              <h3 className="font-display font-bold">Competitive Strategy Suggestions</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              {competitorsOnly.length > 0
                ? 'Actionable recommendations generated from benchmark performance differentials'
                : 'Add competitors to unlock automated benchmark analysis and strategic suggestions'}
            </p>

            {competitorsOnly.length === 0 ? (
              <div className="p-6 text-center rounded-lg bg-accent/10 border border-dashed border-border/40">
                <Lightbulb className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">No competitor benchmark data available</p>
                <p className="text-[11px] text-muted-foreground/80 max-w-md mx-auto mt-1">
                  Once you add competitors, the system analyzes rating gaps, velocity deficits, and response rate targets to generate targeted action items.
                </p>
              </div>
            ) : strategySuggestions.length > 0 ? (
              <div className="space-y-3">
                {strategySuggestions.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-accent/20 border border-border/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={cn(
                        'text-[9px]',
                        s.priority === 'High' ? 'bg-red-500/10 text-red-600 border-red-500/30' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/30'
                      )}>
                        {s.priority}
                      </Badge>
                      <h4 className="text-sm font-medium flex-1">{s.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{s.desc}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Projected impact:</span>
                        <Badge variant="outline" className="text-[9px] text-[var(--brass)] border-[var(--brass)]/30 font-mono">
                          {s.impact}
                        </Badge>
                      </div>
                      {s.actionType === 'campaign' ? (
                        <Button size="sm" className="h-6 text-[10px] bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setCampaignOpen(true)}>
                          {s.actionLabel || 'Take action'}
                        </Button>
                      ) : s.actionType === 'widgets' ? (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" asChild>
                          <Link href="/widgets">
                            {s.actionLabel || 'View widgets'}
                          </Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" asChild>
                          <Link href="/inbox">
                            {s.actionLabel || 'Go to inbox'}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center rounded-lg bg-accent/10 border border-border/20">
                <p className="text-xs text-muted-foreground">
                  Your business is currently pacing ahead across all key metrics. Maintain active review collection to preserve your lead.
                </p>
              </div>
            )}
          </Card>
        </div>
      </main>
      <MobileNav />

      {/* Add Competitor Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="font-display">Add Competitor</DialogTitle>
            <DialogDescription>
              Enter a competitor&apos;s business name and Google Maps URL to begin tracking their public review metrics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="comp-name">Competitor business name</Label>
              <Input
                id="comp-name"
                placeholder="e.g. Rival Cafe"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="comp-url">Google Maps URL (optional)</Label>
              <Input
                id="comp-url"
                placeholder="https://maps.google.com/..."
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Providing the public Maps URL anchors the business identity for snapshot history.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <Label htmlFor="comp-rating" className="text-xs">Current rating (1.0–5.0)</Label>
                <Input
                  id="comp-rating"
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newRating}
                  onChange={e => setNewRating(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="comp-reviews" className="text-xs">Total review count</Label>
                <Input
                  id="comp-reviews"
                  type="number"
                  min="0"
                  value={newReviews}
                  onChange={e => setNewReviews(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleAddCompetitor} disabled={adding || !newName.trim()}>
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add competitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Builder (launched from alerts/recommendations) */}
      <CampaignBuilder open={campaignOpen} onOpenChange={setCampaignOpen} />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { CampaignBuilder } from '@/components/app/campaign-builder'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Target, TrendingUp, TrendingDown, Star, Users, MessageSquare, AlertCircle,
  ArrowUp, ArrowDown, Lightbulb, Plus, Loader2, Send, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchCompetitors()
  }, [])

  const fetchCompetitors = async () => {
    try {
      const res = await fetch('/api/competitors')
      const data = await res.json()
      // Add "you" entry at the top
      const youEntry: Competitor = {
        id: 'you',
        name: 'Bamboo Garden (You)',
        rating: 4.6,
        ratingTrend: 0.3,
        reviews: 247,
        reviewVelocity: 12,
        responseRate: 87,
        sentimentScore: 0.72,
        isYou: true,
      }
      setCompetitors([youEntry, ...(data.competitors || [])])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCompetitor = async () => {
    if (!newName) {
      toast.error('Name required', { description: 'Please enter a competitor name' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, googleMapsUrl: newUrl }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Competitor added!', {
          description: `Now tracking ${newName}. Weekly updates will appear here.`,
        })
        setCompetitors(prev => [...prev, {
          id: data.competitor.id,
          name: data.competitor.name,
          rating: Math.round(data.competitor.rating * 10) / 10,
          ratingTrend: 0,
          reviews: data.competitor.reviews,
          reviewVelocity: data.competitor.velocity,
          responseRate: data.competitor.responseRate,
          sentimentScore: Math.round(data.competitor.sentiment * 100) / 100,
        }])
        setNewName('')
        setNewUrl('')
        setAddOpen(false)
      } else {
        toast.error('Failed to add', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setAdding(false)
    }
  }

  const you = competitors.find(c => c.isYou) || competitors[0]
  const competitorsOnly = competitors.filter(c => !c.isYou)

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Competitor Intelligence"
          description="Weekly benchmark against your local competitors"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Alert banner */}
          <Card className="p-4 glass-card border-amber-500/30 bg-amber-500/5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm mb-1">Golden Dragon is running a review campaign</h3>
                <p className="text-xs text-muted-foreground">
                  Golden Dragon&apos;s review velocity jumped 50% week-over-week (18 reviews/week vs their 12 average). They likely launched a review request campaign. Consider running one of your own to keep pace.
                </p>
              </div>
              <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600 h-7 text-xs flex-shrink-0" onClick={() => setCampaignOpen(true)}>
                Launch campaign
              </Button>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Your Rank', value: `#${competitors.length > 0 ? competitors.filter(c => !c.isYou && c.rating > (you?.rating || 0)).length + 1 : 1}`, sub: `of ${competitors.length} total`, icon: Target, color: 'text-[var(--brass)]' },
              { label: 'Rating Gap', value: competitorsOnly.length > 0 ? `+${Math.max(0, (you?.rating || 0) - (competitorsOnly.reduce((s, c) => s + c.rating, 0) / competitorsOnly.length)).toFixed(1)}` : '—', sub: 'vs market avg', icon: Star, color: 'text-green-500' },
              { label: 'Response Rate', value: `${you?.responseRate || 0}%`, sub: '25% above market', icon: MessageSquare, color: 'text-blue-500' },
              { label: 'Review Velocity', value: `${you?.reviewVelocity || 0}/wk`, sub: 'below market avg', icon: TrendingUp, color: 'text-amber-500' },
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
                  Showing demo data · Real competitor sync (Google Places API) is on our roadmap
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
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading competitors...</div>
                ) : (
                  competitors.map(c => (
                    <div key={c.id} className={cn(
                      'grid grid-cols-12 gap-2 py-3 border-b border-border/20 items-center',
                      c.isYou && 'bg-[var(--brass)]/5 -mx-2 px-2 rounded'
                    )}>
                      <div className="col-span-4 flex items-center gap-2">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                          c.isYou ? 'bg-[var(--brass)] text-white' : 'bg-muted/40'
                        )}>
                          {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            {c.name}
                            {c.isYou && <Badge variant="outline" className="text-[9px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">You</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
                          <span className="font-bold text-sm">{c.rating}</span>
                        </div>
                        <div className={cn('text-[10px] font-mono flex items-center justify-center gap-0.5', c.ratingTrend > 0 ? 'text-green-500' : c.ratingTrend < 0 ? 'text-red-500' : 'text-muted-foreground')}>
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
                          <div className="h-full bg-[var(--brass)]" style={{ width: `${c.responseRate}%` }} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>

          {/* AI Strategy suggestions */}
          <Card className="p-5 glass-card">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-[var(--brass)]" />
              <h3 className="font-display font-bold">AI Strategy Suggestions</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Generated by AI · based on competitor analysis</p>
            <div className="space-y-3">
              {[
                {
                  priority: 'High',
                  title: 'Run a review request campaign this week',
                  desc: 'Your review velocity (12/wk) is below the market average (16/wk). Golden Dragon is pulling ahead with 18/wk. Launch a post-visit SMS campaign to recent customers.',
                  impact: '+8-12 reviews/week',
                },
                {
                  priority: 'Medium',
                  title: 'Address cleanliness concerns',
                  desc: 'Your cleanliness sentiment (0.65) is below market (0.72). Review topic mentions suggest restroom cleanliness is the main issue. Consider a staff training refresher.',
                  impact: '+0.07 sentiment',
                },
                {
                  priority: 'Medium',
                  title: 'Improve wait-time perception',
                  desc: 'Wait-time sentiment is negative (-0.15) while market is at -0.08. Consider implementing a waitlist system or text-when-ready notifications.',
                  impact: '+0.07 sentiment',
                },
              ].map((s, i) => (
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
                      <span className="text-[10px] text-muted-foreground">Expected impact:</span>
                      <Badge variant="outline" className="text-[9px] text-[var(--brass)] border-[var(--brass)]/30 font-mono">
                        {s.impact}
                      </Badge>
                    </div>
                    {s.priority === 'High' && (
                      <Button size="sm" className="h-6 text-[10px] bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setCampaignOpen(true)}>
                        Take action
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              Enter a competitor&apos;s Google Maps URL or business name. We&apos;ll start tracking their reviews weekly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="comp-name">Competitor business name</Label>
              <Input
                id="comp-name"
                placeholder="e.g. Golden Dragon Restaurant"
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
                Providing the Maps URL helps us fetch accurate data. We&apos;ll auto-discover competitors nearby.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleAddCompetitor} disabled={adding || !newName}>
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add competitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Builder (launched from alert) */}
      <CampaignBuilder open={campaignOpen} onOpenChange={setCampaignOpen} />
    </div>
  )
}

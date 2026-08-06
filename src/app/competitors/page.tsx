'use client'

import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Target, TrendingUp, TrendingDown, Star, Users, MessageSquare, AlertCircle,
  ArrowUp, ArrowDown, Lightbulb, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const COMPETITORS = [
  {
    name: 'Bamboo Garden (You)',
    rating: 4.6,
    ratingTrend: 0.3,
    reviews: 247,
    reviewVelocity: 12,
    responseRate: 87,
    sentimentScore: 0.72,
    isYou: true,
  },
  {
    name: 'Golden Dragon Restaurant',
    rating: 4.4,
    ratingTrend: -0.1,
    reviews: 312,
    reviewVelocity: 18,
    responseRate: 62,
    sentimentScore: 0.65,
    isYou: false,
  },
  {
    name: 'Jade Palace',
    rating: 4.3,
    ratingTrend: 0.2,
    reviews: 198,
    reviewVelocity: 8,
    responseRate: 71,
    sentimentScore: 0.61,
    isYou: false,
  },
  {
    name: 'Sakura Sushi Bar',
    rating: 4.7,
    ratingTrend: 0.1,
    reviews: 421,
    reviewVelocity: 22,
    responseRate: 92,
    sentimentScore: 0.78,
    isYou: false,
  },
]

const TOPIC_GAPS = [
  { topic: 'food', you: 0.82, competitor: 0.88, gap: -0.06, status: 'losing' },
  { topic: 'service', you: 0.71, competitor: 0.65, gap: 0.06, status: 'winning' },
  { topic: 'cleanliness', you: 0.65, competitor: 0.72, gap: -0.07, status: 'losing' },
  { topic: 'atmosphere', you: 0.78, competitor: 0.74, gap: 0.04, status: 'winning' },
  { topic: 'value', you: 0.58, competitor: 0.62, gap: -0.04, status: 'losing' },
  { topic: 'wait-time', you: -0.15, competitor: -0.08, gap: -0.07, status: 'losing' },
]

export default function CompetitorsPage() {
  const you = COMPETITORS[0]
  const competitors = COMPETITORS.filter(c => !c.isYou)

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Competitor Intelligence"
          description="Weekly benchmark against your top 3 local competitors"
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
              <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600 h-7 text-xs flex-shrink-0">
                Launch campaign
              </Button>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Your Rank', value: '#2', sub: 'of 4 competitors', icon: Target, color: 'text-[var(--brass)]' },
              { label: 'Rating Gap', value: '+0.2', sub: 'vs market avg', icon: Star, color: 'text-green-500' },
              { label: 'Response Rate', value: '87%', sub: '25% above market', icon: MessageSquare, color: 'text-blue-500' },
              { label: 'Review Velocity', value: '12/wk', sub: 'below market avg', icon: TrendingUp, color: 'text-amber-500' },
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
                <p className="text-xs text-muted-foreground mt-0.5">Snapshot from Aug 6, 2026 · updates weekly</p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add competitor
              </Button>
            </div>

            <div className="overflow-x-auto scrollbar-premium">
              <div className="min-w-[640px]">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 pb-3 border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <div className="col-span-4">Business</div>
                  <div className="col-span-2 text-center">Rating</div>
                  <div className="col-span-2 text-center">Reviews</div>
                  <div className="col-span-2 text-center">Velocity</div>
                  <div className="col-span-2 text-center">Response</div>
                </div>
                {/* Rows */}
                {COMPETITORS.map(c => (
                  <div key={c.name} className={cn(
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
                      <div className={cn('text-[10px] font-mono flex items-center justify-center gap-0.5', c.ratingTrend > 0 ? 'text-green-500' : 'text-red-500')}>
                        {c.ratingTrend > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                        {Math.abs(c.ratingTrend)}
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
                ))}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Topic gap analysis */}
            <Card className="p-5 glass-card">
              <h3 className="font-display font-bold mb-1">Topic Gap Analysis</h3>
              <p className="text-xs text-muted-foreground mb-5">Your sentiment vs market average by topic</p>
              <div className="space-y-3">
                {TOPIC_GAPS.map(t => (
                  <div key={t.topic} className="flex items-center gap-3">
                    <div className="w-20 flex-shrink-0">
                      <div className="text-xs font-medium capitalize">{t.topic}</div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground w-8">You</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                          <div className={cn('h-full rounded-full', t.you >= 0 ? 'bg-[var(--brass)]' : 'bg-red-500')} style={{ width: `${Math.abs(t.you) * 100}%` }} />
                        </div>
                        <span className="font-mono w-10 text-right">{t.you > 0 ? '+' : ''}{t.you.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground w-8">Mkt</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                          <div className={cn('h-full rounded-full', t.competitor >= 0 ? 'bg-blue-500' : 'bg-red-500')} style={{ width: `${Math.abs(t.competitor) * 100}%` }} />
                        </div>
                        <span className="font-mono w-10 text-right">{t.competitor > 0 ? '+' : ''}{t.competitor.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className={cn(
                      'text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-0.5',
                      t.status === 'winning' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                    )}>
                      {t.status === 'winning' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                      {Math.abs(t.gap).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* AI strategy suggestions */}
            <Card className="p-5 glass-card">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="w-4 h-4 text-[var(--brass)]" />
                <h3 className="font-display font-bold">AI Strategy Suggestions</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Generated by Claude 3.5 · based on competitor analysis</p>
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
                  {
                    priority: 'Low',
                    title: 'Highlight your food quality advantage',
                    desc: 'Your food sentiment (0.82) is strong. Consider promoting signature dishes in your Google Business Profile photos and posts to amplify this strength.',
                    impact: '+visibility',
                  },
                ].map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-accent/20 border border-border/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={cn(
                        'text-[9px]',
                        s.priority === 'High' ? 'bg-red-500/10 text-red-600 border-red-500/30' :
                        s.priority === 'Medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                        'bg-blue-500/10 text-blue-600 border-blue-500/30'
                      )}>
                        {s.priority}
                      </Badge>
                      <h4 className="text-sm font-medium flex-1">{s.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{s.desc}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Expected impact:</span>
                      <Badge variant="outline" className="text-[9px] text-[var(--brass)] border-[var(--brass)]/30 font-mono">
                        {s.impact}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

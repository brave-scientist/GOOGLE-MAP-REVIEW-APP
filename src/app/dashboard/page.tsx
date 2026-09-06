'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Star, TrendingUp, MessageSquare, Target, ArrowRight, ArrowUp, ArrowDown,
  Clock, Globe, Sparkles, Bell, ChevronRight, AlertCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useActiveBusiness } from '@/lib/business-context'

interface DashboardData {
  businesses: Array<{ id: string; name: string; industry: string | null; avgRating: number; reviewCount: number }>
  stats: { totalReviews: number; avgRating: number; pendingReplies: number; conversionRate: number }
  recentReviews: Array<{
    id: string; author: string; rating: number; text: string; source: string;
    businessName: string; draftStatus: string; createdAt: string
  }>
  ratingDistribution: Array<{ rating: number; count: number }>
  sentimentTrend: Array<{ week: string; avgSentiment: number; reviewCount: number }>
}

export default function DashboardPage() {
  const { activeBusinessId } = useActiveBusiness()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const url = activeBusinessId
        ? `/api/dashboard?businessId=${activeBusinessId}`
        : '/api/dashboard'
      try {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        if (!cancelled) { setData(d); setLoading(false) }
      } catch (e: unknown) {
        if (!cancelled) { console.error(e); setError((e as Error).message); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [activeBusinessId])

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Dashboard"
          description="Overview of your review performance across all businesses"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {loading ? <DashboardSkeleton /> : error ? <ErrorState message={error} /> : data && <DashboardContent data={data} />}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="p-12 glass-card text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="font-display font-bold mb-1">Failed to load dashboard</h3>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        <RefreshCw className="w-4 h-4 mr-2" />
        Retry
      </Button>
    </Card>
  )
}

function DashboardContent({ data }: { data: DashboardData }) {
  const stats = [
    {
      label: 'Total Reviews',
      value: data.stats.totalReviews.toString(),
      icon: Star,
      sub: 'across all businesses',
    },
    {
      label: 'Average Rating',
      value: data.stats.avgRating.toFixed(1),
      icon: TrendingUp,
      sub: 'across all sources',
    },
    {
      label: 'Pending Replies',
      value: data.stats.pendingReplies.toString(),
      change: data.stats.pendingReplies > 0 ? 'Action needed' : 'All caught up',
      trend: data.stats.pendingReplies > 0 ? ('down' as const) : ('up' as const),
      icon: MessageSquare,
      sub: 'across all sources',
    },
    {
      label: 'Conversion Rate',
      value: `${data.stats.conversionRate}%`,
      icon: Target,
      sub: 'request → review',
    },
  ]

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Sentiment trend chart */}
        <Card className="lg:col-span-2 p-5 glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-bold">Sentiment Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 8 weeks · across all sources</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-[var(--brass)] border-[var(--brass)]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brass)] mr-1.5 animate-pulse" />
              Live
            </Badge>
          </div>
          <SentimentChart data={data.sentimentTrend} />
        </Card>

        {/* Rating distribution */}
        <Card className="p-5 glass-card">
          <h3 className="font-display font-bold mb-1">Rating Distribution</h3>
          <p className="text-xs text-muted-foreground mb-5">{data.stats.totalReviews} total reviews</p>
          <RatingDistribution data={data.ratingDistribution} total={data.stats.totalReviews} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent reviews */}
        <Card className="lg:col-span-2 p-5 glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-bold">Recent Reviews</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Latest from all sources</p>
            </div>
            <Link href="/inbox">
              <Button variant="ghost" size="sm" className="text-xs h-7">
                View all
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {data.recentReviews.slice(0, 5).map(review => <ReviewRow key={review.id} review={review} />)}
          </div>
        </Card>

        {/* Businesses */}
        <Card className="p-5 glass-card">
          <h3 className="font-display font-bold mb-1">Your Businesses</h3>
          <p className="text-xs text-muted-foreground mb-5">{data.businesses.length} active locations</p>
          <div className="space-y-2">
            {data.businesses.map(biz => (
              <div key={biz.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {biz.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{biz.name}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{biz.industry || 'business'}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
                    <span className="text-xs font-bold">{biz.avgRating.toFixed(1)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">{biz.reviewCount} reviews</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-5 glass-card">
        <h3 className="font-display font-bold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/campaigns" className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all group block">
            <MessageSquare className="w-5 h-5 mb-2 text-blue-500" />
            <div className="text-sm font-medium mb-0.5">Send review request</div>
            <div className="text-[10px] text-muted-foreground">SMS or email campaign</div>
          </Link>
          <Link href="/inbox" className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all group block">
            <Sparkles className="w-5 h-5 mb-2 text-[var(--brass)]" />
            <div className="text-sm font-medium mb-0.5">Generate AI reply</div>
            <div className="text-[10px] text-muted-foreground">
              {data.stats.pendingReplies} {data.stats.pendingReplies === 1 ? 'draft' : 'drafts'} pending
            </div>
          </Link>
          <Link href="/analytics" className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all group block">
            <TrendingUp className="w-5 h-5 mb-2 text-green-500" />
            <div className="text-sm font-medium mb-0.5">View analytics</div>
            <div className="text-[10px] text-muted-foreground">Sentiment &amp; topics</div>
          </Link>
          <Link href="/competitors" className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all group block">
            <Target className="w-5 h-5 mb-2 text-purple-500" />
            <div className="text-sm font-medium mb-0.5">Check competitors</div>
            <div className="text-[10px] text-muted-foreground">Weekly benchmark</div>
          </Link>
        </div>
      </Card>
    </>
  )
}

function StatCard({ label, value, change, trend, icon: Icon, sub }: {
  label: string; value: string; change?: string; trend?: 'up' | 'down'; icon: React.ElementType; sub: string
}) {
  return (
    <Card className="p-4 sm:p-5 glass-card hover:border-[var(--brass)]/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</span>
        <div className="p-1.5 rounded-md bg-[var(--brass)]/10">
          <Icon className="w-3.5 h-3.5 text-[var(--brass)]" />
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-2xl sm:text-3xl font-bold">{value}</span>
        {change !== undefined && trend !== undefined && (
          <span className={cn(
            'text-[10px] font-mono flex items-center gap-0.5',
            trend === 'up' ? 'text-green-500' : 'text-amber-500'
          )}>
            {trend === 'up' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
            {change}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </Card>
  )
}

function SentimentChart({ data }: { data: Array<{ week: string; avgSentiment: number; reviewCount: number }> }) {
  const max = Math.max(...data.map(d => Math.abs(d.avgSentiment)), 1)
  const maxReviews = Math.max(...data.map(d => d.reviewCount), 1)
  return (
    <div>
      <div className="flex items-end gap-2 h-40 mb-3">
        {data.map((d, i) => {
          const height = Math.abs(d.avgSentiment) / max * 100
          const isPositive = d.avgSentiment >= 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer">
              <div className="text-[9px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {d.avgSentiment > 0 ? '+' : ''}{d.avgSentiment.toFixed(2)}
              </div>
              <div className="w-full flex-1 flex flex-col justify-end relative">
                <div
                  className={cn(
                    'w-full rounded-t transition-all',
                    isPositive
                      ? 'bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)]'
                      : 'bg-gradient-to-t from-red-700 to-red-400'
                  )}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
              </div>
              <div className="text-[9px] text-muted-foreground font-mono">{d.week}</div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-3 border-t border-border/30">
        <span>Week-over-week sentiment</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--brass)]" /> Positive
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-400" /> Negative
          </span>
        </span>
      </div>
    </div>
  )
}

function RatingDistribution({ data, total }: { data: Array<{ rating: number; count: number }>; total: number }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-2.5">
      {[5, 4, 3, 2, 1].map(rating => {
        const item = data.find(d => d.rating === rating) || { rating, count: 0 }
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
        return (
          <div key={rating} className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 w-12">
              <span className="text-xs font-medium">{rating}</span>
              <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
            </div>
            <div className="flex-1 h-2 rounded-full bg-background/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--brass-dark)] to-[var(--brass)] transition-all"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-12 text-right">{item.count} · {pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function ReviewRow({ review }: { review: DashboardData['recentReviews'][0] }) {
  const timeAgo = getTimeAgo(review.createdAt)
  const isPending = review.draftStatus === 'PENDING'
  return (
    <Link href="/inbox" className="block">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/30 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
          {review.author[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium">{review.author}</span>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, j) => (
                <Star key={j} className={cn('w-2.5 h-2.5', j < review.rating ? 'text-[var(--brass)] fill-[var(--brass)]' : 'text-muted-foreground/30')} />
              ))}
            </div>
            <Badge variant="outline" className="text-[9px] font-mono uppercase py-0 px-1.5">{review.source}</Badge>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">{timeAgo}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{review.text}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{review.businessName}</span>
            {isPending && (
              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 py-0">
                <Clock className="w-2.5 h-2.5 mr-1" />
                Pending reply
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24) return `${hrs}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5 glass-card">
            <div className="h-3 w-20 bg-muted/40 rounded mb-3 animate-pulse" />
            <div className="h-8 w-16 bg-muted/40 rounded animate-pulse" />
          </Card>
        ))}
      </div>
      <Card className="p-5 glass-card">
        <div className="h-4 w-32 bg-muted/40 rounded mb-5 animate-pulse" />
        <div className="h-40 bg-muted/20 rounded animate-pulse" />
      </Card>
    </>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Star, Search, Filter, RefreshCw, Star as StarIcon, Clock, Check, MessageSquare,
  TrendingUp, TrendingDown, Plus, Download, Reply, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Review {
  id: string
  author: string
  rating: number
  title: string | null
  text: string
  source: string
  sentimentScore: number | null
  topics: string[]
  replyText: string | null
  draftText: string | null
  draftStatus: string
  createdAt: string
  business: { id: string; name: string; industry: string | null }
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative' | 'replied' | 'pending'>('all')
  const [exporting, setExporting] = useState(false)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (filter === 'positive') params.set('rating', 'positive')
      if (filter === 'negative') params.set('rating', 'negative')
      if (filter === 'replied') params.set('status', 'replied')
      if (filter === 'pending') params.set('status', 'pending')
      const res = await fetch(`/api/inbox?${params.toString()}&limit=100`)
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, filter])

  useEffect(() => {
    const debounce = setTimeout(fetchReviews, search ? 300 : 0)
    return () => clearTimeout(debounce)
  }, [fetchReviews, search])

  const stats = {
    total: reviews.length,
    avgRating: reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0',
    positive: reviews.filter(r => r.rating >= 4).length,
    negative: reviews.filter(r => r.rating <= 2).length,
    replied: reviews.filter(r => r.draftStatus === 'POSTED').length,
    pending: reviews.filter(r => r.draftStatus === 'PENDING').length,
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Reviews"
          description="All reviews across all your businesses"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: stats.total, icon: MessageSquare, color: 'text-blue-500' },
              { label: 'Avg Rating', value: stats.avgRating, icon: Star, color: 'text-[var(--brass)]' },
              { label: 'Positive', value: stats.positive, icon: TrendingUp, color: 'text-green-500' },
              { label: 'Negative', value: stats.negative, icon: TrendingDown, color: 'text-red-500' },
              { label: 'Replied', value: stats.replied, icon: Check, color: 'text-purple-500' },
            ].map(s => (
              <Card key={s.label} className="p-3 glass-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                  <s.icon className={cn('w-3 h-3', s.color)} />
                </div>
                <div className="font-display text-xl font-bold">{s.value}</div>
              </Card>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search reviews..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 glass-card"
              />
            </div>
            <div className="flex gap-1 p-1 glass-card rounded-lg">
              {([
                { id: 'all', label: 'All' },
                { id: 'positive', label: 'Positive' },
                { id: 'negative', label: 'Negative' },
                { id: 'replied', label: 'Replied' },
                { id: 'pending', label: 'Pending' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    filter === f.id
                      ? 'bg-[var(--brass)] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="glass-card" onClick={async () => {
              setExporting(true)
              try {
                const res = await fetch('/api/export?type=reviews')
                if (res.ok) {
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = window.document.createElement('a')
                  a.href = url
                  a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  toast.success('Export complete', { description: 'Reviews CSV downloaded' })
                } else {
                  toast.error('Export failed')
                }
              } catch {
                toast.error('Network error')
              } finally {
                setExporting(false)
              }
            }} disabled={exporting}>
              {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Export
            </Button>
            <Button variant="outline" size="sm" className="glass-card" onClick={fetchReviews}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          </div>

          {/* Reviews grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-4 glass-card">
                  <div className="h-4 w-32 bg-muted/40 rounded mb-3 animate-pulse" />
                  <div className="h-16 bg-muted/20 rounded animate-pulse" />
                </Card>
              ))
            ) : reviews.length === 0 ? (
              <Card className="p-12 glass-card text-center md:col-span-2">
                <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-display font-bold mb-1">No reviews found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
              </Card>
            ) : (
              reviews.map(review => (
                <Link key={review.id} href={`/inbox?reviewId=${review.id}`}>
                  <Card className="p-4 glass-card hover:border-[var(--brass)]/50 hover:bg-accent/10 transition-all cursor-pointer h-full">
                    <div className="flex items-start gap-3">
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
                        </div>
                        {review.title && <div className="text-xs font-medium mb-1">{review.title}</div>}
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{review.text}</p>
                        <div className="flex items-center justify-between gap-2 flex-wrap mt-auto pt-1">
                          <span className="text-[10px] text-muted-foreground">{review.business.name}</span>
                          {review.draftStatus === 'POSTED' ? (
                            <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30 py-0">
                              <Check className="w-2.5 h-2.5 mr-1" />
                              Replied
                            </Badge>
                          ) : review.draftStatus === 'PENDING' ? (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 py-0">
                              <Clock className="w-2.5 h-2.5 mr-1" />
                              Draft ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 text-muted-foreground">Open in Inbox →</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

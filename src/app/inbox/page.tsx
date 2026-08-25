'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Star, MessageSquare, Search, Filter, Star as StarIcon, Clock, Check,
  Bot, Sparkles, X, Send, AlertCircle, ChevronDown, RefreshCw, Edit3,
  Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Review {
  id: string
  author: string
  authorAvatar: string | null
  rating: number
  title: string | null
  text: string
  source: string
  language: string
  sentimentScore: number | null
  topics: string[]
  replyText: string | null
  repliedAt: string | null
  draftText: string | null
  draftStatus: string
  createdAt: string
  business: { id: string; name: string; industry: string | null }
}

interface InboxResponse {
  reviews: Review[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function InboxPageContent() {
  const searchParams = useSearchParams()
  const reviewIdParam = searchParams.get('reviewId')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'replied' | 'escalated'>('all')
  const [search, setSearch] = useState('')
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      const res = await fetch(`/api/inbox?${params.toString()}`)
      const data: InboxResponse = await res.json()
      const fetchedReviews = data.reviews || []
      setReviews(fetchedReviews)

      // Auto-select review from query param if provided
      if (reviewIdParam && fetchedReviews.length > 0) {
        const found = fetchedReviews.find(r => r.id === reviewIdParam)
        if (found) setSelectedReview(found)
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [filter, search, reviewIdParam])

  useEffect(() => {
    const debounce = setTimeout(fetchReviews, search ? 300 : 0)
    return () => clearTimeout(debounce)
  }, [fetchReviews, search, refreshKey])

  const handleReviewUpdate = (updated: Review) => {
    setReviews(prev => prev.map(r => r.id === updated.id ? updated : r))
    setSelectedReview(updated)
  }

  const stats = {
    total: reviews.length,
    pending: reviews.filter(r => r.draftStatus === 'PENDING').length,
    escalated: reviews.filter(r => r.rating <= 2 && !r.repliedAt).length,
    replied: reviews.filter(r => r.draftStatus === 'POSTED').length,
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Unified Inbox"
          description="All reviews across Google, Facebook, Yelp, and Trustpilot"
        />
        <div className="p-4 sm:p-6">
          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by author, text, or title..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 glass-card"
              />
            </div>
            <div className="flex gap-1 p-1 glass-card rounded-lg">
              {([
                { id: 'all', label: 'All', count: stats.total },
                { id: 'pending', label: 'Pending', count: stats.pending },
                { id: 'escalated', label: 'Escalated', count: stats.escalated },
                { id: 'replied', label: 'Replied', count: stats.replied },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                    filter === f.id
                      ? 'bg-[var(--brass)] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className={cn(
                      'text-[9px] font-mono px-1 rounded',
                      filter === f.id ? 'bg-white/20' : 'bg-muted/40'
                    )}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="glass-card"
              onClick={() => setRefreshKey(k => k + 1)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          </div>

          {/* Reviews list */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <ReviewSkeleton key={i} />)
            ) : reviews.length === 0 ? (
              <EmptyState />
            ) : (
              reviews.map(review => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onSelect={() => setSelectedReview(review)}
                />
              ))
            )}
          </div>
        </div>
      </main>
      <MobileNav />

      {/* Review detail drawer */}
      {selectedReview && (
        <ReviewDetailDrawer
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onUpdate={handleReviewUpdate}
        />
      )}
    </div>
  )
}

function ReviewCard({ review, onSelect }: { review: Review; onSelect: () => void }) {
  const timeAgo = getTimeAgo(review.createdAt)
  const isPending = review.draftStatus === 'PENDING'
  const isReplied = review.draftStatus === 'POSTED'
  const isEscalated = review.rating <= 2 && !review.repliedAt

  return (
    <Card
      className="p-4 glass-card hover:border-[var(--brass)]/40 transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
          {review.author[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium">{review.author}</span>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, j) => (
                <Star key={j} className={cn('w-3 h-3', j < review.rating ? 'text-[var(--brass)] fill-[var(--brass)]' : 'text-muted-foreground/30')} />
              ))}
            </div>
            <Badge variant="outline" className="text-[9px] font-mono uppercase py-0 px-1.5">{review.source}</Badge>
            {review.sentimentScore !== null && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] font-mono py-0 px-1.5',
                  review.sentimentScore > 0.2
                    ? 'bg-green-500/10 text-green-600 border-green-500/30'
                    : review.sentimentScore < -0.2
                    ? 'bg-red-500/10 text-red-600 border-red-500/30'
                    : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                )}
              >
                {review.sentimentScore > 0 ? '+' : ''}{review.sentimentScore.toFixed(2)}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">{timeAgo}</span>
          </div>
          {review.title && <div className="text-xs font-medium mb-0.5">{review.title}</div>}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{review.text}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{review.business.name}</span>
            {review.topics.slice(0, 3).map((topic, idx) => (
              <Badge key={topic + "_idx_" + idx} variant="outline" className="text-[9px] py-0 px-1.5 text-muted-foreground">
                {topic}
              </Badge>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              {isEscalated && (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30 py-0">
                  <AlertCircle className="w-2.5 h-2.5 mr-1" />
                  Escalated
                </Badge>
              )}
              {isPending && (
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 py-0">
                  <Clock className="w-2.5 h-2.5 mr-1" />
                  Draft ready
                </Badge>
              )}
              {isReplied && (
                <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30 py-0">
                  <Check className="w-2.5 h-2.5 mr-1" />
                  Replied
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function ReviewDetailDrawer({ review, onClose, onUpdate }: {
  review: Review
  onClose: () => void
  onUpdate: (r: Review) => void
}) {
  const [draft, setDraft] = useState(review.draftText || '')
  const [draftStatus, setDraftStatus] = useState(review.draftStatus)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const generateDraft = async (force = false) => {
    setIsGenerating(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate: force }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraft(data.draft)
        setDraftStatus(data.status)
        onUpdate({ ...review, draftText: data.draft, draftStatus: data.status })
        toast.success('AI draft generated', {
          description: 'Draft reply ready for review',
        })
      } else {
        toast.error('Failed to generate draft', { description: data.error })
      }
    } catch (e) {
      toast.error('Failed to generate draft')
    } finally {
      setIsGenerating(false)
    }
  }

  const approveDraft = async (editedText?: string) => {
    setIsApproving(true)
    const textToCopy = editedText || draft || review.draftText || ''
    try {
      const res = await fetch(`/api/reviews/${review.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', editedText, manual: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus(data.status)
        onUpdate({
          ...review,
          replyText: data.replyText,
          repliedAt: data.repliedAt,
          draftStatus: data.status,
        })
        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy)
            toast.success('Approved & Copied to Clipboard!', {
              description: `Reply saved. Paste directly into ${review.source} to publish.`,
            })
          } catch {
            toast.success('Reply Approved!', {
              description: `Reply saved for ${review.source}.`,
            })
          }
        } else {
          toast.success('Reply Approved')
        }
        setIsEditing(false)
      } else {
        toast.error('Failed to approve', { description: data.error })
      }
    } catch (e) {
      toast.error('Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  const rejectDraft = async () => {
    try {
      const res = await fetch(`/api/reviews/${review.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus(data.status)
        onUpdate({ ...review, draftStatus: data.status })
        toast.success('Draft rejected')
      }
    } catch (e) {
      toast.error('Failed to reject')
    }
  }

  const isPending = draftStatus === 'PENDING'
  const isPosted = draftStatus === 'POSTED'

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative ml-auto w-full sm:max-w-2xl bg-background border-l border-border h-full overflow-y-auto scrollbar-premium animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono uppercase">{review.source}</Badge>
            <span className="text-sm font-medium">Review Detail</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Customer info */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-base font-bold">
              {review.author[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-medium">{review.author}</span>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className={cn('w-3.5 h-3.5', j < review.rating ? 'text-[var(--brass)] fill-[var(--brass)]' : 'text-muted-foreground/30')} />
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {review.business.name} · {getTimeAgo(review.createdAt)}
              </div>
            </div>
          </div>

          {/* Review text */}
          <Card className="p-4 bg-accent/20 border-border/40">
            {review.title && <div className="text-sm font-medium mb-2">{review.title}</div>}
            <p className="text-sm leading-relaxed">{review.text}</p>
            {review.topics.length > 0 && (
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-border/30 flex-wrap">
                {review.topics.map((t, idx) => (
                  <Badge key={t + "-" + idx} variant="outline" className="text-[10px] text-muted-foreground">
                    {t}
                  </Badge>
                ))}
                {review.sentimentScore !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-mono ml-auto',
                      review.sentimentScore > 0.2
                        ? 'bg-green-500/10 text-green-600 border-green-500/30'
                        : review.sentimentScore < -0.2
                        ? 'bg-red-500/10 text-red-600 border-red-500/30'
                        : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    )}
                  >
                    Sentiment: {review.sentimentScore > 0 ? '+' : ''}{review.sentimentScore.toFixed(2)}
                  </Badge>
                )}
              </div>
            )}
          </Card>

          {/* Reply section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-sm">
                {isPosted ? 'Posted Reply' : 'AI Draft Reply'}
              </h3>
              {!draft && !isPosted && (
                <Button
                  size="sm"
                  className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs"
                  onClick={() => generateDraft(false)}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      Generate draft
                    </>
                  )}
                </Button>
              )}
            </div>

            {draft || isPosted ? (
              <div className="rounded-lg border border-[var(--brass)]/30 bg-[var(--brass)]/5 overflow-hidden">
                <div className="px-3 py-2 bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
                    <Bot className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-[10px] font-mono text-[var(--brass)]">
                    {isPosted ? 'Posted reply' : 'AI draft · AI (GLM-4.6)'}
                  </span>
                  {isPending && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">
                      Pending approval
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  {isEditing ? (
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      className="w-full min-h-[120px] text-sm bg-background border border-border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
                    />
                  ) : (
                    <p className="text-sm leading-relaxed italic text-foreground/90">
                      "{isPosted ? review.replyText : draft}"
                    </p>
                  )}
                </div>
                {isPending && (
                  <div className="px-3 py-2 border-t border-[var(--brass)]/20 flex gap-2 flex-wrap items-center">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs"
                          onClick={() => approveDraft(draft)}
                          disabled={isApproving}
                        >
                          {isApproving ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Copy className="w-3 h-3 mr-1" />}
                          Save &amp; Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs"
                          onClick={() => approveDraft()}
                          disabled={isApproving}
                        >
                          {isApproving ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Copy className="w-3 h-3 mr-1" />}
                          Approve &amp; Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setIsEditing(true)}
                        >
                          <Edit3 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => generateDraft(true)}
                          disabled={isGenerating}
                        >
                          <RefreshCw className={cn('w-3 h-3 mr-1', isGenerating && 'animate-spin')} />
                          Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-500 ml-auto"
                          onClick={rejectDraft}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {isPosted && (
                  <div className="px-3 py-2 border-t border-[var(--brass)]/20 flex gap-2 flex-wrap items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20 border-[var(--brass)]/30"
                      onClick={async () => {
                        const text = review.replyText || draft || ''
                        if (text) {
                          await navigator.clipboard.writeText(text)
                          toast.success('Copied to clipboard!', { description: `Paste directly into ${review.source}.` })
                        }
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy reply text
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Card className="p-6 border-dashed border-border/40 text-center">
                <Bot className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">No draft yet</p>
                <p className="text-xs text-muted-foreground/70">Click &quot;Generate draft&quot; to create an AI reply</p>
              </Card>
            )}

            {/* Beta guidance banner */}
            <div className="p-3 rounded-lg bg-accent/20 border border-border/30 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <span>💡</span> Beta Publishing Workflow
              </div>
              <p className="leading-relaxed text-[11px]">
                1. Click <strong>Generate draft</strong> to create an on-brand AI reply.<br />
                2. Review or edit the draft to your liking.<br />
                3. Click <strong>Approve &amp; Copy</strong> to save and copy to clipboard, then paste into your {review.source} business dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <Card className="p-4 glass-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/30 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 bg-muted/30 rounded animate-pulse" />
          <div className="h-3 w-full bg-muted/20 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-muted/20 rounded animate-pulse" />
        </div>
      </div>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card className="p-12 glass-card text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--brass)]/10 flex items-center justify-center mx-auto mb-4">
        <MessageSquare className="w-8 h-8 text-[var(--brass)]" />
      </div>
      <h3 className="font-display font-bold mb-1">No reviews found</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Try adjusting your filters or check back later for new reviews.
      </p>
    </Card>
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

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          <AppTopbar title="Unified Inbox" description="Loading reviews..." />
          <div className="p-4 sm:p-6 space-y-4">
            <ReviewSkeleton />
            <ReviewSkeleton />
          </div>
        </main>
      </div>
    }>
      <InboxPageContent />
    </Suspense>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Star, MessageSquare, Search, Filter, Star as StarIcon, Clock, Check,
  Bot, Sparkles, X, Send, AlertCircle, ChevronDown, RefreshCw, Edit3,
  Copy, ExternalLink, Loader2, Globe, AlertTriangle, Network, Sliders, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useActiveBusiness } from '@/lib/business-context'

interface LatestPublishAttempt {
  id: string
  status: 'IN_FLIGHT' | 'SUCCESS' | 'FAILED' | 'UNCONFIRMED'
  platform: string
  errorMessage: string | null
  remoteId: string | null
  createdAt: string
}

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
  externalId?: string | null
  activeEscalation?: { id: string; status: string; severity: string; reason: string } | null
  latestPublishAttempt?: LatestPublishAttempt | null
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
  const { activeBusinessId } = useActiveBusiness()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'replied' | 'escalated'>('all')
  const [search, setSearch] = useState('')
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const latestRequestId = useRef(0)

  // ORG-02: Regional Governance & Bulk Dispatch State
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<any>(null)

  useEffect(() => {
    fetch('/api/governance/groups')
      .then((res) => res.json())
      .then((data) => {
        if (data?.groups) {
          setGroups(data.groups.map((g: any) => ({ id: g.id, name: g.name })))
        }
      })
      .catch(() => {})
  }, [])

  const handleSyncAll = async () => {
    setSyncing(true)
    toast.info('Syncing reviews from connected platforms...')
    try {
      let businessId = activeBusinessId
      if (!businessId) {
        const dashRes = await fetch('/api/dashboard')
        const dashData = await dashRes.json()
        businessId = dashData.businesses?.[0]?.id
      }

      if (!businessId) {
        toast.error('No active business found to sync')
        return
      }

      const results: string[] = []

      // 1. Google Sync
      try {
        const gRes = await fetch(`/api/businesses/${businessId}/sync-reviews`, { method: 'POST' })
        const gData = await gRes.json()
        if (gRes.ok) {
          results.push(`Google: ${gData.stats?.created ?? 0} new, ${gData.stats?.updated ?? 0} updated`)
        } else if (gData.code !== 'NO_LOCATION_SELECTED' && gData.code !== 'GOOGLE_NOT_CONFIGURED') {
          results.push(`Google: ${gData.message || gData.error}`)
        }
      } catch {}

      // 2. Facebook Sync
      try {
        const fbRes = await fetch(`/api/businesses/${businessId}/sync-facebook-reviews`, { method: 'POST' })
        const fbData = await fbRes.json()
        if (fbRes.ok) {
          results.push(`Facebook: ${fbData.stats?.created ?? 0} new, ${fbData.stats?.updated ?? 0} updated`)
        } else if (fbData.code !== 'NO_PAGE_CONNECTED' && fbData.code !== 'FACEBOOK_NOT_CONFIGURED') {
          results.push(`Facebook: ${fbData.message || fbData.error}`)
        }
      } catch {}

      if (results.length > 0) {
        toast.success('Sync complete!', { description: results.join(' · ') })
      } else {
        toast.info('No reviews to sync or accounts not connected yet.')
      }

      setRefreshKey(k => k + 1)
    } catch {
      toast.error('Failed to sync reviews')
    } finally {
      setSyncing(false)
    }
  }

  const fetchReviews = useCallback(async () => {
    const requestId = ++latestRequestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      if (activeBusinessId) params.set('businessId', activeBusinessId)
      if (selectedGroupId) params.set('groupId', selectedGroupId)
      const res = await fetch(`/api/inbox?${params.toString()}`)
      const data: InboxResponse = await res.json()

      // Discard stale response if another request has been initiated (e.g. rapid business switching)
      if (requestId !== latestRequestId.current) return

      const fetchedReviews = data.reviews || []
      setReviews(fetchedReviews)

      // Auto-select review from query param if provided, or retain only if still belongs to current business
      if (reviewIdParam && fetchedReviews.length > 0) {
        const found = fetchedReviews.find(r => r.id === reviewIdParam)
        if (found) setSelectedReview(found)
      } else {
        setSelectedReview(current => (current && fetchedReviews.some(r => r.id === current.id) ? current : null))
      }
    } catch (e) {
      if (requestId !== latestRequestId.current) return
      console.error(e)
      toast.error('Failed to load reviews')
    } finally {
      if (requestId === latestRequestId.current) {
        setLoading(false)
      }
    }
  }, [filter, search, reviewIdParam, activeBusinessId, selectedGroupId])

  useEffect(() => {
    const debounce = setTimeout(fetchReviews, search ? 300 : 0)
    return () => clearTimeout(debounce)
  }, [fetchReviews, search, refreshKey])

  const handleReviewUpdate = (updated: Review) => {
    setReviews(prev => prev.map(r => r.id === updated.id ? updated : r))
    setSelectedReview(updated)
  }

  // Bulk action handlers
  const toggleSelectReview = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedReviewIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleSelectAllPending = () => {
    const pendingIds = reviews.filter(r => r.draftStatus === 'PENDING').map(r => r.id)
    if (pendingIds.length === 0) {
      toast.info('No pending reviews in current view')
      return
    }
    setSelectedReviewIds(pendingIds)
  }

  const handleSelectAllInView = () => {
    if (selectedReviewIds.length === reviews.length) {
      setSelectedReviewIds([])
    } else {
      setSelectedReviewIds(reviews.map(r => r.id))
    }
  }

  const handleClearSelection = () => {
    setSelectedReviewIds([])
  }

  const executeBulkAction = async (action: 'approve', publishMode: 'platform' | 'manual') => {
    if (selectedReviewIds.length === 0) return
    setIsBulkLoading(true)
    toast.info(`Executing bulk ${publishMode === 'platform' ? 'live dispatch' : 'manual copy'}...`)
    try {
      const res = await fetch('/api/reviews/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewIds: selectedReviewIds,
          action,
          publishMode,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setBulkResults(data)
        toast.success(`Bulk dispatch processed: ${(data.published || 0) + (data.savedLocally || 0)} of ${data.total} completed`)
      } else {
        toast.error(data.error || 'Bulk dispatch failed')
      }
    } catch {
      toast.error('Network error during bulk dispatch')
    } finally {
      setIsBulkLoading(false)
    }
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
          description="All reviews across Google Business Profile and Facebook Pages"
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

            {/* Regional Group Selector */}
            {groups.length > 0 && (
              <div className="flex items-center gap-1.5 glass-card px-2.5 py-1 rounded-lg">
                <Network className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="bg-transparent text-xs text-foreground font-medium focus:outline-none cursor-pointer py-1"
                >
                  <option value="" className="bg-card text-foreground">All Regional Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-card text-foreground">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="glass-card text-xs"
              onClick={handleSelectAllPending}
            >
              Select Pending ({stats.pending})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="glass-card"
              onClick={() => setRefreshKey(k => k + 1)}
              disabled={syncing || loading}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] shadow-sm"
              onClick={handleSyncAll}
              disabled={syncing || loading}
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {syncing ? 'Syncing...' : 'Sync Reviews'}
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
                  isSelected={selectedReviewIds.includes(review.id)}
                  onToggleSelect={(e) => toggleSelectReview(review.id, e)}
                />
              ))
            )}
          </div>

          {/* Floating Bulk Action Bar */}
          {selectedReviewIds.length > 0 && (
            <div className="sticky bottom-4 z-30 p-3 rounded-xl bg-card/95 backdrop-blur-md border border-[var(--brass)]/30 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[var(--brass)] text-white font-mono">
                  {selectedReviewIds.length} Selected
                </Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Bulk operations for regional dispatch
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  disabled={isBulkLoading}
                  onClick={() => executeBulkAction('approve', 'platform')}
                  className="bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white text-xs flex items-center gap-1.5"
                >
                  {isBulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Bulk Publish Live
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBulkLoading}
                  onClick={() => executeBulkAction('approve', 'manual')}
                  className="text-xs flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Approve & Save Locally
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBulkLoading}
                  onClick={handleClearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <MobileNav />

      {/* Bulk Results Modal */}
      {bulkResults && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                Bulk Dispatch Results
              </h3>
              <button
                onClick={() => {
                  setBulkResults(null)
                  setSelectedReviewIds([])
                  setRefreshKey(k => k + 1)
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-muted/40">
                <div className="font-bold text-foreground text-sm">{bulkResults.total}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <div className="font-bold text-sm">{bulkResults.published}</div>
                <div className="text-[10px]">Live</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <div className="font-bold text-sm">{bulkResults.savedLocally}</div>
                <div className="text-[10px]">Saved</div>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <div className="font-bold text-sm">{bulkResults.unconfirmed}</div>
                <div className="text-[10px]">Unconfirmed</div>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <div className="font-bold text-sm">{bulkResults.failed}</div>
                <div className="text-[10px]">Failed</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <div className="font-bold text-sm">{bulkResults.skipped}</div>
                <div className="text-[10px]">Skipped</div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-border/40 rounded-xl p-2 bg-muted/20">
              {bulkResults.results?.map((res: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                  <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                    ID: {res.reviewId}
                  </span>
                  <div className="flex items-center gap-2">
                    {res.message && <span className="text-[11px] text-muted-foreground">{res.message}</span>}
                    <Badge
                      className={
                        res.publishStatus === 'LIVE'
                          ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                          : res.publishStatus === 'SAVED_LOCALLY'
                          ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                          : res.publishStatus === 'UNCONFIRMED'
                          ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                          : res.publishStatus === 'FAILED'
                          ? 'bg-red-500/15 text-red-500 border-red-500/30'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {res.publishStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  setBulkResults(null)
                  setSelectedReviewIds([])
                  setRefreshKey(k => k + 1)
                }}
                className="bg-primary text-primary-foreground text-xs"
              >
                Close & Refresh Inbox
              </Button>
            </div>
          </div>
        </div>
      )}

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

function ReviewCard({
  review,
  onSelect,
  isSelected,
  onToggleSelect,
}: {
  review: Review
  onSelect: () => void
  isSelected?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
}) {
  const timeAgo = getTimeAgo(review.createdAt)
  const isPending = review.draftStatus === 'PENDING'
  const isPosting = review.draftStatus === 'POSTING'
  const isPublishFailed = review.latestPublishAttempt?.status === 'FAILED'
  const isUnconfirmed = review.latestPublishAttempt?.status === 'UNCONFIRMED'
  const isApproved = review.draftStatus === 'APPROVED' && !isPublishFailed && !isUnconfirmed
  const isLive = review.draftStatus === 'POSTED' &&
    review.latestPublishAttempt?.status === 'SUCCESS' &&
    !!review.latestPublishAttempt.remoteId &&
    !review.latestPublishAttempt.remoteId.startsWith('manual_copy_') &&
    !review.latestPublishAttempt.remoteId.startsWith('internal_')
  const isSavedLocally = review.draftStatus === 'POSTED' && !isLive
  const isEscalated = !!review.activeEscalation || (review.rating <= 2 && !review.repliedAt)
  const escalationSeverity = review.activeEscalation?.severity

  return (
    <Card
      className={cn(
        "p-4 glass-card hover:border-[var(--brass)]/40 transition-all cursor-pointer",
        isSelected && "border-[var(--brass)]/60 bg-[var(--brass)]/5"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <div
            className="flex items-center pt-2.5 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(e)
            }}
          >
            <input
              type="checkbox"
              checked={isSelected || false}
              onChange={() => {}}
              className="w-4 h-4 rounded border-border cursor-pointer accent-[var(--brass)]"
            />
          </div>
        )}
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
                <Badge variant="outline" className={cn(
                  "text-[9px] py-0",
                  escalationSeverity === 'CRITICAL'
                    ? "bg-red-500/20 text-red-500 border-red-500/40 font-bold"
                    : "bg-red-500/10 text-red-600 border-red-500/30"
                )}>
                  <AlertCircle className="w-2.5 h-2.5 mr-1" />
                  {escalationSeverity ? `${escalationSeverity} Escalated` : 'Escalated'}
                </Badge>
              )}
              {isPosting && (
                <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/30 py-0 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                  Publishing...
                </Badge>
              )}
              {isPublishFailed && (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30 py-0" title={review.latestPublishAttempt?.errorMessage || 'Publish attempt failed'}>
                  <AlertCircle className="w-2.5 h-2.5 mr-1" />
                  Publish Failed
                </Badge>
              )}
              {isUnconfirmed && (
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 py-0" title="Network timeout during dispatch. Verify on platform before retrying.">
                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                  Unconfirmed
                </Badge>
              )}
              {isPending && (
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 py-0">
                  <Clock className="w-2.5 h-2.5 mr-1" />
                  Draft ready
                </Badge>
              )}
              {isApproved && (
                <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/30 py-0">
                  <Check className="w-2.5 h-2.5 mr-1" />
                  Approved
                </Badge>
              )}
              {isLive && (
                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 py-0" title="Published live to platform via API">
                  <Globe className="w-2.5 h-2.5 mr-1" />
                  Published Live
                </Badge>
              )}
              {isSavedLocally && (
                <Badge variant="outline" className="text-[9px] bg-teal-500/10 text-teal-600 border-teal-500/30 py-0" title="Saved locally in database">
                  <Copy className="w-2.5 h-2.5 mr-1" />
                  Saved Locally
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
  const [presets, setPresets] = useState<Array<{ id: string; name: string }>>([])
  const [templates, setTemplates] = useState<Array<{ id: string; title: string; category: string | null }>>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('sys_preset_professional_warm')

  const businessId = review.business?.id

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/ai-presets?businessId=${businessId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.presets) {
          setPresets(d.presets)
          const def = d.customPresets?.find((p: any) => p.isDefault) || d.systemPresets?.[0]
          if (def) setSelectedPresetId(def.id)
        }
      })
      .catch(() => {})

    fetch(`/api/templates?businessId=${businessId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.templates) setTemplates(d.templates)
      })
      .catch(() => {})
  }, [businessId])

  const generateDraft = async (force = false, overridePresetId?: string) => {
    setIsGenerating(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceRegenerate: force,
          presetId: overridePresetId || selectedPresetId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraft(data.draft)
        setDraftStatus(data.status)
        onUpdate({ ...review, draftText: data.draft, draftStatus: data.status })
        toast.success('AI draft generated', {
          description: `Generated with ${data.preset?.name || 'preset'} style`,
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

  const applyTemplate = async (templateId: string) => {
    if (!templateId) return
    setIsGenerating(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          applyTemplateDirectly: true,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraft(data.draft)
        setDraftStatus(data.status)
        onUpdate({ ...review, draftText: data.draft, draftStatus: data.status })
        toast.success('Template applied', {
          description: `Applied "${data.templateTitle || 'Template'}" with hydrated variables`,
        })
      } else {
        toast.error('Failed to apply template', { description: data.error })
      }
    } catch (e) {
      toast.error('Failed to apply template')
    } finally {
      setIsGenerating(false)
    }
  }

  const approveDraft = async (editedText?: string, publishMode: 'manual' | 'platform' = 'manual') => {
    setIsApproving(true)
    const textToCopy = editedText || draft || review.draftText || ''
    try {
      const res = await fetch(`/api/reviews/${review.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          editedText,
          publishMode,
          ...(publishMode === 'manual' ? { manual: true } : {}),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus(data.status)
        onUpdate({
          ...review,
          replyText: data.replyText,
          repliedAt: data.repliedAt,
          draftStatus: data.status,
          latestPublishAttempt: {
            id: `att_${Date.now()}`,
            status: 'SUCCESS',
            platform: review.source,
            errorMessage: null,
            remoteId: data.publishedLive ? (data.remoteId || review.externalId || review.id) : `manual_copy_${review.id}`,
            createdAt: new Date().toISOString(),
          },
        })
        if (publishMode === 'platform') {
          toast.success(`Reply published live to ${review.source}!`, {
            description: 'The reply has been posted directly to the platform via API.',
          })
        } else if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy)
            toast.success('Approved & Copied to Clipboard!', {
              description: `Reply saved locally. Paste directly into ${review.source} to publish.`,
            })
          } catch {
            toast.success('Reply Approved!', {
              description: `Reply saved locally for ${review.source}.`,
            })
          }
        } else {
          toast.success('Reply Approved')
        }
        setIsEditing(false)
      } else {
        if (data.status === 'APPROVED') {
          setDraftStatus(data.status)
          onUpdate({
            ...review,
            draftStatus: data.status,
            latestPublishAttempt: {
              id: `att_${Date.now()}`,
              status: data.publishStatus === 'UNCONFIRMED' ? 'UNCONFIRMED' : 'FAILED',
              platform: review.source,
              errorMessage: data.error || 'Failed to post reply',
              remoteId: null,
              createdAt: new Date().toISOString(),
            },
          })
        }
        // Surface platform-specific errors with actionable messages
        if (data.code === 'NO_OAUTH_TOKEN') {
          toast.error(`${review.source} not connected`, {
            description: 'Go to Settings → Integrations to connect your account, then try again.',
          })
        } else if (data.code === 'GOOGLE_REAUTH_REQUIRED') {
          toast.error(`Google authorization expired`, {
            description: 'Please reconnect your Google Business Profile in Settings → Integrations.',
          })
        } else {
          toast.error('Failed to publish', { description: data.error })
        }
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
  const isApproved = draftStatus === 'APPROVED'
  const isPublishFailed = review.latestPublishAttempt?.status === 'FAILED'
  const isUnconfirmed = review.latestPublishAttempt?.status === 'UNCONFIRMED'
  const isLive = isPosted &&
    review.latestPublishAttempt?.status === 'SUCCESS' &&
    !!review.latestPublishAttempt.remoteId &&
    !review.latestPublishAttempt.remoteId.startsWith('manual_copy_') &&
    !review.latestPublishAttempt.remoteId.startsWith('internal_')
  const isSavedLocally = isPosted && !isLive
  const canApprove = isPending || isApproved || isPublishFailed || isUnconfirmed

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
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[var(--brass)]" />
                {isPosted ? 'Posted Reply' : 'AI Draft Reply'}
              </h3>

              {!isPosted && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Preset Selector */}
                  {presets.length > 0 && (
                    <div className="flex items-center gap-1 bg-accent/40 px-2 py-0.5 rounded border border-border/50">
                      <Sliders className="w-3 h-3 text-muted-foreground" />
                      <select
                        value={selectedPresetId}
                        onChange={e => setSelectedPresetId(e.target.value)}
                        className="bg-transparent text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
                        title="Select AI Fine-Tuning Preset"
                      >
                        {presets.map(p => (
                          <option key={p.id} value={p.id} className="bg-popover text-popover-foreground">
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Template Quick Insert */}
                  {templates.length > 0 && (
                    <div className="flex items-center gap-1 bg-accent/40 px-2 py-0.5 rounded border border-border/50">
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            applyTemplate(e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="bg-transparent text-[11px] font-medium text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                        title="Quick-apply hydrated reply template"
                      >
                        <option value="" disabled className="bg-popover text-popover-foreground">
                          Apply Template...
                        </option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id} className="bg-popover text-popover-foreground">
                            {t.title} {t.category ? `(${t.category.toLowerCase()})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!draft && (
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
              )}
            </div>

            {draft || isPosted ? (
              <div className="rounded-lg border border-[var(--brass)]/30 bg-[var(--brass)]/5 overflow-hidden">
                <div className="px-3 py-2 bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
                    <Bot className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-[10px] font-mono text-[var(--brass)]">
                    {isLive
                      ? `Posted live · ${review.source}`
                      : isSavedLocally
                      ? `Saved locally · ${review.source}`
                      : isPublishFailed
                      ? `Publish failed · ${review.source}`
                      : isUnconfirmed
                      ? `Publish unconfirmed · ${review.source}`
                      : isApproved
                      ? `Approved draft · ${review.source}`
                      : 'AI draft · ReviewReply AI'}
                  </span>
                  {isPending && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">
                      Pending approval
                    </Badge>
                  )}
                  {isPublishFailed && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-red-500/10 text-red-600 border-red-500/30">
                      Publish Failed
                    </Badge>
                  )}
                  {isUnconfirmed && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">
                      Unconfirmed
                    </Badge>
                  )}
                  {isApproved && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-blue-500/10 text-blue-600 border-blue-500/30">
                      Approved
                    </Badge>
                  )}
                  {isLive && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      Published Live
                    </Badge>
                  )}
                  {isSavedLocally && (
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 bg-teal-500/10 text-teal-600 border-teal-500/30">
                      Saved Locally
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

                  {/* Outbound publish attempt feedback alerts */}
                  {isPublishFailed && (
                    <div className="mt-2.5 p-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-600 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Publish Attempt Failed
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {review.latestPublishAttempt?.errorMessage || 'Platform rejected the reply.'}
                        {(review.latestPublishAttempt?.errorMessage?.includes('not connected') ||
                          review.latestPublishAttempt?.errorMessage?.includes('expired') ||
                          review.latestPublishAttempt?.errorMessage?.includes('Settings')) && (
                          <a href="/settings" className="underline font-semibold ml-1.5 hover:text-red-700">
                            Connect account in Settings →
                          </a>
                        )}
                      </p>
                    </div>
                  )}

                  {isUnconfirmed && (
                    <div className="mt-2.5 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Ambiguous Network Timeout
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        A network timeout occurred during dispatch to {review.source}. Please check your {review.source} business dashboard directly to verify if the comment was posted before retrying.
                      </p>
                    </div>
                  )}

                  {isLive && (
                    <div className="mt-2.5 p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 space-y-0.5">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        Published Live to {review.source}
                      </div>
                      <p className="text-[11px] text-emerald-600">
                        This reply was successfully dispatched and posted live via direct API integration.
                      </p>
                    </div>
                  )}

                  {isSavedLocally && (
                    <div className="mt-2.5 p-2.5 rounded-md bg-teal-500/10 border border-teal-500/30 text-xs text-teal-700 space-y-0.5">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5" />
                        Saved Locally (Platform Not Connected)
                      </div>
                      <p className="text-[11px] text-teal-600">
                        Reply is saved in your local workspace. To post it to {review.source}, copy the text below and paste it into your {review.source} business dashboard.
                      </p>
                    </div>
                  )}
                </div>

                {canApprove && (
                  <div className="px-3 py-2 border-t border-[var(--brass)]/20 flex gap-2 flex-wrap items-center">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs"
                          onClick={() => approveDraft(draft, 'manual')}
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
                          onClick={() => approveDraft(undefined, 'manual')}
                          disabled={isApproving}
                        >
                          {isApproving ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Copy className="w-3 h-3 mr-1" />}
                          Approve &amp; Copy
                        </Button>
                        {(review.source === 'GOOGLE' || review.source === 'FACEBOOK') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
                            onClick={() => approveDraft(undefined, 'platform')}
                            disabled={isApproving}
                            title={`Publish reply directly to ${review.source}`}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {isPublishFailed ? 'Retry Publish to ' : 'Publish to '}
                            {review.source === 'GOOGLE' ? 'Google' : 'Facebook'}
                          </Button>
                        )}
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

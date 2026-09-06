'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { NewReportModal, EditReportModal } from '@/components/app/admin-modals'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText, Clock, Download, Plus, Mail, Calendar, TrendingUp, Star,
  Users, MessageSquare, Target, BarChart3, Send, Loader2, RefreshCw, AlertCircle, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useActiveBusiness } from '@/lib/business-context'

interface ScheduledReportItem {
  id: string
  name: string
  schedule: string
  recipients: string[]
  format: string
  status: string
  lastSentAt?: string | null
  createdAt: string
}

interface ExecutiveAnalyticsData {
  hasBusiness: boolean
  businessId: string | null
  businessName: string | null
  isOrgWide: boolean
  totalReviews: number
  avgRating: number
  responseRate: number
  customerNps: number
  ratingsBreakdown: Record<number, number>
  periodComparison: {
    totalReviewsChange: string
    avgRatingChange: string
    responseRateChange: string
    npsChange: string
  }
  velocity: Array<{
    weekNumber: number
    weekLabel: string
    startDate: string
    endDate: string
    count: number
  }>
  trendBadge: string
  summary: string
}

export default function ReportsPage() {
  const { businesses, activeBusiness, activeBusinessId } = useActiveBusiness()
  const [reports, setReports] = useState<ScheduledReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newReportOpen, setNewReportOpen] = useState(false)
  const [editReport, setEditReport] = useState<{ id: string; name: string; schedule: string; status: string; recipients: string[]; format: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Executive analytics state
  const [executiveData, setExecutiveData] = useState<ExecutiveAnalyticsData | null>(null)
  const [loadingExecutive, setLoadingExecutive] = useState(true)
  const [executiveError, setExecutiveError] = useState<string | null>(null)
  const [executiveScope, setExecutiveScope] = useState<'active' | 'all'>('active')

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      if (res.ok && Array.isArray(data.reports)) {
        setReports(data.reports)
      }
    } catch (e) {
      console.error('Failed to fetch reports:', e)
      toast.error('Failed to load reports')
    }
  }, [])

  const handleRefreshExecutive = useCallback(async () => {
    setLoadingExecutive(true)
    setExecutiveError(null)
    try {
      const targetBizId = executiveScope === 'active' ? activeBusinessId : null
      const url = targetBizId
        ? `/api/reports/executive?businessId=${encodeURIComponent(targetBizId)}`
        : '/api/reports/executive'

      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setExecutiveData(data)
      } else {
        setExecutiveError(data.error || 'Failed to load executive analytics')
      }
    } catch (e) {
      console.error('Failed to fetch executive analytics:', e)
      setExecutiveError('Network error loading executive analytics')
    } finally {
      setLoadingExecutive(false)
    }
  }, [activeBusinessId, executiveScope])

  useEffect(() => {
    let isCancelled = false

    async function loadReports() {
      try {
        const res = await fetch('/api/reports')
        const data = await res.json()
        if (!isCancelled && res.ok && Array.isArray(data.reports)) {
          setReports(data.reports)
        }
      } catch (e) {
        console.error('Failed to fetch reports:', e)
        if (!isCancelled) {
          toast.error('Failed to load reports')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadReports()
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadExecutive() {
      try {
        const targetBizId = executiveScope === 'active' ? activeBusinessId : null
        const url = targetBizId
          ? `/api/reports/executive?businessId=${encodeURIComponent(targetBizId)}`
          : '/api/reports/executive'

        const res = await fetch(url)
        const data = await res.json()
        if (!isCancelled) {
          if (res.ok) {
            setExecutiveData(data)
          } else {
            setExecutiveError(data.error || 'Failed to load executive analytics')
          }
        }
      } catch (e) {
        if (!isCancelled) {
          console.error('Failed to fetch executive analytics:', e)
          setExecutiveError('Network error loading executive analytics')
        }
      } finally {
        if (!isCancelled) {
          setLoadingExecutive(false)
        }
      }
    }

    loadExecutive()
    return () => {
      isCancelled = true
    }
  }, [activeBusinessId, executiveScope])



  const handleToggleStatus = async (report: ScheduledReportItem) => {
    const newStatus = report.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    setActionLoading(report.id)
    try {
      const res = await fetch('/api/reports/create', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          status: newStatus,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Report ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'}!`)
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: newStatus } : r))
      } else {
        toast.error('Failed to update status', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteReport = async (report: ScheduledReportItem) => {
    if (!confirm(`Are you sure you want to delete report "${report.name}"?`)) return
    setActionLoading(report.id)
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Report "${report.name}" deleted`)
        setReports(prev => prev.filter(r => r.id !== report.id))
      } else {
        toast.error('Failed to delete report', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  const formatLastSent = (iso?: string | null) => {
    if (!iso) return 'Never'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Reports"
          description="Scheduled reports and executive dashboards"
        />
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="scheduled" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="scheduled" className="text-xs">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Scheduled ({reports.length})
              </TabsTrigger>
              <TabsTrigger value="executive" className="text-xs">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Executive
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scheduled">
              <div className="space-y-4">
                <Card className="p-5 glass-card border-dashed border-2 border-[var(--brass)]/30 bg-[var(--brass)]/5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-[var(--brass)]" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold">Schedule New Report</h3>
                        <p className="text-xs text-muted-foreground">Daily, weekly, or monthly — sent to your inbox</p>
                      </div>
                    </div>
                    <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setNewReportOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" />
                      New report
                    </Button>
                  </div>
                </Card>

                {loading ? (
                  <Card className="p-12 glass-card text-center">
                    <Loader2 className="w-8 h-8 text-[var(--brass)] mx-auto mb-3 animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading scheduled reports...</p>
                  </Card>
                ) : reports.length === 0 ? (
                  <Card className="p-12 glass-card text-center">
                    <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                    <h3 className="font-display font-bold mb-1">No scheduled reports configured</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first automated email or PDF digest to keep track of review activity.
                    </p>
                    <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setNewReportOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" />
                      Create first report
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {reports.map(r => (
                      <Card key={r.id} className="p-5 glass-card hover:border-[var(--brass)]/30 transition-all">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                              r.schedule === 'REALTIME_ALERT' ? 'bg-red-500/10' : 'bg-[var(--brass)]/10'
                            )}>
                              {r.schedule === 'REALTIME_ALERT' ? (
                                <MessageSquare className="w-5 h-5 text-red-500" />
                              ) : (
                                <FileText className="w-5 h-5 text-[var(--brass)]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-display font-bold">{r.name}</h3>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[9px] capitalize',
                                    r.status === 'ACTIVE'
                                      ? 'bg-green-500/10 text-green-600 border-green-500/30'
                                      : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                  )}
                                >
                                  {r.status}
                                </Badge>
                                <Badge variant="outline" className="text-[9px] font-mono">
                                  {r.schedule}
                                </Badge>
                                <Badge variant="outline" className="text-[9px]">
                                  {r.format === 'EMAIL_HTML' ? 'Email' : r.format === 'PDF_ATTACHMENT' ? 'PDF' : 'Email + PDF'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {r.recipients.length} recipient{r.recipients.length > 1 ? 's' : ''} ({r.recipients.slice(0, 2).join(', ')}{r.recipients.length > 2 ? ` +${r.recipients.length - 2}` : ''})
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Last sent: {formatLastSent(r.lastSentAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={actionLoading === r.id}
                              onClick={() => handleToggleStatus(r)}
                            >
                              {r.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setEditReport({
                                id: r.id,
                                name: r.name,
                                schedule: r.schedule,
                                status: r.status,
                                recipients: r.recipients,
                                format: r.format,
                              })}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              disabled={actionLoading === r.id}
                              onClick={() => handleDeleteReport(r)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="executive">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold">Executive Analytics</h3>
                    {executiveData?.trendBadge && (
                      <Badge variant="outline" className={cn(
                        'text-[10px] font-mono py-0',
                        executiveData.trendBadge === 'Trending up' ? 'text-green-500 border-green-500/30 bg-green-500/10' :
                        executiveData.trendBadge === 'Pacing down' ? 'text-amber-500 border-amber-500/30 bg-amber-500/10' :
                        'text-muted-foreground border-border'
                      )}>
                        {executiveData.trendBadge === 'Trending up' && <TrendingUp className="w-3 h-3 mr-1 inline" />}
                        {executiveData.trendBadge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {executiveScope === 'active' && activeBusiness
                      ? `Performance metrics for ${activeBusiness.name}`
                      : 'Aggregated cross-location performance insights'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {businesses.length > 1 && (
                    <div className="flex p-0.5 glass-card rounded-lg text-xs">
                      <button
                        onClick={() => setExecutiveScope('active')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1',
                          executiveScope === 'active'
                            ? 'bg-[var(--brass)] text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Building2 className="w-3 h-3" />
                        Active Location
                      </button>
                      <button
                        onClick={() => setExecutiveScope('all')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1',
                          executiveScope === 'all'
                            ? 'bg-[var(--brass)] text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Users className="w-3 h-3" />
                        All Locations
                      </button>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs glass-card"
                    onClick={handleRefreshExecutive}
                    disabled={loadingExecutive}
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loadingExecutive && 'animate-spin')} />
                    Refresh
                  </Button>
                </div>
              </div>

              {loadingExecutive ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Card key={i} className="p-4 glass-card animate-pulse">
                        <div className="h-3 w-20 bg-muted/40 rounded mb-3" />
                        <div className="h-7 w-16 bg-muted/30 rounded" />
                      </Card>
                    ))}
                  </div>
                  <Card className="p-5 glass-card animate-pulse">
                    <div className="h-4 w-32 bg-muted/40 rounded mb-2" />
                    <div className="h-3 w-48 bg-muted/20 rounded mb-6" />
                    <div className="h-32 bg-muted/10 rounded" />
                  </Card>
                </div>
              ) : executiveError ? (
                <Card className="p-8 glass-card text-center">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                  <h4 className="font-semibold text-sm mb-1">Failed to load executive analytics</h4>
                  <p className="text-xs text-muted-foreground mb-4">{executiveError}</p>
                  <Button size="sm" variant="outline" onClick={handleRefreshExecutive}>Try Again</Button>
                </Card>
              ) : executiveData && executiveData.totalReviews === 0 ? (
                <Card className="p-12 glass-card text-center mb-4">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <h4 className="font-display font-bold text-base mb-1">No reviews analyzed yet</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
                    {executiveScope === 'active' && activeBusiness
                      ? `No reviews recorded for "${activeBusiness.name}". Ingest or import reviews to generate live response rate, Net Promoter Score, and velocity trajectories.`
                      : 'No reviews recorded in your organization. Connect a platform or import reviews to begin viewing executive insights.'}
                  </p>
                </Card>
              ) : executiveData ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                      {
                        label: 'Total Reviews',
                        value: executiveData.totalReviews.toLocaleString(),
                        change: executiveData.periodComparison.totalReviewsChange,
                        icon: Star,
                        desc: 'vs prior 30 days',
                      },
                      {
                        label: 'Avg Rating',
                        value: `${executiveData.avgRating.toFixed(1)}★`,
                        change: executiveData.periodComparison.avgRatingChange,
                        icon: TrendingUp,
                        desc: 'vs prior 30 days',
                      },
                      {
                        label: 'Response Rate',
                        value: `${executiveData.responseRate}%`,
                        change: executiveData.periodComparison.responseRateChange,
                        icon: MessageSquare,
                        desc: 'replied reviews',
                      },
                      {
                        label: 'Customer NPS',
                        value: `${executiveData.customerNps > 0 ? '+' : ''}${executiveData.customerNps}`,
                        change: `${executiveData.ratingsBreakdown[5] || 0} promoters`,
                        icon: Target,
                        desc: '5★ vs 1-3★ rating ratio',
                      },
                    ].map(s => (
                      <Card key={s.label} className="p-4 glass-card">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                          <s.icon className="w-3.5 h-3.5 text-[var(--brass)]" />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-2xl font-bold">{s.value}</span>
                          <span className="text-[10px] text-green-500 font-mono">{s.change}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{s.desc}</p>
                      </Card>
                    ))}
                  </div>

                  <Card className="p-5 glass-card mb-4">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="font-display font-bold">Review Velocity</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Weekly review volume across the past 12 weeks · derived from active review records
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono text-[var(--brass)] border-[var(--brass)]/30">
                        12-Week Trajectory
                      </Badge>
                    </div>

                    {executiveData.velocity.length > 0 ? (
                      (() => {
                        const maxCount = Math.max(...executiveData.velocity.map(v => v.count), 1)
                        return (
                          <div className="flex items-end gap-1.5 h-36 pt-4">
                            {executiveData.velocity.map((v) => (
                              <div
                                key={v.weekNumber}
                                className="flex-1 flex flex-col items-center gap-1 group cursor-pointer relative"
                                title={`Week ${v.weekNumber}: ${v.count} review${v.count === 1 ? '' : 's'}`}
                              >
                                <div className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 text-[var(--brass)] font-bold">
                                  {v.count}
                                </div>
                                <div
                                  className="w-full rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)] transition-all group-hover:opacity-80 min-h-[4px]"
                                  style={{ height: `${Math.max((v.count / maxCount) * 100, 4)}%` }}
                                />
                                <div className="text-[8px] text-muted-foreground font-mono">{v.weekLabel}</div>
                              </div>
                            ))}
                          </div>
                        )
                      })()
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        No velocity data recorded in this time range.
                      </div>
                    )}
                  </Card>
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="history">
              <Card className="p-5 glass-card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-bold">Report Dispatch Activity</h3>
                    <p className="text-xs text-muted-foreground">Recent dispatch status for configured scheduled reports</p>
                  </div>
                </div>

                {reports.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-xs">
                    No scheduled reports configured. Set up a schedule to begin tracking dispatch activity.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reports.map(r => (
                      <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20">
                        <FileText className="w-4 h-4 text-[var(--brass)] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            <span>{r.name}</span>
                            <Badge variant="outline" className="text-[9px] font-mono">{r.schedule}</Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {r.lastSentAt ? `Last dispatched: ${new Date(r.lastSentAt).toLocaleString()}` : 'Never dispatched yet'} · {r.recipients.length} recipient(s)
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={r.status === 'ACTIVE' ? 'text-green-600 bg-green-500/10' : 'text-amber-600 bg-amber-500/10'}
                        >
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                    <div className="p-3 mt-4 rounded-lg bg-muted/20 border border-border/30 text-xs text-muted-foreground text-center">
                      Detailed event logs and delivery timestamps are persisted in <a href="/settings" className="text-[var(--brass)] hover:underline">Settings &gt; Audit Log</a>.
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
      <NewReportModal open={newReportOpen} onOpenChange={setNewReportOpen} onSuccess={fetchReports} />
      <EditReportModal open={!!editReport} onOpenChange={(v) => { if (!v) setEditReport(null) }} report={editReport} onSuccess={fetchReports} />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { NewReportModal, EditReportModal } from '@/components/app/admin-modals'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText, Clock, Download, Plus, Mail, Calendar, TrendingUp, Star,
  Users, MessageSquare, Target, BarChart3, Send, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

export default function ReportsPage() {
  const [reports, setReports] = useState<ScheduledReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newReportOpen, setNewReportOpen] = useState(false)
  const [editReport, setEditReport] = useState<{ id: string; name: string; schedule: string; status: string; recipients: string[]; format: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      if (res.ok && Array.isArray(data.reports)) {
        setReports(data.reports)
      }
    } catch (e) {
      console.error('Failed to fetch reports:', e)
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [])

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
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold">Executive Analytics</h3>
                  <p className="text-xs text-muted-foreground">Aggregated cross-location performance insights</p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                  Stage 3 Roadmap Preview
                </Badge>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Total Reviews', value: '1,247', change: '+12%', icon: Star },
                  { label: 'Avg Rating', value: '4.6', change: '+0.3', icon: TrendingUp },
                  { label: 'Response Rate', value: '87%', change: '+5%', icon: MessageSquare },
                  { label: 'Customer NPS', value: '+42', change: '+8', icon: Target },
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
                  </Card>
                ))}
              </div>

              <Card className="p-5 glass-card mb-4">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-display font-bold">Review Velocity</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Reviews received per week · sample trajectory</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-green-500 border-green-500/30">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending up
                  </Badge>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {[35, 42, 38, 51, 48, 62, 58, 71, 65, 78, 82, 89].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                      <div className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{h}</div>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)] transition-all hover:opacity-80"
                        style={{ height: `${(h / 89) * 100}%` }}
                      />
                      <div className="text-[8px] text-muted-foreground font-mono">W{i + 1}</div>
                    </div>
                  ))}
                </div>
              </Card>
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

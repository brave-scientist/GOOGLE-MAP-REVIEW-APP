'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Shield, Search, ChevronLeft, ChevronRight, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuditEntry {
  id: string
  actorId: string | null
  actorEmail: string | null
  actorName: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: string | null
  ip: string | null
  createdAt: string
}

interface AuditLogResponse {
  entries: AuditEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    action: string | null
    targetType: string | null
    actorId: string | null
    since: string | null
    until: string | null
  }
}

// Distinct action categories for the filter dropdown.
// These match the action prefixes written by auditLog.create() across the codebase.
const ACTION_CATEGORIES = [
  { value: '', label: 'All actions' },
  { value: 'user.', label: 'User (signup/login)' },
  { value: 'admin.', label: 'Admin (trial/broadcast)' },
  { value: 'draft.', label: 'Draft (generated/rejected)' },
  { value: 'reply.', label: 'Reply (posted)' },
  { value: 'campaign.', label: 'Campaign (created/sent)' },
  { value: 'google.', label: 'Google (connected/sync)' },
  { value: 'sms.', label: 'SMS (opt-out/opt-in)' },
  { value: 'email.', label: 'Email (opt-out)' },
  { value: 'team.', label: 'Team (invite/add)' },
  { value: 'brand_voice.', label: 'Brand voice (updated)' },
  { value: 'competitor.', label: 'Competitor (added)' },
  { value: 'integration.', label: 'Integration (connect/disconnect)' },
  { value: 'report.', label: 'Report (created/updated)' },
  { value: 'contact.', label: 'Contact form' },
  { value: 'trial.', label: 'Trial (expired/downgrade)' },
]

export default function AuditLogPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchAuditLog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (actionFilter) params.set('action', actionFilter)
      if (appliedSearch) params.set('action', appliedSearch)
      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const d: AuditLogResponse = await res.json()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch audit log')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, appliedSearch])

  useEffect(() => {
    fetchAuditLog()
  }, [fetchAuditLog])

  const handleSearch = () => {
    setAppliedSearch(searchInput)
    setPage(1)
  }

  const handleCategoryChange = (value: string) => {
    setActionFilter(value)
    setSearchInput('')
    setAppliedSearch('')
    setPage(1)
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatMetadata = (metadata: string | null): Record<string, unknown> | null => {
    if (!metadata) return null
    try {
      return JSON.parse(metadata)
    } catch {
      return { _raw: metadata }
    }
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const entries = data?.entries || []
  const pagination = data?.pagination
  const showingFrom = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0
  const showingTo = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Audit Log"
          description="Platform-wide record of all admin and user actions"
        />
        <div className="p-4 sm:p-6 space-y-4">
          {/* Filters */}
          <Card className="p-4 glass-card">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="search" className="text-xs">Search by action</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    id="search"
                    placeholder="e.g. admin.trial_extended"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="glass-card"
                  />
                  <Button onClick={handleSearch} size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
                    <Search className="w-3.5 h-3.5 mr-1" />
                    Search
                  </Button>
                </div>
              </div>
              <div className="min-w-[200px]">
                <Label className="text-xs">Category</Label>
                <Select value={actionFilter} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="mt-1.5 glass-card">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(actionFilter || appliedSearch) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionFilter('')
                    setAppliedSearch('')
                    setSearchInput('')
                    setPage(1)
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </Card>

          {/* Error */}
          {error && (
            <Card className="p-4 glass-card border-red-500/30">
              <p className="text-sm text-red-600">{error}</p>
            </Card>
          )}

          {/* Table */}
          <Card className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-accent/30 border-b border-border">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Actor</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Target</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Loading…
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No audit log entries found.
                      </td>
                    </tr>
                  ) : (
                    entries.map(entry => {
                      const expanded = expandedRows.has(entry.id)
                      const meta = formatMetadata(entry.metadata)
                      return (
                        <tr key={entry.id} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="p-3 align-top whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </td>
                          <td className="p-3 align-top">
                            {entry.actorEmail ? (
                              <div>
                                <div className="font-medium">{entry.actorName || entry.actorEmail}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{entry.actorEmail}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">system</span>
                            )}
                          </td>
                          <td className="p-3 align-top">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-mono',
                                entry.action.startsWith('admin.') && 'bg-amber-500/10 text-amber-700 border-amber-500/30',
                                entry.action.startsWith('user.') && 'bg-blue-500/10 text-blue-700 border-blue-500/30',
                                entry.action.startsWith('draft.') && 'bg-purple-500/10 text-purple-700 border-purple-500/30',
                                entry.action.startsWith('reply.') && 'bg-green-500/10 text-green-700 border-green-500/30',
                                entry.action.startsWith('sms.') && 'bg-orange-500/10 text-orange-700 border-orange-500/30',
                              )}
                            >
                              {entry.action}
                            </Badge>
                          </td>
                          <td className="p-3 align-top">
                            {entry.targetType ? (
                              <div className="font-mono text-[10px]">
                                <div>{entry.targetType}</div>
                                {entry.targetId && (
                                  <div className="text-muted-foreground truncate max-w-[120px]" title={entry.targetId}>
                                    {entry.targetId}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 align-top">
                            {meta ? (
                              <button
                                onClick={() => toggleRow(entry.id)}
                                className="text-[10px] text-[var(--brass)] hover:underline flex items-center gap-1"
                              >
                                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {Object.keys(meta).length} field{Object.keys(meta).length !== 1 ? 's' : ''}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {expanded && meta && (
                              <pre className="mt-2 p-2 rounded bg-accent/30 text-[10px] font-mono overflow-x-auto max-w-md">
                                {JSON.stringify(meta, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.total > 0 && (
              <div className="flex items-center justify-between p-3 border-t border-border text-xs">
                <div className="text-muted-foreground">
                  Showing {showingFrom}–{showingTo} of {pagination.total} entries
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </Button>
                  <span className="font-mono text-muted-foreground">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages || loading}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Info note */}
          <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
            <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              This log records every admin action (trial extension, broadcast, plan change), every user auth event,
              and every data mutation across the platform. Entries are immutable and retained indefinitely
              (configure retention via a cleanup cron if needed).
            </p>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Shield, FileText, Trash2, Download, Lock, Eye, CheckCircle, AlertCircle,
  Clock, Database, UserCheck, Mail, Loader2, AlertTriangle, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AuditLogEntry {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  actorId: string | null
  actor: string
  ip: string | null
  createdAt: string
  metadata?: string | null
}

interface DeletionRequestInfo {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED'
  reason: string | null
  scheduledFor: string
  requestedAt: string
}

export default function CompliancePage() {
  // Export states
  const [isExportingData, setIsExportingData] = useState(false)
  const [isExportingAudit, setIsExportingAudit] = useState(false)

  // Deletion request states
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequestInfo | null>(null)
  const [isLoadingDeletion, setIsLoadingDeletion] = useState(true)
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false)
  const [isCancellingDeletion, setIsCancellingDeletion] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')

  // Audit log states
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [isLoadingAudit, setIsLoadingAudit] = useState(true)
  const [auditError, setAuditError] = useState<string | null>(null)

  // ─────────────────────────────────────────────────────────────
  // Load Initial Statuses
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let ignore = false

    fetch('/api/compliance/deletion-request')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!ignore) {
          if (data) setDeletionRequest(data.deletionRequest || null)
          setIsLoadingDeletion(false)
        }
      })
      .catch(() => {
        if (!ignore) setIsLoadingDeletion(false)
      })

    fetch('/api/audit-log?limit=25')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load audit logs')
        return res.json()
      })
      .then(data => {
        if (!ignore) {
          setAuditLogs(data.entries || [])
          setIsLoadingAudit(false)
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          setAuditError(err.message || 'Could not load audit logs')
          setIsLoadingAudit(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  const refreshAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-log?limit=25')
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.entries || [])
      }
    } catch {
      // Background refresh
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Handlers: DSAR Export
  // ─────────────────────────────────────────────────────────────
  const handleExportData = async () => {
    try {
      setIsExportingData(true)
      const res = await fetch('/api/export?type=dsar')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to generate data archive')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dsar-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Personal data archive downloaded successfully', {
        description: 'Includes user profile, organizations, businesses, reviews, campaigns, and consent records.',
      })
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    } finally {
      setIsExportingData(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Handlers: Audit Log Export
  // ─────────────────────────────────────────────────────────────
  const handleExportAudit = async () => {
    try {
      setIsExportingAudit(true)
      const res = await fetch('/api/export?type=audit-log')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to export audit log')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Audit log exported successfully', {
        description: 'CSV download initiated for your organization audit trail.',
      })
    } catch (err: any) {
      toast.error(err.message || 'Audit export failed')
    } finally {
      setIsExportingAudit(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Handlers: Deletion Request & Cancellation
  // ─────────────────────────────────────────────────────────────
  const handleRequestDeletion = async () => {
    try {
      setIsSubmittingDeletion(true)
      const res = await fetch('/api/compliance/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deletionReason.trim() || undefined }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit deletion request')

      setDeletionRequest(data.deletionRequest)
      setShowDeleteModal(false)
      setDeletionReason('')
      toast.warning('Account deletion request recorded', {
        description: 'A 30-day grace period is now active. You may cancel anytime before processing.',
      })
      // Refresh audit logs to reflect the deletion request event
      refreshAuditLogs()
    } catch (err: any) {
      toast.error(err.message || 'Failed to request deletion')
    } finally {
      setIsSubmittingDeletion(false)
    }
  }

  const handleCancelDeletion = async () => {
    try {
      setIsCancellingDeletion(true)
      const res = await fetch('/api/compliance/deletion-request', {
        method: 'DELETE',
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel deletion request')

      setDeletionRequest(null)
      toast.success('Account deletion request cancelled', {
        description: 'Your account and data retention remain active.',
      })
      // Refresh audit logs to reflect the cancellation event
      refreshAuditLogs()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel request')
    } finally {
      setIsCancellingDeletion(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Compliance Center"
          description="GDPR, CCPA, TCPA, and security controls"
        />
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="overview" className="text-xs">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="gdpr" className="text-xs">
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                GDPR
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="data" className="text-xs">
                <Database className="w-3.5 h-3.5 mr-1.5" />
                Data Retention
              </TabsTrigger>
            </TabsList>

            {/* ────────────────── OVERVIEW TAB ────────────────── */}
            <TabsContent value="overview">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'SOC2 Type I', status: 'In Progress', color: 'amber', icon: Shield },
                  { label: 'GDPR Ready', status: 'Compliant', color: 'green', icon: Lock },
                  { label: 'CCPA Ready', status: 'Compliant', color: 'green', icon: Eye },
                  { label: 'TCPA Safe', status: 'Enforced', color: 'green', icon: CheckCircle },
                ].map(item => (
                  <Card key={item.label} className="p-4 glass-card">
                    <div className="flex items-center justify-between mb-2">
                      <item.icon className="w-4 h-4 text-[var(--brass)]" />
                      <Badge variant="outline" className={cn(
                        'text-[10px]',
                        item.color === 'green' ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                      )}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="text-sm font-semibold">{item.label}</div>
                  </Card>
                ))}
              </div>

              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-3">Security & Compliance Checklist</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Multi-Tenant Isolation', status: 'Active', desc: 'Organizations and business scopes strictly partitioned' },
                    { label: 'Data Encryption at Rest', status: 'Active', desc: 'AES-256 encryption on all stored sensitive credentials' },
                    { label: 'Affirmative TCPA SMS Consent', status: 'Enforced', desc: 'Cryptographic single-use tokens & append-only audit ledger' },
                    { label: 'GDPR Article 15 DSAR Archive', status: 'Active', desc: 'Self-serve personal and business data export available' },
                    { label: 'GDPR Article 17 Right to Erasure', status: 'Active', desc: '30-day grace period deletion request workflow with audit logging' },
                  ].map(c => (
                    <div key={c.label} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                      <div>
                        <div className="text-xs font-medium">{c.label}</div>
                        <div className="text-[10px] text-muted-foreground">{c.desc}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30">
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>

            {/* ────────────────── GDPR TAB ────────────────── */}
            <TabsContent value="gdpr">
              <div className="space-y-4 max-w-3xl">
                {/* Active Deletion Request Banner */}
                {deletionRequest && (
                  <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          Account Deletion Request Active
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Requested on {new Date(deletionRequest.requestedAt).toLocaleDateString()}. Scheduled for permanent deletion on{' '}
                          <span className="font-semibold text-foreground">
                            {new Date(deletionRequest.scheduledFor).toLocaleDateString()}
                          </span>{' '}
                          (30-day grace period).
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelDeletion}
                      disabled={isCancellingDeletion}
                      className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex-shrink-0"
                    >
                      {isCancellingDeletion ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Cancel Request
                    </Button>
                  </div>
                )}

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCheck className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Subject Access Request (DSAR)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    EU/EEA and California residents have the legal right to request a complete machine-readable archive of all personal data, reviews, campaigns, and consent events, or to request permanent account deletion (right to erasure).
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <Button
                      variant="outline"
                      className="h-12 border-border/80 hover:border-[var(--brass)]/50"
                      onClick={handleExportData}
                      disabled={isExportingData}
                    >
                      {isExportingData ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin text-[var(--brass)]" />
                      ) : (
                        <Download className="w-4 h-4 mr-2 text-[var(--brass)]" />
                      )}
                      {isExportingData ? 'Compiling Archive...' : 'Export my data (JSON)'}
                    </Button>

                    <Button
                      variant="outline"
                      className="h-12 border-red-500/30 text-red-600 hover:bg-red-500/5 hover:border-red-500/50"
                      onClick={() => setShowDeleteModal(true)}
                      disabled={!!deletionRequest || isLoadingDeletion}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deletionRequest ? 'Deletion Pending' : 'Request deletion'}
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/20 leading-relaxed">
                    <strong>Regulatory Note:</strong> Deletion requests initiate an immutable 30-day statutory grace period during which you can cancel at any time. Financial transaction records and immutable audit logs are retained for 7 years as mandated by SOC2 and commercial laws.
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Cookie Consent</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage how cookies are used on your account and customer-facing pages.
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: 'Essential cookies', desc: 'Required for site authentication & security', enabled: true, locked: true },
                      { label: 'Analytics cookies', desc: 'Telemetry to improve product stability', enabled: true, locked: false },
                      { label: 'Marketing cookies', desc: 'Used for conversion attribution', enabled: false, locked: false },
                    ].map(c => (
                      <div key={c.label} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-[10px] text-muted-foreground">{c.desc}</div>
                        </div>
                        <Badge variant="outline" className={cn(
                          'text-[9px]',
                          c.enabled ? 'bg-green-500/10 text-green-600 border-green-500/30' : ''
                        )}>
                          {c.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Legal Documents</h3>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Privacy Policy', updated: 'Aug 1, 2026' },
                      { name: 'Terms of Service', updated: 'Aug 1, 2026' },
                      { name: 'Data Processing Addendum (DPA)', updated: 'Jul 15, 2026' },
                      { name: 'Sub-processor List', updated: 'Aug 1, 2026' },
                      { name: 'Cookie Policy', updated: 'Aug 1, 2026' },
                    ].map(doc => (
                      <div key={doc.name} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{doc.name}</div>
                          <div className="text-[10px] text-muted-foreground">Last updated: {doc.updated}</div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* ────────────────── AUDIT LOG TAB ────────────────── */}
            <TabsContent value="audit">
              <Card className="p-5 glass-card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-bold">Organization Audit Trail</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Live immutable ledger of tenant mutations · retained 7 years</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-border/80 hover:border-[var(--brass)]/50"
                    onClick={handleExportAudit}
                    disabled={isExportingAudit}
                  >
                    {isExportingAudit ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-[var(--brass)]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 mr-1.5 text-[var(--brass)]" />
                    )}
                    {isExportingAudit ? 'Exporting...' : 'Export (CSV)'}
                  </Button>
                </div>

                {isLoadingAudit ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--brass)] mb-2" />
                    <p className="text-xs">Loading organization audit trail...</p>
                  </div>
                ) : auditError ? (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{auditError}</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border/60 rounded-xl bg-accent/10">
                    <Shield className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    <h4 className="text-xs font-semibold text-foreground">No Audit Records Yet</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm mx-auto">
                      Administrative mutations and compliance events for this organization will be captured here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 overflow-x-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/30 transition-colors text-xs"
                      >
                        <div className="font-mono text-[10px] text-[var(--brass)] w-36 truncate flex-shrink-0 font-medium">
                          {log.action}
                        </div>
                        <div className="flex-1 truncate text-foreground/90 min-w-32">
                          {log.targetType ? `${log.targetType}: ` : ''}
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {log.targetId || 'global'}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground w-36 truncate hidden sm:block">
                          {log.actor || 'System'}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono w-24 hidden md:block">
                          {log.ip || '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono w-20 text-right flex-shrink-0">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* ────────────────── DATA RETENTION TAB ────────────────── */}
            <TabsContent value="data">
              <div className="space-y-4 max-w-2xl">
                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Retention Policy</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure how long different types of data are retained. After the retention period, data is automatically purged.
                  </p>
                  <div className="space-y-3">
                    {[
                      { type: 'Customer contact info (PII)', retention: '90 days', desc: 'Phone numbers and emails from review requests' },
                      { type: 'Reviews & replies', retention: 'Indefinite', desc: 'Stored until business deletes account' },
                      { type: 'AI draft history', retention: '1 year', desc: 'For brand voice training and quality improvement' },
                      { type: 'Audit logs', retention: '7 years', desc: 'Required for SOC2 and legal compliance' },
                      { type: 'Campaign analytics', retention: '2 years', desc: 'For trend analysis and reporting' },
                      { type: 'Webhook event logs', retention: '30 days', desc: 'For debugging and idempotency' },
                    ].map(item => (
                      <div key={item.type} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{item.type}</div>
                          <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {item.retention}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Storage</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Region</div>
                      <div className="text-sm font-medium">US-East (Virginia)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Encryption</div>
                      <div className="text-sm font-medium">AES-256-GCM</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Backups</div>
                      <div className="text-sm font-medium">Daily + PITR</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Replication</div>
                      <div className="text-sm font-medium">Multi-AZ</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/20">
                    <strong>EU data residency:</strong> Available on Enterprise tier. Contact sales to migrate your data to our EU (Frankfurt) region.
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />

      {/* ────────────────── DELETION REQUEST MODAL ────────────────── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Request Account Deletion
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Under GDPR Article 17 (Right to Erasure), this will schedule all personal data, businesses, reviews, and campaigns associated with your account for permanent erasure after a <strong>30-day grace period</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 space-y-1">
              <div className="font-semibold">Important Consequences:</div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>You can cancel this request anytime within the 30-day grace period.</li>
                <li>After 30 days, your businesses, drafts, and campaigns are irreversibly purged.</li>
                <li>Regulatory audit logs are retained for 7 years as required by financial/TCPA laws.</li>
              </ul>
            </div>

            <div>
              <label htmlFor="deletion-reason" className="text-xs font-medium text-foreground block mb-1">
                Reason for deletion (optional)
              </label>
              <Input
                id="deletion-reason"
                placeholder="e.g. Closing business, switching vendors..."
                value={deletionReason}
                onChange={e => setDeletionReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
              disabled={isSubmittingDeletion}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRequestDeletion}
              disabled={isSubmittingDeletion}
            >
              {isSubmittingDeletion && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Confirm Deletion Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

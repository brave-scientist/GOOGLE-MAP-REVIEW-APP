'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, Send, Mail, Plus, Edit3, Clock } from 'lucide-react'
import { toast } from 'sonner'

// ============================================================
// 1. Extend Trial Modal
// ============================================================
export function ExtendTrialModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Array<{ id: string; email: string; name: string | null; org: { id: string; name: string; plan: string; trialEndsAt: string | null } | null }>>([])
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string } | null>(null)
  const [days, setDays] = useState('14')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (search.length < 2) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/extend-trial?q=${encodeURIComponent(search)}`)
      const data = await res.json()
      setResults(data.users || [])
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleExtend = async () => {
    if (!selectedOrg || !days) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/extend-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: selectedOrg.id, days: parseInt(days) }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Trial extended!', { description: data.message })
        onOpenChange(false)
        setSearch('')
        setResults([])
        setSelectedOrg(null)
      } else {
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Clock className="w-4 h-4 text-[var(--brass)]" /> Extend Trial</DialogTitle>
          <DialogDescription>Search for a user's organization and extend their trial period.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Input placeholder="Search by email or name..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="glass-card" />
            <Button variant="outline" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto scrollbar-premium space-y-1">
              {results.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelectedOrg(u.org ? { id: u.org.id, name: u.org.name } : null)}
                  className={`w-full text-left p-2 rounded-lg border transition-colors ${selectedOrg?.id === u.org?.id ? 'border-[var(--brass)] bg-[var(--brass)]/10' : 'border-border/30 hover:bg-accent/30'}`}
                >
                  <div className="text-xs font-medium">{u.name || u.email}</div>
                  <div className="text-[10px] text-muted-foreground">{u.email}</div>
                  {u.org && <div className="text-[10px] text-[var(--brass)]">{u.org.name} · {u.org.plan}</div>}
                </button>
              ))}
            </div>
          )}
          {selectedOrg && (
            <div className="p-3 rounded-lg bg-[var(--brass)]/5 border border-[var(--brass)]/20">
              <div className="text-xs text-muted-foreground mb-1">Selected: <span className="text-foreground font-medium">{selectedOrg.name}</span></div>
              <div className="flex items-center gap-2">
                <Label htmlFor="days" className="text-xs whitespace-nowrap">Extend by:</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleExtend} disabled={loading || !selectedOrg}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Extend Trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// 2. Send Broadcast Modal
// ============================================================
export function BroadcastModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!subject || !message) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message, { description: `Recipients: ${data.recipientCount}` })
        onOpenChange(false)
        setSubject('')
        setMessage('')
      } else {
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Send className="w-4 h-4 text-[var(--brass)]" /> Send Broadcast</DialogTitle>
          <DialogDescription>Send an email to all registered users. Use sparingly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="bc-subject">Subject</Label>
            <Input id="bc-subject" placeholder="Important update from ReviewReply" value={subject} onChange={e => setSubject(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label htmlFor="bc-message">Message</Label>
            <Textarea id="bc-message" rows={5} placeholder="Type your message here..." value={message} onChange={e => setMessage(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <p className="text-[10px] text-muted-foreground">This will send to all users in the database. If Resend is not configured, the broadcast will be logged but not sent.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleSend} disabled={loading || !subject || !message}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Broadcast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// 3. Invite Member Modal
// ============================================================
export function InviteMemberModal({ open, onOpenChange, onSuccess }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess?: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('STAFF')
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Member invited!', { description: data.message })
        onOpenChange(false)
        setEmail('')
        onSuccess?.()
      } else {
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--brass)]" /> Invite Team Member</DialogTitle>
          <DialogDescription>Invite someone to join your organization.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="inv-email">Email address</Label>
            <Input id="inv-email" type="email" placeholder="colleague@business.com" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label htmlFor="inv-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin — full access except billing</SelectItem>
                <SelectItem value="STAFF">Staff — manage reviews and campaigns</SelectItem>
                <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleInvite} disabled={loading || !email}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// 4. New Report Modal
// ============================================================
export function NewReportModal({ open, onOpenChange, onSuccess }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess?: () => void
}) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('WEEKLY')
  const [recipients, setRecipients] = useState('')
  const [format, setFormat] = useState('EMAIL_HTML')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name) return
    setLoading(true)
    try {
      const res = await fetch('/api/reports/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schedule,
          recipients: recipients ? recipients.split(',').map((r: string) => r.trim()) : [],
          format,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Report created!', { description: data.message })
        onOpenChange(false)
        setName('')
        setRecipients('')
        onSuccess?.()
      } else {
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Plus className="w-4 h-4 text-[var(--brass)]" /> New Scheduled Report</DialogTitle>
          <DialogDescription>Configure an automated report sent to your inbox.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="rpt-name">Report name</Label>
            <Input id="rpt-name" placeholder="Weekly performance summary" value={name} onChange={e => setName(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label>Schedule</Label>
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily — every morning</SelectItem>
                <SelectItem value="WEEKLY">Weekly — every Monday</SelectItem>
                <SelectItem value="MONTHLY">Monthly — 1st of each month</SelectItem>
                <SelectItem value="REALTIME_ALERT">Real-time alert (rating ≤ 2)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rpt-recipients">Recipients (comma-separated emails)</Label>
            <Input id="rpt-recipients" placeholder="you@business.com, manager@business.com" value={recipients} onChange={e => setRecipients(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL_HTML">Email (HTML digest)</SelectItem>
                <SelectItem value="PDF_ATTACHMENT">PDF attachment</SelectItem>
                <SelectItem value="BOTH">Email + PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleCreate} disabled={loading || !name}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// 5. Edit Report Modal
// ============================================================
export function EditReportModal({ open, onOpenChange, report, onSuccess }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  report: { id: string; name: string; schedule: string; status: string; recipients?: string[]; format?: string } | null
  onSuccess?: () => void
}) {
  const [prevReport, setPrevReport] = useState(report)
  const [name, setName] = useState(report?.name || '')
  const [schedule, setSchedule] = useState(report?.schedule || 'WEEKLY')
  const [status, setStatus] = useState(report?.status || 'ACTIVE')
  const [recipients, setRecipients] = useState(Array.isArray(report?.recipients) ? report.recipients.join(', ') : '')
  const [format, setFormat] = useState(report?.format || 'EMAIL_HTML')
  const [loading, setLoading] = useState(false)

  if (report !== prevReport) {
    setPrevReport(report)
    setName(report?.name || '')
    setSchedule(report?.schedule || 'WEEKLY')
    setStatus(report?.status || 'ACTIVE')
    setRecipients(Array.isArray(report?.recipients) ? report.recipients.join(', ') : '')
    setFormat(report?.format || 'EMAIL_HTML')
  }


  const handleUpdate = async () => {
    if (!report?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/reports/create', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          name,
          schedule,
          status,
          format,
          recipients: recipients ? recipients.split(',').map((r: string) => r.trim()) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Report updated!', { description: data.message })
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error('Failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Edit3 className="w-4 h-4 text-[var(--brass)]" /> Edit Report</DialogTitle>
          <DialogDescription>{report ? `Editing: ${report.name}` : 'Modify report configuration'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="edt-name">Report name</Label>
            <Input id="edt-name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label>Schedule</Label>
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="REALTIME_ALERT">Real-time alert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edt-recipients">Recipients (comma-separated)</Label>
            <Input id="edt-recipients" value={recipients} onChange={e => setRecipients(e.target.value)} className="mt-1.5 glass-card" />
          </div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL_HTML">Email (HTML digest)</SelectItem>
                <SelectItem value="PDF_ATTACHMENT">PDF attachment</SelectItem>
                <SelectItem value="BOTH">Email + PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1.5 glass-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleUpdate} disabled={loading || !name}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit3 className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

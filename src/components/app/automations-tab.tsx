'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Zap,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  AlertTriangle,
  Mail,
  Sliders,
  Check,
  Shield,
  Activity,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveBusiness } from '@/lib/business-context'

interface AutomationRuleItem {
  id: string
  businessId: string
  businessName?: string
  name: string
  description: string | null
  triggerType: 'NEW_REVIEW' | 'SENTIMENT_ALERT' | 'RATING_THRESHOLD' | 'NEGATIVE_FEEDBACK'
  isEnabled: boolean
  minRating: number | null
  maxRating: number | null
  sentimentThreshold: 'ANY' | 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE'
  minSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  sources: string
  actionType: 'CREATE_ESCALATION' | 'DISPATCH_NOTIFICATION' | 'ESCALATE_AND_NOTIFY'
  actionConfig: {
    notifyEmail?: string
    autoAssignUserId?: string
    customNote?: string
  } | null
  cooldownMinutes: number
  lastTriggeredAt: string | null
  escalationCount: number
  executionCount: number
  createdAt: string
  updatedAt: string
}

export function AutomationsTab() {
  const { activeBusinessId, activeBusiness, businesses } = useActiveBusiness()
  const effectiveBusinessId = activeBusinessId || activeBusiness?.id || (businesses.length === 1 ? businesses[0].id : null)
  const [rules, setRules] = useState<AutomationRuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null)

  // Form State
  const [form, setForm] = useState({
    name: '',
    description: '',
    triggerType: 'NEW_REVIEW' as AutomationRuleItem['triggerType'],
    minRating: 1,
    maxRating: 2,
    sentimentThreshold: 'NEGATIVE' as AutomationRuleItem['sentimentThreshold'],
    minSeverity: 'HIGH' as AutomationRuleItem['minSeverity'],
    sources: 'ALL',
    actionType: 'ESCALATE_AND_NOTIFY' as AutomationRuleItem['actionType'],
    notifyEmail: '',
    customNote: '',
    cooldownMinutes: 0,
  })

  const fetchRules = useCallback(async () => {
    if (!effectiveBusinessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/automations?businessId=${effectiveBusinessId}`)
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || [])
      } else {
        toast.error('Failed to load automation rules')
      }
    } catch {
      toast.error('Network error loading automation rules')
    } finally {
      setLoading(false)
    }
  }, [effectiveBusinessId])

  useEffect(() => {
    let ignore = false
    async function load() {
      if (!effectiveBusinessId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/automations?businessId=${effectiveBusinessId}`)
        if (res.ok && !ignore) {
          const data = await res.json()
          setRules(data.rules || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [effectiveBusinessId])

  const openCreateModal = () => {
    setEditingRuleId(null)
    setForm({
      name: 'Urgent Negative Review Alert',
      description: 'Auto-escalate 1-2 star reviews with negative sentiment and notify management',
      triggerType: 'NEW_REVIEW',
      minRating: 1,
      maxRating: 2,
      sentimentThreshold: 'NEGATIVE',
      minSeverity: 'HIGH',
      sources: 'ALL',
      actionType: 'ESCALATE_AND_NOTIFY',
      notifyEmail: '',
      customNote: 'Please reach out to the customer within 2 business hours.',
      cooldownMinutes: 0,
    })
    setModalOpen(true)
  }

  const openEditModal = (rule: AutomationRuleItem) => {
    setEditingRuleId(rule.id)
    setForm({
      name: rule.name,
      description: rule.description || '',
      triggerType: rule.triggerType,
      minRating: rule.minRating ?? 1,
      maxRating: rule.maxRating ?? 2,
      sentimentThreshold: rule.sentimentThreshold,
      minSeverity: rule.minSeverity,
      sources: rule.sources || 'ALL',
      actionType: rule.actionType,
      notifyEmail: rule.actionConfig?.notifyEmail || '',
      customNote: rule.actionConfig?.customNote || '',
      cooldownMinutes: rule.cooldownMinutes || 0,
    })
    setModalOpen(true)
  }

  const handleToggleEnable = async (rule: AutomationRuleItem) => {
    setTogglingRuleId(rule.id)
    const endpoint = rule.isEnabled ? `/api/automations/${rule.id}/disable` : `/api/automations/${rule.id}/enable`
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      if (res.ok) {
        toast.success(`Rule ${rule.isEnabled ? 'paused' : 'activated'}`)
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: !rule.isEnabled } : r))
        )
      } else {
        const data = await res.json()
        toast.error('Failed to toggle rule', { description: data.error })
      }
    } catch {
      toast.error('Network error toggling rule')
    } finally {
      setTogglingRuleId(null)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    setDeletingRuleId(ruleId)
    try {
      const res = await fetch(`/api/automations/${ruleId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Automation rule deleted')
        setRules((prev) => prev.filter((r) => r.id !== ruleId))
      } else {
        const data = await res.json()
        toast.error('Failed to delete rule', { description: data.error })
      }
    } catch {
      toast.error('Network error deleting rule')
    } finally {
      setDeletingRuleId(null)
    }
  }

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Rule name is required')
      return
    }

    if ((form.actionType === 'DISPATCH_NOTIFICATION' || form.actionType === 'ESCALATE_AND_NOTIFY') && !form.notifyEmail.trim()) {
      toast.error('Notification email is required for alert actions')
      return
    }

    if (!effectiveBusinessId) {
      toast.error('No active business selected', { description: 'Please select a business location first.' })
      return
    }

    setSaving(true)
    const payload = {
      businessId: effectiveBusinessId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      triggerType: form.triggerType,
      minRating: Number(form.minRating),
      maxRating: Number(form.maxRating),
      sentimentThreshold: form.sentimentThreshold,
      minSeverity: form.minSeverity,
      sources: form.sources,
      actionType: form.actionType,
      actionConfig: {
        notifyEmail: form.notifyEmail.trim() || undefined,
        customNote: form.customNote.trim() || undefined,
      },
      cooldownMinutes: Number(form.cooldownMinutes),
    }

    try {
      const url = editingRuleId ? `/api/automations/${editingRuleId}` : '/api/automations'
      const method = editingRuleId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(editingRuleId ? 'Automation rule updated' : 'Automation rule created')
        setModalOpen(false)
        fetchRules()
      } else {
        toast.error('Failed to save rule', { description: data.error })
      }
    } catch {
      toast.error('Network error saving automation rule')
    } finally {
      setSaving(false)
    }
  }

  const getSeverityBadgeClass = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-500 border-red-500/30 font-semibold'
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30'
      case 'MEDIUM':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30'
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30'
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--brass)]" />
            Automation Triggers & Escalations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure real-time sentiment analysis, escalation rules, and instant manager alerts for incoming reviews.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          size="sm"
          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </Button>
      </div>

      {/* Rules List */}
      {loading ? (
        <Card className="p-12 glass-card text-center flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-[var(--brass)] animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">Loading automation rules...</p>
        </Card>
      ) : rules.length === 0 ? (
        <Card className="p-12 glass-card text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[var(--brass)]/10 flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-[var(--brass)]" />
          </div>
          <h4 className="font-display font-semibold text-base mb-1">No Automation Rules Configured</h4>
          <p className="text-xs text-muted-foreground max-w-sm mb-6">
            Create automated triggers to automatically flag negative sentiment reviews and dispatch alerts to your team.
          </p>
          <Button
            onClick={openCreateModal}
            className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create First Rule
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className={`p-5 glass-card transition-all ${
                rule.isEnabled ? 'hover:border-[var(--brass)]/40' : 'opacity-70 bg-card/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="font-semibold text-sm text-foreground">{rule.name}</h4>
                    <Badge variant="outline" className={getSeverityBadgeClass(rule.minSeverity)}>
                      {rule.minSeverity} Priority
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-accent/40">
                      {rule.triggerType}
                    </Badge>
                    {rule.sources !== 'ALL' && (
                      <Badge variant="outline" className="text-[10px] bg-accent/30 text-muted-foreground">
                        {rule.sources}
                      </Badge>
                    )}
                  </div>

                  {rule.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{rule.description}</p>
                  )}

                  {/* Conditions summary */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
                    <span className="flex items-center gap-1">
                      <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
                      Stars: <strong>{rule.minRating ?? 1}–{rule.maxRating ?? 5}★</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                      Sentiment: <strong>{rule.sentimentThreshold}</strong>
                    </span>
                    {rule.actionConfig?.notifyEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        Alert: <strong className="truncate max-w-[150px]">{rule.actionConfig.notifyEmail}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions & Toggle */}
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="flex items-center gap-2 pr-2 border-r border-border/50">
                    <span className="text-xs text-muted-foreground">
                      {rule.isEnabled ? 'Active' : 'Paused'}
                    </span>
                    <Switch
                      checked={rule.isEnabled}
                      disabled={togglingRuleId === rule.id}
                      onCheckedChange={() => handleToggleEnable(rule)}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditModal(rule)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Edit Rule"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingRuleId === rule.id}
                    onClick={() => handleDeleteRule(rule.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete Rule"
                  >
                    {deletingRuleId === rule.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Execution Footer Stats */}
              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>Escalations: <strong>{rule.escalationCount}</strong></span>
                  <span>Executions: <strong>{rule.executionCount}</strong></span>
                </div>
                <div>
                  {rule.lastTriggeredAt ? (
                    <span>Last triggered: {new Date(rule.lastTriggeredAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Never triggered</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Rule Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl glass-card p-6 max-h-[90vh] overflow-y-auto space-y-5 border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--brass)]" />
                {editingRuleId ? 'Edit Automation Rule' : 'New Automation Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              <div>
                <Label htmlFor="rule-name" className="text-xs">Rule Name *</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Critical 1-Star Review Alert"
                  className="mt-1 text-xs glass-card"
                  required
                />
              </div>

              <div>
                <Label htmlFor="rule-desc" className="text-xs">Description</Label>
                <Input
                  id="rule-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Instantly alerts team for negative feedback"
                  className="mt-1 text-xs glass-card"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-rating" className="text-xs">Min Star Rating</Label>
                  <select
                    id="min-rating"
                    value={form.minRating}
                    onChange={(e) => setForm({ ...form, minRating: Number(e.target.value) })}
                    className="w-full mt-1 bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--brass)]"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="max-rating" className="text-xs">Max Star Rating</Label>
                  <select
                    id="max-rating"
                    value={form.maxRating}
                    onChange={(e) => setForm({ ...form, maxRating: Number(e.target.value) })}
                    className="w-full mt-1 bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--brass)]"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sentiment-threshold" className="text-xs">Sentiment Filter</Label>
                  <select
                    id="sentiment-threshold"
                    value={form.sentimentThreshold}
                    onChange={(e) => setForm({ ...form, sentimentThreshold: e.target.value as any })}
                    className="w-full mt-1 bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--brass)]"
                  >
                    <option value="ANY">Any Sentiment</option>
                    <option value="NEGATIVE">Negative Only</option>
                    <option value="NEUTRAL">Neutral Only</option>
                    <option value="POSITIVE">Positive Only</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="min-severity" className="text-xs">Escalation Severity</Label>
                  <select
                    id="min-severity"
                    value={form.minSeverity}
                    onChange={(e) => setForm({ ...form, minSeverity: e.target.value as any })}
                    className="w-full mt-1 bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--brass)]"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="action-type" className="text-xs">Automation Action</Label>
                <select
                  id="action-type"
                  value={form.actionType}
                  onChange={(e) => setForm({ ...form, actionType: e.target.value as any })}
                  className="w-full mt-1 bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-[var(--brass)]"
                >
                  <option value="ESCALATE_AND_NOTIFY">Create Escalation & Send Email Alert</option>
                  <option value="CREATE_ESCALATION">Create Internal Escalation Only</option>
                  <option value="DISPATCH_NOTIFICATION">Send Email Alert Only</option>
                </select>
              </div>

              {(form.actionType === 'DISPATCH_NOTIFICATION' || form.actionType === 'ESCALATE_AND_NOTIFY') && (
                <div>
                  <Label htmlFor="notify-email" className="text-xs">Notification Recipient Email *</Label>
                  <Input
                    id="notify-email"
                    type="email"
                    value={form.notifyEmail}
                    onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })}
                    placeholder="manager@yourbusiness.com"
                    className="mt-1 text-xs glass-card"
                    required
                  />
                </div>
              )}

              <div>
                <Label htmlFor="custom-note" className="text-xs">Internal Instruction Note (Optional)</Label>
                <Input
                  id="custom-note"
                  value={form.customNote}
                  onChange={(e) => setForm({ ...form, customNote: e.target.value })}
                  placeholder="e.g. Call customer within 2 hours"
                  className="mt-1 text-xs glass-card"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  {editingRuleId ? 'Save Changes' : 'Create Rule'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

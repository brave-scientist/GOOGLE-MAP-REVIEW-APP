'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Check,
  Loader2,
  Sliders,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveBusiness } from '@/lib/business-context'

interface PresetItem {
  id: string
  name: string
  description?: string | null
  tone: string
  responseLength: 'CONCISE' | 'BALANCED' | 'DETAILED'
  customInstructions?: string | null
  signature?: string | null
  isDefault?: boolean
  isCustom: boolean
  businessId?: string
}

export function AiPresetsTab() {
  const { activeBusinessId } = useActiveBusiness()
  const [systemPresets, setSystemPresets] = useState<PresetItem[]>([])
  const [customPresets, setCustomPresets] = useState<PresetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDefaultId, setActiveDefaultId] = useState<string | null>(null)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<PresetItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTone, setFormTone] = useState('')
  const [formLength, setFormLength] = useState<'CONCISE' | 'BALANCED' | 'DETAILED'>('BALANCED')
  const [formInstructions, setFormInstructions] = useState('')
  const [formSignature, setFormSignature] = useState('')
  const [formIsDefault, setFormIsDefault] = useState(false)

  const fetchPresets = useCallback(async () => {
    if (!activeBusinessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai-presets?businessId=${activeBusinessId}`)
      if (res.ok) {
        const data = await res.json()
        setSystemPresets((data.systemPresets || []).map((p: any) => ({ ...p, isCustom: false })))
        const customs = (data.customPresets || []).map((p: any) => ({ ...p, isCustom: true }))
        setCustomPresets(customs)

        const defaultCustom = customs.find((p: any) => p.isDefault)
        if (defaultCustom) {
          setActiveDefaultId(defaultCustom.id)
        } else {
          setActiveDefaultId('sys_preset_professional_warm')
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeBusinessId])

  useEffect(() => {
    let ignore = false
    async function load() {
      if (!activeBusinessId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/ai-presets?businessId=${activeBusinessId}`)
        if (res.ok && !ignore) {
          const data = await res.json()
          setSystemPresets((data.systemPresets || []).map((p: any) => ({ ...p, isCustom: false })))
          const customs = (data.customPresets || []).map((p: any) => ({ ...p, isCustom: true }))
          setCustomPresets(customs)

          const defaultCustom = customs.find((p: any) => p.isDefault)
          if (defaultCustom) {
            setActiveDefaultId(defaultCustom.id)
          } else {
            setActiveDefaultId('sys_preset_professional_warm')
          }
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
  }, [activeBusinessId])

  const openCreateModal = () => {
    setEditingPreset(null)
    setFormName('')
    setFormDescription('')
    setFormTone('Warm, authentic, and polite with an upbeat boutique tone.')
    setFormLength('BALANCED')
    setFormInstructions('Mention our dedication to quality and invite the customer back for a seasonal special.')
    setFormSignature('')
    setFormIsDefault(false)
    setIsModalOpen(true)
  }

  const openEditModal = (preset: PresetItem) => {
    setEditingPreset(preset)
    setFormName(preset.name)
    setFormDescription(preset.description || '')
    setFormTone(preset.tone)
    setFormLength(preset.responseLength || 'BALANCED')
    setFormInstructions(preset.customInstructions || '')
    setFormSignature(preset.signature || '')
    setFormIsDefault(Boolean(preset.isDefault))
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!activeBusinessId) {
      toast.error('No active business selected')
      return
    }
    if (!formName.trim()) {
      toast.error('Preset name is required')
      return
    }
    if (!formTone.trim()) {
      toast.error('Tone directive is required')
      return
    }

    setSaving(true)
    try {
      const url = editingPreset ? `/api/ai-presets/${editingPreset.id}` : '/api/ai-presets'
      const method = editingPreset ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: activeBusinessId,
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          tone: formTone.trim(),
          responseLength: formLength,
          customInstructions: formInstructions.trim() || undefined,
          signature: formSignature.trim() || undefined,
          isDefault: formIsDefault,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(editingPreset ? 'Preset updated' : 'Custom preset created')
        setIsModalOpen(false)
        fetchPresets()
      } else {
        toast.error(data.error || 'Failed to save preset')
      }
    } catch {
      toast.error('Network error saving preset')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete preset "${name}"?`)) return
    try {
      const res = await fetch(`/api/ai-presets/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Preset deleted')
        fetchPresets()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete preset')
      }
    } catch {
      toast.error('Network error deleting preset')
    }
  }

  const handleSetDefault = async (presetId: string) => {
    if (!activeBusinessId) return
    try {
      const res = await fetch(`/api/ai-presets/${presetId}/set-default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: activeBusinessId }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || 'Default preset updated')
        fetchPresets()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to set default')
      }
    } catch {
      toast.error('Network error setting default')
    }
  }

  const getLengthBadge = (len: string) => {
    switch (len) {
      case 'CONCISE':
        return <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/30">Concise (1-2 Sentences)</Badge>
      case 'DETAILED':
        return <Badge variant="outline" className="text-[10px] text-purple-600 dark:text-purple-400 border-purple-500/30">Detailed (4-6 Sentences)</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Balanced (2-4 Sentences)</Badge>
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--brass)]" />
            AI Reply Presets & Fine-Tuning
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure specialized response personas, tone styles, length constraints, and custom instructions for automated LLM drafts.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-8 text-xs self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Custom Preset
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(n => (
            <Card key={n} className="p-5 glass-card animate-pulse space-y-3">
              <div className="h-4 bg-muted/40 rounded w-1/3" />
              <div className="h-12 bg-muted/20 rounded" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Custom Presets Section */}
          {customPresets.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your Custom Presets ({customPresets.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customPresets.map(preset => {
                  const isCurrentDefault = preset.id === activeDefaultId || preset.isDefault
                  return (
                    <Card key={preset.id} className={`p-4 glass-card flex flex-col justify-between transition-all ${isCurrentDefault ? 'border-[var(--brass)] ring-1 ring-[var(--brass)]/30' : 'hover:border-border/80'}`}>
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="font-semibold text-sm">{preset.name}</h5>
                              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[9px]">Custom</Badge>
                              {isCurrentDefault && (
                                <Badge className="bg-[var(--brass)] text-white text-[9px] px-1.5 py-0">
                                  Active Default
                                </Badge>
                              )}
                            </div>
                            {preset.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditModal(preset)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                              onClick={() => handleDelete(preset.id, preset.name)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="p-2.5 rounded bg-accent/20 border border-border/40 text-xs space-y-1.5">
                          <p><strong className="text-foreground/70">Tone:</strong> {preset.tone}</p>
                          {preset.customInstructions && (
                            <p><strong className="text-foreground/70">Rules:</strong> {preset.customInstructions}</p>
                          )}
                          {preset.signature && (
                            <p><strong className="text-foreground/70">Signature:</strong> <code className="text-[11px]">{preset.signature}</code></p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between">
                        {getLengthBadge(preset.responseLength)}
                        {!isCurrentDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetDefault(preset.id)}
                            className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            Set as Default
                          </Button>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* System Presets Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Standard Curated Presets ({systemPresets.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemPresets.map(preset => {
                const isCurrentDefault = preset.id === activeDefaultId
                return (
                  <Card key={preset.id} className={`p-4 glass-card flex flex-col justify-between transition-all ${isCurrentDefault ? 'border-[var(--brass)] ring-1 ring-[var(--brass)]/30' : 'hover:border-border/80'}`}>
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-semibold text-sm">{preset.name}</h5>
                            <Badge variant="secondary" className="text-[9px]">Standard</Badge>
                            {isCurrentDefault && (
                              <Badge className="bg-[var(--brass)] text-white text-[9px] px-1.5 py-0">
                                Active Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded bg-accent/20 border border-border/40 text-xs space-y-1">
                        <p><strong className="text-foreground/70">Tone:</strong> {preset.tone}</p>
                        <p><strong className="text-foreground/70">Instructions:</strong> {preset.customInstructions}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between">
                      {getLengthBadge(preset.responseLength)}
                      {!isCurrentDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(preset.id)}
                          className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          Set as Default
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Custom Preset Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingPreset ? 'Edit Fine-Tuning Preset' : 'Create Custom AI Preset'}</DialogTitle>
            <DialogDescription>
              Fine-tune the voice and personality of the AI draft generation engine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g. Modern Boutique & Playful"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="preset-desc">Short Description</Label>
              <Input
                id="preset-desc"
                placeholder="e.g. Energetic and casual tone for our summer pop-up"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="preset-tone">Tone & Personality Directive</Label>
                <Input
                  id="preset-tone"
                  placeholder="e.g. Upbeat, witty, warm and friendly"
                  value={formTone}
                  onChange={e => setFormTone(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="preset-length">Response Length</Label>
                <select
                  id="preset-length"
                  value={formLength}
                  onChange={e => setFormLength(e.target.value as any)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
                >
                  <option value="CONCISE">Concise (1-2 Sentences, max 35 words)</option>
                  <option value="BALANCED">Balanced (2-4 Sentences, max 60 words)</option>
                  <option value="DETAILED">Detailed (4-6 Sentences, max 100 words)</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="preset-instructions">Special Instructions / Rules for LLM</Label>
              <textarea
                id="preset-instructions"
                rows={3}
                placeholder="e.g. Always mention our upcoming Friday jazz nights when thanking 5-star reviewers."
                value={formInstructions}
                onChange={e => setFormInstructions(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
              />
            </div>

            <div>
              <Label htmlFor="preset-signature">Custom Sign-off (Optional)</Label>
              <Input
                id="preset-signature"
                placeholder="e.g. — Warmly, Chef Marco & Team"
                value={formSignature}
                onChange={e => setFormSignature(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="preset-default"
                checked={formIsDefault}
                onChange={e => setFormIsDefault(e.target.checked)}
                className="rounded border-input text-[var(--brass)] focus:ring-[var(--brass)]"
              />
              <Label htmlFor="preset-default" className="text-xs cursor-pointer">
                Set as active default preset for this business
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)} disabled={saving} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
              {saving ? 'Saving...' : 'Save Preset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

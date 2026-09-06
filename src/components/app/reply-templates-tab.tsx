'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Search,
  Check,
  Loader2,
  Star,
  ShieldAlert,
  HelpCircle,
  Eye,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveBusiness } from '@/lib/business-context'
import { AVAILABLE_TOKENS, hydrateTemplate } from '@/lib/templates/token-engine'

interface ReplyTemplateItem {
  id: string
  businessId: string
  title: string
  body: string
  category: string | null
  language: string
  usageCount: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export function ReplyTemplatesTab() {
  const { activeBusinessId, activeBusiness } = useActiveBusiness()
  const [templates, setTemplates] = useState<ReplyTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ReplyTemplateItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formCategory, setFormCategory] = useState<string>('POSITIVE')
  const [formLanguage, setFormLanguage] = useState('en')
  const [formIsDefault, setFormIsDefault] = useState(false)

  // Preview / Test state
  const [showPreview, setShowPreview] = useState(true)

  const fetchTemplates = useCallback(async () => {
    if (!activeBusinessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/templates?businessId=${activeBusinessId}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
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
        const res = await fetch(`/api/templates?businessId=${activeBusinessId}`)
        if (res.ok && !ignore) {
          const data = await res.json()
          setTemplates(data.templates || [])
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
    setEditingTemplate(null)
    setFormTitle('')
    setFormBody('Hi {{first_name}}, thank you so much for your {{rating}}-star review! We are delighted to serve you at {{business_name}} and look forward to welcoming you back soon.')
    setFormCategory('POSITIVE')
    setFormLanguage('en')
    setFormIsDefault(false)
    setIsModalOpen(true)
  }

  const openEditModal = (t: ReplyTemplateItem) => {
    setEditingTemplate(t)
    setFormTitle(t.title)
    setFormBody(t.body)
    setFormCategory(t.category || 'POSITIVE')
    setFormLanguage(t.language || 'en')
    setFormIsDefault(t.isDefault)
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!activeBusinessId) {
      toast.error('No active business selected')
      return
    }
    if (!formTitle.trim()) {
      toast.error('Template title is required')
      return
    }
    if (!formBody.trim()) {
      toast.error('Template body is required')
      return
    }

    setSaving(true)
    try {
      const url = editingTemplate ? `/api/templates/${editingTemplate.id}` : '/api/templates'
      const method = editingTemplate ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: activeBusinessId,
          title: formTitle.trim(),
          body: formBody.trim(),
          category: formCategory,
          language: formLanguage,
          isDefault: formIsDefault,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(editingTemplate ? 'Template updated' : 'Template created')
        setIsModalOpen(false)
        fetchTemplates()
      } else {
        toast.error(data.error || 'Failed to save template')
      }
    } catch {
      toast.error('Network error saving template')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Template deleted')
        setTemplates(prev => prev.filter(t => t.id !== id))
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete template')
      }
    } catch {
      toast.error('Network error deleting template')
    }
  }

  const insertToken = (token: string) => {
    setFormBody(prev => {
      if (prev.endsWith(' ') || prev.length === 0) {
        return prev + token + ' '
      }
      return prev + ' ' + token + ' '
    })
  }

  // Live hydrated preview
  const livePreview = useMemo(() => {
    return hydrateTemplate(formBody, {
      author: 'Sarah Jenkins',
      firstName: 'Sarah',
      businessName: activeBusiness?.name || 'Apex Business Solutions',
      businessPhone: activeBusiness?.phone || '+1 (555) 234-5678',
      businessAddress: activeBusiness?.address || '123 Market St, Suite 400',
      rating: formCategory === 'POSITIVE' ? 5 : formCategory === 'NEGATIVE' ? 1 : 3,
      platform: 'Google',
      managerName: 'Management',
      contactEmail: 'support@business.com',
    })
  }, [formBody, formCategory, activeBusiness])

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory
      const matchesSearch = !searchQuery.trim() ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.body.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [templates, selectedCategory, searchQuery])

  const getCategoryBadge = (cat: string | null) => {
    switch (cat) {
      case 'POSITIVE':
        return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Positive (4-5★)</Badge>
      case 'NEUTRAL':
        return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">Neutral (3★)</Badge>
      case 'NEGATIVE':
        return <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px]">Negative (1-2★)</Badge>
      case 'ESCALATION':
        return <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px]">Escalation</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">General</Badge>
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--brass)]" />
            AI Reply Templates
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pre-composed responses with dynamic token variables for 1-click review replies and AI prompt steering.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-8 text-xs self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Template
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-3 glass-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'ESCALATION'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--brass)] text-white'
                  : 'bg-accent/40 text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {cat === 'ALL' ? 'All Templates' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs glass-card"
          />
        </div>
      </Card>

      {/* Templates Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(n => (
            <Card key={n} className="p-5 glass-card animate-pulse space-y-3">
              <div className="h-4 bg-muted/40 rounded w-1/3" />
              <div className="h-16 bg-muted/20 rounded" />
              <div className="h-3 bg-muted/30 rounded w-1/4" />
            </Card>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="p-8 text-center glass-card border-dashed">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h4 className="font-semibold text-sm mb-1">No templates found</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            {searchQuery || selectedCategory !== 'ALL'
              ? 'No templates match your active filters. Try adjusting your search query.'
              : 'Create your first reply template with dynamic customer and business tokens.'}
          </p>
          <Button onClick={openCreateModal} size="sm" variant="outline" className="text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Template
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map(template => (
            <Card key={template.id} className="p-4 glass-card flex flex-col justify-between hover:border-[var(--brass)]/40 transition-colors">
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{template.title}</h4>
                      {template.isDefault && (
                        <Badge className="bg-[var(--brass)]/15 text-[var(--brass-dark)] dark:text-[var(--brass-light)] border-[var(--brass)]/30 text-[9px] px-1.5 py-0">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {getCategoryBadge(template.category)}
                      <span className="text-[10px] text-muted-foreground">
                        Used {template.usageCount} {template.usageCount === 1 ? 'time' : 'times'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditModal(template)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                      onClick={() => handleDelete(template.id, template.title)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-foreground/80 line-clamp-3 bg-accent/20 p-2.5 rounded border border-border/40 font-mono">
                  {template.body}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Updated {new Date(template.updatedAt || template.createdAt).toLocaleDateString()}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider">{template.language}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Reply Template' : 'Create Reply Template'}</DialogTitle>
            <DialogDescription>
              Use variables like <code className="bg-accent px-1 py-0.5 rounded text-[11px]">{'{{first_name}}'}</code> to automatically insert customer or business info.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template-title">Template Title</Label>
                <Input
                  id="template-title"
                  placeholder="e.g. 5-Star Enthusiastic Thanks"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="template-category">Review Scenario / Category</Label>
                <select
                  id="template-category"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
                >
                  <option value="POSITIVE">Positive (4-5 Stars)</option>
                  <option value="NEUTRAL">Neutral (3 Stars)</option>
                  <option value="NEGATIVE">Negative (1-2 Stars)</option>
                  <option value="ESCALATION">Escalation (Legal/Urgent)</option>
                </select>
              </div>
            </div>

            {/* Token Inserter Chips */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">Dynamic Token Chips (Click to insert)</Label>
                <span className="text-[10px] text-muted-foreground">Auto-hydrated per review</span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-accent/30 border border-border/40">
                {AVAILABLE_TOKENS.map(item => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => insertToken(item.token)}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-background hover:bg-[var(--brass)] hover:text-white border border-border/60 text-[11px] font-mono transition-colors"
                    title={`Inserts ${item.label} (e.g. ${item.example})`}
                  >
                    + {item.token}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Body */}
            <div>
              <Label htmlFor="template-body">Template Message Body</Label>
              <textarea
                id="template-body"
                rows={4}
                placeholder="Write your template text with dynamic tokens..."
                value={formBody}
                onChange={e => setFormBody(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30"
              />
            </div>

            {/* Default toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-default"
                checked={formIsDefault}
                onChange={e => setFormIsDefault(e.target.checked)}
                className="rounded border-input text-[var(--brass)] focus:ring-[var(--brass)]"
              />
              <Label htmlFor="is-default" className="text-xs cursor-pointer">
                Set as default template for {formCategory.toLowerCase()} reviews
              </Label>
            </div>

            {/* Live Hydration Preview */}
            <div className="mt-3 p-3 rounded-lg bg-[var(--brass)]/5 border border-[var(--brass)]/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--brass-dark)] dark:text-[var(--brass-light)] flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Live Customer Hydration Preview
                </span>
                <span className="text-[10px] text-muted-foreground">Sample 5★ Google Review</span>
              </div>
              <p className="text-xs text-foreground/90 italic leading-relaxed">
                &ldquo;{livePreview}&rdquo;
              </p>
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
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

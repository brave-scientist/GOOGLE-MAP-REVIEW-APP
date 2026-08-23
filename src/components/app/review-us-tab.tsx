'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Star, ExternalLink, Search, Loader2, Check, Plus, Trash2, QrCode, Copy, ChevronDown, ChevronUp, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  REVIEW_PLATFORMS,
  PLATFORM_MAP,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  generateBusinessSlug,
  type PlatformCategory,
} from '@/lib/review-platforms'
import QRCodeLib from 'qrcode'

interface SavedLink {
  id?: string
  platformId?: string | null
  customName?: string | null
  customIconUrl?: string | null
  url: string
  enabled: boolean
  sortOrder: number
}

interface ReviewUsTabProps {
  businessId: string
}

export function ReviewUsTab({ businessId }: ReviewUsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slug, setSlug] = useState('')
  const [links, setLinks] = useState<SavedLink[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<PlatformCategory | null>('general')
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [reviewUsUrl, setReviewUsUrl] = useState<string | null>(null)

  // Fetch existing links + slug on mount
  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/review-links?businessId=${businessId}`)
      if (!res.ok) return
      const data = await res.json()
      setSlug(data.slug || generateBusinessSlug(data.businessName || ''))
      setLinks(data.links || [])
      if (data.slug) {
        setReviewUsUrl(`${window.location.origin}/review-us/${data.slug}`)
      }
    } catch {
      // ignore — user will see empty state
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  // Check if a platform is already enabled
  const isPlatformEnabled = (platformId: string) =>
    links.some(l => l.platformId === platformId && l.enabled)

  // Toggle a platform on/off
  const togglePlatform = (platform: { id: string; name: string }) => {
    const existing = links.find(l => l.platformId === platform.id)
    if (existing) {
      // Toggle enabled state
      setLinks(prev => prev.map(l =>
        l.platformId === platform.id ? { ...l, enabled: !l.enabled } : l
      ))
    } else {
      // Add new — URL starts empty, user must fill it in
      setLinks(prev => [...prev, {
        platformId: platform.id,
        url: '',
        enabled: true,
        sortOrder: prev.length,
      }])
      toast.success(`${platform.name} added`, { description: 'Paste your review URL below.' })
    }
  }

  // Update the URL for a platform link
  const updateLinkUrl = (platformId: string, url: string) => {
    setLinks(prev => prev.map(l =>
      l.platformId === platformId ? { ...l, url } : l
    ))
  }

  // Update the URL for a custom link (by index, since they have no platformId)
  const updateCustomLinkUrl = (index: number, url: string) => {
    setLinks(prev => prev.map((l, i) => i === index ? { ...l, url } : l))
  }

  const updateCustomLinkName = (index: number, name: string) => {
    setLinks(prev => prev.map((l, i) => i === index ? { ...l, customName: name } : l))
  }

  // Remove a link entirely
  const removeLink = (platformId: string | null, index: number) => {
    setLinks(prev => prev.filter((l, i) => {
      if (platformId) return l.platformId !== platformId
      return i !== index
    }))
  }

  // Move a link up/down (reorder)
  const moveLink = (index: number, direction: 'up' | 'down') => {
    setLinks(prev => {
      const next = [...prev]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((l, i) => ({ ...l, sortOrder: i }))
    })
  }

  // Add a custom platform
  const addCustomPlatform = () => {
    if (!customName.trim() || !customUrl.trim()) {
      toast.error('Name and URL are both required')
      return
    }
    try {
      const parsed = new URL(customUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        toast.error('URL must start with http:// or https://')
        return
      }
    } catch {
      toast.error('Invalid URL — must include http:// or https://')
      return
    }
    setLinks(prev => [...prev, {
      platformId: null,
      customName: customName.trim(),
      customIconUrl: null,
      url: customUrl.trim(),
      enabled: true,
      sortOrder: prev.length,
    }])
    setCustomName('')
    setCustomUrl('')
    toast.success('Custom platform added')
  }

  // Save all changes
  const save = async () => {
    setSaving(true)
    try {
      // Validate that enabled links all have URLs
      const enabledWithoutUrl = links.filter(l => l.enabled && !l.url.trim())
      if (enabledWithoutUrl.length > 0) {
        toast.error('Some enabled platforms are missing their review URL', {
          description: 'Either paste the URL or disable the platform.',
        })
        setSaving(false)
        return
      }

      const res = await fetch('/api/review-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          slug,
          links: links.map((l, i) => ({
            platformId: l.platformId || null,
            customName: l.customName || null,
            customIconUrl: l.customIconUrl || null,
            url: l.url,
            enabled: l.enabled,
            sortOrder: i,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Review Us page saved!')
        if (data.reviewUsUrl) {
          setReviewUsUrl(`${window.location.origin}${data.reviewUsUrl}`)
        }
      } else {
        toast.error(data.error || 'Failed to save')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  // Generate QR code pointing to the Review Us page
  const generateQr = async () => {
    if (!reviewUsUrl) {
      toast.error('Save your settings first to generate a QR code')
      return
    }
    setQrLoading(true)
    try {
      const dataUrl = await QRCodeLib.toDataURL(reviewUsUrl, {
        width: 512,
        margin: 2,
        color: { dark: '#1F1E1C', light: '#FFFFFF' },
      })
      setQrDataUrl(dataUrl)
      toast.success('QR code generated!')
    } catch (err) {
      toast.error('Failed to generate QR code')
    } finally {
      setQrLoading(false)
    }
  }

  const downloadQr = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `review-us-${slug || businessId}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const copyUrl = () => {
    if (!reviewUsUrl) return
    navigator.clipboard.writeText(reviewUsUrl)
    toast.success('Link copied!')
  }

  // Filter catalog by search
  const filteredPlatforms = REVIEW_PLATFORMS.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group by category
  const platformsByCategory = CATEGORY_ORDER.map(cat => ({
    category: cat,
    platforms: filteredPlatforms.filter(p => p.category === cat),
  })).filter(g => g.platforms.length > 0)

  // Custom links (platformId is null)
  const customLinks = links.filter(l => !l.platformId)
  // Catalog links (platformId is set)
  const catalogLinks = links.filter(l => l.platformId)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <Card className="p-5 glass-card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-[var(--brass)]" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold mb-1">Review Us Page</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A public page where your customers pick a platform and get sent straight to that platform's review-submission page.
              No API access needed — you just paste your review URL for each platform you want to offer.
            </p>
          </div>
        </div>
      </Card>

      {/* Page URL + QR */}
      <Card className="p-5 glass-card">
        <h4 className="text-sm font-medium mb-3">Your public Review Us page</h4>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Page URL</Label>
            <div className="flex gap-2 mt-1.5">
              <div className="flex-1 flex items-center gap-1 px-3 py-2 rounded-md glass-card text-xs font-mono text-muted-foreground">
                <span className="truncate">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/review-us/
                </span>
                <Input
                  value={slug}
                  onChange={e => setSlug(generateBusinessSlug(e.target.value))}
                  className="h-5 border-0 p-0 bg-transparent font-mono text-xs flex-1 focus-visible:ring-0"
                  placeholder="your-business"
                />
              </div>
              {reviewUsUrl && (
                <>
                  <Button variant="outline" size="sm" onClick={copyUrl} className="h-9">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(reviewUsUrl, '_blank')} className="h-9">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              This is the link you share with customers or print on a QR code.
              Save your settings first to activate the URL.
            </p>
          </div>

          {reviewUsUrl && (
            <div className="pt-3 border-t border-border/30">
              <Button variant="outline" size="sm" onClick={generateQr} disabled={qrLoading}>
                {qrLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1.5" />}
                Generate QR code
              </Button>
              {qrDataUrl && (
                <div className="mt-3 flex items-start gap-4">
                  <img src={qrDataUrl} alt="QR code" className="w-32 h-32 rounded-lg border border-border/30" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 max-w-xs">
                      Print this QR code and place it where customers can scan it — on a receipt, a table tent, a poster, or a business card.
                      It points to your Review Us page.
                    </p>
                    <Button variant="outline" size="sm" onClick={downloadQr}>
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Download PNG
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Currently configured platforms */}
      <Card className="p-5 glass-card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium">Enabled platforms ({links.filter(l => l.enabled).length})</h4>
          <Button size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Save changes
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Loading…
          </div>
        ) : links.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">No platforms configured yet</p>
            <p className="text-xs text-muted-foreground">Pick platforms from the catalog below to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Catalog links */}
            {catalogLinks.map((link) => {
              const platform = link.platformId ? PLATFORM_MAP[link.platformId] : null
              if (!platform) return null
              const index = links.indexOf(link)
              return (
                <div key={link.platformId} className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border transition-all',
                  link.enabled
                    ? 'border-[var(--brass)]/30 bg-[var(--brass)]/5'
                    : 'border-border/40 opacity-60',
                )}>
                  <PlatformIcon platform={platform} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{platform.name}</div>
                    <Input
                      value={link.url}
                      onChange={e => updateLinkUrl(link.platformId!, e.target.value)}
                      placeholder={platform.urlHint}
                      className="h-7 mt-1 text-[11px] glass-card font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveLink(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveLink(index, 'down')}
                      disabled={index === links.length - 1}
                      className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => togglePlatform(platform)}
                      className={cn(
                        'p-1.5 rounded text-[10px] font-medium transition-colors',
                        link.enabled
                          ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                          : 'bg-muted text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {link.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => removeLink(link.platformId ?? null, index)}
                      className="p-1 rounded hover:bg-red-500/10 text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Custom links */}
            {customLinks.map((link) => {
              const index = links.indexOf(link)
              return (
                <div key={`custom-${index}`} className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border transition-all',
                  link.enabled
                    ? 'border-[var(--brass)]/30 bg-[var(--brass)]/5'
                    : 'border-border/40 opacity-60',
                )}>
                  <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(link.customName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input
                      value={link.customName || ''}
                      onChange={e => updateCustomLinkName(index, e.target.value)}
                      placeholder="Platform name"
                      className="h-6 text-xs font-medium glass-card"
                    />
                    <Input
                      value={link.url}
                      onChange={e => updateCustomLinkUrl(index, e.target.value)}
                      placeholder="https://"
                      className="h-7 mt-1 text-[11px] glass-card font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveLink(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveLink(index, 'down')}
                      disabled={index === links.length - 1}
                      className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeLink(null, index)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Platform catalog */}
      <Card className="p-5 glass-card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium">Add a platform</h4>
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search platforms…"
              className="h-8 pl-7 text-xs glass-card"
            />
          </div>
        </div>

        {platformsByCategory.map(({ category, platforms }) => (
          <div key={category} className="mb-4">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              {expandedCategory === category ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {CATEGORY_LABELS[category]} ({platforms.length})
            </button>
            {expandedCategory === category && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {platforms.map(platform => {
                  const enabled = isPlatformEnabled(platform.id)
                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform)}
                      className={cn(
                        'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all',
                        enabled
                          ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                          : 'border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30',
                      )}
                    >
                      <PlatformIcon platform={platform} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{platform.name}</div>
                        {enabled && <div className="text-[9px] text-green-600 font-medium">Added</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Custom platform adder */}
        <div className="mt-4 pt-4 border-t border-border/30">
          <h5 className="text-xs font-medium mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add a custom platform
          </h5>
          <p className="text-[10px] text-muted-foreground mb-2">
            Don't see your platform? Add it — just paste the name and the review URL.
          </p>
          <div className="flex gap-2">
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Platform name"
              className="h-8 text-xs glass-card flex-1"
            />
            <Input
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="https://review-url.com/your-business"
              className="h-8 text-xs glass-card flex-1 font-mono"
            />
            <Button size="sm" variant="outline" onClick={addCustomPlatform} className="h-8">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </Card>

      {/* Honest disclaimer */}
      <div className="flex items-start gap-2 text-[10px] text-muted-foreground px-1">
        <Star className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--brass)]" />
        <p>
          This feature sends customers <strong>to</strong> review platforms — it does not sync or display reviews from them.
          Each platform you enable just stores a URL. No "connected" or "syncing" status is shown to your customers
          because none of these platforms have API access from this app.
        </p>
      </div>
    </div>
  )
}

// Helper component for platform icons — handles fallback for platforms without an iconUrl
function PlatformIcon({ platform, size = 32 }: { platform: { name: string; iconUrl: string }, size?: number }) {
  const [imgError, setImgError] = useState(false)

  if (!platform.iconUrl || imgError) {
    // Letter-avatar fallback
    return (
      <div
        className="rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {platform.name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={platform.iconUrl}
      alt={platform.name}
      width={size}
      height={size}
      onError={() => setImgError(true)}
      className="rounded-md flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

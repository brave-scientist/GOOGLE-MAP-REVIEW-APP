'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Star, ExternalLink, Search, Loader2, Check, Plus, Trash2, QrCode, Copy,
  ChevronDown, ChevronUp, ChevronRight, Printer, Sparkles, Sliders, MessageSquareHeart,
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
import { PrintableQrKitModal } from '@/components/app/printable-qr-kit-modal'

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
  const [businessName, setBusinessName] = useState('')
  const [reviewPageTitle, setReviewPageTitle] = useState('')
  const [reviewPageSubtitle, setReviewPageSubtitle] = useState('')
  const [reviewPagePrivateFeedbackEnabled, setReviewPagePrivateFeedbackEnabled] = useState(true)
  const [links, setLinks] = useState<SavedLink[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<PlatformCategory | null>('general')
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrTargetMode, setQrTargetMode] = useState<'hub' | 'direct'>('hub')
  const [showPrintKit, setShowPrintKit] = useState(false)
  const [reviewUsUrl, setReviewUsUrl] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    async function loadLinks() {
      try {
        const res = await fetch(`/api/review-links?businessId=${businessId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!ignore) {
          setSlug(data.slug || generateBusinessSlug(data.businessName || ''))
          setBusinessName(data.businessName || '')
          setReviewPageTitle(data.reviewPageTitle || '')
          setReviewPageSubtitle(data.reviewPageSubtitle || '')
          setReviewPagePrivateFeedbackEnabled(data.reviewPagePrivateFeedbackEnabled ?? true)
          setLinks(data.links || [])
          if (data.slug) {
            const url = `${window.location.origin}/review-us/${data.slug}`
            setReviewUsUrl(url)
            QRCodeLib.toDataURL(url, {
              width: 512,
              margin: 2,
              color: { dark: '#1F1E1C', light: '#FFFFFF' },
            }).then(qr => {
              if (!ignore) setQrDataUrl(qr)
            }).catch(() => {})
          }
        }
      } catch {
        // ignore — user will see empty state
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadLinks()
    return () => {
      ignore = true
    }
  }, [businessId])


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
          reviewPageTitle: reviewPageTitle.trim() || null,
          reviewPageSubtitle: reviewPageSubtitle.trim() || null,
          reviewPagePrivateFeedbackEnabled,
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
          const url = `${window.location.origin}${data.reviewUsUrl}`
          setReviewUsUrl(url)
          if (qrTargetMode === 'hub') {
            QRCodeLib.toDataURL(url, {
              width: 512,
              margin: 2,
              color: { dark: '#1F1E1C', light: '#FFFFFF' },
            }).then(setQrDataUrl).catch(() => {})
          }
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

  // Generate QR code pointing to either the Review Us hub or direct Google page
  const generateQr = async (targetMode: 'hub' | 'direct' = qrTargetMode) => {
    let target = reviewUsUrl
    if (targetMode === 'direct') {
      const googleLink = links.find(l => l.platformId === 'google' && l.enabled)?.url
      if (!googleLink) {
        toast.error('Google review link not configured', {
          description: 'Enable and add your Google review URL below before generating a direct QR code.',
        })
        return
      }
      target = googleLink
    }

    if (!target) {
      toast.error('Save your settings first to generate a QR code')
      return
    }
    setQrLoading(true)
    try {
      const dataUrl = await QRCodeLib.toDataURL(target, {
        width: 512,
        margin: 2,
        color: { dark: '#1F1E1C', light: '#FFFFFF' },
      })
      setQrDataUrl(dataUrl)
      toast.success(`QR code updated (${targetMode === 'direct' ? 'Direct Google' : 'Multi-Platform Hub'})!`)
    } catch {
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

  const enabledPlatforms = links.filter(l => l.enabled).map(l => {
    if (l.platformId && PLATFORM_MAP[l.platformId]) {
      return { name: PLATFORM_MAP[l.platformId].name, iconUrl: PLATFORM_MAP[l.platformId].iconUrl || null }
    }
    return { name: l.customName || 'Review Site', iconUrl: l.customIconUrl || null }
  })

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <Card className="p-5 glass-card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-[var(--brass)]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold mb-1">Review Us Page &amp; QR Acceleration</h3>
              <Button
                size="sm"
                className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                onClick={save}
                disabled={saving || loading}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Save Changes
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A customized public landing page where customers choose their favorite platform to leave a review, or send direct private feedback to your management team. Generate high-resolution tabletop and countertop QR kits with zero platform API lock-in.
            </p>
          </div>
        </div>
      </Card>

      {/* Page Customization & Private Feedback Triage */}
      <Card className="p-5 glass-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] flex items-center justify-center flex-shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold">Page Customization &amp; Private Feedback Triage</h4>
            <p className="text-xs text-muted-foreground">
              Personalize the welcoming headline, subtext, and enable private customer feedback triage.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Custom Headline</Label>
              <span className="text-[10px] text-muted-foreground">{reviewPageTitle.length}/120</span>
            </div>
            <Input
              value={reviewPageTitle}
              onChange={e => setReviewPageTitle(e.target.value.slice(0, 120))}
              placeholder="How was your experience?"
              className="mt-1 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave blank to default to &quot;How was your experience?&quot;.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Custom Subtitle / Message</Label>
              <span className="text-[10px] text-muted-foreground">{reviewPageSubtitle.length}/250</span>
            </div>
            <Textarea
              value={reviewPageSubtitle}
              onChange={e => setReviewPageSubtitle(e.target.value.slice(0, 250))}
              placeholder={`We'd love to hear from you. Pick a platform below to leave a review for ${businessName || 'our business'}.`}
              rows={2}
              className="mt-1 text-xs resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Shown directly under the headline on the public page.
            </p>
          </div>

          <div className="pt-3 border-t border-border/30">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                id="review-page-feedback-toggle"
                checked={reviewPagePrivateFeedbackEnabled}
                onChange={e => setReviewPagePrivateFeedbackEnabled(e.target.checked)}
                className="mt-0.5 rounded border-border/80 text-[var(--brass)] focus:ring-[var(--brass)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Enable Private Direct Feedback Triage
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    FTC Compliant
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Displays a direct message option for unhappy or concerned customers to reach management privately, reducing public negative reviews without suppressing or gating any review platform links.
                </p>
              </div>
            </label>
          </div>
        </div>
      </Card>

      {/* Page URL + QR Acceleration */}
      <Card className="p-5 glass-card">
        <h4 className="text-sm font-medium mb-3">Your Public Review Us Page &amp; QR Acceleration</h4>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Page URL Slug</Label>
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
                  <Button variant="outline" size="sm" onClick={copyUrl} className="h-9" title="Copy URL">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(reviewUsUrl, '_blank')} className="h-9" title="Preview Public Page">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              This is the destination link shared in campaigns or printed on tabletop signs.
            </p>
          </div>

          {/* QR Destination Target Selector */}
          <div className="pt-3 border-t border-border/30">
            <Label className="text-xs mb-2 block font-medium">QR Code Destination Mode</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setQrTargetMode('hub')
                  generateQr('hub')
                }}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  qrTargetMode === 'hub'
                    ? 'border-[var(--brass)] bg-[var(--brass)]/10 text-foreground'
                    : 'border-border/60 hover:border-border text-muted-foreground'
                )}
              >
                <div className="text-xs font-semibold">Multi-Platform Hub</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Points to /review-us/{slug || '...'} (Customer selects Google, Yelp, FB, etc.)
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQrTargetMode('direct')
                  generateQr('direct')
                }}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  qrTargetMode === 'direct'
                    ? 'border-[var(--brass)] bg-[var(--brass)]/10 text-foreground'
                    : 'border-border/60 hover:border-border text-muted-foreground'
                )}
              >
                <div className="text-xs font-semibold">Direct Primary Platform</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Points directly to your Google review URL for maximum 1-tap conversion
                </div>
              </button>
            </div>

            {reviewUsUrl && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-accent/20 border border-border/40">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    id="preview-qr-image"
                    className="w-28 h-28 rounded-lg bg-white p-1.5 shadow-sm border border-border/40 flex-shrink-0"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <div className="space-y-2 flex-1">
                  <div className="text-xs font-semibold">
                    {qrTargetMode === 'direct' ? 'Direct Platform QR Code' : 'Multi-Platform Hub QR Code'}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Place this QR on counter cards, dining table tents, window decals, or checkout receipts. Customers scan with their phone camera to instantly write a review.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={downloadQr} className="text-xs h-8">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Download PNG
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowPrintKit(true)}
                      className="text-xs h-8 bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5" />
                      Print Countertop Kit
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Printable Countertop Kit Modal */}
      <PrintableQrKitModal
        open={showPrintKit}
        onOpenChange={setShowPrintKit}
        businessName={businessName}
        qrDataUrl={qrDataUrl}
        targetUrl={qrTargetMode === 'direct' ? (links.find(l => l.platformId === 'google')?.url || reviewUsUrl) : reviewUsUrl}
        platforms={enabledPlatforms}
        headline={reviewPageTitle || 'How was your experience?'}
      />

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

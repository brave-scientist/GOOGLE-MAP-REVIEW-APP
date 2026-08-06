'use client'

import { useState } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Star, Code2, Copy, Check, Eye, MousePointerClick, BarChart3, Plus, Palette, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const WIDGET_TYPES = [
  {
    id: 'carousel',
    name: 'Carousel',
    desc: 'Auto-rotating reviews',
    icon: Eye,
    preview: 'carousel',
    popular: true,
  },
  {
    id: 'grid',
    name: 'Grid',
    desc: 'Static review grid',
    icon: BarChart3,
    preview: 'grid',
  },
  {
    id: 'badge',
    name: 'Floating Badge',
    desc: 'Floating rating badge',
    icon: Star,
    preview: 'badge',
  },
  {
    id: 'slider',
    name: 'Slider',
    desc: 'Horizontal review slider',
    icon: MousePointerClick,
    preview: 'slider',
  },
]

const COLOR_THEMES = [
  { id: 'brass', name: 'Brass', primary: '#97781B', bg: '#FFFFFF' },
  { id: 'dark', name: 'Dark', primary: '#D6B44F', bg: '#0A0A0B' },
  { id: 'blue', name: 'Ocean', primary: '#4464C3', bg: '#FFFFFF' },
  { id: 'green', name: 'Forest', primary: '#3B774F', bg: '#FFFFFF' },
  { id: 'purple', name: 'Royal', primary: '#7C3AED', bg: '#FFFFFF' },
  { id: 'rose', name: 'Rose', primary: '#E11D48', bg: '#FFFFFF' },
]

const SAMPLE_REVIEWS = [
  { author: 'Sarah Chen', rating: 5, text: 'Absolutely phenomenal experience. The staff went above and beyond!', source: 'Google' },
  { author: 'Marcus Webb', rating: 5, text: 'Best service in town. I have been coming here for years.', source: 'Facebook' },
  { author: 'Priya Patel', rating: 4, text: 'Great food and atmosphere. Will definitely be back!', source: 'Yelp' },
  { author: 'James R.', rating: 5, text: 'Outstanding from start to finish. Five stars well deserved.', source: 'Google' },
]

export default function WidgetsPage() {
  const [selectedType, setSelectedType] = useState('carousel')
  const [selectedTheme, setSelectedTheme] = useState('brass')
  const [minRating, setMinRating] = useState(4)
  const [copied, setCopied] = useState(false)

  const embedCode = `<script src="https://cdn.reviewreply.com/widget.js"
  data-widget-id="w_${Math.random().toString(36).slice(2, 10)}"
  data-type="${selectedType}"
  data-theme="${selectedTheme}"
  data-min-rating="${minRating}"
  data-business="Bamboo Garden Restaurant"
  async>
</script>`

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    toast.success('Embed code copied!', { description: 'Paste it into your website HTML' })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Widgets"
          description="Embeddable review widgets for your website"
        />
        <div className="p-4 sm:p-6 space-y-6">
          <Tabs defaultValue="builder" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="builder" className="text-xs">
                <Palette className="w-3.5 h-3.5 mr-1.5" />
                Builder
              </TabsTrigger>
              <TabsTrigger value="embed" className="text-xs">
                <Code2 className="w-3.5 h-3.5 mr-1.5" />
                Embed Code
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="builder">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Config */}
                <div className="space-y-6">
                  <Card className="p-5 glass-card">
                    <h3 className="font-display font-bold mb-4">Widget Type</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {WIDGET_TYPES.map(w => (
                        <button
                          key={w.id}
                          onClick={() => setSelectedType(w.id)}
                          className={cn(
                            'p-3 rounded-lg border text-left transition-all relative',
                            selectedType === w.id
                              ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                              : 'border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30'
                          )}
                        >
                          {w.popular && (
                            <Badge variant="outline" className="absolute -top-2 -right-2 text-[9px] bg-[var(--brass)] text-white border-[var(--brass)]">
                              Popular
                            </Badge>
                          )}
                          <w.icon className="w-5 h-5 mb-2 text-[var(--brass)]" />
                          <div className="text-xs font-medium">{w.name}</div>
                          <div className="text-[10px] text-muted-foreground">{w.desc}</div>
                        </button>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-5 glass-card">
                    <h3 className="font-display font-bold mb-4">Color Theme</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {COLOR_THEMES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTheme(t.id)}
                          className={cn(
                            'p-2 rounded-lg border transition-all',
                            selectedTheme === t.id
                              ? 'border-[var(--brass)] ring-2 ring-[var(--brass)]/20'
                              : 'border-border/40 hover:border-[var(--brass)]/40'
                          )}
                        >
                          <div className="aspect-video rounded mb-1 flex items-center justify-center" style={{ background: t.bg }}>
                            <div className="w-6 h-6 rounded-full" style={{ background: t.primary }} />
                          </div>
                          <div className="text-[10px] font-medium">{t.name}</div>
                        </button>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-5 glass-card">
                    <h3 className="font-display font-bold mb-4">Filters</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Minimum rating</Label>
                        <div className="flex gap-1 mt-1.5">
                          {[1, 2, 3, 4, 5].map(r => (
                            <button
                              key={r}
                              onClick={() => setMinRating(r)}
                              className={cn(
                                'flex-1 py-2 rounded-md border text-xs transition-all flex items-center justify-center gap-0.5',
                                minRating === r
                                  ? 'border-[var(--brass)] bg-[var(--brass)]/10 text-[var(--brass)]'
                                  : 'border-border/40 hover:bg-accent/30'
                              )}
                            >
                              {r}<Star className="w-3 h-3" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="count" className="text-xs">Max reviews to show</Label>
                        <Input id="count" type="number" defaultValue={10} min={1} max={50} className="mt-1.5 glass-card" />
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Preview */}
                <div className="lg:col-span-2">
                  <Card className="p-5 glass-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-display font-bold">Live Preview</h3>
                        <p className="text-xs text-muted-foreground">This is exactly how your widget will look</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {selectedType} · {selectedTheme} · ≥{minRating}★
                      </Badge>
                    </div>
                    <WidgetPreview type={selectedType} theme={selectedTheme} minRating={minRating} />
                  </Card>

                  <Card className="p-5 glass-card mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display font-bold text-sm">Embed Snippet</h3>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyCode}>
                        {copied ? <><Check className="w-3 h-3 mr-1" /> Copied</> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                      </Button>
                    </div>
                    <pre className="text-[10px] font-mono bg-background/60 p-3 rounded-md overflow-x-auto scrollbar-premium text-muted-foreground">
                      {embedCode}
                    </pre>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="embed">
              <Card className="p-6 glass-card max-w-3xl">
                <h3 className="font-display font-bold mb-2">Embed on your website</h3>
                <p className="text-sm text-muted-foreground mb-5">Copy this snippet and paste it where you want the widget to appear.</p>
                <pre className="text-xs font-mono bg-background/60 p-4 rounded-md overflow-x-auto scrollbar-premium border border-border/30">
                  {embedCode}
                </pre>
                <Button className="mt-4 bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={copyCode}>
                  {copied ? <><Check className="w-4 h-4 mr-2" /> Copied to clipboard</> : <><Copy className="w-4 h-4 mr-2" /> Copy embed code</>}
                </Button>

                <div className="mt-6 p-4 rounded-lg bg-accent/20 border border-border/30">
                  <h4 className="text-sm font-medium mb-2">Installation options:</h4>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2"><Globe className="w-3.5 h-3.5 mt-0.5 text-[var(--brass)]" /> <span><b>HTML</b>: Paste before closing <code className="font-mono">&lt;/body&gt;</code> tag</span></li>
                    <li className="flex items-start gap-2"><Code2 className="w-3.5 h-3.5 mt-0.5 text-[var(--brass)]" /> <span><b>WordPress</b>: Add to theme footer or use a Code Snippets plugin</span></li>
                    <li className="flex items-start gap-2"><Palette className="w-3.5 h-3.5 mt-0.5 text-[var(--brass)]" /> <span><b>Webflow</b>: Add an Embed widget and paste the code</span></li>
                    <li className="flex items-start gap-2"><Globe className="w-3.5 h-3.5 mt-0.5 text-[var(--brass)]" /> <span><b>Shopify</b>: Add to theme.liquid or use a custom liquid block</span></li>
                  </ul>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="analytics">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Active Widgets', value: '3', icon: Code2 },
                  { label: 'Total Impressions', value: '12.4k', icon: Eye },
                  { label: 'Click-through Rate', value: '8.2%', icon: MousePointerClick },
                  { label: 'Reviews Generated', value: '47', icon: Star },
                ].map(s => (
                  <Card key={s.label} className="p-4 glass-card">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                      <s.icon className="w-3.5 h-3.5 text-[var(--brass)]" />
                    </div>
                    <div className="font-display text-2xl font-bold">{s.value}</div>
                  </Card>
                ))}
              </div>

              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-4">Widget Performance</h3>
                <div className="space-y-3">
                  {[
                    { name: 'Homepage Carousel', impressions: 8420, clicks: 712, reviews: 28 },
                    { name: 'Footer Badge', impressions: 3200, clicks: 245, reviews: 12 },
                    { name: 'Sidebar Grid', impressions: 780, clicks: 89, reviews: 7 },
                  ].map(w => (
                    <div key={w.name} className="p-3 rounded-lg bg-accent/20 border border-border/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">{w.name}</div>
                        <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30">Active</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Impressions</div>
                          <div className="font-bold">{w.impressions.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Clicks</div>
                          <div className="font-bold">{w.clicks}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Reviews</div>
                          <div className="font-bold text-[var(--brass)]">{w.reviews}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

function WidgetPreview({ type, theme, minRating }: { type: string; theme: string; minRating: number }) {
  const themeColor = COLOR_THEMES.find(t => t.id === theme)?.primary || '#97781B'
  const themeBg = COLOR_THEMES.find(t => t.id === theme)?.bg || '#FFFFFF'
  const isDark = themeBg === '#0A0A0B'
  const filtered = SAMPLE_REVIEWS.filter(r => r.rating >= minRating).slice(0, 3)

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg p-12 text-center" style={{ background: themeBg }}>
        <p className="text-sm" style={{ color: isDark ? '#888' : '#666' }}>No reviews match your filter. Try lowering the minimum rating.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg p-5" style={{ background: themeBg, color: isDark ? '#FAFAF9' : '#1F1E1C' }}>
      {type === 'carousel' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5" style={{ color: themeColor, fill: themeColor }} />
            <span className="font-bold text-lg">4.6</span>
            <span className="text-xs opacity-60">· 247 reviews</span>
          </div>
          <div className="space-y-3">
            {filtered.map((r, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: themeColor }}>
                    {r.author[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium">{r.author}</div>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className="w-2.5 h-2.5" style={{ color: themeColor, fill: j < r.rating ? themeColor : 'transparent' }} />
                      ))}
                    </div>
                  </div>
                  <span className="text-[9px] opacity-50 font-mono">{r.source}</span>
                </div>
                <p className="text-xs opacity-80">"{r.text}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'grid' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5" style={{ color: themeColor, fill: themeColor }} />
            <span className="font-bold text-lg">4.6</span>
            <span className="text-xs opacity-60">· 247 reviews</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {filtered.slice(0, 4).map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: themeColor }}>
                    {r.author[0]}
                  </div>
                  <span className="text-[10px] font-medium">{r.author.split(' ')[0]}</span>
                </div>
                <div className="flex mb-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="w-2 h-2" style={{ color: themeColor, fill: j < r.rating ? themeColor : 'transparent' }} />
                  ))}
                </div>
                <p className="text-[9px] opacity-70 line-clamp-2">"{r.text}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'badge' && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 p-4 rounded-xl shadow-lg" style={{ background: themeBg, border: `2px solid ${themeColor}` }}>
            <div className="text-center">
              <div className="font-display text-3xl font-bold" style={{ color: themeColor }}>4.6</div>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className="w-3 h-3" style={{ color: themeColor, fill: j < 5 ? themeColor : 'transparent' }} />
                ))}
              </div>
            </div>
            <div className="h-12 w-px" style={{ background: themeColor, opacity: 0.3 }} />
            <div>
              <div className="text-xs font-medium">Rated by</div>
              <div className="font-bold text-lg">247</div>
              <div className="text-xs opacity-60">customers</div>
            </div>
          </div>
        </div>
      )}

      {type === 'slider' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5" style={{ color: themeColor, fill: themeColor }} />
              <span className="font-bold text-lg">4.6</span>
            </div>
            <div className="flex gap-1">
              <button className="w-6 h-6 rounded flex items-center justify-center" style={{ background: themeColor, color: 'white' }}>‹</button>
              <button className="w-6 h-6 rounded flex items-center justify-center" style={{ background: themeColor, color: 'white' }}>›</button>
            </div>
          </div>
          <div className="p-4 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: themeColor }}>
                {filtered[0].author[0]}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{filtered[0].author}</div>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="w-2.5 h-2.5" style={{ color: themeColor, fill: j < filtered[0].rating ? themeColor : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-sm opacity-80">"{filtered[0].text}"</p>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
        <span className="text-[10px] opacity-50">Powered by ReviewReply</span>
        <span className="text-[10px] opacity-50 font-mono">Live preview</span>
      </div>
    </div>
  )
}

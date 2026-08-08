'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { CampaignBuilder } from '@/components/app/campaign-builder'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Send, Mail, Phone, Globe, QrCode, Users, Clock, TrendingUp, Plus, Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Campaign {
  id: string
  name: string
  description: string | null
  businessName: string
  channelMix: string[]
  status: string
  trigger: string
  sentCount: number
  clickCount: number
  conversionCount: number
  clickRate: number
  conversionRate: number
  totalConversionRate: number
  requestCount: number
  createdAt: string
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchCampaigns = () => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(d => { setCampaigns(d.campaigns || []); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export?type=campaigns')
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = window.document.createElement('a')
        a.href = url
        a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Export complete', { description: 'Campaigns CSV downloaded' })
      } else {
        toast.error('Export failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setExporting(false)
    }
  }

  const totals = campaigns.reduce((acc, c) => ({
    sent: acc.sent + c.sentCount,
    clicks: acc.clicks + c.clickCount,
    conversions: acc.conversions + c.conversionCount,
  }), { sent: 0, clicks: 0, conversions: 0 })

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Campaigns"
          description="Multi-channel review request campaigns and send history"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: 'Total Sent', value: totals.sent.toLocaleString(), icon: Send, color: 'text-blue-500' },
              { label: 'Click Rate', value: `${totals.sent > 0 ? Math.round((totals.clicks / totals.sent) * 100) : 0}%`, icon: Users, color: 'text-[var(--brass)]' },
              { label: 'Conversion', value: `${totals.sent > 0 ? Math.round((totals.conversions / totals.sent) * 100) : 0}%`, icon: TrendingUp, color: 'text-green-500' },
              { label: 'Active Campaigns', value: campaigns.filter(c => c.status === 'active').length.toString(), icon: Clock, color: 'text-purple-500' },
            ].map(stat => (
              <Card key={stat.label} className="p-4 glass-card">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{stat.label}</span>
                  <stat.icon className={cn('w-3.5 h-3.5', stat.color)} />
                </div>
                <div className="font-display text-2xl font-bold">{stat.value}</div>
              </Card>
            ))}
          </div>

          {/* New campaign CTA */}
          <Card className="p-5 glass-card border-dashed border-2 border-[var(--brass)]/30 bg-[var(--brass)]/5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[var(--brass)]" />
                </div>
                <div>
                  <h3 className="font-display font-bold">Create New Campaign</h3>
                  <p className="text-xs text-muted-foreground">Send review requests via SMS, email, or QR</p>
                </div>
              </div>
              <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => setBuilderOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                New campaign
              </Button>
            </div>
          </Card>

          {/* Export bar */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs glass-card" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Export campaigns (CSV)
            </Button>
          </div>

          {/* Campaign list */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-5 glass-card">
                  <div className="h-4 w-32 bg-muted/40 rounded mb-3 animate-pulse" />
                  <div className="h-20 bg-muted/20 rounded animate-pulse" />
                </Card>
              ))
            ) : campaigns.length === 0 ? (
              <Card className="p-12 glass-card text-center">
                <Send className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-display font-bold mb-1">No campaigns yet</h3>
                <p className="text-sm text-muted-foreground">Create your first review request campaign above.</p>
              </Card>
            ) : (
              campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)
            )}
          </div>
        </div>
      </main>
      <MobileNav />
      <CampaignBuilder open={builderOpen} onOpenChange={setBuilderOpen} onSuccess={fetchCampaigns} />
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const channelIcons: Record<string, React.ElementType> = {
    sms: Phone,
    email: Mail,
    qr: QrCode,
    whatsapp: Globe,
  }
  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600 border-green-500/30',
    completed: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    draft: 'bg-muted/40 text-muted-foreground border-border',
    paused: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  }

  return (
    <Card className="p-5 glass-card hover:border-[var(--brass)]/30 transition-all">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-display font-bold">{campaign.name}</h3>
            <Badge variant="outline" className={cn('text-[10px] capitalize', statusColors[campaign.status] || statusColors.draft)}>
              {campaign.status}
            </Badge>
          </div>
          {campaign.description && <p className="text-xs text-muted-foreground mb-1">{campaign.description}</p>}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{campaign.businessName}</span>
            <span>·</span>
            <span className="capitalize">{campaign.trigger} trigger</span>
            <span>·</span>
            <span>{campaign.requestCount} recipients</span>
          </div>
        </div>
        <div className="flex gap-1">
          {campaign.channelMix.map(ch => {
            const Icon = channelIcons[ch] || Send
            return (
              <div key={ch} className="w-7 h-7 rounded-md bg-accent/40 flex items-center justify-center" title={ch}>
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )
          })}
        </div>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-accent/20">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-0.5">Sent</div>
          <div className="font-display font-bold text-lg">{campaign.sentCount}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-accent/20">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-0.5">Clicked</div>
          <div className="font-display font-bold text-lg">{campaign.clickCount}</div>
          <div className="text-[10px] text-[var(--brass)] font-mono">{campaign.clickRate}%</div>
        </div>
        <div className="p-2.5 rounded-lg bg-[var(--brass)]/10">
          <div className="text-[10px] uppercase tracking-wider text-[var(--brass)] font-mono mb-0.5">Reviews</div>
          <div className="font-display font-bold text-lg text-[var(--brass)]">{campaign.conversionCount}</div>
          <div className="text-[10px] text-[var(--brass)] font-mono">{campaign.totalConversionRate}%</div>
        </div>
      </div>
    </Card>
  )
}
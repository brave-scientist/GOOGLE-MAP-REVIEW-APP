'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Building2, Users, Star, TrendingUp, DollarSign, Plus, ChevronRight,
  Settings, MoreHorizontal, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Client {
  id: string
  name: string
  industry: string
  plan: string
  mrr: number
  rating: number
  reviews: number
  reviewVelocity: number
  healthScore: number
  status: string
  lastActive: string
}

interface AgencyData {
  clients: Client[]
  stats: {
    totalClients: number
    totalMRR: number
    avgHealth: number
    atRisk: number
    totalReviews: number
  }
}

export default function AgencyPage() {
  const router = useRouter()
  const [data, setData] = useState<AgencyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agency')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }, [])

  const stats = data?.stats || { totalClients: 0, totalMRR: 0, avgHealth: 0, atRisk: 0, totalReviews: 0 }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Agency Dashboard"
          description="Manage all your client businesses in one place"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {loading ? (
            <Card className="p-12 glass-card text-center">
              <Loader2 className="w-8 h-8 text-[var(--brass)] mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground">Loading agency data...</p>
            </Card>
          ) : data && data.clients ? (
            <>
              {/* Agency stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: 'Active Clients', value: (stats.totalClients || data.clients.length).toString(), sub: `${data.clients.length} total`, icon: Building2, color: 'text-blue-500' },
                  { label: 'Monthly Revenue', value: `$${stats.totalMRR.toLocaleString()}`, sub: '87% margin', icon: DollarSign, color: 'text-green-500' },
                  { label: 'Avg Health Score', value: stats.avgHealth.toString(), sub: stats.atRisk > 0 ? `${stats.atRisk} at risk` : 'All healthy', icon: TrendingUp, color: stats.atRisk > 0 ? 'text-amber-500' : 'text-[var(--brass)]' },
                  { label: 'Reviews Managed', value: stats.totalReviews.toLocaleString(), sub: 'across all clients', icon: Star, color: 'text-purple-500' },
                ].map(s => (
                  <Card key={s.label} className="p-4 glass-card">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                      <s.icon className={cn('w-3.5 h-3.5', s.color)} />
                    </div>
                    <div className="font-display text-2xl font-bold">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
                  </Card>
                ))}
              </div>

              {/* White-label config banner */}
              <Card className="p-5 glass-card bg-gradient-to-r from-[var(--brass)]/5 to-transparent border-[var(--brass)]/20">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                      <Settings className="w-5 h-5 text-[var(--brass)]" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold">White-Label Configuration</h3>
                      <p className="text-xs text-muted-foreground">Custom domain, logo, and colors for your agency portal</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-muted-foreground">agency.localexperts.com</span>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info('White-label config', { description: 'Custom domain, logo, and colors — coming soon' })}>Configure</Button>
                  </div>
                </div>
              </Card>

              {/* Client leaderboard */}
              <Card className="p-5 glass-card">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-display font-bold">Client Leaderboard</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Ranked by health score · live data from database</p>
                  </div>
                  <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-8 text-xs" onClick={() => toast.info('Add client', { description: 'Invite a new client business to your agency' })}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add client
                  </Button>
                </div>

                <div className="space-y-2">
                  {data.clients.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No clients yet. Add your first client business.</p>
                  ) : (
                    data.clients.sort((a, b) => b.healthScore - a.healthScore).map((client, i) => (
                      <div
                        key={client.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-all hover:border-[var(--brass)]/40 hover:bg-accent/30 cursor-pointer',
                          client.status === 'at-risk' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30'
                        )}
                      >
                        <div className="text-xs font-mono text-muted-foreground w-5">{i + 1}</div>
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                        )}
                          style={{ background: `linear-gradient(135deg, hsl(${i * 60}, 60%, 50%), hsl(${i * 60 + 30}, 60%, 40%))` }}
                        >
                          {client.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-medium truncate">{client.name}</span>
                            <Badge variant="outline" className="text-[9px] capitalize">{client.industry}</Badge>
                            <Badge variant="outline" className={cn(
                              'text-[9px]',
                              client.plan === 'Enterprise' ? 'bg-purple-500/10 text-purple-600 border-purple-500/30' :
                              client.plan === 'Pro' ? 'bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30' : ''
                            )}>
                              {client.plan}
                            </Badge>
                            {client.status === 'at-risk' && (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                At risk
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 text-[var(--brass)] fill-[var(--brass)]" />
                              {client.rating}
                            </span>
                            <span>{client.reviews} reviews</span>
                            <span>{client.reviewVelocity}/wk velocity</span>
                            <span>Last active: {getTimeAgo(client.lastActive)}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-muted-foreground">Health</div>
                          <div className={cn(
                            'font-bold text-lg',
                            client.healthScore >= 80 ? 'text-green-500' :
                            client.healthScore >= 60 ? 'text-amber-500' : 'text-red-500'
                          )}>
                            {client.healthScore}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-muted-foreground">MRR</div>
                          <div className="font-bold text-sm">${client.mrr}</div>
                        </div>
                        <button className="p-1.5 rounded-md hover:bg-accent transition-colors flex-shrink-0">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Bulk actions */}
              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-4">Bulk Actions</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Bulk assign', desc: 'Assign reviews to team', icon: Users, action: () => toast.info('Bulk assign', { description: 'Select reviews to assign' }) },
                    { label: 'Bulk approve', desc: 'Approve pending drafts', icon: Star, action: () => router.push('/inbox') },
                    { label: 'Bulk export', desc: 'Export client reports', icon: TrendingUp, action: () => router.push('/reviews') },
                    { label: 'Bulk campaign', desc: 'Send across clients', icon: ChevronRight, action: () => router.push('/campaigns') },
                  ].map(a => (
                    <button
                      key={a.label}
                      onClick={a.action}
                      className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all group"
                    >
                      <a.icon className="w-5 h-5 mb-2 text-[var(--brass)]" />
                      <div className="text-sm font-medium mb-0.5">{a.label}</div>
                      <div className="text-[10px] text-muted-foreground">{a.desc}</div>
                    </button>
                  ))}
                </div>
              </Card>
            </>
          ) : data && data.error ? (
            <Card className="p-12 glass-card text-center">
              <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-display font-bold mb-1">{data.error}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {data.code === 'PLAN_UPGRADE_REQUIRED'
                  ? `Agency mode requires ${data.requiredPlan} plan. Your current plan: ${data.currentPlan}.`
                  : 'Unable to load agency data.'}
              </p>
              <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => router.push('/billing')}>
                Upgrade plan
              </Button>
            </Card>
          ) : (
            <Card className="p-12 glass-card text-center">
              <p className="text-sm text-muted-foreground">Failed to load agency data</p>
            </Card>
          )}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24) return `${hrs}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

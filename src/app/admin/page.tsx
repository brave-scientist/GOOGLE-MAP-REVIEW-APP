'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { ExtendTrialModal, BroadcastModal } from '@/components/app/admin-modals'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Users, Building2, DollarSign, TrendingUp, Star, Send, MessageSquare,
  Activity, Clock, Crown, Zap, ArrowUp, ArrowDown, Shield,
  UserCheck, Bell, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AdminData {
  overview: {
    totalUsers: number
    totalOrgs: number
    totalBusinesses: number
    paidSubscribers: number
    trialUsers: number
    mrr: number
    arr: number
  }
  planBreakdown: { free: number; starter: number; pro: number; enterprise: number; agency: number }
  trialOrgs: Array<{ id: string; name: string; trialEndsAt: string | null; createdAt: string; daysLeft: number }>
  recentSignups: Array<{
    id: string; email: string; name: string | null; createdAt: string;
    orgName: string; plan: string; isTrial: boolean
  }>
  usage: {
    totalReviews: number
    totalDrafts: number
    totalCampaigns: number
    totalRequests: number
    reviewsBySource: Array<{ source: string; count: number }>
  }
  signupsByDay: Array<{ date: string; count: number }>
  recentActivity: Array<{ id: string; action: string; targetType: string | null; targetId: string | null; actorId: string | null; createdAt: string }>
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }, [])

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Developer Dashboard"
          description="Platform-wide metrics · Owner access only"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {/* Owner access banner */}
          <Card className="p-4 glass-card border-[var(--brass)]/30 bg-gradient-to-r from-[var(--brass)]/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-[var(--brass)]" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">Owner Access</h3>
                <p className="text-xs text-muted-foreground">You have full platform visibility. This dashboard is only visible to the SaaS owner.</p>
              </div>
              <Badge variant="outline" className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </Badge>
            </div>
          </Card>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="p-5 glass-card">
                  <div className="h-3 w-20 bg-muted/40 rounded mb-3 animate-pulse" />
                  <div className="h-8 w-16 bg-muted/40 rounded animate-pulse" />
                </Card>
              ))}
            </div>
          ) : data ? (
            <AdminContent data={data} />
          ) : null}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

function AdminContent({ data }: { data: AdminData }) {
  const router = useRouter()
  const [extendTrialOpen, setExtendTrialOpen] = useState(false)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const { overview, planBreakdown, trialOrgs, recentSignups, usage, signupsByDay, recentActivity } = data

  const topStats = [
    { label: 'Total Users', value: overview.totalUsers.toString(), change: `+${signupsByDay.slice(-7).reduce((s, d) => s + d.count, 0)} this week`, icon: Users, color: 'text-blue-500' },
    { label: 'Organizations', value: overview.totalOrgs.toString(), change: `${overview.totalBusinesses} businesses`, icon: Building2, color: 'text-purple-500' },
    { label: 'Paid Subscribers', value: overview.paidSubscribers.toString(), change: `${overview.trialUsers} on trial`, icon: UserCheck, color: 'text-green-500' },
    { label: 'Monthly Revenue', value: `$${overview.mrr.toLocaleString()}`, change: `$${overview.arr.toLocaleString()} ARR`, icon: DollarSign, color: 'text-[var(--brass)]' },
  ]

  return (
    <>
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {topStats.map(stat => (
          <Card key={stat.label} className="p-4 sm:p-5 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{stat.label}</span>
              <div className="p-1.5 rounded-md bg-[var(--brass)]/10">
                <stat.icon className={cn('w-3.5 h-3.5', stat.color)} />
              </div>
            </div>
            <div className="font-display text-2xl sm:text-3xl font-bold mb-1">{stat.value}</div>
            <p className="text-[10px] text-muted-foreground">{stat.change}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Signups chart */}
        <Card className="lg:col-span-2 p-5 glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-bold">User Signups</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 14 days</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-[var(--brass)] border-[var(--brass)]/40">
              <TrendingUp className="w-3 h-3 mr-1" />
              {signupsByDay.reduce((s, d) => s + d.count, 0)} total
            </Badge>
          </div>
          <div className="flex items-end gap-1.5 h-40 mb-3">
            {signupsByDay.map((d, i) => {
              const max = Math.max(...signupsByDay.map(s => s.count), 1)
              const h = (d.count / max) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                  <div className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.count > 0 ? d.count : ''}
                  </div>
                  <div className="w-full flex-1 flex flex-col justify-end">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)] transition-all hover:opacity-80"
                      style={{ height: `${Math.max(h, 2)}%` }}
                    />
                  </div>
                  <div className="text-[8px] text-muted-foreground font-mono">{d.date}</div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Plan breakdown */}
        <Card className="p-5 glass-card">
          <h3 className="font-display font-bold mb-1">Plan Distribution</h3>
          <p className="text-xs text-muted-foreground mb-5">Across all organizations</p>
          <div className="space-y-3">
            {[
              { name: 'Free', count: planBreakdown.free, price: 0, color: 'bg-muted-foreground' },
              { name: 'Starter', count: planBreakdown.starter, price: 49, color: 'bg-blue-500' },
              { name: 'Pro', count: planBreakdown.pro, price: 99, color: 'bg-[var(--brass)]' },
              { name: 'Enterprise', count: planBreakdown.enterprise, price: 299, color: 'bg-purple-500' },
              { name: 'Agency', count: planBreakdown.agency, price: 499, color: 'bg-green-500' },
            ].map(p => {
              const total = Object.values(planBreakdown).reduce((s, c) => s + c, 0) || 1
              const pct = Math.round((p.count / total) * 100)
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{p.count} · ${p.price}/mo</span>
                  </div>
                  <div className="h-2 rounded-full bg-background/60 overflow-hidden">
                    <div className={cn('h-full rounded-full', p.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Usage stats */}
      <Card className="p-5 glass-card">
        <h3 className="font-display font-bold mb-4">Platform Usage</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Reviews', value: usage.totalReviews, icon: Star, color: 'text-[var(--brass)]' },
            { label: 'AI Drafts Posted', value: usage.totalDrafts, icon: MessageSquare, color: 'text-blue-500' },
            { label: 'Campaigns Created', value: usage.totalCampaigns, icon: Send, color: 'text-green-500' },
            { label: 'Review Requests', value: usage.totalRequests, icon: Zap, color: 'text-purple-500' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-lg bg-accent/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                <s.icon className={cn('w-3.5 h-3.5', s.color)} />
              </div>
              <div className="font-display text-2xl font-bold">{s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Reviews by source */}
        <div className="mt-5 pt-5 border-t border-border/30">
          <div className="text-xs font-medium mb-3">Reviews by Source</div>
          <div className="flex gap-2 flex-wrap">
            {usage.reviewsBySource.map(s => (
              <div key={s.source} className="px-3 py-1.5 rounded-lg bg-accent/30 border border-border/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mr-2">{s.source}</span>
                <span className="text-sm font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Recent signups */}
        <Card className="p-5 glass-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold">Recent Signups</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 7 days · {recentSignups.length} new users</p>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-premium">
            {recentSignups.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No new signups in the last 7 days</p>
            ) : (
              recentSignups.map(user => (
                <div key={user.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/20">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{user.name || user.email}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline" className={cn(
                      'text-[9px] capitalize',
                      user.plan === 'PRO' ? 'bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30' : ''
                    )}>
                      {user.plan.toLowerCase()}
                    </Badge>
                    {user.isTrial && (
                      <div className="text-[9px] text-amber-500 mt-0.5">Trial</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Trial users */}
        <Card className="p-5 glass-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold">Active Trials</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{trialOrgs.length} organizations on trial</p>
            </div>
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
              <Clock className="w-3 h-3 mr-1" />
              {trialOrgs.length} active
            </Badge>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-premium">
            {trialOrgs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No active trials</p>
            ) : (
              trialOrgs.map(org => (
                <div key={org.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/20">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{org.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Created {new Date(org.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    'text-[9px] flex-shrink-0',
                    org.daysLeft <= 3 ? 'bg-red-500/10 text-red-600 border-red-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  )}>
                    {org.daysLeft}d left
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-5 glass-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold">Platform Activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Recent actions across all users</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            <Activity className="w-3 h-3 mr-1" />
            Live
          </Badge>
        </div>
        <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-premium">
          {recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
          ) : (
            recentActivity.map(log => (
              <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors text-xs">
                <div className="font-mono text-[10px] text-[var(--brass)] w-36 truncate flex-shrink-0">{log.action}</div>
                <div className="flex-1 truncate text-muted-foreground">
                  {log.targetType} · {log.targetId?.slice(0, 12) || '—'}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Admin quick actions */}
      <Card className="p-5 glass-card">
        <h3 className="font-display font-bold mb-4">Admin Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Extend trial', desc: 'Give a user more time', icon: Clock, color: 'text-amber-500', action: () => setExtendTrialOpen(true) },
            { label: 'View audit log', desc: 'Full platform audit', icon: Shield, color: 'text-blue-500', action: () => router.push('/admin/audit-log') },
            { label: 'Send broadcast', desc: 'Email all users', icon: Bell, color: 'text-purple-500', action: () => setBroadcastOpen(true) },
          ].map(action => (
            <button
              key={action.label}
              onClick={action.action}
              className="text-left p-4 rounded-lg border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-all"
            >
              <action.icon className={cn('w-5 h-5 mb-2', action.color)} />
              <div className="text-sm font-medium mb-0.5">{action.label}</div>
              <div className="text-[10px] text-muted-foreground">{action.desc}</div>
            </button>
          ))}
        </div>
      </Card>
      <ExtendTrialModal open={extendTrialOpen} onOpenChange={setExtendTrialOpen} />
      <BroadcastModal open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </>
  )
}

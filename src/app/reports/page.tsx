'use client'

import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText, Clock, Download, Plus, Mail, Calendar, TrendingUp, Star,
  Users, MessageSquare, Target, BarChart3, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Reports"
          description="Scheduled reports and executive dashboards"
        />
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="scheduled" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="scheduled" className="text-xs">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Scheduled
              </TabsTrigger>
              <TabsTrigger value="executive" className="text-xs">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Executive
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scheduled">
              <div className="space-y-4">
                <Card className="p-5 glass-card border-dashed border-2 border-[var(--brass)]/30 bg-[var(--brass)]/5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-[var(--brass)]" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold">Schedule New Report</h3>
                        <p className="text-xs text-muted-foreground">Daily, weekly, or monthly — sent to your inbox</p>
                      </div>
                    </div>
                    <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={() => toast.info('New report', { description: 'Configure a scheduled report — daily, weekly, or monthly. (Requires Resend API key to send emails.)' })}>
                      <Plus className="w-4 h-4 mr-1" />
                      New report
                    </Button>
                  </div>
                </Card>

                <div className="space-y-3">
                  {[
                    {
                      name: 'Daily Review Digest',
                      schedule: 'Every day at 9:00 AM',
                      recipients: ['sarah@bamboogarden.com'],
                      format: 'Email',
                      lastSent: '2 hours ago',
                      status: 'active',
                      type: 'daily',
                    },
                    {
                      name: 'Weekly Performance Summary',
                      schedule: 'Every Monday at 9:00 AM',
                      recipients: ['sarah@bamboogarden.com', 'manager@bamboogarden.com'],
                      format: 'PDF + Email',
                      lastSent: '3 days ago',
                      status: 'active',
                      type: 'weekly',
                    },
                    {
                      name: 'Monthly Executive Report',
                      schedule: '1st of every month at 9:00 AM',
                      recipients: ['sarah@bamboogarden.com', 'board@bamboogarden.com'],
                      format: 'PDF',
                      lastSent: '12 days ago',
                      status: 'active',
                      type: 'monthly',
                    },
                    {
                      name: 'Negative Review Alert',
                      schedule: 'Real-time (rating ≤ 2)',
                      recipients: ['sarah@bamboogarden.com', '+1 415-555-1000'],
                      format: 'SMS + Email',
                      lastSent: '5 hours ago',
                      status: 'active',
                      type: 'alert',
                    },
                  ].map(r => (
                    <Card key={r.name} className="p-5 glass-card hover:border-[var(--brass)]/30 transition-all">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                            r.type === 'alert' ? 'bg-red-500/10' : 'bg-[var(--brass)]/10'
                          )}>
                            {r.type === 'alert' ? <MessageSquare className="w-5 h-5 text-red-500" /> : <FileText className="w-5 h-5 text-[var(--brass)]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-display font-bold">{r.name}</h3>
                              <Badge variant="outline" className="text-[9px] capitalize bg-green-500/10 text-green-600 border-green-500/30">
                                {r.status}
                              </Badge>
                              {r.type === 'alert' && (
                                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30">
                                  Real-time
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.schedule}</span>
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {r.recipients.length} recipient{r.recipients.length > 1 ? 's' : ''}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last sent: {r.lastSent}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info('Sending test report...')}>
                            <Send className="w-3 h-3 mr-1" />
                            Test
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info('Edit report', { description: 'Modify schedule, recipients, or format.' })}>
                            Edit
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="executive">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Total Reviews', value: '1,247', change: '+12%', icon: Star },
                  { label: 'Avg Rating', value: '4.6', change: '+0.3', icon: TrendingUp },
                  { label: 'Response Rate', value: '87%', change: '+5%', icon: MessageSquare },
                  { label: 'Customer NPS', value: '+42', change: '+8', icon: Target },
                ].map(s => (
                  <Card key={s.label} className="p-4 glass-card">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                      <s.icon className="w-3.5 h-3.5 text-[var(--brass)]" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-bold">{s.value}</span>
                      <span className="text-[10px] text-green-500 font-mono">{s.change}</span>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="p-5 glass-card mb-4">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-display font-bold">Review Velocity</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Reviews received per week · last 12 weeks</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-green-500 border-green-500/30">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending up
                  </Badge>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {[35, 42, 38, 51, 48, 62, 58, 71, 65, 78, 82, 89].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                      <div className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{h}</div>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)] transition-all hover:opacity-80"
                        style={{ height: `${(h / 89) * 100}%` }}
                      />
                      <div className="text-[8px] text-muted-foreground font-mono">W{i + 1}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-5 glass-card">
                  <h3 className="font-display font-bold mb-4">Top Performing Locations</h3>
                  <div className="space-y-2">
                    {[
                      { name: 'Bamboo Garden Downtown', rating: 4.8, reviews: 342, trend: '+15%' },
                      { name: 'Smile Studio Dental', rating: 4.7, reviews: 287, trend: '+12%' },
                      { name: 'Bamboo Garden Uptown', rating: 4.5, reviews: 234, trend: '+8%' },
                      { name: 'Urban Cuts Barbershop', rating: 4.4, reviews: 198, trend: '+5%' },
                    ].map((b, i) => (
                      <div key={b.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/20">
                        <div className="text-xs font-mono text-muted-foreground w-4">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{b.name}</div>
                          <div className="text-[10px] text-muted-foreground">{b.reviews} reviews</div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
                            <span className="text-xs font-bold">{b.rating}</span>
                          </div>
                          <div className="text-[10px] text-green-500 font-mono">{b.trend}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <h3 className="font-display font-bold mb-4">Recent Highlights</h3>
                  <div className="space-y-3">
                    {[
                      { type: 'milestone', text: 'Bamboo Garden Downtown hit 4.8★ average', time: '2h ago', icon: Star },
                      { type: 'response', text: '87% response rate this week (target: 80%)', time: '5h ago', icon: MessageSquare },
                      { type: 'campaign', text: 'Post-visit campaign generated 12 new reviews', time: '1d ago', icon: Send },
                      { type: 'sentiment', text: 'Food sentiment up 0.15 this month', time: '2d ago', icon: TrendingUp },
                    ].map((h, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-accent/20">
                        <div className="w-7 h-7 rounded-md bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
                          <h.icon className="w-3.5 h-3.5 text-[var(--brass)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs">{h.text}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{h.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-4">Report History</h3>
                <div className="space-y-2">
                  {[
                    { name: 'Daily Review Digest', date: 'Aug 6, 2026 · 9:00 AM', size: '142 KB', type: 'Email' },
                    { name: 'Negative Review Alert', date: 'Aug 6, 2026 · 4:23 AM', size: '—', type: 'SMS' },
                    { name: 'Daily Review Digest', date: 'Aug 5, 2026 · 9:00 AM', size: '138 KB', type: 'Email' },
                    { name: 'Weekly Performance Summary', date: 'Aug 4, 2026 · 9:00 AM', size: '2.4 MB', type: 'PDF' },
                    { name: 'Daily Review Digest', date: 'Aug 4, 2026 · 9:00 AM', size: '145 KB', type: 'Email' },
                    { name: 'Monthly Executive Report', date: 'Aug 1, 2026 · 9:00 AM', size: '4.8 MB', type: 'PDF' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.date}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{r.type}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono w-16 text-right">{r.size}</span>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toast.info('Downloading report...')}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
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

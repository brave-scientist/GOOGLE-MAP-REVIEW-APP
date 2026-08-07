import { LegalLayout } from '@/components/app/marketing-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, AlertCircle, Activity } from 'lucide-react'

export const metadata = {
  title: 'Status — ReviewReply Enterprise',
  description: 'Real-time status of ReviewReply services and integrations.',
}

export default function StatusPage() {
  const services = [
    { name: 'Web Application', status: 'operational', uptime: '99.98%', latency: '142ms' },
    { name: 'API', status: 'operational', uptime: '99.99%', latency: '89ms' },
    { name: 'AI Draft Generation', status: 'operational', uptime: '99.95%', latency: '2.3s' },
    { name: 'Google Business Profile Sync', status: 'operational', uptime: '99.92%', latency: '1.2s' },
    { name: 'Facebook Pages Sync', status: 'operational', uptime: '99.88%', latency: '0.9s' },
    { name: 'SMS Delivery (Twilio)', status: 'operational', uptime: '99.97%', latency: '0.8s' },
    { name: 'Email Delivery (Resend)', status: 'operational', uptime: '99.99%', latency: '0.4s' },
    { name: 'Stripe Billing', status: 'operational', uptime: '100%', latency: '0.3s' },
  ]

  const incidents = [
    {
      date: 'Jul 28, 2026',
      title: 'Brief elevated AI response times',
      status: 'resolved',
      impact: 'minor',
      desc: 'AI draft generation took 8-12 seconds instead of the usual 2-3 seconds for approximately 45 minutes. Root cause: upstream LLM provider throttling. Resolved by switching to fallback provider.',
    },
    {
      date: 'Jul 15, 2026',
      title: 'Google Business Profile API rate limit increase',
      status: 'resolved',
      impact: 'maintenance',
      desc: 'Scheduled maintenance to increase our Google API quota. No customer impact — review fetching continued from cache during the 5-minute window.',
    },
  ]

  const statusConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    operational: { color: 'text-green-500', icon: CheckCircle, label: 'Operational' },
    degraded: { color: 'text-amber-500', icon: Clock, label: 'Degraded' },
    outage: { color: 'text-red-500', icon: AlertCircle, label: 'Outage' },
  }

  return (
    <LegalLayout title="System Status" lastUpdated="August 7, 2026">
      <Card className="p-5 glass-card mb-6 border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg">All Systems Operational (Demo)</h3>
            <p className="text-xs text-muted-foreground">Status page is representative — real uptime monitoring (UptimeRobot/BetterStack) not yet configured</p>
          </div>
        </div>
      </Card>

      <h2 className="text-lg font-bold text-foreground mb-4">Service Status</h2>
      <div className="space-y-2 mb-8">
        {services.map(s => {
          const cfg = statusConfig[s.status]
          return (
            <div key={s.name} className="flex items-center gap-3 p-3 rounded-lg glass-card">
              <cfg.icon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Uptime: {s.uptime} · Latency: {s.latency}
                </div>
              </div>
              <Badge variant="outline" className={`text-[9px] ${cfg.color} border-current/30`}>
                {cfg.label}
              </Badge>
            </div>
          )
        })}
      </div>

      <h2 className="text-lg font-bold text-foreground mb-4">90-Day Uptime History</h2>
      <Card className="p-5 glass-card mb-8">
        <div className="flex gap-0.5 h-12 mb-2">
          {Array.from({ length: 90 }).map((_, i) => {
            // Most days are green, a couple amber/red
            const status = i === 42 || i === 43 ? 'amber' : i === 12 ? 'red' : 'green'
            const color = status === 'green' ? 'bg-green-500' : status === 'amber' ? 'bg-amber-500' : 'bg-red-500'
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm ${color} hover:opacity-70 transition-opacity cursor-pointer`}
                title={`Day ${i + 1}: ${status === 'green' ? 'Operational' : status === 'amber' ? 'Degraded' : 'Outage'}`}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </Card>

      <h2 className="text-lg font-bold text-foreground mb-4">Recent Incidents</h2>
      <div className="space-y-3">
        {incidents.map((inc, i) => (
          <Card key={i} className="p-4 glass-card">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={`text-[9px] ${
                inc.status === 'resolved' ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
              }`}>
                {inc.status}
              </Badge>
              <Badge variant="outline" className={`text-[9px] capitalize ${
                inc.impact === 'minor' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                inc.impact === 'maintenance' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' : ''
              }`}>
                {inc.impact}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{inc.date}</span>
            </div>
            <h3 className="font-medium text-sm mb-1">{inc.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{inc.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 glass-card mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-[var(--brass)]" />
          <h3 className="font-display font-bold text-sm">Subscribe to Status Updates</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Get notified when incidents occur or are resolved.</p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="you@business.com"
            className="flex-1 px-3 py-2 rounded-md glass-card border-0 focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30 text-sm"
          />
          <button className="px-4 py-2 rounded-md bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] text-sm font-medium">
            Subscribe
          </button>
        </div>
      </Card>
    </LegalLayout>
  )
}

'use client'

import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield, FileText, Trash2, Download, Lock, Eye, CheckCircle, AlertCircle,
  Clock, Database, UserCheck, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function CompliancePage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Compliance Center"
          description="GDPR, CCPA, TCPA, and security controls"
        />
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="overview" className="text-xs">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="gdpr" className="text-xs">
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                GDPR
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="data" className="text-xs">
                <Database className="w-3.5 h-3.5 mr-1.5" />
                Data Retention
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'SOC2 Type I', status: 'In Progress', color: 'amber', icon: Shield },
                  { label: 'GDPR Ready', status: 'Compliant', color: 'green', icon: Lock },
                  { label: 'CCPA Ready', status: 'Compliant', color: 'green', icon: Eye },
                  { label: 'TCPA Ready', status: 'Action needed', color: 'amber', icon: Mail },
                ].map(s => (
                  <Card key={s.label} className="p-4 glass-card">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{s.label}</span>
                      <s.icon className={cn(
                        'w-3.5 h-3.5',
                        s.color === 'green' ? 'text-green-500' : 'text-amber-500'
                      )} />
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-[10px]',
                      s.color === 'green' ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    )}>
                      {s.status}
                    </Badge>
                  </Card>
                ))}
              </div>

              <Card className="p-5 glass-card">
                <h3 className="font-display font-bold mb-4">Security Checklist</h3>
                <div className="space-y-2">
                  {[
                    { label: 'PII encryption at rest (AES-256-GCM)', done: true },
                    { label: 'Audit logging on all write operations', done: true },
                    { label: 'Rate limiting on auth + AI endpoints', done: true },
                    { label: 'Stripe webhook signature verification', done: true },
                    { label: 'Inngest webhook signature verification', done: true },
                    { label: 'CSRF protection on route handlers', done: true },
                    { label: '2FA enforcement for enterprise tier', done: false },
                    { label: 'Penetration test (third-party)', done: false },
                    { label: 'SOC2 Type I audit', done: false },
                    { label: 'Bug bounty program launch', done: false },
                    { label: 'Disaster recovery drill', done: false },
                    { label: 'Sub-processor list published', done: true },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-2.5 rounded-lg bg-accent/20">
                      {item.done ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-sm flex-1">{item.label}</span>
                      <Badge variant="outline" className={cn(
                        'text-[9px]',
                        item.done ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                      )}>
                        {item.done ? 'Done' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="gdpr">
              <div className="space-y-4 max-w-3xl">
                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCheck className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Subject Access Request (DSAR)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    EU residents have the right to request a copy of all personal data you hold about them, and to request deletion (right to erasure).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <Button variant="outline" className="h-12" onClick={() => toast.info('Generating data export...', { description: 'You\'ll receive an email with a download link within 30 days' })}>
                      <Download className="w-4 h-4 mr-2" />
                      Export my data
                    </Button>
                    <Button variant="outline" className="h-12 border-red-500/30 text-red-600 hover:bg-red-500/5" onClick={() => toast.warning('Account deletion requested', { description: 'This will permanently delete all your data after a 30-day grace period' })}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Request deletion
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/20">
                    <strong>Note:</strong> Deletion requests are processed within 30 days. Audit logs are retained for 7 years for legal compliance, even after account deletion.
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Cookie Consent</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage how cookies are used on your account and customer-facing pages.
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: 'Essential cookies', desc: 'Required for site function', enabled: true, locked: true },
                      { label: 'Analytics cookies', desc: 'Help us improve the product', enabled: true, locked: false },
                      { label: 'Marketing cookies', desc: 'Used for retargeting', enabled: false, locked: false },
                    ].map(c => (
                      <div key={c.label} className="flex items-center gap-3 p-3 rounded-lg bg-accent/20">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-[10px] text-muted-foreground">{c.desc}</div>
                        </div>
                        <Badge variant="outline" className={cn(
                          'text-[9px]',
                          c.enabled ? 'bg-green-500/10 text-green-600 border-green-500/30' : ''
                        )}>
                          {c.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Legal Documents</h3>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Privacy Policy', updated: 'Aug 1, 2026' },
                      { name: 'Terms of Service', updated: 'Aug 1, 2026' },
                      { name: 'Data Processing Addendum (DPA)', updated: 'Jul 15, 2026' },
                      { name: 'Sub-processor List', updated: 'Aug 1, 2026' },
                      { name: 'Cookie Policy', updated: 'Aug 1, 2026' },
                    ].map(doc => (
                      <div key={doc.name} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{doc.name}</div>
                          <div className="text-[10px] text-muted-foreground">Last updated: {doc.updated}</div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="audit">
              <Card className="p-5 glass-card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-bold">Audit Log</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Every write operation · retained 7 years</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info('Exporting audit log...')}>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Export
                  </Button>
                </div>
                <div className="space-y-1">
                  {[
                    { action: 'reply.posted', target: 'Review from Jordan Lee', actor: 'Sarah Chen', ip: '192.168.1.1', time: '2m ago' },
                    { action: 'draft.generated', target: 'Review from Marcus Webb', actor: 'System (AI)', ip: '—', time: '14m ago' },
                    { action: 'campaign.sent', target: 'Post-visit follow-up', actor: 'Sarah Chen', ip: '192.168.1.1', time: '1h ago' },
                    { action: 'user.login', target: 'Sarah Chen', actor: 'Sarah Chen', ip: '192.168.1.1', time: '3h ago' },
                    { action: 'billing.viewed', target: 'Plans page', actor: 'Sarah Chen', ip: '192.168.1.1', time: '4h ago' },
                    { action: 'review.received', target: 'Review from Priya Patel', actor: 'System (Google poll)', ip: '—', time: '5h ago' },
                    { action: 'draft.rejected', target: 'Review from James R.', actor: 'Sarah Chen', ip: '192.168.1.1', time: '6h ago' },
                    { action: 'widget.created', target: 'Homepage Carousel', actor: 'Sarah Chen', ip: '192.168.1.1', time: '1d ago' },
                    { action: 'settings.updated', target: 'Business profile', actor: 'Sarah Chen', ip: '192.168.1.1', time: '1d ago' },
                    { action: 'user.signup', target: 'Sarah Chen', actor: 'System', ip: '73.42.18.92', time: '7d ago' },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/30 transition-colors text-xs">
                      <div className="font-mono text-[10px] text-[var(--brass)] w-32 truncate flex-shrink-0">{log.action}</div>
                      <div className="flex-1 truncate text-muted-foreground">{log.target}</div>
                      <div className="text-[10px] text-muted-foreground w-28 truncate hidden sm:block">{log.actor}</div>
                      <div className="text-[10px] text-muted-foreground font-mono w-24 hidden md:block">{log.ip}</div>
                      <div className="text-[10px] text-muted-foreground font-mono w-16 text-right flex-shrink-0">{log.time}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="data">
              <div className="space-y-4 max-w-2xl">
                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Retention Policy</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure how long different types of data are retained. After the retention period, data is automatically purged.
                  </p>
                  <div className="space-y-3">
                    {[
                      { type: 'Customer contact info (PII)', retention: '90 days', desc: 'Phone numbers and emails from review requests' },
                      { type: 'Reviews & replies', retention: 'Indefinite', desc: 'Stored until business deletes account' },
                      { type: 'AI draft history', retention: '1 year', desc: 'For brand voice training and quality improvement' },
                      { type: 'Audit logs', retention: '7 years', desc: 'Required for SOC2 and legal compliance' },
                      { type: 'Campaign analytics', retention: '2 years', desc: 'For trend analysis and reporting' },
                      { type: 'Webhook event logs', retention: '30 days', desc: 'For debugging and idempotency' },
                    ].map(item => (
                      <div key={item.type} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{item.type}</div>
                          <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {item.retention}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 glass-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-5 h-5 text-[var(--brass)]" />
                    <h3 className="font-display font-bold">Data Storage</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Region</div>
                      <div className="text-sm font-medium">US-East (Virginia)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Encryption</div>
                      <div className="text-sm font-medium">AES-256-GCM</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Backups</div>
                      <div className="text-sm font-medium">Daily + PITR</div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/20">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Replication</div>
                      <div className="text-sm font-medium">Multi-AZ</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/20">
                    <strong>EU data residency:</strong> Available on Enterprise tier. Contact sales to migrate your data to our EU (Frankfurt) region.
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

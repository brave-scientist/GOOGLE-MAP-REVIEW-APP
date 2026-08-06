import { LegalLayout } from '@/components/app/marketing-shell'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sparkles, Zap, Bug, Check } from 'lucide-react'

export const metadata = {
  title: 'Changelog — ReviewReply Enterprise',
  description: 'What is new in ReviewReply. Updated weekly.',
}

const RELEASES = [
  {
    version: '1.2.0',
    date: 'Aug 7, 2026',
    tag: 'major',
    highlights: [
      { type: 'feature', text: 'Real LLM integration via z-ai-web-dev-sdk — AI drafts now use Claude 3.5 Sonnet with brand voice prompts' },
      { type: 'feature', text: 'Developer Dashboard (owner-only) — total users, trials, MRR, signups chart, recent activity' },
      { type: 'feature', text: 'Google OAuth login — sign in with Google account' },
      { type: 'feature', text: 'Email OTP login — passwordless authentication via 6-digit code' },
      { type: 'feature', text: 'Campaign Builder modal — 3-step wizard to create and send campaigns' },
      { type: 'feature', text: 'Add Competitor modal — add competitors by name or Google Maps URL' },
      { type: 'feature', text: 'CSV Export — download reviews and campaigns as CSV' },
      { type: 'feature', text: 'Command Palette (Cmd+K) — global search and quick actions' },
      { type: 'feature', text: 'Integration connect/disconnect — toggle integrations from Settings' },
      { type: 'feature', text: 'Footer pages: Privacy, Terms, About, Blog, Help, Contact, Status, Changelog' },
    ],
  },
  {
    version: '1.1.0',
    date: 'Aug 6, 2026',
    tag: 'major',
    highlights: [
      { type: 'feature', text: 'Competitor Intelligence page — benchmark table, topic gap analysis, AI strategy suggestions' },
      { type: 'feature', text: 'Agency Dashboard — client leaderboard, white-label config, MRR tracking' },
      { type: 'feature', text: 'Reports page — scheduled reports, executive dashboard, report history' },
      { type: 'feature', text: 'Widgets page — 4 widget types, 6 color themes, live preview, embed code generator' },
      { type: 'feature', text: 'Compliance Center — GDPR DSAR, audit log, data retention, security checklist' },
      { type: 'feature', text: 'Billing page — 4 plans, monthly/annual toggle, usage meters, invoice history' },
      { type: 'feature', text: 'Reviews management page — stats, filters, grid layout' },
      { type: 'feature', text: 'Auth system — login, signup, logout, session middleware, RBAC roles' },
    ],
  },
  {
    version: '1.0.0',
    date: 'Aug 6, 2026',
    tag: 'release',
    highlights: [
      { type: 'release', text: 'Initial public release of ReviewReply Enterprise' },
      { type: 'feature', text: 'Premium marketing landing page with 13 sections' },
      { type: 'feature', text: 'Dashboard with sentiment trend chart, rating distribution, recent reviews' },
      { type: 'feature', text: 'Unified Inbox with AI draft generation, edit, approve & post workflow' },
      { type: 'feature', text: 'Analytics page with topic sentiment matrix, source breakdown' },
      { type: 'feature', text: 'Campaigns page with conversion funnel metrics' },
      { type: 'feature', text: 'Settings page with 5 tabs (business, integrations, billing, team, security)' },
      { type: 'feature', text: 'Premium dark theme with brass accents, glassmorphism, aurora gradients' },
      { type: 'feature', text: 'Mobile-responsive with bottom tab bar' },
      { type: 'feature', text: 'Prisma database with 8 models and 6 enums' },
      { type: 'feature', text: 'Seed data: 4 businesses, 119 reviews, 6 campaigns' },
    ],
  },
]

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  feature: { icon: Sparkles, color: 'text-[var(--brass)]', label: 'Feature' },
  bug: { icon: Bug, color: 'text-red-500', label: 'Bug Fix' },
  improvement: { icon: Zap, color: 'text-blue-500', label: 'Improvement' },
  release: { icon: Check, color: 'text-green-500', label: 'Release' },
}

export default function ChangelogPage() {
  return (
    <LegalLayout title="Changelog" lastUpdated="August 7, 2026">
      <p className="text-base text-muted-foreground mb-8">
        What is new in ReviewReply. We ship weekly — here is everything that has changed.
      </p>

      <div className="space-y-8">
        {RELEASES.map(release => (
          <div key={release.version}>
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" className="text-[10px] font-mono bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                v{release.version}
              </Badge>
              <h2 className="font-display text-xl font-bold">{release.date}</h2>
              {release.tag === 'major' && (
                <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-600 border-purple-500/30">
                  Major Release
                </Badge>
              )}
              {release.tag === 'release' && (
                <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30">
                  Initial Release
                </Badge>
              )}
            </div>
            <Card className="p-4 glass-card">
              <ul className="space-y-2.5">
                {release.highlights.map((h, i) => {
                  const cfg = typeConfig[h.type]
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <cfg.icon className={`w-4 h-4 ${cfg.color} flex-shrink-0 mt-0.5`} />
                      <span className="text-sm text-foreground/90">{h.text}</span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>
        ))}
      </div>
    </LegalLayout>
  )
}

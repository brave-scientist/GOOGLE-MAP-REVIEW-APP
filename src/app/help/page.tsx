import { LegalLayout } from '@/components/app/marketing-shell'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, MessageSquare, FileText, Mail, Phone, Book, Zap, Shield } from 'lucide-react'

export const metadata = {
  title: 'Help Center — ReviewReply Enterprise',
  description: 'Find answers, contact support, and learn how to get the most from ReviewReply.',
}

export default function HelpPage() {
  const categories = [
    {
      title: 'Getting Started',
      icon: Zap,
      articles: [
        'How to create your account',
        'Connecting Google Business Profile',
        'Connecting Facebook Pages',
        'Setting up your business profile',
        'Inviting team members',
      ],
    },
    {
      title: 'Review Management',
      icon: MessageSquare,
      articles: [
        'How to use the unified inbox',
        'Generating AI draft replies',
        'Editing and approving drafts',
        'Handling negative reviews',
        'Bulk actions and keyboard shortcuts',
      ],
    },
    {
      title: 'Campaigns',
      icon: FileText,
      articles: [
        'Creating your first campaign',
        'SMS vs Email: when to use each',
        'TCPA compliance for SMS',
        'QR code campaigns',
        'A/B testing message copy',
      ],
    },
    {
      title: 'Analytics',
      icon: Search,
      articles: [
        'Understanding sentiment scores',
        'Topic analysis explained',
        'Setting up alerts',
        'Exporting reports',
        'Competitor benchmarking',
      ],
    },
    {
      title: 'Billing & Plans',
      icon: Book,
      articles: [
        'Choosing the right plan',
        'Upgrading or downgrading',
        'Managing your subscription',
        'Understanding metered usage',
        'Canceling your account',
      ],
    },
    {
      title: 'Security & Privacy',
      icon: Shield,
      articles: [
        'How we protect your data',
        'GDPR compliance',
        'Managing cookies',
        'Requesting data export',
        'Deleting your account',
      ],
    },
  ]

  return (
    <LegalLayout title="Help Center" lastUpdated="August 2026">
      <div className="mb-8">
        <p className="text-base text-muted-foreground mb-4">
          Find answers to common questions, learn how to use ReviewReply, and get support when you need it.
        </p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search help articles..."
            className="w-full pl-9 pr-4 py-2 rounded-lg glass-card border-0 focus:outline-none focus:ring-2 focus:ring-[var(--brass)]/30 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {categories.map(cat => (
          <Card key={cat.title} className="p-5 glass-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10">
                <cat.icon className="w-4 h-4 text-[var(--brass)]" />
              </div>
              <h3 className="font-display font-bold text-sm">{cat.title}</h3>
            </div>
            <ul className="space-y-2">
              {cat.articles.map(article => (
                <li key={article}>
                  <a href="#" className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors">
                    {article}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="p-6 glass-card">
        <h3 className="font-display font-bold text-lg mb-2">Still need help?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Our support team is here to help. Reach out and we will get back to you within the SLA for your plan.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/contact">
            <Button variant="outline" className="w-full glass-card h-12 flex-col items-start">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--brass)]" />
                <span className="text-sm font-medium">Email Support</span>
              </div>
              <span className="text-[10px] text-muted-foreground">support@reviewreply.com</span>
            </Button>
          </Link>
          <Button variant="outline" className="w-full glass-card h-12 flex-col items-start">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--brass)]" />
              <span className="text-sm font-medium">Live Chat</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Mon–Fri 9am–6pm PT</span>
          </Button>
          <Button variant="outline" className="w-full glass-card h-12 flex-col items-start">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--brass)]" />
              <span className="text-sm font-medium">Phone (Enterprise)</span>
            </div>
            <span className="text-[10px] text-muted-foreground">+1 415-555-0100</span>
          </Button>
        </div>
      </Card>
    </LegalLayout>
  )
}

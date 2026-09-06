import { LegalLayout } from '@/components/app/marketing-shell'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Search, MessageSquare, FileText, Mail, Phone, Book, Zap, Shield } from 'lucide-react'

export const metadata = {
  title: 'Help Center — ReviewReply Enterprise',
  description: 'Find answers, contact support, and learn how to get the most from ReviewReply.',
}

const HELP_CATEGORIES = [
  {
    title: 'Getting Started',
    icon: Zap,
    articles: [
      {
        q: 'How to create your account',
        a: 'Click "Sign up free" on the homepage or login page. Enter your name, work email, and a password (min 8 characters). On step 2, enter your business name and select your industry. Click "Create account & start trial" — your 14-day free trial starts immediately, no credit card required. We automatically seed 5 demo reviews so you can explore the product right away.',
      },
      {
        q: 'Connecting Google Business Profile',
        a: 'Go to Settings → Integrations → find "Google Business Profile" and click "Connect." You will be redirected to Google\'s OAuth consent screen. After granting permission, we pull your last 100 reviews automatically. New reviews are fetched every 15 minutes. You can disconnect at any time — we immediately stop fetching and delete your OAuth tokens.',
      },
      {
        q: 'Connecting Facebook Pages',
        a: 'Go to Settings → Integrations → find "Facebook Pages" and click "Connect." You will be redirected to Facebook\'s OAuth flow. Grant the requested permissions (pages_manage_metadata, pages_read_engagement). We pull reviews from all pages you manage. Reviews are fetched hourly. Disconnect anytime from the same settings page.',
      },
      {
        q: 'Setting up your business profile',
        a: 'Go to Settings → Business. Enter your business name, industry, timezone, address, phone, and reply-from email. The timezone is used for quiet hours enforcement (9am–8pm) on SMS campaigns. The reply-from email is used when customers reply to your review responses. Click "Save changes" — updates take effect immediately.',
      },
      {
        q: 'Inviting team members',
        a: 'Go to Settings → Team. Click "Invite member." Enter their email and select a role (Admin, Staff, or Viewer). They receive an email invitation with a signup link. Once they accept, they appear in your team list. Pro plan includes 5 seats; Enterprise includes unlimited.',
      },
    ],
  },
  {
    title: 'Review Management',
    icon: MessageSquare,
    articles: [
      {
        q: 'How to use the unified inbox',
        a: 'The Inbox page shows all reviews across Google Business Profile and Facebook Pages in one feed. Use the filter bar at the top to filter by status (All, Pending, Escalated, Replied). Use the search box to find reviews by author name, text content, or title. Click any review to open the detail drawer where you can generate an AI draft, edit it, and approve it for posting.',
      },
      {
        q: 'Generating AI draft replies',
        a: 'Open any review from the Inbox. If no draft exists, click "Generate draft." The ReviewReply AI Engine analyzes the review and generates a contextually appropriate reply in 2–5 seconds. The draft references the customer\'s name, the business name, and specific details from their review. You can regenerate the draft (with "Regenerate" button) for a fresh variation.',
      },
      {
        q: 'Editing and approving drafts',
        a: 'After generating a draft, click "Edit" to modify the text inline. Once satisfied, click "Approve & Post" to publish the reply to the review platform (Google/Facebook). You can also "Reject" the draft if you prefer to write your own reply. All actions are logged in the audit trail.',
      },
      {
        q: 'Handling negative reviews',
        a: 'Negative reviews (1–2 stars) are automatically flagged as "Escalated" in the inbox. The AI generates an empathetic, non-defensive draft that apologizes and offers to make it right. For reviews containing legal keywords (lawsuit, lawyer, BBB), the AI generates an escalation response asking the customer to contact management directly — no apology or fault admission.',
      },
      {
        q: 'Quick navigation and command palette',
        a: 'Press Cmd+K (Mac) or Ctrl+K (Windows) anywhere in the app to open the Command Palette for quick search and navigation across locations, reviews, and settings.',
      },
    ],
  },
  {
    title: 'Campaigns',
    icon: FileText,
    articles: [
      {
        q: 'Creating your first campaign',
        a: 'Go to Campaigns → "New campaign." Step 1: Enter a name (e.g., "Post-visit follow-up") and select channels (SMS, Email, QR). Step 2: Write your message template — use {{name}} for the customer\'s name. Step 3: Add recipients (name + phone/email). Click "Send to N recipients" to launch immediately, or "Save as draft" to send later.',
      },
      {
        q: 'SMS vs Email: when to use each',
        a: 'SMS has a 98% open rate (vs 20% for email) but costs $0.035/message. Use SMS for time-sensitive review requests (e.g., right after a visit). Email is free and better for longer messages or when you want to include images. For best results, send SMS to mobile customers and email to desktop users. Our campaign builder supports both simultaneously.',
      },
      {
        q: 'TCPA compliance for SMS',
        a: 'All SMS campaigns are TCPA-compliant by default: (1) We enforce 9am–8pm quiet hours in the recipient\'s timezone, (2) STOP/UNSUBSCRIBE keywords are auto-processed within 24 hours, (3) We register your 10DLC campaign with Twilio, (4) Consent timestamps are recorded. You must still capture explicit opt-in from customers — add a checkbox to your intake forms.',
      },
      {
        q: 'QR code campaigns',
        a: 'QR code campaigns generate a printable QR poster that customers can scan to leave a review. Go to Campaigns → New campaign → select "QR Code" channel. We generate a unique QR code linking to your Google review page. Download the PNG and print it for your counter, receipts, or table tents. Track scans in the campaign analytics.',
      },
      {
        q: 'A/B testing message copy',
        a: 'When creating a campaign, you can add multiple message variants. We automatically split recipients evenly across variants and track which generates more reviews. After 100+ sends, we auto-promote the winning variant. This feature is available on Pro and Enterprise plans.',
      },
    ],
  },
  {
    title: 'Analytics',
    icon: Search,
    articles: [
      {
        q: 'Understanding sentiment scores',
        a: 'Each review is assigned a sentiment score from -1.0 (very negative) to +1.0 (very positive). The score is calculated by our AI based on the review text — not just the star rating. A 4-star review with text complaining about wait times may have a sentiment of +0.3, while a 5-star review with enthusiastic language may score +0.9. The dashboard shows your average sentiment trend over time.',
      },
      {
        q: 'Topic analysis explained',
        a: 'We extract topics from each review (food, service, cleanliness, atmosphere, value, wait-time, etc.) and calculate sentiment per topic. This lets you see that "food" sentiment is +0.8 but "wait-time" is -0.2 — pinpointing exactly where to improve. The Topic Sentiment Matrix on the Analytics page shows this for all topics side by side.',
      },
      {
        q: 'Setting up alerts',
        a: 'Go to Reports → Scheduled → "New report." Choose a trigger: daily digest (9am), weekly summary (Monday), or real-time alert (rating ≤ 2). Select recipients and channel (email, SMS, or both). For real-time alerts, we notify you within 30 seconds of a negative review being posted. Slack integration is available on Enterprise plans.',
      },
      {
        q: 'Exporting reports',
        a: 'Go to Reviews or Campaigns page and click "Export." We generate a CSV file with all data (author, rating, text, sentiment, topics, reply status, dates). The file downloads immediately. For scheduled PDF reports, go to Reports → Scheduled and configure a daily, weekly, or monthly report emailed to your inbox.',
      },
      {
        q: 'Competitor benchmarking',
        a: 'Go to Competitors → "Add competitor." Enter their business name or Google Maps URL. We fetch their rating, review count, and review velocity weekly. The benchmark table shows how you compare. The Topic Gap Analysis shows where you are winning or losing by topic. AI Strategy Suggestions generate actionable recommendations based on the gap analysis.',
      },
    ],
  },
  {
    title: 'Billing & Plans',
    icon: Book,
    articles: [
      {
        q: 'Choosing the right plan',
        a: 'Free: 1 business, 50 reviews/month, manual replies — best for solo operators testing the waters. Starter ($49/mo): 1 business, 500 reviews, AI drafts — for single-location businesses. Pro ($99/mo): 3 businesses, unlimited reviews, brand voice, competitor intel — for multi-location or growing teams. Enterprise ($299/mo): unlimited businesses, agency mode, white-label, bulk actions across clients — for agencies and chains.',
      },
      {
        q: 'Upgrading or downgrading',
        a: 'Go to Billing → Plans. Click "Upgrade" on your desired plan. You will be redirected to Stripe checkout. Upgrades take effect immediately and are pro-rated. Downgrades take effect at the end of your current billing period — you retain access to the higher tier until then. No contracts — change or cancel anytime.',
      },
      {
        q: 'Managing your subscription',
        a: 'Go to Billing → "Manage subscription" to access the Stripe customer portal. From there you can: update your payment method, view invoices, change billing email, cancel subscription, or update your business address. All changes are reflected in ReviewReply within 60 seconds.',
      },
      {
        q: 'Understanding metered usage',
        a: 'SMS messages and AI draft generations are metered. Each plan includes a monthly quota (Starter: 100 SMS, Pro: 500 SMS, Enterprise: 2000 SMS). Usage beyond the quota is billed at $0.035/SMS and $0.02/AI draft. View your current usage on Billing → Usage. Overage charges appear on your next monthly invoice.',
      },
      {
        q: 'Canceling your account',
        a: 'Go to Billing → Manage subscription → Cancel. Your subscription remains active until the end of the current billing period. After cancellation, your account downgrades to Free tier. Your data is retained for 30 days — if you reactivate within that window, everything is restored. After 30 days, all data is permanently deleted (except audit logs, retained 7 years for compliance).',
      },
    ],
  },
  {
    title: 'Security & Privacy',
    icon: Shield,
    articles: [
      {
        q: 'How we protect your data',
        a: 'All data is encrypted at rest (AES-256-GCM) and in transit (TLS 1.3). PII (customer phone/email) is encrypted with KMS-managed keys. Row-Level Security (RLS) in our database ensures you can only access your own organization\'s data. We never store passwords in plaintext — all passwords are hashed. OAuth tokens for Google/Facebook are encrypted and never exposed.',
      },
      {
        q: 'GDPR compliance',
        a: 'We are fully GDPR-compliant. You can export all your data (DSAR) from Settings → Compliance → GDPR → "Export my data." You can request deletion ("right to be forgotten") from the same page — deletion is processed within 30 days. Audit logs are retained for 7 years for legal compliance, even after account deletion. EU data residency is available on Enterprise plans.',
      },
      {
        q: 'Managing cookies',
        a: 'We use three categories of cookies: Essential (required for login — cannot be disabled), Analytics (anonymized usage data — opt-out anytime), and Marketing (retargeting — opt-in only). Manage your preferences from the cookie consent banner or Settings → Compliance → GDPR → Cookie Consent.',
      },
      {
        q: 'Requesting data export',
        a: 'Go to Settings → Compliance → GDPR → "Export my data." We compile all your account data (businesses, reviews, replies, campaigns, team members, audit logs) into a JSON file and email you a secure download link within 30 days. The export includes everything we have stored about your account.',
      },
      {
        q: 'Deleting your account',
        a: 'Go to Settings → Compliance → GDPR → "Request deletion." We schedule your account for deletion in 30 days (grace period). During this time, you can cancel the deletion by logging in. After 30 days, all data is permanently purged — businesses, reviews, replies, campaigns, team members. Audit logs are retained for 7 years as required by law.',
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <LegalLayout title="Help Center" lastUpdated="August 2026">
      <div className="mb-8">
        <p className="text-base text-muted-foreground mb-4">
          Find answers to common questions, learn how to use ReviewReply, and get support when you need it. Click any question to expand the answer.
        </p>
      </div>

      <div className="space-y-6">
        {HELP_CATEGORIES.map(cat => (
          <Card key={cat.title} className="p-5 glass-card">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10">
                <cat.icon className="w-4 h-4 text-[var(--brass)]" />
              </div>
              <h3 className="font-display font-bold text-sm">{cat.title}</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">{cat.articles.length} articles</span>
            </div>
            <Accordion type="single" collapsible className="space-y-1">
              {cat.articles.map(article => (
                <AccordionItem key={article.q} value={article.q} className="border-0">
                  <AccordionTrigger className="text-left hover:no-underline py-3 px-3 rounded-lg hover:bg-accent/30 transition-colors text-sm font-medium">
                    {article.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 px-3">
                    {article.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        ))}
      </div>

      <Card className="p-6 glass-card mt-8">
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

import { LegalLayout } from '@/components/app/marketing-shell'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, ArrowLeft, Star } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Blog — ReviewReply Enterprise',
  description: 'Insights on review management, local SEO, and customer experience.',
}

const POSTS: Record<string, { title: string; excerpt: string; category: string; date: string; readTime: string; content: string[] }> = {
  'how-ai-is-transforming-review-management': {
    title: 'How AI is Transforming Review Management in 2026',
    excerpt: 'Generic ChatGPT replies are dead. Brand-voice-trained AI is the new standard. Here is how it works and why it matters for your business.',
    category: 'AI',
    date: 'Aug 5, 2026',
    readTime: '7 min',
    content: [
      'For the past two years, businesses have experimented with AI-generated review replies. The results have been underwhelming — customers can spot a ChatGPT reply from a mile away. The tone is generic, the structure is predictable, and the personalization is shallow.',
      'In 2026, a new approach is emerging: brand-voice-trained AI. Instead of using a generic prompt, the AI is fine-tuned on each business\'s historical replies — learning their tone, length, signature phrases, and escalation rules. The result is drafts that sound like the owner wrote them.',
      'At ReviewReply, we use GLM-4.6 (via z-ai-web-dev-sdk) with a per-business brand voice profile. The profile is built from your last 50–200 approved replies and is encrypted at rest. Every draft is generated using this profile as the system prompt, plus 5-shot examples from your best replies.',
      'The results speak for themselves: businesses using brand-voice-trained AI see a 94% draft approval rate (vs 31% for generic AI), and customers report that replies feel "personal" and "authentic" — even when they know AI was involved.',
      'If you are still copy-pasting from ChatGPT, you are leaving time on the table and risking customer trust. Brand-voice AI is now table stakes for any serious review management workflow.',
    ],
  },
  'local-seo-ranking-factors-2026': {
    title: 'The 7 Local SEO Ranking Factors That Actually Matter in 2026',
    excerpt: 'Google\'s local algorithm keeps evolving. We analyzed 10,000 Google Business Profile listings to find what really moves the needle.',
    category: 'Local SEO',
    date: 'Jul 28, 2026',
    readTime: '12 min',
    content: [
      'Local SEO is the lifeblood of multi-location businesses. But with Google constantly updating its algorithm, it is hard to know what actually matters. We analyzed 10,000 Google Business Profile listings across 6 industries to identify the real ranking factors.',
      '1. Review Velocity (weight: 24%) — The number of new reviews per week matters more than total reviews. A business with 50 reviews but 5 new per week outranks one with 500 reviews but 0 new per week. Consistency is key.',
      '2. Review Recency (weight: 19%) — Reviews older than 90 days carry minimal weight. Google wants to see what customers think NOW, not last year. This is why ongoing review request campaigns are critical.',
      '3. Rating (weight: 16%) — Average rating still matters, but the threshold is 4.3. Below 4.3, you drop out of the top 3 for most queries. Above 4.7, diminishing returns kick in.',
      '4. Review Keyword Density (weight: 14%) — Reviews that mention your primary service keyword (e.g., "best sushi in San Francisco") boost rankings for that keyword. Encourage customers to be specific.',
      '5. Response Rate (weight: 12%) — Responding to reviews (especially negative ones) signals active management. Aim for 85%+ response rate within 24 hours.',
      '6. GBP Profile Completeness (weight: 9%) — Fill out every field: services, products, hours, attributes, photos. Each completed field is a signal.',
      '7. Citations and NAP Consistency (weight: 6%) — Your name, address, and phone should be identical across Google, Yelp, Apple Maps, Bing, and 50+ directories.',
      'The takeaway: focus on review velocity and recency first. A 4.6 rating with 8 new reviews per week will outrank a 4.9 rating with 0 new reviews. Run consistent campaigns.',
    ],
  },
  'tcpa-compliance-for-sms-review-requests': {
    title: 'TCPA Compliance for SMS Review Requests: A 2026 Guide',
    excerpt: 'One wrong text can cost you $500 per recipient. Here is how to stay compliant while running effective SMS review request campaigns.',
    category: 'Compliance',
    date: 'Jul 20, 2026',
    readTime: '9 min',
    content: [
      'The Telephone Consumer Protection Act (TCPA) is unforgiving. A single non-compliant SMS can trigger a $500 fine per recipient — and $1,500 per recipient for willful violations. For a campaign of 1,000 recipients, that is $500,000 to $1.5M in potential liability.',
      'Here is what you need to do to stay compliant:',
      '1. Get explicit written consent. Pre-checked boxes do not count. The customer must actively check a box acknowledging they agree to receive SMS. Capture the timestamp, IP, and consent text.',
      '2. Register a 10DLC campaign. Since 2022, US carriers require A2P 10DLC (Application-to-Person 10-Digit Long Code) registration for business SMS. Use Twilio to register your campaign and brand.',
      '3. Respect quiet hours. Do not send SMS outside 9am–8pm in the recipient\'s local timezone. Build timezone detection into your send logic.',
      '4. Handle opt-out keywords. STOP, UNSUBSCRIBE, CANCEL, END, and QUIT must be honored within 24 hours. Set up a webhook to process these automatically.',
      '5. Include identifying information. Every SMS must identify your business name. "Hi from Bamboo Garden" is compliant; "Hi" is not.',
      '6. Do not use shortened links without disclosure. If you use a branded short link, disclose it (e.g., "Leave a review: bamboogarden.com/r/abc123").',
      '7. Keep consent records for 4 years. If you get audited, you need to prove consent for every number you texted.',
      'ReviewReply handles all of this automatically — opt-in capture, 10DLC registration, quiet hours, opt-out processing, and consent record retention. But understanding the rules helps you design better campaigns and avoid costly mistakes.',
    ],
  },
  'case-study-bamboo-garden': {
    title: 'Case Study: How Bamboo Garden Went from 3.2 to 4.6 Stars in 90 Days',
    excerpt: 'A 3-location restaurant group used ReviewReply to transform their online reputation. Here is the exact playbook they used.',
    category: 'Case Study',
    date: 'Jul 12, 2026',
    readTime: '8 min',
    content: [
      'Bamboo Garden Restaurant Group operates 3 Chinese restaurants in the San Francisco Bay Area. In early 2026, they were struggling: their Google rating had slipped to 3.2 stars, they were losing foot traffic to a newer competitor, and negative reviews about wait times were piling up.',
      'They signed up for ReviewReply Pro in April 2026. Here is what happened over the next 90 days.',
      'Week 1-2: Setup and brand voice training. They connected their Google Business Profile and Facebook Pages. We pulled their last 200 reviews and trained a brand voice profile. The first AI drafts were surprisingly good — the owner approved 8 out of 10 without edits.',
      'Week 3-4: Review request campaign. They launched a post-visit SMS campaign to customers who had dined in the last 30 days. Within 2 weeks, they received 47 new reviews (vs their usual 4-5 per month). 38 were 4 or 5 stars.',
      'Week 5-8: Negative review recovery. They had 12 existing 1-2 star reviews that had never been responded to. Using AI drafts, they responded to all 12 with personalized apology + make-it-right offers. 3 customers updated their reviews to 4 stars after being contacted.',
      'Week 9-12: Operational improvements. Using the sentiment analytics, they identified "wait time" as their weakest topic (-0.4 sentiment). They hired a host and implemented a text-when-ready system. Within 4 weeks, wait-time sentiment improved to +0.1.',
      'The results: By day 90, their Google rating had climbed from 3.2 to 4.6. Review velocity went from 4/month to 18/month. Foot traffic increased 23% (attributed to improved local search visibility). And the owner now spends 15 minutes per week on reviews instead of 3 hours.',
      'The total cost: $297 (3 months of Pro plan). The ROI: measurable revenue increase far exceeding the cost.',
    ],
  },
  'competitor-intelligence-playbook': {
    title: 'The Competitor Intelligence Playbook: 5 Ways to Use Review Data',
    excerpt: 'Your competitors\' reviews are a goldmine of strategic insight. Here is how to extract actionable intelligence from them.',
    category: 'Strategy',
    date: 'Jul 5, 2026',
    readTime: '6 min',
    content: [
      'Most businesses treat competitor research as a quarterly exercise — a quick glance at the competitor\'s Google rating and a shrug. But with the right tools, competitor review data can become a continuous strategic advantage.',
      '1. Topic gap analysis. Run sentiment analysis on your competitors\' reviews by topic (food, service, cleanliness, value). If your competitor scores higher on "food" but lower on "service," you know where to differentiate.',
      '2. Velocity monitoring. Track how many reviews your competitors receive per week. A sudden spike (e.g., from 5/week to 18/week) usually means they launched a review request campaign. You should too.',
      '3. Response time benchmarking. How quickly do competitors respond to reviews? If your average response time is 6 hours and theirs is 1 hour, customers notice. Aim to be fastest in your market.',
      '4. Negative review patterns. What do customers complain about at your competitors? If 30% of negative reviews mention "rude staff," that is a weakness you can exploit in your marketing.',
      '5. Keyword opportunities. What keywords appear in competitor reviews that you are not ranking for? If customers search "best dim sum in SF" and your competitor gets that mention, you need to encourage your customers to use those words.',
      'ReviewReply\'s Competitor Intelligence module automates all of this. We pull competitor data weekly, run sentiment analysis, and generate AI strategy suggestions. The result: you always know where you stand and what to do next.',
    ],
  },
  'why-we-built-reviewreply': {
    title: 'Why We Built ReviewReply (And Why It Is Different)',
    excerpt: 'A founders\' perspective on the review management market and what we are doing differently.',
    category: 'Company',
    date: 'Jun 28, 2026',
    readTime: '5 min',
    content: [
      'When we started ReviewReply in early 2026, the review management market felt broken. On one end, you had Birdeye and Podium — powerful but expensive ($3,000+/month), with dated UIs and aggressive sales processes. On the other end, you had basic tools like Grade.us that were affordable but lacked AI and analytics.',
      'We saw a gap: a premium, modern, AI-powered platform at a price point that respects SMB budgets. A tool that feels like Linear or Vercel — not like enterprise software from 2015.',
      'Three things make ReviewReply different:',
      'First, brand-voice-trained AI. Every competitor now has "AI reply generation." None of them train the AI on your specific voice. We do. Your drafts sound like you, not like a chatbot.',
      'Second, competitor intelligence built in. Reputation.com offers this at $5,000+/month. We include it in every plan. You always know how you stack up against your top competitors.',
      'Third, a premium product experience. We obsess over design — micro-interactions, dark mode, command palette, glassmorphism. This is not vanity; it is retention. Users actually want to log in.',
      'We are not trying to be the cheapest. We are trying to be the best value — the platform that delivers 90% of Birdeye\'s features at 3% of the price, with a product experience that makes you want to use it every day.',
      'If that resonates with you, we would love to have you as a customer. Start a free trial — no credit card required.',
    ],
  },
}

export function generateStaticParams() {
  return Object.keys(POSTS).map(slug => ({ slug }))
}

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  // This is a synchronous wrapper since we can't use async in generateStaticParams mode
  // We'll use React.use() in the component body instead
  return <BlogPostContent params={params} />
}

import * as React from 'react'
function BlogPostContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params)
  const post = POSTS[slug]

  if (!post) {
    notFound()
  }

  return (
    <LegalLayout title={post.title} lastUpdated={post.date}>
      <div className="mb-8">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-[var(--brass)] hover:underline mb-4">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to blog
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="text-[10px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
            {post.category}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {post.date}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {post.readTime} read
          </span>
        </div>
        <p className="text-base text-muted-foreground leading-relaxed">{post.excerpt}</p>
      </div>

      <div className="space-y-4">
        {post.content.map((paragraph, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-12 pt-8 border-t border-border/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-[var(--brass)] fill-[var(--brass)]" />
            <span className="text-sm font-medium">Ready to try ReviewReply?</span>
          </div>
          <Link href="/signup">
            <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
              Start free trial
            </Button>
          </Link>
        </div>
      </div>
    </LegalLayout>
  )
}

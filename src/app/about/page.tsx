import { LegalLayout } from '@/components/app/marketing-shell'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, Target, Heart, Zap, Globe, TrendingUp } from 'lucide-react'

export const metadata = {
  title: 'About — ReviewReply Enterprise',
  description: 'We are building the review management platform that businesses actually want to use.',
}

export default function AboutPage() {
  return (
    <LegalLayout title="About ReviewReply" lastUpdated="August 2026">
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">Our Mission</h2>
          <p className="text-base leading-relaxed">
            We believe every business deserves to be discovered by its best customers. Reviews are the modern word-of-mouth — they drive local search rankings, influence purchase decisions, and shape brand reputation. Yet most review management tools are clunky, expensive, and built for enterprise chains.
          </p>
          <p className="mt-3 text-base leading-relaxed">
            ReviewReply Enterprise exists to change that. We are building a premium, AI-powered platform that helps multi-location businesses and agencies manage reviews at scale — without the enterprise price tag or the dated UI.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">Our Story</h2>
          <p className="text-base leading-relaxed">
            ReviewReply was born in 2026 out of frustration. Our founders ran a multi-location restaurant group and spent hours every week manually responding to Google and Facebook reviews. The existing tools either cost $3,000+/month (Birdeye, Podium) or were too basic to handle multi-location workflows.
          </p>
          <p className="mt-3 text-base leading-relaxed">
            We built ReviewReply to be the tool we wished existed: a beautiful, modern, AI-powered platform that costs less than a single employee&apos;s hourly wage, drafts replies in our own voice, and gives us competitive intelligence no other tool offers.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">Our Values</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {[
              { icon: Zap, title: 'Speed over bureaucracy', desc: 'We ship fast, listen to customers, and iterate weekly. No corporate red tape.' },
              { icon: Heart, title: 'Customer obsession', desc: 'Every feature starts with a real customer pain point. We build what you need, not what looks good on a roadmap.' },
              { icon: Target, title: 'Quality over quantity', desc: 'We would rather ship one polished feature than ten half-baked ones. Design matters.' },
              { icon: Globe, title: 'Privacy by default', desc: 'Your data is yours. We encrypt everything, never sell data, and respect GDPR/CCPA from day one.' },
              { icon: TrendingUp, title: 'Transparency', desc: 'We publish our pricing, our roadmap, and our status. No opaque enterprise sales process.' },
              { icon: Users, title: 'Long-term thinking', desc: 'We are building for the next decade, not the next quarter. Every decision considers compounding value.' },
            ].map(v => (
              <div key={v.title} className="p-4 rounded-lg glass-card">
                <v.icon className="w-5 h-5 text-[var(--brass)] mb-2" />
                <h3 className="font-semibold text-sm text-foreground mb-1">{v.title}</h3>
                <p className="text-xs text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">By the Numbers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { stat: '7,200+', label: 'Businesses' },
              { stat: '1.2M+', label: 'Reviews managed' },
              { stat: '47', label: 'AI languages' },
              { stat: '99.9%', label: 'Uptime SLA' },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-lg glass-card text-center">
                <div className="font-display text-2xl font-bold text-gradient-brass">{s.stat}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">Our Approach to AI</h2>
          <p className="text-base leading-relaxed">
            We use Claude 3.5 Sonnet (via z-ai-web-dev-sdk) for our AI draft generation. Unlike competitors who use generic ChatGPT prompts, we train a per-business brand voice profile from your past 50–200 approved replies. This produces drafts that sound like you wrote them — not like a chatbot.
          </p>
          <p className="mt-3 text-base leading-relaxed">
            We believe AI should augment humans, not replace them. Every AI draft goes through an approval workflow. You can edit, regenerate, or reject. We never auto-post negative review replies — those always require human review.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">Join Us</h2>
          <p className="text-base leading-relaxed mb-4">
            We are hiring across engineering, design, customer success, and sales. If you are passionate about building tools that small businesses love, we would love to hear from you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup">
              <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
                Start free trial
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" className="glass-card">
                Contact us
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </LegalLayout>
  )
}

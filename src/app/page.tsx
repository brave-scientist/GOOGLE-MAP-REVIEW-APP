'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Star, MessageSquare, Send, Sparkles, TrendingUp, Users, Building2, Zap,
  Check, ArrowRight, ChevronDown, Menu, X, Globe, Bot, BarChart3, Eye,
  Shield, Clock, Globe2, Phone, Mail, QrCode, Bell, LineChart, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────
// Premium Landing Page — ReviewReply Enterprise
// Inspired by Linear, Vercel, Stripe, Framer, Cal.com
// ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [activeDemoTab, setActiveDemoTab] = useState<'inbox' | 'ai' | 'analytics' | 'widgets'>('inbox')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <ScrollProgressBar />
      <Nav scrolled={scrolled} onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} mobileMenuOpen={mobileMenuOpen} />
      <Hero />
      <LogoMarquee />
      <StatBar />
      <BentoFeatures />
      <LiveDemo activeTab={activeDemoTab} onTabChange={setActiveDemoTab} />
      <HowItWorks />
      <Comparison />
      <Testimonials />
      <Pricing billingCycle={billingCycle} onCycleChange={setBillingCycle} />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Scroll Progress Bar
// ─────────────────────────────────────────────────────────
function ScrollProgressBar() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY
      const height = document.documentElement.scrollHeight - window.innerHeight
      setProgress(height > 0 ? (scrolled / height) * 100 : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-[var(--brass-dark)] via-[var(--brass)] to-[var(--brass-light)] transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────
function Nav({ scrolled, onMobileMenuToggle, mobileMenuOpen }: {
  scrolled: boolean
  onMobileMenuToggle: () => void
  mobileMenuOpen: boolean
}) {
  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      scrolled ? 'py-3' : 'py-5'
    )}>
      <div className={cn(
        'mx-auto max-w-7xl px-4 sm:px-6 transition-all duration-300',
      )}>
        <nav className={cn(
          'flex items-center justify-between rounded-2xl px-4 sm:px-6 py-3 transition-all duration-300',
          scrolled
            ? 'glass-card shadow-lg shadow-black/5'
            : 'bg-transparent'
        )}>
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30 group-hover:shadow-lg group-hover:shadow-[var(--brass)]/50 transition-shadow">
              <Star className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">ReviewReply</span>
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] uppercase tracking-wider font-mono border-[var(--brass)]/40 text-[var(--brass)]">
              Enterprise
            </Badge>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {['Features', 'Pricing', 'Solutions', 'Comparisons', 'Resources'].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase()}`}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
              >
                {item}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer font-medium">
                Get Started
                <ArrowRight className="ml-1 w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 rounded-md hover:bg-accent/50 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden mx-4 mt-2 glass-card rounded-2xl p-4 shadow-xl">
          {['Features', 'Pricing', 'Solutions', 'Comparisons', 'Resources'].map((item) => (
            <Link
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={onMobileMenuToggle}
              className="block px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
            >
              {item}
            </Link>
          ))}
          <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
            <Link href="/login" onClick={onMobileMenuToggle}>
              <Button variant="ghost" size="sm" className="w-full">Log in</Button>
            </Link>
            <Link href="/signup" onClick={onMobileMenuToggle}>
              <Button size="sm" className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
                Get Started
                <ArrowRight className="ml-1 w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative pt-32 sm:pt-40 pb-20 sm:pb-32 aurora-bg">
      <div className="absolute inset-0 grid-overlay opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card mb-8 reveal in-view">
            <Sparkles className="w-3.5 h-3.5 text-[var(--brass)]" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Now with AI (GLM-4.6) brand voice training
            </span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            Turn every customer
            <br />
            into a{' '}
            <span className="text-gradient-brass">five-star review.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            ReviewReply Enterprise brings all your customer reviews into one unified inbox. AI trained on your brand voice drafts replies in seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mb-8">
            <Link href="/signup">
              <Button size="lg" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer font-medium px-7 h-12 text-base group">
                Start free trial
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button size="lg" variant="outline" className="h-12 text-base px-7 glass-card">
                <Eye className="mr-2 w-4 h-4" />
                Watch 2-min demo
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {['No credit card required', '14-day free trial', 'SOC2 in progress', 'Cancel anytime'].map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[var(--brass)]" />
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Floating dashboard mockup */}
        <div className="mt-16 sm:mt-20 relative">
          <HeroDashboardMockup />
        </div>
      </div>
    </section>
  )
}

function HeroDashboardMockup() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Glow behind */}
      <div className="absolute -inset-4 bg-gradient-to-br from-[var(--brass)]/20 via-transparent to-[var(--info)]/10 blur-3xl" />

      <div className="relative glass-card rounded-2xl shadow-2xl shadow-black/20 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          </div>
          <div className="ml-3 text-xs text-muted-foreground font-mono">reviewreply.pw/dashboard</div>
        </div>

        {/* Dashboard content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-card/30">
          {/* Stat cards */}
          {[
            { label: 'Total Reviews', value: '1,247', change: '+12%', icon: Star },
            { label: 'Avg Rating', value: '4.6', change: '+0.3', icon: TrendingUp },
            { label: 'Pending Replies', value: '8', change: '-2', icon: MessageSquare },
            { label: 'Conversion Rate', value: '32%', change: '+5%', icon: Target },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-background/60 border border-border/40 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{stat.label}</span>
                <stat.icon className="w-3.5 h-3.5 text-[var(--brass)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">{stat.value}</span>
                <span className="text-[10px] text-green-500 font-mono">{stat.change}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart preview */}
        <div className="p-4 pt-0">
          <div className="rounded-xl bg-background/60 border border-border/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium">Sentiment Trend — Last 8 weeks</span>
              <Badge variant="outline" className="text-[10px] font-mono text-[var(--brass)] border-[var(--brass)]/40">
                Live
              </Badge>
            </div>
            <div className="flex items-end gap-1.5 h-20">
              {[40, 55, 48, 62, 70, 65, 78, 85].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)] transition-all hover:opacity-80"
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground font-mono">
              {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'].map(w => <span key={w}>{w}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Logo Marquee
// ─────────────────────────────────────────────────────────
function LogoMarquee() {
  const logos = ['Bamboo Garden', 'Smile Studio', 'Urban Cuts', 'Pulse Fitness', 'The Daily Grind', 'Sunset Realty', 'Aroma Bistro', 'Quick Lube']
  return (
    <section className="py-16 border-y border-border/30 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground font-mono mb-8">
          Trusted by growing multi-location businesses
        </p>
        <div className="relative overflow-hidden">
          <div className="flex gap-12 animate-marquee">
            {[...logos, ...logos].map((logo, i) => (
              <div key={i} className="flex items-center gap-2 whitespace-nowrap opacity-60 hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] opacity-70" />
                <span className="font-display font-semibold text-sm">{logo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
      `}</style>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Bar
// ─────────────────────────────────────────────────────────
function StatBar() {
  const stats = [
    { value: '4.7', suffix: '★', label: 'Average rating lift in 90 days' },
    { value: '3.2', suffix: '×', label: 'More reviews than manual outreach' },
    { value: '<30', suffix: 's', label: 'Average AI draft reply time' },
    { value: '', suffix: '', label: 'Languages supported' },
  ]
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/40 rounded-2xl overflow-hidden">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-background p-6 sm:p-8 text-center hover:bg-accent/30 transition-colors">
              <div className="font-display text-4xl sm:text-5xl font-bold mb-2 text-gradient-brass">
                <CountUp value={stat.value} />
                <span className="text-2xl sm:text-3xl">{stat.suffix}</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-[200px] mx-auto leading-relaxed">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CountUp({ value }: { value: string }) {
  const [display, setDisplay] = useState(value.startsWith('<') ? '<0' : '0')
  const ref = useRef<HTMLSpanElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated) {
        setHasAnimated(true)
        const numeric = parseFloat(value.replace(/[^0-9.]/g, ''))
        if (!isNaN(numeric)) {
          const prefix = value.startsWith('<') ? '<' : ''
          const duration = 1500
          const steps = 60
          const inc = numeric / steps
          let current = 0
          const interval = setInterval(() => {
            current += inc
            if (current >= numeric) {
              setDisplay(`${prefix}${numeric}`)
              clearInterval(interval)
            } else {
              setDisplay(`${prefix}${Math.floor(current * 10) / 10}`)
            }
          }, duration / steps)
        }
      }
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value, hasAnimated])

  return <span ref={ref}>{display}</span>
}

// ─────────────────────────────────────────────────────────
// Bento Features
// ─────────────────────────────────────────────────────────
function BentoFeatures() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mb-16">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">Features</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            One platform. Every review channel. Zero noise.
          </h2>
          <p className="text-lg text-muted-foreground">
            Stop juggling five tabs and a spreadsheet. ReviewReply unifies every review source, every workflow, and every insight into one premium experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {/* Large card — Unified Inbox */}
          <Card className="md:col-span-2 md:row-span-2 p-6 lg:p-8 glass-card hover:border-[var(--brass)]/30 transition-all group">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold">Unified Review Inbox</h3>
                <p className="text-sm text-muted-foreground mt-1">All your review sources in one place</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Every review from every source, in one filterable, searchable, actionable stream. Bulk-assign, bulk-approve, snooze, escalate — all with keyboard shortcuts.
            </p>
            {/* Mini inbox preview */}
            <div className="space-y-2">
              {[
                { author: 'Sarah C.', rating: 5, text: 'Absolutely phenomenal experience...', source: 'Google', time: '2m' },
                { author: 'Marcus W.', rating: 2, text: 'Disappointing visit, wait time...', source: 'Facebook', time: '14m' },
                { author: 'Priya P.', rating: 5, text: 'Best service in town, will...', source: 'Google', time: '1h' },
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/30 hover:border-[var(--brass)]/40 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center text-xs font-bold text-white">
                    {r.author[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{r.author}</span>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Star key={j} className={cn('w-3 h-3', j < r.rating ? 'text-[var(--brass)] fill-[var(--brass)]' : 'text-muted-foreground/30')} />
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono py-0 px-1.5">{r.source}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">{r.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Medium — AI Brand Voice */}
          <Card className="p-6 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">AI Brand Voice</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Trained on your replies</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              AI-powered learns your voice from past replies. Every draft sounds like you wrote it — not like ChatGPT.
            </p>
            <div className="rounded-lg bg-background/40 border border-border/30 p-3">
              <div className="text-xs font-mono text-[var(--brass)] mb-1">Draft reply · 2.3s</div>
              <p className="text-xs text-foreground/80 italic">"Thank you so much for the wonderful review, Sarah! We are thrilled..."</p>
            </div>
          </Card>

          {/* Medium — Multi-Channel */}
          <Card className="p-6 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">Multi-Channel Requests</h3>
                <p className="text-xs text-muted-foreground mt-0.5">SMS · Email · QR</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Send review requests by SMS, email, or QR poster. TCPA-compliant with automatic opt-out handling.
            </p>
            <div className="flex gap-2">
              {[Phone, Mail, QrCode, Globe].map((Icon, i) => (
                <div key={i} className="flex-1 p-2 rounded-lg bg-background/40 border border-border/30 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--brass)]" />
                </div>
              ))}
            </div>
          </Card>

          {/* Small — Sentiment Analytics */}
          <Card className="p-6 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="font-display font-bold text-sm">Sentiment Analytics</h3>
            </div>
            <div className="flex items-end gap-1 h-12 mb-2">
              {[60, 75, 45, 80, 65, 90, 70].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-[var(--brass-dark)] to-[var(--brass)]" style={{ height: `${h}%` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Topic-level sentiment trends and key topic extraction from every review.</p>
          </Card>

          {/* Small — Competitor Intel */}
          <Card className="p-6 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="font-display font-bold text-sm">Competitor Intel</h3>
            </div>
            <div className="space-y-1.5 mb-2">
              {[
                { name: 'You', rating: '4.6', width: '92%', color: 'var(--brass)' },
                { name: 'Comp A', rating: '4.3', width: '86%', color: 'var(--muted-foreground)' },
                { name: 'Comp B', rating: '4.1', width: '82%', color: 'var(--muted-foreground)' },
              ].map(c => (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="text-[10px] w-12 text-muted-foreground">{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-background/40 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: c.width, background: c.color }} />
                  </div>
                  <span className="text-[10px] font-mono w-6">{c.rating}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Benchmark against local competitors (demo data; real sync on roadmap).</p>
          </Card>

          {/* Small — Agency Mode */}
          <Card className="p-6 glass-card hover:border-[var(--brass)]/30 transition-all">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)]">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="font-display font-bold text-sm">Agency Mode</h3>
            </div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {['Client 1', 'Client 2', 'Client 3', 'Client 4', 'Client 5', '+42'].map((c, i) => (
                <div key={i} className={cn(
                  'p-1.5 rounded text-[9px] text-center border',
                  i === 5 ? 'border-dashed border-[var(--brass)]/40 text-[var(--brass)]' : 'border-border/30 text-muted-foreground bg-background/40'
                )}>
                  {c}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">White-label, client portal, per-seat pricing, RBAC.</p>
          </Card>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Live Demo (tabbed)
// ─────────────────────────────────────────────────────────
function LiveDemo({ activeTab, onTabChange }: {
  activeTab: 'inbox' | 'ai' | 'analytics' | 'widgets'
  onTabChange: (t: 'inbox' | 'ai' | 'analytics' | 'widgets') => void
}) {
  const tabs = [
    { id: 'inbox' as const, label: 'Inbox', icon: MessageSquare },
    { id: 'ai' as const, label: 'AI Reply', icon: Bot },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'widgets' as const, label: 'Widgets', icon: Globe },
  ]

  return (
    <section id="demo" className="py-24 sm:py-32 bg-card/20 border-y border-border/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">Live Demo</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            See ReviewReply in action
          </h2>
          <p className="text-lg text-muted-foreground">
            Click through the tabs to explore the actual product experience.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 p-1 mb-6 glass-card rounded-xl w-fit mx-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  activeTab === tab.id
                    ? 'bg-[var(--brass)] text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Demo content */}
          <div className="glass-card rounded-2xl p-6 sm:p-8 min-h-[400px]">
            {activeTab === 'inbox' && <InboxDemo />}
            {activeTab === 'ai' && <AIDemo />}
            {activeTab === 'analytics' && <AnalyticsDemo />}
            {activeTab === 'widgets' && <WidgetsDemo />}
          </div>

          <div className="mt-6 text-center">
            <Link href="/dashboard">
              <Button variant="outline" className="glass-card">
                Try it yourself — start free trial
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function InboxDemo() {
  const reviews = [
    { author: 'Sarah Chen', rating: 5, text: 'Absolutely phenomenal experience. The staff went above and beyond...', source: 'google', time: '2 minutes ago', status: 'pending' },
    { author: 'Marcus Webb', rating: 2, text: 'Disappointing visit. The wait time was over 45 minutes with no apology...', source: 'facebook', time: '14 minutes ago', status: 'pending' },
    { author: 'Priya Patel', rating: 5, text: 'Best service in town. I have been coming here for years and the quality...', source: 'yelp', time: '1 hour ago', status: 'replied' },
    { author: 'James Rodriguez', rating: 4, text: 'Great experience overall. The staff was friendly and the service was...', source: 'google', time: '3 hours ago', status: 'replied' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-lg">Unified Inbox</h3>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">4 reviews</Badge>
          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">2 pending</Badge>
        </div>
      </div>
      {reviews.map((r, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/30 hover:border-[var(--brass)]/40 transition-colors">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center text-sm font-bold text-white">
            {r.author[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium">{r.author}</span>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className={cn('w-3 h-3', j < r.rating ? 'text-[var(--brass)] fill-[var(--brass)]' : 'text-muted-foreground/30')} />
                ))}
              </div>
              <Badge variant="outline" className="text-[9px] font-mono uppercase">{r.source}</Badge>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{r.time}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-1.5">{r.text}</p>
            {r.status === 'pending' ? (
              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">Pending reply</Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30">Replied</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AIDemo() {
  return (
    <div>
      <div className="flex items-start gap-3 mb-4 p-4 rounded-lg bg-background/40 border border-border/30">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">M</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">Marcus Webb</span>
            <div className="flex">
              {[1, 2].map(i => <Star key={i} className="w-3 h-3 text-red-400 fill-red-400" />)}
              {[3, 4, 5].map(i => <Star key={i} className="w-3 h-3 text-muted-foreground/30" />)}
            </div>
            <Badge variant="outline" className="text-[9px] font-mono">Facebook</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Disappointing visit. The wait time was over 45 minutes with no apology or explanation. The staff seemed overwhelmed and disorganized.</p>
        </div>
      </div>

      <div className="ml-12 p-4 rounded-lg bg-[var(--brass)]/5 border border-[var(--brass)]/30">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-mono text-[var(--brass)]">Draft reply · AI (GLM-4.6) · 2.3s</span>
        </div>
        <p className="text-sm text-foreground/90 italic mb-3">
          "Marcus, we are truly sorry to hear that your experience at Bamboo Garden fell short of expectations. This is not the standard we hold ourselves to, and we would like to make it right. Please reach out to us directly at hello@bamboogarden.com or call us during business hours — we would love the opportunity to turn this around for you."
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs">
            <Check className="w-3 h-3 mr-1" /> Approve & Copy
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs">Edit</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">Regenerate</Button>
        </div>
      </div>
    </div>
  )
}

function AnalyticsDemo() {
  return (
    <div>
      <h3 className="font-display font-bold text-lg mb-4">Sentiment & Topic Analytics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Avg Sentiment', value: '+0.62', change: '+12%' },
          { label: 'Topics Tracked', value: '12', change: '+3' },
          { label: 'Anomalies', value: '0', change: 'Stable' },
          { label: 'Response Time', value: '4.2h', change: '-38%' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg bg-background/40 border border-border/30">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">{s.label}</div>
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-[10px] text-green-500 font-mono">{s.change}</div>
          </div>
        ))}
      </div>
      <div className="p-4 rounded-lg bg-background/40 border border-border/30">
        <div className="text-xs font-medium mb-3">Topic Sentiment Matrix</div>
        <div className="space-y-2">
          {[
            { topic: 'food', sentiment: 0.82, count: 47 },
            { topic: 'service', sentiment: 0.71, count: 62 },
            { topic: 'cleanliness', sentiment: 0.65, count: 28 },
            { topic: 'wait-time', sentiment: -0.15, count: 18 },
            { topic: 'pricing', sentiment: 0.42, count: 22 },
          ].map(t => (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="text-xs w-20 text-muted-foreground font-mono">{t.topic}</span>
              <div className="flex-1 h-2 rounded-full bg-background/60 overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                <div
                  className={cn('h-full rounded-full', t.sentiment >= 0 ? 'bg-green-500' : 'bg-red-500')}
                  style={{ width: `${Math.abs(t.sentiment) * 50}%`, marginLeft: t.sentiment >= 0 ? '50%' : `${50 - Math.abs(t.sentiment) * 50}%` }}
                />
              </div>
              <span className={cn('text-xs font-mono w-12 text-right', t.sentiment >= 0 ? 'text-green-500' : 'text-red-500')}>
                {t.sentiment > 0 ? '+' : ''}{t.sentiment.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono w-8">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WidgetsDemo() {
  return (
    <div>
      <h3 className="font-display font-bold text-lg mb-4">Branded Review Widget</h3>
      <p className="text-sm text-muted-foreground mb-6">Embeddable widgets for your website. Auto-generated from positive reviews. SEO-friendly with JSON-LD schema.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { type: 'Carousel', desc: 'Auto-rotating reviews', count: '+247 reviews' },
          { type: 'Grid', desc: 'Static review grid', count: '+12 displayed' },
          { type: 'Badge', desc: 'Floating rating badge', count: '4.6★ average' },
        ].map(w => (
          <div key={w.type} className="p-4 rounded-lg bg-background/40 border border-border/30 hover:border-[var(--brass)]/40 transition-colors">
            <div className="aspect-video rounded-md bg-gradient-to-br from-[var(--brass)]/10 to-[var(--brass-dark)]/10 border border-[var(--brass)]/20 mb-3 flex items-center justify-center">
              <Globe className="w-8 h-8 text-[var(--brass)]/60" />
            </div>
            <div className="text-sm font-medium mb-1">{w.type}</div>
            <div className="text-xs text-muted-foreground mb-2">{w.desc}</div>
            <Badge variant="outline" className="text-[9px] font-mono text-[var(--brass)] border-[var(--brass)]/40">{w.count}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// How It Works
// ─────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Set up your business profile',
      desc: 'Enter your business name, details, and review links. Manage all your reviews from one clean, centralized dashboard.',
      icon: Globe2,
    },
    {
      num: '02',
      title: 'AI learns your brand voice',
      desc: 'AI analyzes review context and customer sentiment, drafting on-brand replies in seconds.',
      icon: Bot,
    },
    {
      num: '03',
      title: 'Approve, copy & publish',
      desc: 'Review and refine AI drafts, click Approve & Copy, and paste directly to Google, Facebook, Yelp, or your review platform.',
      icon: LineChart,
    },
  ]
  return (
    <section id="solutions" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">How It Works</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Live in 10 minutes. No engineer required.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brass)]/30 to-transparent" />

          {steps.map((step) => (
            <div key={step.num} className="relative text-center">
              <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full bg-[var(--brass)]/10 blur-xl" />
                <div className="relative w-20 h-20 rounded-full glass-card border-[var(--brass)]/30 flex items-center justify-center">
                  <step.icon className="w-8 h-8 text-[var(--brass)]" />
                </div>
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[var(--brass)] text-white text-xs font-bold flex items-center justify-center font-mono">
                  {step.num}
                </div>
              </div>
              <h3 className="font-display text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Comparison Table
// ─────────────────────────────────────────────────────────
function Comparison() {
  const features = [
    { name: 'Unified Review Inbox', rr: true, birdeye: true, podium: true, reputation: true },
    { name: 'AI Reply Draft Generation', rr: true, birdeye: true, podium: false, reputation: true },
    { name: 'Brand Voice Training', rr: true, birdeye: false, podium: false, reputation: false },
    { name: 'Multi-Channel Request (SMS + Email + QR)', rr: true, birdeye: true, podium: true, reputation: false },
    { name: 'Sentiment + Topic Analytics', rr: true, birdeye: true, podium: false, reputation: true },
    { name: 'Branded Review Widget', rr: true, birdeye: false, podium: false, reputation: true },
    { name: 'Multi-Tenant Agency Mode', rr: true, birdeye: true, podium: false, reputation: true },
  ]
  return (
    <section id="comparisons" className="py-24 sm:py-32 bg-card/20 border-y border-border/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">Comparison</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Why teams switch from Birdeye & Podium
          </h2>
        </div>

        <div className="overflow-x-auto scrollbar-premium -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="min-w-[700px] mx-auto">
            <div className="grid grid-cols-5 gap-px bg-border/40 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="bg-background p-4" />
              <div className="bg-[var(--brass)] p-4 text-center">
                <div className="font-display font-bold text-sm text-white">ReviewReply</div>
                <div className="text-[10px] text-white/80 font-mono mt-0.5">$49–$299/mo</div>
              </div>
              <div className="bg-background p-4 text-center">
                <div className="font-display font-bold text-sm">Birdeye</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">$3k–$10k/mo</div>
              </div>
              <div className="bg-background p-4 text-center">
                <div className="font-display font-bold text-sm">Podium</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">$399–$1.5k/mo</div>
              </div>
              <div className="bg-background p-4 text-center">
                <div className="font-display font-bold text-sm">Reputation</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">$5k–$25k/mo</div>
              </div>

              {/* Rows */}
              {features.map((f, i) => (
                <div key={f.name} className="contents">
                  <div className={cn('bg-background p-4 text-sm', i % 2 === 0 && 'bg-accent/20')}>{f.name}</div>
                  <div className={cn('bg-[var(--brass)]/10 p-4 flex items-center justify-center', i % 2 === 0 && 'bg-[var(--brass)]/15')}>
                    {f.rr ? <Check className="w-4 h-4 text-[var(--brass)]" /> : <X className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className={cn('bg-background p-4 flex items-center justify-center', i % 2 === 0 && 'bg-accent/20')}>
                    {f.birdeye ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className={cn('bg-background p-4 flex items-center justify-center', i % 2 === 0 && 'bg-accent/20')}>
                    {f.podium ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className={cn('bg-background p-4 flex items-center justify-center', i % 2 === 0 && 'bg-accent/20')}>
                    {f.reputation ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Testimonials
// ─────────────────────────────────────────────────────────
function Testimonials() {
  const [active, setActive] = useState(0)
  const testimonials = [
    {
      quote: 'We went from 3.2 to 4.6 stars on Google in 90 days. The AI replies sound exactly like me — customers cannot tell.',
      name: 'Sarah Chen',
      title: 'Owner',
      business: 'Bamboo Garden (3 locations)',
    },
    {
      quote: 'As an agency managing 47 clients, ReviewReply\'s white-label mode is a game-changer. We charge $299/client and the margin is 87%.',
      name: 'Marcus Webb',
      title: 'Founder',
      business: 'LocalEdge Agency',
    },
    {
      quote: 'The competitor benchmarking view is a great at-a-glance check on where we stand. Looking forward to the live Google Places sync when it ships — even the demo data helps us frame our positioning.',
      name: 'Dr. Priya Patel',
      title: 'Owner',
      business: 'Smile Studio Dental',
    },
  ]

  useEffect(() => {
    const interval = setInterval(() => setActive(a => (a + 1) % testimonials.length), 6000)
    return () => clearInterval(interval)
  }, [testimonials.length])

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">Testimonials</p>

        <div className="relative min-h-[280px] sm:min-h-[240px]">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={cn(
                'absolute inset-0 transition-all duration-500',
                i === active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              )}
            >
              <div className="flex justify-center mb-6">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className="w-5 h-5 text-[var(--brass)] fill-[var(--brass)]" />
                ))}
              </div>
              <blockquote className="font-display text-2xl sm:text-3xl font-medium leading-relaxed mb-8 text-foreground/90">
                "{t.quote}"
              </blockquote>
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-muted-foreground">{t.title}, {t.business}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-8 bg-[var(--brass)]' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              aria-label={`Testimonial ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────
function Pricing({ billingCycle, onCycleChange }: {
  billingCycle: 'monthly' | 'annual'
  onCycleChange: (c: 'monthly' | 'annual') => void
}) {
  const tiers = [
    {
      name: 'Free',
      price: { monthly: 0, annual: 0 },
      desc: 'For solo operators getting started.',
      features: ['1 business', '50 reviews/mo', 'Manual reply', 'Basic analytics', 'Community support'],
      cta: 'Get started',
      highlight: false,
    },
    {
      name: 'Starter',
      price: { monthly: 49, annual: 39 },
      desc: 'For single-location businesses.',
      features: ['1 business', '500 reviews/mo', 'AI draft replies', '1 widget', 'Email support', 'Sentiment analytics'],
      cta: 'Start free trial',
      highlight: false,
    },
    {
      name: 'Pro',
      price: { monthly: 99, annual: 79 },
      desc: 'For multi-location & growing teams.',
      features: ['3 businesses', 'Unlimited reviews', 'Brand voice training', 'All widgets', 'Competitor intel', 'Priority support', 'Scheduled reports'],
      cta: 'Start free trial',
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: { monthly: 299, annual: 239 },
      desc: 'For agencies & multi-location chains.',
      features: ['Unlimited businesses', 'Agency mode + white-label', 'Dedicated CSM', '99.9% SLA', 'Custom integrations', 'Bulk actions across clients'],
      cta: 'Talk to sales',
      highlight: false,
    },
  ]

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-card/20 border-y border-border/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">Pricing</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            No hidden fees. No contracts. Cancel anytime.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 glass-card rounded-full">
            <button
              onClick={() => onCycleChange('monthly')}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                billingCycle === 'monthly' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => onCycleChange('annual')}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5',
                billingCycle === 'annual' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Annual
              <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-[var(--brass)]/40 text-[var(--brass)]">Save 20%</Badge>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                'relative rounded-2xl p-6 flex flex-col',
                tier.highlight
                  ? 'glass-card border-2 border-[var(--brass)]/40 shadow-2xl shadow-[var(--brass)]/10 lg:scale-105'
                  : 'glass-card'
              )}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--brass)] text-white text-xs font-medium">
                  Most Popular
                </div>
              )}
              <div className="mb-4">
                <h3 className="font-display font-bold text-lg mb-1">{tier.name}</h3>
                <p className="text-xs text-muted-foreground">{tier.desc}</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">${tier.price[billingCycle]}</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                {billingCycle === 'annual' && (
                  <p className="text-xs text-[var(--brass)] mt-1">Billed annually</p>
                )}
              </div>
              <Link href="/signup" className="w-full mb-6">
                <Button
                  className={cn(
                    'w-full',
                    tier.highlight
                      ? 'bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer'
                      : 'glass-card hover:bg-accent'
                  )}
                  variant={tier.highlight ? 'default' : 'outline'}
                >
                  {tier.cta}
                </Button>
              </Link>
              <ul className="space-y-2.5 flex-1">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-[var(--brass)] flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────
function FAQ() {
  const faqs = [
    { q: 'How does the AI brand voice training work?', a: 'Upload your past 50–200 approved replies. AI (GLM-4.6) analyzes your tone, length, signature, escalation rules, and do-not-say list to create a private brand voice profile. The profile is encrypted at rest and used as the system prompt for every draft. We re-train weekly based on your accept/reject/edit rate.' },
    { q: 'Which review sources are supported?', a: 'The unified inbox supports reviews from Google Business Profile and Facebook Pages. Additional sources (Yelp, Trustpilot) are on our roadmap. You can also manually import reviews from any platform via CSV upload.' },
    { q: 'Is ReviewReply TCPA-compliant for SMS?', a: 'Yes. We capture explicit opt-in with timestamp and IP, enforce 9pm–8am recipient-local quiet hours, handle STOP/UNSTOP keywords within 24 hours, and register your 10DLC campaign with Twilio. All SMS sends are logged for audit.' },
    { q: 'Can I use ReviewReply if I am an agency?', a: 'Yes — the Enterprise tier ($299/mo) includes full agency mode: white-label on your domain, client portal, per-seat pricing, role-based access control, and bulk actions across all client businesses.' },
    { q: 'How long is the free trial?', a: '14 days, no credit card required. Full Pro features. Data is retained for 30 days after trial ends, so you can upgrade without losing anything.' },
    { q: 'Do you offer SSO for enterprise?', a: 'SSO/SAML and Google Workspace SSO are on our roadmap. Beta customers can use email-based authentication with Email & Password or fast Email OTP today.' },
    { q: 'What is your SOC2 status?', a: 'SOC2 Type I attestation is in progress. Type II monitoring starts at launch. Reports are available to enterprise customers under NDA.' },
    { q: 'Can I cancel anytime?', a: 'Yes, no contracts. Cancel from the self-serve billing portal. Annual plans get a pro-rated refund for unused months.' },
  ]
  return (
    <section id="resources" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-[var(--brass)] font-mono mb-3">FAQ</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
        </div>
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="glass-card rounded-xl px-5 border-border/30">
              <AccordionTrigger className="text-left hover:no-underline py-4">
                <span className="font-medium text-sm sm:text-base">{faq.q}</span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Final CTA
// ─────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden aurora-bg">
      <div className="absolute inset-0 grid-overlay opacity-30" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <h2 className="font-display text-4xl sm:text-6xl font-bold tracking-tight mb-6">
          Your next five-star review
          <br />
          is one click away.
        </h2>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Join growing businesses using ReviewReply to win local search, build trust, and turn every customer into a five-star advocate.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/signup">
            <Button size="lg" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer font-medium px-8 h-12 text-base group">
              Start free trial
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="glass-card h-12 text-base px-8">
            Book a demo
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {['No credit card', '14-day trial', 'Cancel anytime', 'SOC2 in progress'].map(b => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[var(--brass)]" />
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    {
      title: 'Product',
      links: [
        { name: 'Features', href: '/#features' },
        { name: 'Pricing', href: '/#pricing' },
        { name: 'Changelog', href: '/changelog' },
        { name: 'Status', href: '/status' },
      ],
    },
    {
      title: 'Solutions',
      links: [
        { name: 'Restaurants', href: '/signup' },
        { name: 'Dental', href: '/signup' },
        { name: 'Hospitality', href: '/signup' },
        { name: 'Agencies', href: '/signup' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { name: 'Blog', href: '/blog' },
        { name: 'Help Center', href: '/help' },
        { name: 'Contact', href: '/contact' },
        { name: 'About', href: '/about' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { name: 'Privacy', href: '/privacy' },
        { name: 'Terms', href: '/terms' },
        { name: 'Security', href: '/help' },
        { name: 'GDPR', href: '/privacy' },
      ],
    },
  ]
  return (
    <footer className="border-t border-border/30 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
          {/* Logo + newsletter */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
                <Star className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-display font-bold">ReviewReply</span>
            </Link>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Turn every customer into a five-star review.
            </p>
            <div className="flex gap-2">
              {[Globe, Mail, Bell].map((Icon, i) => (
                <div key={i} className="w-8 h-8 rounded-lg glass-card flex items-center justify-center hover:bg-accent/50 transition-colors cursor-pointer">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>

          {cols.map(col => (
            <div key={col.title}>
              <h4 className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-4 font-mono">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © 20 ReviewReply Enterprise. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[var(--brass)]" />
              SOC2 in progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--brass)]" />
              Target: 99.9% uptime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[var(--brass)]" />
              Powered by AI-powered
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

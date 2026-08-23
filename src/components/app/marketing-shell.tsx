'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
            <Star className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-display font-bold tracking-tight">ReviewReply</span>
        </Link>
        <div className="hidden md:flex items-center gap-1">
          <Link href="/#features" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors">
            Features
          </Link>
          <Link href="/#pricing" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors">
            Pricing
          </Link>
          {['About', 'Blog', 'Help'].map(item => (
            <Link key={item} href={`/${item.toLowerCase()}`} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors">
              {item}
            </Link>
          ))}
        </div>
        <Link href="/login">
          <button className="px-4 py-1.5 rounded-md text-xs sm:text-sm bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] transition-colors font-medium">
            Log in
          </button>
        </Link>
      </div>
    </header>
  )
}

export function MarketingFooter() {
  const cols = [
    {
      title: 'Product',
      links: [
        { name: 'Features', href: '/#features' },
        { name: 'Pricing', href: '/#pricing' },
        { name: 'Integrations', href: '/help' },
        { name: 'API Docs', href: '/help' },
        { name: 'Changelog', href: '/changelog' },
      ],
    },
    {
      title: 'Company',
      links: [
        { name: 'About', href: '/about' },
        { name: 'Blog', href: '/blog' },
        { name: 'Help Center', href: '/help' },
        { name: 'Contact', href: '/contact' },
        { name: 'Status', href: '/status' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { name: 'Privacy Policy', href: '/privacy' },
        { name: 'Terms of Service', href: '/terms' },
        { name: 'Data Processing', href: '/privacy' },
        { name: 'Security', href: '/help' },
        { name: 'GDPR', href: '/privacy' },
      ],
    },
  ]
  return (
    <footer className="border-t border-border/30 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center">
                <Star className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-display font-bold">ReviewReply</span>
            </Link>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Turn every customer into a five-star review.
            </p>
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
        <div className="mt-8 pt-6 border-t border-border/30 text-center">
          <p className="text-xs text-muted-foreground">© 2026 ReviewReply Enterprise. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export function LegalLayout({ title, lastUpdated, children }: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}

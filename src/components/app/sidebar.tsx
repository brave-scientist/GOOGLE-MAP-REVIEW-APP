'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Inbox, Star, Send, BarChart3, Code2, FileText,
  Settings, Sparkles, ChevronRight, Building2, CreditCard, Shield, Target, Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badge: '8' },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/campaigns', label: 'Campaigns', icon: Send },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/competitors', label: 'Competitors', icon: Target },
  { href: '/widgets', label: 'Widgets', icon: Code2 },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/agency', label: 'Agency', icon: Building2 },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <aside className="hidden lg:flex w-64 flex-col bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30 group-hover:shadow-lg group-hover:shadow-[var(--brass)]/50 transition-shadow">
            <Star className="w-4 h-4 text-white fill-white" />
          </div>
          <div>
            <div className="font-display font-bold text-sm leading-tight">ReviewReply</div>
            <div className="text-[10px] text-muted-foreground font-mono leading-tight">Enterprise</div>
          </div>
        </Link>
      </div>

      {/* Business switcher */}
      <div className="p-3 border-b border-sidebar-border">
        <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            BG
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">Bamboo Garden Group</div>
            <div className="text-[10px] text-muted-foreground truncate">4 businesses · Pro plan</div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-premium">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-2">
          Workspace
        </div>
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all group',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className={cn('w-4 h-4', active && 'text-[var(--brass)]')} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <Badge variant="outline" className="text-[9px] font-mono py-0 px-1.5 bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}

        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-2 mt-4">
          Account
        </div>
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
            pathname === '/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </Link>
        <Link
          href="/billing"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
            pathname === '/billing'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <CreditCard className="w-4 h-4" />
          <span>Billing</span>
        </Link>
        <Link
          href="/compliance"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
            pathname === '/compliance'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <Shield className="w-4 h-4" />
          <span>Compliance</span>
        </Link>
        <Link
          href="/admin"
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
            pathname === '/admin'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
        >
          <Crown className="w-4 h-4 text-[var(--brass)]" />
          <span>Developer</span>
          <Badge variant="outline" className="text-[8px] ml-auto bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
            OWNER
          </Badge>
        </Link>
      </nav>

      {/* Upgrade card */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--brass)]/10 to-transparent border border-[var(--brass)]/20">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--brass)]" />
            <span className="text-xs font-medium">12 days left in trial</span>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
            Upgrade to Pro for brand voice training and competitor intel.
          </p>
          <button
            onClick={() => router.push('/billing')}
            className="w-full text-xs bg-[var(--brass)] text-white py-1.5 rounded-md hover:bg-[var(--brass-dark)] transition-colors font-medium"
          >
            Upgrade plan
          </button>
        </div>
      </div>
    </aside>
  )
}

export function AppTopbar({ title, description }: { title: string; description?: string }) {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/agency')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent transition-colors border border-border"
          >
            <Building2 className="w-3.5 h-3.5" />
            All businesses
          </button>
          <button
            onClick={() => router.push('/campaigns')}
            className="px-3 py-1.5 rounded-md text-xs bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] transition-colors font-medium flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New campaign</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>
    </header>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const items = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/inbox', label: 'Inbox', icon: Inbox },
    { href: '/campaigns', label: 'Send', icon: Send },
    { href: '/analytics', label: 'Stats', icon: BarChart3 },
    { href: '/settings', label: 'More', icon: Settings },
  ]
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border">
      <div className="grid grid-cols-5">
        {items.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                active ? 'text-[var(--brass)]' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

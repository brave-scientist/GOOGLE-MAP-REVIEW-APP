'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Inbox, Star, Send, BarChart3, Code2, FileText,
  Settings, Sparkles, Building2, CreditCard, Shield, Target, Crown, Link2,
  LogOut, User as UserIcon, ChevronDown, Loader2, Check, Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useActiveBusiness } from '@/lib/business-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface MeResponse {
  user: { name: string | null; email: string; orgPlan: string | null } | null
  isAdmin: boolean
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/governance', label: 'Regional Ops', icon: Network },
  { href: '/campaigns', label: 'Campaigns', icon: Send },
  { href: '/review-us-page', label: 'Review Us Page', icon: Link2 },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/competitors', label: 'Competitors', icon: Target },
  { href: '/widgets', label: 'Widgets', icon: Code2 },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/agency', label: 'Agency', icon: Building2 },
]

export function UserProfileDropdown({ isCollapsed = false, onMeLoaded }: { isCollapsed?: boolean; onMeLoaded?: (res: MeResponse) => void }) {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string | null; email: string; orgPlan: string | null } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then((data: MeResponse) => {
        if (data?.user) {
          setUser(data.user)
        }
        onMeLoaded?.(data)
      })
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      toast.success('Signed out successfully')
      router.push('/login')
      router.refresh()
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const displayName = user?.name || user?.email?.split('@')[0] || 'My Account'
  const initials = displayName
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0">
            {initials || <UserIcon className="w-4 h-4" />}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate group-hover:text-foreground">{displayName}</div>
              <div className="text-[10px] text-muted-foreground truncate">{user?.email || 'Loading...'}</div>
            </div>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 glass-card">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-medium leading-none">{displayName}</p>
            <p className="text-[11px] leading-none text-muted-foreground truncate">{user?.email}</p>
            {user?.orgPlan && (
              <div className="pt-1">
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-mono border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/10">
                  {user.orgPlan} Plan
                </Badge>
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer text-xs">
          <Settings className="w-3.5 h-3.5 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/billing')} className="cursor-pointer text-xs">
          <CreditCard className="w-3.5 h-3.5 mr-2" />
          Billing & Plans
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={loading}
          className="cursor-pointer text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 focus:text-red-600 focus:bg-red-500/10"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <LogOut className="w-3.5 h-3.5 mr-2" />}
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const { businesses, activeBusiness, setActiveBusinessId } = useActiveBusiness()

  const [billingInfo, setBillingInfo] = useState<{
    status?: string
    plan?: string
    trialEndsAt?: string | null
  } | null>(null)

  useEffect(() => {
    // Fetch live pending-reply count for Inbox badge.
    // Uses pagination.total from the existing inbox API — no new endpoint needed.
    fetch('/api/inbox?status=pending&limit=1')
      .then(r => r.ok ? r.json() : null)
      .then((data: { pagination?: { total: number } } | null) => {
        if (data?.pagination?.total !== undefined) {
          setPendingCount(data.pagination.total)
        }
      })
      .catch(() => {}) // silent failure — badge simply won't show

    // Fetch authoritative billing state for trial/plan banner
    fetch('/api/billing')
      .then(r => r.ok ? r.json() : null)
      .then((data: { status?: string; plan?: string; trialEndsAt?: string | null } | null) => {
        if (data) {
          setBillingInfo({
            status: data.status,
            plan: data.plan,
            trialEndsAt: data.trialEndsAt,
          })
        }
      })
      .catch(() => {})
  }, [])

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

      {/* Active Business Switcher */}
      <div className="p-3 border-b border-sidebar-border">
        {businesses.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left group">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {activeBusiness?.name ? activeBusiness.name.slice(0, 2).toUpperCase() : 'BG'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate group-hover:text-foreground">
                    {activeBusiness?.name || 'Select location'}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {businesses.length} locations · Switch
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 glass-card">
              <DropdownMenuLabel className="text-xs">Active Location</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {businesses.map(b => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => setActiveBusinessId(b.id)}
                  className="cursor-pointer text-xs flex items-center justify-between"
                >
                  <span className="truncate">{b.name}</span>
                  {b.id === activeBusiness?.id && <Check className="w-3 h-3 text-[var(--brass)] flex-shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/agency')} className="cursor-pointer text-xs">
                <Building2 className="w-3.5 h-3.5 mr-2" />
                Manage all locations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            href="/agency"
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {activeBusiness?.name ? activeBusiness.name.slice(0, 2).toUpperCase() : 'BG'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{activeBusiness?.name || 'Manage businesses'}</div>
              <div className="text-[10px] text-muted-foreground truncate">View all locations</div>
            </div>
            <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </Link>
        )}
      </div>

      {/* User Profile — also provides isAdmin signal */}
      {/* NOTE: UserProfileDropdown fetches /api/auth/me; we piggyback on that */}
      {/* The UserProfileDropdown in the bottom section handles this */}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-premium">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-2">
          Workspace
        </div>
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
          // For Inbox, show a live pending count instead of a hardcoded badge
          const badgeValue =
            item.href === '/inbox' && pendingCount !== null && pendingCount > 0
              ? pendingCount > 99 ? '99+' : String(pendingCount)
              : undefined
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
              {badgeValue && (
                <Badge variant="outline" className="text-[9px] font-mono py-0 px-1.5 bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                  {badgeValue}
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
        {isAdmin && (
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
        )}
      </nav>

      {/* User Profile & Logout section */}
      <div className="p-3 border-t border-sidebar-border">
        <UserProfileDropdown onMeLoaded={(res) => setIsAdmin(res.isAdmin)} />
      </div>

      {/* Upgrade / Trial card — authoritative billing state */}
      {(() => {
        const isTrialing = billingInfo?.status === 'trialing' && !!billingInfo.trialEndsAt
        let trialText: string | null = null
        if (isTrialing && billingInfo?.trialEndsAt) {
          const msLeft = new Date(billingInfo.trialEndsAt).getTime() - Date.now()
          if (msLeft > 0) {
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
            trialText = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left in trial`
          } else {
            trialText = 'Trial expired'
          }
        }
        const isFreePlan = billingInfo?.plan === 'FREE' && billingInfo?.status !== 'trialing'

        if (!trialText && !isFreePlan) return null

        return (
          <div className="p-3 pt-0">
            <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--brass)]/10 to-transparent border border-[var(--brass)]/20">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--brass)]" />
                <span className="text-xs font-medium">{trialText || 'Free Plan'}</span>
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
        )
      })()}
    </aside>
  )
}

export function AppTopbar({ title, description }: { title: string; description?: string }) {
  const router = useRouter()
  const { businesses, activeBusiness, setActiveBusinessId } = useActiveBusiness()

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {businesses.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-foreground bg-accent/40 hover:bg-accent/70 transition-colors border border-border">
                  <Building2 className="w-3.5 h-3.5 text-[var(--brass)]" />
                  <span className="max-w-[130px] truncate">{activeBusiness?.name || 'Select location'}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-card">
                <DropdownMenuLabel className="text-xs">Active Location</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {businesses.map(b => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => setActiveBusinessId(b.id)}
                    className="cursor-pointer text-xs flex items-center justify-between"
                  >
                    <span className="truncate">{b.name}</span>
                    {b.id === activeBusiness?.id && <Check className="w-3 h-3 text-[var(--brass)] flex-shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
          <div className="hidden sm:block">
            <UserProfileDropdown isCollapsed />
          </div>
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

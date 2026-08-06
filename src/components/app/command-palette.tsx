'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard, Inbox, Star, Send, BarChart3, Code2, FileText,
  Settings, CreditCard, Shield, Target, Building2, Plus, Search,
  Sparkles, Bot, Users, Zap,
} from 'lucide-react'

const NAV_COMMANDS = [
  { label: 'Dashboard', desc: 'View overview and stats', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Unified Inbox', desc: 'All reviews across sources', icon: Inbox, href: '/inbox' },
  { label: 'Reviews', desc: 'Browse all reviews', icon: Star, href: '/reviews' },
  { label: 'Campaigns', desc: 'Review request campaigns', icon: Send, href: '/campaigns' },
  { label: 'Analytics', desc: 'Sentiment and topics', icon: BarChart3, href: '/analytics' },
  { label: 'Competitors', desc: 'Competitive benchmark', icon: Target, href: '/competitors' },
  { label: 'Widgets', desc: 'Embeddable widget builder', icon: Code2, href: '/widgets' },
  { label: 'Reports', desc: 'Scheduled reports', icon: FileText, href: '/reports' },
  { label: 'Agency Dashboard', desc: 'Manage all clients', icon: Building2, href: '/agency' },
  { label: 'Settings', desc: 'Business profile and integrations', icon: Settings, href: '/settings' },
  { label: 'Billing', desc: 'Plans and invoices', icon: CreditCard, href: '/billing' },
  { label: 'Compliance', desc: 'GDPR, audit log, data retention', icon: Shield, href: '/compliance' },
]

const ACTION_COMMANDS = [
  { label: 'Generate AI draft', desc: 'Create reply for pending review', icon: Bot, action: 'generate-draft' },
  { label: 'New campaign', desc: 'Send review requests', icon: Plus, action: 'new-campaign' },
  { label: 'Train brand voice', desc: 'Upload replies for AI training', icon: Sparkles, action: 'train-voice' },
  { label: 'Invite team member', desc: 'Add a user to your org', icon: Users, action: 'invite' },
  { label: 'Export reviews', desc: 'Download as CSV', icon: Star, action: 'export' },
  { label: 'View audit log', desc: 'See all actions', icon: Shield, action: 'audit' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = (href?: string, action?: string) => {
    setOpen(false)
    if (href) {
      router.push(href)
    } else if (action) {
      // For actions, route to relevant page
      switch (action) {
        case 'generate-draft':
          router.push('/inbox')
          break
        case 'new-campaign':
          router.push('/campaigns')
          break
        case 'train-voice':
          router.push('/settings')
          break
        case 'invite':
          router.push('/settings')
          break
        case 'export':
          router.push('/reviews')
          break
        case 'audit':
          router.push('/compliance')
          break
      }
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions, or jump to..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Actions">
          {ACTION_COMMANDS.map(cmd => (
            <CommandItem
              key={cmd.action}
              onSelect={() => runCommand(undefined, cmd.action)}
              className="cursor-pointer"
            >
              <cmd.icon className="mr-2 h-4 w-4 text-[var(--brass)]" />
              <div className="flex-1">
                <div className="text-sm">{cmd.label}</div>
                <div className="text-xs text-muted-foreground">{cmd.desc}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV_COMMANDS.map(cmd => (
            <CommandItem
              key={cmd.href}
              onSelect={() => runCommand(cmd.href)}
              className="cursor-pointer"
            >
              <cmd.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm">{cmd.label}</div>
                <div className="text-xs text-muted-foreground">{cmd.desc}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

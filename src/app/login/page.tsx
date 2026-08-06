'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Star, ArrowRight, Check, Sparkles, TrendingUp, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Welcome back!', { description: data.user?.name || 'Logged in successfully' })
        router.push(data.redirectTo || '/dashboard')
      } else {
        toast.error('Login failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = () => {
    setEmail('owner@bamboogarden.com')
    setPassword('demo1234')
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side — form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 aurora-bg">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div className="relative w-full max-w-md mx-auto">
          <Link href="/" className="flex items-center gap-2.5 mb-12 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
              <Star className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <div className="font-display font-bold leading-tight">ReviewReply</div>
              <div className="text-[10px] text-muted-foreground font-mono">Enterprise</div>
            </div>
          </Link>

          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight mb-2">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Log in to your ReviewReply dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="mt-1.5 glass-card"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-xs text-[var(--brass)] hover:underline">Forgot password?</Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="mt-1.5 glass-card"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer h-11"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Log in'}
              {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
            </Button>
          </form>

          <div className="mt-4 p-3 rounded-lg bg-[var(--brass)]/5 border border-[var(--brass)]/20">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-[var(--brass)]" />
              <span className="text-xs font-medium">Demo account</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Use the seeded demo account to explore the full product:
            </p>
            <button
              onClick={fillDemo}
              className="text-xs font-mono text-[var(--brass)] hover:underline"
            >
              owner@bamboogarden.com · any password →
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[var(--brass)] hover:underline font-medium">
              Sign up free
            </Link>
          </p>
        </div>
      </div>

      {/* Right side — showcase */}
      <div className="hidden lg:flex flex-1 bg-card/30 border-l border-border/30 flex-col justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 aurora-bg opacity-50" />
        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">7,200+ businesses trust us</span>
          </div>

          <h2 className="font-display text-4xl font-bold tracking-tight mb-4 leading-tight">
            Turn every customer into a{' '}
            <span className="text-gradient-brass">five-star review.</span>
          </h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            AI-trained brand voice. Unified inbox. Competitor intelligence. All in one premium platform.
          </p>

          <div className="space-y-4">
            {[
              { icon: MessageSquare, title: 'Unified Review Inbox', desc: 'Google, Facebook, Yelp, Trustpilot — all in one place' },
              { icon: Sparkles, title: 'AI Brand Voice', desc: 'Claude 3.5 drafts replies that sound like you' },
              { icon: TrendingUp, title: 'Competitor Intelligence', desc: 'Weekly benchmarks against your top 3 competitors' },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-lg glass-card">
                <div className="p-2 rounded-lg bg-[var(--brass)]/10">
                  <f.icon className="w-4 h-4 text-[var(--brass)]" />
                </div>
                <div>
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
                <Check className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

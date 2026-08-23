'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Star, ArrowRight, Check, Sparkles, TrendingUp, MessageSquare, Mail,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { safeRedirectPath } from '@/lib/redirect-allowlist'

type Mode = 'password' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // SEC-10: validate the redirect param against an allowlist to prevent
  // open-redirect attacks (e.g. ?redirect=https://evil.com)
  const redirectTo = safeRedirectPath(searchParams.get('redirect'), '/dashboard')

  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleModalOpen, setGoogleModalOpen] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')

  const handlePasswordLogin = async (e: React.FormEvent) => {
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
        router.push(data.redirectTo || redirectTo)
      } else {
        toast.error('Login failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async () => {
    if (!email) {
      toast.error('Email required', { description: 'Please enter your email first' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email }),
      })
      const data = await res.json()
      if (res.ok) {
        setOtpSent(true)
        toast.success('OTP sent!', {
          description: 'Check the server console (terminal) for the 6-digit code in dev mode.',
        })
      } else {
        toast.error('Failed to send OTP', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Invalid code', { description: 'Please enter the 6-digit code' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, code: otpCode }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Logged in!', { description: data.isNewUser ? 'Welcome to ReviewReply!' : 'Welcome back!' })
        router.push(data.redirectTo || redirectTo)
      } else {
        toast.error('Verification failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    setGoogleModalOpen(true)
  }

  const handleGoogleSubmit = async () => {
    if (!googleEmail) {
      toast.error('Email required', { description: 'Please enter your Google email' })
      return
    }
    setGoogleLoading(true)
    try {
      const name = googleEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: googleEmail, name }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Logged in with Google!', { description: data.user?.name })
        setGoogleModalOpen(false)
        router.push(data.redirectTo || redirectTo)
      } else {
        toast.error('Google login failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setGoogleLoading(false)
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

          {/* Google OAuth button */}
          <Button
            variant="outline"
            className="w-full h-11 glass-card mb-4"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <Separator className="flex-1" />
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">or</span>
            <Separator className="flex-1" />
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 glass-card rounded-lg mb-4">
            <button
              onClick={() => setMode('password')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'password' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Password
            </button>
            <button
              onClick={() => setMode('otp')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'otp' ? 'bg-[var(--brass)] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Email OTP
            </button>
          </div>

          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
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
                  <Link href="/forgot-password" className="text-xs text-[var(--brass)] hover:underline">
                    Forgot password?
                  </Link>
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
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Log in
                {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
              </Button>
            </form>
          )}

          {mode === 'otp' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="otp-email">Email</Label>
                <Input
                  id="otp-email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={otpSent}
                  required
                  className="mt-1.5 glass-card"
                />
              </div>

              {!otpSent ? (
                <Button
                  onClick={handleSendOtp}
                  className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-11"
                  disabled={loading || !email}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send login code
                </Button>
              ) : (
                <>
                  <div>
                    <Label htmlFor="otp-code">6-digit code</Label>
                    <Input
                      id="otp-code"
                      placeholder="123456"
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="mt-1.5 glass-card font-mono text-center text-lg tracking-widest"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Code sent to {email} · expires in 10 minutes
                    </p>
                  </div>
                  <Button
                    onClick={handleVerifyOtp}
                    className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-11"
                    disabled={loading || otpCode.length !== 6}
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Verify & log in
                  </Button>
                  <button
                    onClick={handleSendOtp}
                    className="w-full text-xs text-[var(--brass)] hover:underline"
                    disabled={loading}
                  >
                    Resend code
                  </button>
                </>
              )}
            </div>
          )}

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
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">growing businesses trust us</span>
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
              { icon: Sparkles, title: 'AI Brand Voice', desc: 'AI-powered drafts that sound like you' },
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

      {/* Google login modal */}
      <Dialog open={googleModalOpen} onOpenChange={setGoogleModalOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="font-display">Continue with Google</DialogTitle>
            <DialogDescription>
              Enter your Google email to continue. In production, this will open Google&apos;s official OAuth consent screen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="google-email">Google email</Label>
              <Input
                id="google-email"
                type="email"
                placeholder="you@gmail.com"
                value={googleEmail}
                onChange={e => setGoogleEmail(e.target.value)}
                className="mt-1.5 glass-card"
                onKeyDown={e => e.key === 'Enter' && handleGoogleSubmit()}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Dev mode: Creates an account if one doesn&apos;t exist. In production, real Google OAuth token verification is used.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoogleModalOpen(false)}>Cancel</Button>
            <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]" onClick={handleGoogleSubmit} disabled={googleLoading || !googleEmail}>
              {googleLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

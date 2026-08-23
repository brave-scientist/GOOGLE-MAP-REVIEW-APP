'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Star, ArrowLeft, Mail, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error('Email is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
      } else {
        toast.error('Request failed', { description: data.error || 'Please try again later' })
      }
    } catch {
      toast.error('Network error', { description: 'Could not connect to server' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 aurora-bg">
      <div className="absolute inset-0 grid-overlay opacity-30" />
      <div className="relative w-full max-w-md mx-auto">
        <Link href="/" className="flex items-center gap-2.5 mb-8 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
            <Star className="w-4 h-4 text-white fill-white" />
          </div>
          <div>
            <div className="font-display font-bold leading-tight">ReviewReply</div>
            <div className="text-[10px] text-muted-foreground font-mono">Enterprise</div>
          </div>
        </Link>

        <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-xl">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[var(--brass)]/10 text-[var(--brass)] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Check your email</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                If an account exists for <span className="font-medium text-foreground">{email}</span>, we have sent a secure password reset link.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-bold tracking-tight mb-2">Reset password</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email address and we will send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email address</Label>
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

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer h-11"
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send reset link
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-border/40 text-center">
                <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center">
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

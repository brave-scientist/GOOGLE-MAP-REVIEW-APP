'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Star, ArrowRight, CheckCircle2, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast.error('Invalid link', { description: 'Missing password reset token.' })
      return
    }

    if (password.length < 8) {
      toast.error('Password too short', { description: 'Password must be at least 8 characters.' })
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match', { description: 'Please ensure both passwords match.' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
        toast.success('Password updated!')
      } else {
        toast.error('Reset failed', { description: data.error || 'Please request a new reset link' })
      }
    } catch {
      toast.error('Network error', { description: 'Could not connect to server' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center py-6">
        <h2 className="font-display text-xl font-bold mb-2">Invalid or Missing Token</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This password reset link is invalid or incomplete. Please request a new link.
        </p>
        <Link href="/forgot-password">
          <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
            Request new reset link
          </Button>
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">Password reset complete</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your password has been changed and all previous sessions have been invalidated.
        </p>
        <Button
          onClick={() => router.push('/login')}
          className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
        >
          Sign in with new password
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight mb-2">Create new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a strong password with at least 8 characters.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5 glass-card"
          />
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5 glass-card"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer h-11"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
          Update password
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
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
          <Suspense fallback={<div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  UserPlus,
  Loader2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface VerificationData {
  status: 'VALID' | 'INVALID' | 'EXPIRED' | 'ALREADY_CONSUMED' | 'ALREADY_MEMBER'
  invitation?: {
    id: string
    orgId: string
    orgName: string
    email: string
    role: string
    expiresAt: string
    invitedBy?: {
      name: string | null
      email: string
    }
  }
  userExists?: boolean
}

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(Boolean(token))
  const [submitting, setSubmitting] = useState(false)
  const [verification, setVerification] = useState<VerificationData | null>(() => token ? null : { status: 'INVALID' })

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (!token) return

    let ignore = false
    fetch(`/api/team/invite/verify?token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then((data: VerificationData) => {
        if (!ignore) {
          setVerification(data)
          if (data.invitation?.email) {
            setName(data.invitation.email.split('@')[0])
          }
        }
      })
      .catch(() => {
        if (!ignore) {
          setVerification({ status: 'INVALID' })
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [token])


  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    if (!verification?.userExists) {
      if (!password || password.length < 8) {
        toast.error('Password too short', { description: 'Please choose a password with at least 8 characters' })
        return
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match', { description: 'Please ensure both password fields match' })
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: password || undefined,
          name: name || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Welcome to the team!', { description: data.message })
        router.push('/dashboard')
      } else {
        toast.error('Acceptance failed', { description: data.error || 'Unable to accept invitation' })
      }
    } catch {
      toast.error('Network error', { description: 'Please check your connection and try again' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brass)]" />
          <p className="text-sm text-muted-foreground">Verifying invitation...</p>
        </div>
      </div>
    )
  }

  const status = verification?.status || 'INVALID'
  const invitation = verification?.invitation

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-gradient-to-b from-background to-accent/10">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <Link href="/" className="inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <span className="text-[var(--brass)]">✦</span> ReviewReply
          </Link>
          <p className="text-xs text-muted-foreground">Enterprise Team Invitation</p>
        </div>

        {/* State 1: Invalid Token */}
        {status === 'INVALID' && (
          <Card className="p-6 glass-card border-red-500/30 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-bold text-lg">Invalid Invitation Link</h2>
              <p className="text-xs text-muted-foreground">
                This invitation link is malformed or does not exist. Please ask your administrator to send a new invitation.
              </p>
            </div>
            <Button asChild className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
              <Link href="/login">Go to Login</Link>
            </Button>
          </Card>
        )}

        {/* State 2: Expired Token */}
        {status === 'EXPIRED' && (
          <Card className="p-6 glass-card border-amber-500/30 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-bold text-lg">Invitation Expired</h2>
              <p className="text-xs text-muted-foreground">
                Team invitations expire after 7 days for security. Please ask your team owner to re-send your invite.
              </p>
            </div>
            <Button asChild className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
              <Link href="/login">Go to Login</Link>
            </Button>
          </Card>
        )}

        {/* State 3: Already Consumed */}
        {status === 'ALREADY_CONSUMED' && (
          <Card className="p-6 glass-card text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[var(--brass)]/10 text-[var(--brass)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-bold text-lg">Invitation Already Accepted</h2>
              <p className="text-xs text-muted-foreground">
                This invitation token has already been single-use consumed. You can log in directly with your account credentials.
              </p>
            </div>
            <Button asChild className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
              <Link href="/login">Log In to ReviewReply</Link>
            </Button>
          </Card>
        )}

        {/* State 4: Already Member */}
        {status === 'ALREADY_MEMBER' && (
          <Card className="p-6 glass-card text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-bold text-lg">Already a Member</h2>
              <p className="text-xs text-muted-foreground">
                You are already an active member of this organization. You can access your workspace now.
              </p>
            </div>
            <Button asChild className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </Card>
        )}

        {/* State 5: Valid Invitation */}
        {status === 'VALID' && invitation && (
          <Card className="p-6 glass-card space-y-5">
            <div className="text-center space-y-2 border-b border-border/40 pb-4">
              <Badge variant="outline" className="text-[10px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                <Sparkles className="w-3 h-3 mr-1" /> Team Invite
              </Badge>
              <h2 className="font-display font-bold text-xl">Join {invitation.orgName}</h2>
              <p className="text-xs text-muted-foreground">
                {invitation.invitedBy?.name || 'An admin'} invited you ({invitation.email}) to join as <strong className="text-foreground">{invitation.role}</strong>.
              </p>
            </div>

            <form onSubmit={handleAccept} className="space-y-4">
              <div>
                <Label htmlFor="inv-name" className="text-xs">Your Name</Label>
                <Input
                  id="inv-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1.5"
                  required
                />
              </div>

              {!verification.userExists ? (
                <>
                  <div>
                    <Label htmlFor="inv-password" className="text-xs">Create Password</Label>
                    <Input
                      id="inv-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="mt-1.5"
                      required
                      minLength={8}
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-confirm" className="text-xs">Confirm Password</Label>
                    <Input
                      id="inv-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="mt-1.5"
                      required
                      minLength={8}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-accent/30 text-xs text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Existing account recognized. Enter your password or continue with active session to join {invitation.orgName}.</span>
                  </div>
                  <div>
                    <Label htmlFor="inv-existing-password" className="text-xs">Confirm Your Password</Label>
                    <Input
                      id="inv-existing-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter account password"
                      className="mt-1.5"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                {verification.userExists ? 'Authenticate & Join Team' : 'Create Account & Join Team'}
              </Button>
            </form>
          </Card>
        )}

        <div className="text-center">
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Already have an account? Log In
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brass)]" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
}

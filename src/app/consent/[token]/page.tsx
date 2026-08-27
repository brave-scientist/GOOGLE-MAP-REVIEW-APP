'use client'

import { useEffect, useState, use } from 'react'
import { CheckCircle2, AlertCircle, ShieldCheck, MessageSquare, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface TokenInfo {
  valid: boolean
  businessName?: string
  maskedContact?: string
  disclosureVersion?: string
  disclosureText?: string
  expiresAt?: string
  error?: string
  errorCode?: string
}

export default function CustomerConsentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [loading, setLoading] = useState(true)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTokenInfo() {
      try {
        const res = await fetch(`/api/sms/consent/public/${token}`)
        const data = await res.json()
        if (res.ok && data.valid) {
          setTokenInfo(data)
        } else {
          setTokenInfo({
            valid: false,
            error: data.error || 'This consent link is invalid or has expired.',
            errorCode: data.errorCode,
          })
        }
      } catch {
        setTokenInfo({
          valid: false,
          error: 'Unable to connect to verification server. Please try again.',
        })
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchTokenInfo()
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agree || submitting) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/sms/consent/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          confirmed: agree,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSubmitted(true)
      } else {
        setErrorMessage(data.error || 'Failed to submit consent. Please try again.')
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 flex flex-col justify-between">
      {/* Top Decorative Accent Bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[var(--brass)] via-[var(--brass-dark)] to-[var(--brass)]" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-card/80 backdrop-blur-md border border-border/60 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--brass)]" />
              <p className="text-sm font-medium">Verifying invitation link…</p>
            </div>
          ) : submitted ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold text-foreground">Consent Confirmed!</h1>
                <p className="text-sm text-muted-foreground">
                  You have successfully agreed to receive customer review & feedback text messages from{' '}
                  <span className="font-semibold text-foreground">{tokenInfo?.businessName}</span>.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-accent/30 border border-border/40 text-xs text-muted-foreground text-left space-y-1">
                <p>• Message frequency varies.</p>
                <p>• Message and data rates may apply.</p>
                <p>• You can reply <strong>STOP</strong> at any time to opt out.</p>
              </div>
            </div>
          ) : !tokenInfo?.valid ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto ring-8 ring-red-500/5">
                <AlertCircle className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold text-foreground">Link Invalid or Expired</h1>
                <p className="text-sm text-muted-foreground">
                  {tokenInfo?.error || 'This SMS consent invitation is no longer active.'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground/80">
                Please contact the business if you would like them to send a new invitation link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] shadow-md shadow-[var(--brass)]/20 mb-1">
                  <MessageSquare className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  SMS Communication Consent
                </h1>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{tokenInfo.businessName}</span> invites you to receive feedback requests and review links by SMS.
                </p>
              </div>

              {/* Recipient Details */}
              <div className="p-3.5 rounded-xl bg-accent/20 border border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Phone Number:</span>
                <span className="font-mono font-medium text-foreground">{tokenInfo.maskedContact}</span>
              </div>

              {/* Server-Controlled Legal Disclosure */}
              <div className="p-4 rounded-xl bg-accent/40 border border-border/60 space-y-2 text-xs text-muted-foreground leading-relaxed">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--brass)]" />
                  SMS Disclosure Notice
                </div>
                <p className="text-[11px] sm:text-xs">
                  {tokenInfo.disclosureText}
                </p>
              </div>

              {/* Error Notice */}
              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Affirmative Action Checkbox — UNCHECKED BY DEFAULT */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border/60 hover:border-[var(--brass)]/50 bg-card hover:bg-accent/10 transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={agree}
                    onChange={e => setAgree(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-[var(--brass)] focus:ring-[var(--brass)] cursor-pointer"
                  />
                  <span className="text-xs text-foreground leading-relaxed">
                    I affirmatively agree to receive SMS text messages from <strong>{tokenInfo.businessName}</strong> as described in the disclosure above.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="grant-consent-button"
                disabled={!agree || submitting}
                className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-[var(--brass)] hover:bg-[var(--brass-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-[var(--brass)]/15 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  'Confirm & Opt In to SMS'
                )}
              </button>

              <div className="text-center">
                <p className="text-[11px] text-muted-foreground/70">
                  Consent is voluntary and is not a condition of purchase.
                </p>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground/60">
        Powered by{' '}
        <Link href="/" className="font-semibold text-foreground/80 hover:underline">
          ReviewReply
        </Link>
      </footer>
    </div>
  )
}

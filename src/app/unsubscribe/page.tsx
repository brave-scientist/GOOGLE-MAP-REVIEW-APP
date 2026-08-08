'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, Loader2, Mail } from 'lucide-react'

export default function UnsubscribePage() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleUnsubscribe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
      } else {
        setError(data.error || 'Failed to unsubscribe')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 aurora-bg">
      <div className="absolute inset-0 grid-overlay opacity-30" />
      <Card className="relative p-8 glass-card max-w-md w-full text-center">
        {done ? (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="font-display text-xl font-bold mb-2">Unsubscribed</h1>
            <p className="text-sm text-muted-foreground">
              You have been removed from our email list. You will not receive further review request emails.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-[var(--brass)]/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-[var(--brass)]" />
            </div>
            <h1 className="font-display text-xl font-bold mb-2">Unsubscribe</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {email
                ? `Unsubscribe ${email} from ReviewReply email messages?`
                : 'No email address provided. Please use the unsubscribe link from your email.'}
            </p>
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            {email && (
              <Button
                className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] w-full"
                onClick={handleUnsubscribe}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Yes, unsubscribe me
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

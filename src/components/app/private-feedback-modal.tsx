'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Star, MessageSquareHeart, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PrivateFeedbackModalProps {
  slug: string
  businessName: string
}

export function PrivateFeedbackModal({ slug, businessName }: PrivateFeedbackModalProps) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(3)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const resetForm = () => {
    setRating(3)
    setHoverRating(null)
    setCustomerName('')
    setCustomerContact('')
    setMessage('')
    setError(null)
    setSubmitted(false)
  }

  const handleOpen = () => {
    resetForm()
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim()) {
      setError('Please enter your name')
      return
    }
    if (!message.trim()) {
      setError('Please describe your experience or feedback')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/review-us/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerContact: customerContact.trim() || undefined,
          rating,
          message: message.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback')
      }

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        id="private-feedback-trigger"
        onClick={handleOpen}
        className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-border/80 hover:border-[var(--brass)]/60 bg-accent/20 hover:bg-accent/40 text-left transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <MessageSquareHeart className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground group-hover:text-[var(--brass)] transition-colors">
              Prefer to share private feedback directly?
            </div>
            <div className="text-[11px] text-muted-foreground">
              Send a note straight to the management team at {businessName}.
            </div>
          </div>
        </div>
        <span className="text-[11px] font-medium text-[var(--brass)] hidden sm:inline-block">
          Send Note &rarr;
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <MessageSquareHeart className="w-5 h-5 text-[var(--brass)]" />
              Direct Message to Management
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              We value honest feedback and strive to make things right. Your note goes directly to the manager.
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="py-6 text-center space-y-3" id="private-feedback-success">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                Thank You for Your Feedback
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Your message has been delivered directly to {businessName}&apos;s leadership team.
              </p>
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium mb-1.5 block">
                  How was your overall experience?
                </Label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = (hoverRating ?? rating) >= star
                    return (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        className="p-1 rounded hover:bg-accent/40 transition-colors focus:outline-none"
                      >
                        <Star
                          className={cn(
                            'w-5 h-5 transition-colors',
                            isFilled
                              ? 'text-amber-500 fill-amber-500'
                              : 'text-muted-foreground/40'
                          )}
                        />
                      </button>
                    )
                  })}
                  <span className="text-[11px] text-muted-foreground ml-2">
                    {rating === 5 && 'Outstanding'}
                    {rating === 4 && 'Good'}
                    {rating === 3 && 'Average'}
                    {rating === 2 && 'Needs Improvement'}
                    {rating === 1 && 'Disappointing'}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="customer-name" className="text-xs font-medium">
                  Your Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="customer-contact" className="text-xs font-medium">
                  Email or Phone <span className="text-muted-foreground font-normal">(optional, for follow-up)</span>
                </Label>
                <Input
                  id="customer-contact"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  placeholder="alex@example.com or (555) 012-3456"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label htmlFor="customer-message" className="text-xs font-medium">
                  Your Feedback or Message <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="customer-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what happened and how we can make things right..."
                  rows={3}
                  className="text-xs mt-1 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  id="submit-private-feedback"
                  disabled={submitting}
                  className="h-8 text-xs bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Submit Feedback'
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

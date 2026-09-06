'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ShieldCheck,
  Link as LinkIcon,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Phone,
  User,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface InviteConsentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  businessName: string
}

export function InviteConsentModal({
  open,
  onOpenChange,
  businessId,
  businessName,
}: InviteConsentModalProps) {
  const [contact, setContact] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    inviteUrl: string
    expiresAt: string
  } | null>(null)

  const handleReset = () => {
    setContact('')
    setRecipientName('')
    setError(null)
    setCopied(false)
    setInviteResult(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleReset()
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanedContact = contact.trim()
    if (!cleanedContact) {
      setError('Please enter a recipient phone number.')
      return
    }

    if (!businessId) {
      setError('Please select an active business first.')
      return
    }

    try {
      setIsLoading(true)
      const res = await fetch('/api/sms/consent/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          contact: cleanedContact,
          recipientName: recipientName.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create consent invitation')
      }

      setInviteResult({
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
      })
      toast.success('Consent invitation link created')
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (!inviteResult?.inviteUrl) return
    navigator.clipboard.writeText(inviteResult.inviteUrl)
    setCopied(true)
    toast.success('Link copied to clipboard')
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-display">
            <ShieldCheck className="w-5 h-5 text-[var(--brass)]" />
            SMS Customer Consent Invitation
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
            Generate a single-use, verifiable affirmative consent link for{' '}
            <strong className="text-foreground">{businessName || 'your business'}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!inviteResult ? (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                TCPA / CTIA Compliance Requirement
              </div>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                Commercial SMS cannot be sent without customer-originated consent. Share this link directly with the customer (via email, QR code, or chat). When the customer completes the affirmative web form, SMS review requests are automatically authorized.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consent-phone" className="text-xs font-medium flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                Customer Mobile Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="consent-phone"
                placeholder="+1 (555) 234-5678"
                value={contact}
                onChange={e => setContact(e.target.value)}
                className="text-xs font-mono"
                required
                disabled={isLoading}
              />
              <p className="text-[10px] text-muted-foreground">
                Enter customer&apos;s mobile number. Normalized automatically to E.164.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consent-name" className="text-xs font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Customer Name (Optional)
              </Label>
              <Input
                id="consent-name"
                placeholder="e.g. Alex Rivera"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="text-xs"
                disabled={isLoading}
              />
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isLoading}
                className="bg-[var(--brass)] text-primary-foreground hover:brightness-110"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Generate Consent Link
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-700 dark:text-green-300 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                Consent Invitation Link Generated
              </div>
              <p className="text-[11px] text-green-800/90 dark:text-green-300/90 leading-relaxed">
                This single-use link is valid for 7 days until{' '}
                <span className="font-medium">
                  {new Date(inviteResult.expiresAt).toLocaleDateString()}
                </span>
                . Share it with your customer to capture compliant express written consent.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-[var(--brass)]" />
                Customer Consent URL
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inviteResult.inviteUrl}
                  className="text-xs font-mono select-all bg-accent/20"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-600 mr-1" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 mr-1" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Create Another Link
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(inviteResult.inviteUrl, '_blank')}
                  className="text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Preview Form
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

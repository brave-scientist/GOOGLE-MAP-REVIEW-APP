'use client'

import { useState, useEffect, useRef } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Link2, Phone, Mail, Upload, Plus, Trash2, Loader2, Check, Send, Clock, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ReviewUsTab } from '@/components/app/review-us-tab'

interface Recipient {
  name: string
  contact: string
}

interface PastSend {
  id: string
  channel: string
  messageTemplate: string | null
  reviewUsUrl: string
  recipientCount: number
  sentCount: number
  skippedOptOutCount: number
  failedCount: number
  sentAt: string
}

export default function ReviewUsPagePage() {
  const [businessId, setBusinessId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Bulk-send state
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [messageTemplate, setMessageTemplate] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [pastSends, setPastSends] = useState<PastSend[]>([])
  const [loadingSends, setLoadingSends] = useState(false)

  const disclosureText = `By providing your phone number, you agree to receive text messages from ${businessName || 'this business'} regarding review requests and customer feedback. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.`

  // Fetch business ID + name on mount
  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.businesses?.[0]) {
          setBusinessId(d.businesses[0].id)
          setBusinessName(d.businesses[0].name)
          if (!messageTemplate) {
            setMessageTemplate(`Hi! Thanks for visiting ${d.businesses[0].name}. We would love your feedback — pick your favorite platform and leave us a review:`)
          }
        }
      })
      .catch(() => {})
  }, [])

  // Fetch past sends when businessId is available
  useEffect(() => {
    if (!businessId) return
    setLoadingSends(true)
    fetch(`/api/review-us-page/sends?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => {
        if (d.sends) setPastSends(d.sends)
      })
      .catch(() => {})
      .finally(() => setLoadingSends(false))
  }, [businessId])

  const validRecipients = recipients.filter(r => r.name.trim() && r.contact.trim())

  const addRecipient = () => {
    setRecipients([...recipients, { name: '', contact: '' }])
  }

  const removeRecipient = (i: number) => {
    setRecipients(recipients.filter((_, idx) => idx !== i))
  }

  const updateRecipient = (i: number, field: 'name' | 'contact', value: string) => {
    setRecipients(recipients.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  // CSV upload — reuses the same parsing pattern as campaign-builder.tsx
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').map(l => l.trim()).filter(l => l)

      if (lines.length === 0) {
        toast.error('CSV is empty', { description: 'The file has no rows' })
        return
      }

      const imported: Recipient[] = []
      const firstRow = lines[0].toLowerCase()
      const hasHeader = firstRow.includes('name') && firstRow.includes('contact')
      const dataLines = hasHeader ? lines.slice(1) : lines

      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
        if (parts.length >= 2) {
          const name = parts[0]
          const contact = parts[1]
          if (name && contact) {
            if (!imported.find(r => r.contact === contact)) {
              imported.push({ name, contact })
            }
          }
        }
      }

      if (imported.length === 0) {
        toast.error('No valid rows found', { description: 'CSV must have name,contact columns' })
        return
      }

      // Merge with existing recipients (dedup by contact)
      const existing = new Set(recipients.map(r => r.contact))
      const newOnes = imported.filter(r => !existing.has(r.contact))
      setRecipients([...recipients, ...newOnes])
      toast.success(`Imported ${newOnes.length} recipients`, {
        description: imported.length - newOnes.length > 0
          ? `${imported.length - newOnes.length} duplicates skipped`
          : undefined,
      })
    }
    reader.readAsText(file)
    // Reset input so the same file can be uploaded again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = async () => {
    if (!businessId) {
      toast.error('No business found')
      return
    }
    if (validRecipients.length === 0) {
      toast.error('No valid recipients', { description: 'Add at least one recipient with name and contact' })
      return
    }
    if (channel === 'sms' && !consentConfirmed) {
      toast.error('Affirmative consent required', { description: 'You must confirm affirmative express written consent before sending commercial SMS.' })
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/review-us-page/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          channel,
          messageTemplate,
          recipients: validRecipients,
          consentConfirmed,
          disclosureText,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Sent!', {
          description: `${data.sentCount} sent, ${data.skippedOptOut} opted out, ${data.failedCount} failed`,
        })
        // Clear recipients on success
        setRecipients([])
        // Refresh past sends
        if (businessId) {
          const sendsRes = await fetch(`/api/review-us-page/sends?businessId=${businessId}`)
          if (sendsRes.ok) {
            const sendsData = await sendsRes.json()
            if (sendsData.sends) setPastSends(sendsData.sends)
          }
        }
      } else {
        toast.error(data.error || 'Failed to send')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Review Us Page"
          description="Configure your public review page and send it to customers"
        />
        <div className="p-4 sm:p-6 space-y-8">
          {/* Existing platform-catalog + QR + link configuration */}
          {businessId ? (
            <ReviewUsTab businessId={businessId} />
          ) : (
            <Card className="p-8 glass-card text-center">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading…</span>
            </Card>
          )}

          {/* ── Bulk Send Section ── */}
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center flex-shrink-0">
                <Send className="w-5 h-5 text-[var(--brass)]" />
              </div>
              <div>
                <h3 className="font-display font-bold">Send to customers</h3>
                <p className="text-xs text-muted-foreground">
                  Bulk-distribute your Review Us Page link via SMS or email. Customers pick their preferred platform from the page.
                </p>
              </div>
            </div>

            {/* Channel selection */}
            <Card className="p-5 glass-card">
              <h4 className="text-sm font-medium mb-3">Send channel</h4>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setChannel('sms')}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    channel === 'sms'
                      ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                      : 'border-border/40 hover:border-[var(--brass)]/40',
                  )}
                >
                  <Phone className={cn('w-5 h-5', channel === 'sms' ? 'text-[var(--brass)]' : 'text-muted-foreground')} />
                  <div>
                    <div className="text-sm font-medium">SMS</div>
                    <div className="text-[10px] text-muted-foreground">via Twilio</div>
                  </div>
                </button>
                <button
                  onClick={() => setChannel('email')}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    channel === 'email'
                      ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                      : 'border-border/40 hover:border-[var(--brass)]/40',
                  )}
                >
                  <Mail className={cn('w-5 h-5', channel === 'email' ? 'text-[var(--brass)]' : 'text-muted-foreground')} />
                  <div>
                    <div className="text-sm font-medium">Email</div>
                    <div className="text-[10px] text-muted-foreground">via Resend</div>
                  </div>
                </button>
              </div>
            </Card>

            {/* Message template */}
            <Card className="p-5 glass-card">
              <h4 className="text-sm font-medium mb-3">Message</h4>
              <Textarea
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                placeholder={`Hi! Thanks for visiting ${businessName || 'us'}. We would love your feedback — pick your favorite platform and leave us a review:`}
                rows={3}
                className="glass-card text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Your Review Us Page link will be automatically appended to the message.
                {channel === 'sms' && ' An opt-out notice ("Reply STOP to unsubscribe") will also be added automatically.'}
              </p>
            </Card>

            {/* Recipients */}
            <Card className="p-5 glass-card">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">
                  Recipients
                  {validRecipients.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-[10px] bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/30">
                      {validRecipients.length} ready
                    </Badge>
                  )}
                </h4>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Import CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addRecipient}
                    className="h-7 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add manually
                  </Button>
                </div>
              </div>

              {recipients.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">No recipients yet</p>
                  <p className="text-xs text-muted-foreground">
                    Import a CSV (name,contact columns) or add recipients manually.
                    Opted-out contacts are automatically filtered before sending.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recipients.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={r.name}
                        onChange={e => updateRecipient(i, 'name', e.target.value)}
                        placeholder="Name"
                        className="h-8 text-xs glass-card flex-1"
                      />
                      <Input
                        value={r.contact}
                        onChange={e => updateRecipient(i, 'contact', e.target.value)}
                        placeholder={channel === 'sms' ? 'Phone number' : 'Email address'}
                        className="h-8 text-xs glass-card flex-1"
                      />
                      <button
                        onClick={() => removeRecipient(i)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Customer-Originated SMS Consent Notice (SMS-002.1) */}
              {channel === 'sms' && validRecipients.length > 0 && (
                <div className="mt-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="review-us-sms-consent"
                      checked={consentConfirmed}
                      onChange={e => setConsentConfirmed(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-amber-500/40 text-[var(--brass)] focus:ring-[var(--brass)] cursor-pointer"
                    />
                    <label htmlFor="review-us-sms-consent" className="text-xs text-foreground cursor-pointer leading-relaxed">
                      <span className="font-medium text-amber-600 dark:text-amber-400 block mb-0.5">Staff Compliance Acknowledgment</span>
                      I acknowledge that outbound commercial SMS requires customer-originated affirmative express written consent. Recipients lacking verified customer consent will be blocked by the SMS compliance gate.
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 pl-6.5">
                    Need to collect consent? Customers can opt in via your Review Us Page or through a dedicated consent link.
                  </p>
                </div>
              )}

              {/* Send button */}
              {validRecipients.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Opted-out contacts will be skipped automatically.
                    Recipients are separate from campaign recipients — this is an independent send list.
                  </p>
                  <Button
                    className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                    onClick={handleSend}
                    disabled={sending}
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" /> Send to {validRecipients.length} {validRecipients.length === 1 ? 'recipient' : 'recipients'}</>
                    )}
                  </Button>
                </div>
              )}
            </Card>

            {/* Past sends */}
            <Card className="p-5 glass-card">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Past sends
              </h4>
              {loadingSends ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading…
                </div>
              ) : pastSends.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">No sends yet. Your send history will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pastSends.map(send => (
                    <div key={send.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-accent/20 transition-colors">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        send.channel === 'sms' ? 'bg-blue-500/10' : 'bg-purple-500/10',
                      )}>
                        {send.channel === 'sms' ? (
                          <Phone className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Mail className="w-4 h-4 text-purple-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">
                          {send.sentCount} sent
                          {send.skippedOptOutCount > 0 && ` · ${send.skippedOptOutCount} opted out`}
                          {send.failedCount > 0 && ` · ${send.failedCount} failed`}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate font-mono">
                          {send.reviewUsUrl}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(send.sentAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

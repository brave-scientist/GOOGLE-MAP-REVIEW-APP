'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Send, Plus, Trash2, Loader2, Check, Phone, Mail, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface CampaignBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface Recipient {
  name: string
  contact: string
}

const CHANNELS = [
  { id: 'sms', label: 'SMS', icon: Phone, desc: 'Twilio' },
  { id: 'email', label: 'Email', icon: Mail, desc: 'Resend' },
  { id: 'qr', label: 'QR Code', icon: QrCode, desc: 'Printable' },
]

export function CampaignBuilder({ open, onOpenChange, onSuccess }: CampaignBuilderProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['sms'])
  const [messageTemplate, setMessageTemplate] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: '', contact: '' }])
  const [businessId, setBusinessId] = useState<string>('')

  // Fetch first business on mount
  useEffect(() => {
    if (open && !businessId) {
      fetch('/api/dashboard')
        .then(r => r.json())
        .then(d => {
          if (d.businesses?.[0]) {
            setBusinessId(d.businesses[0].id)
            if (!messageTemplate) {
              setMessageTemplate(`Hi! Thanks for visiting ${d.businesses[0].name}. Would you mind leaving us a quick review?`)
            }
          }
        })
        .catch(() => {})
    }
  }, [open, businessId, messageTemplate])

  const reset = () => {
    setStep(1)
    setName('')
    setDescription('')
    setSelectedChannels(['sms'])
    setMessageTemplate('')
    setRecipients([{ name: '', contact: '' }])
  }

  const handleClose = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const addRecipient = () => {
    setRecipients([...recipients, { name: '', contact: '' }])
  }

  const removeRecipient = (i: number) => {
    setRecipients(recipients.filter((_, idx) => idx !== i))
  }

  const updateRecipient = (i: number, field: 'name' | 'contact', value: string) => {
    setRecipients(recipients.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const validRecipients = recipients.filter(r => r.name.trim() && r.contact.trim())

  const handleCreate = async (sendNow: boolean) => {
    if (!businessId) {
      toast.error('No business found', { description: 'Please add a business first' })
      return
    }
    if (validRecipients.length === 0) {
      toast.error('No valid recipients', { description: 'Add at least one recipient with name and contact' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          name,
          description,
          channelMix: selectedChannels,
          messageTemplate,
          recipients: validRecipients,
          sendNow,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(sendNow ? 'Campaign sent!' : 'Campaign created!', {
          description: data.message,
        })
        handleClose(false)
        onSuccess?.()
      } else {
        toast.error('Failed to create campaign', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-premium glass-card">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New Campaign</DialogTitle>
          <DialogDescription>
            Send review requests to your customers via SMS, email, or QR code.
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1">
              <div className={cn(
                'h-1 rounded-full transition-colors',
                s <= step ? 'bg-[var(--brass)]' : 'bg-muted'
              )} />
              <div className="text-[9px] text-muted-foreground font-mono mt-1 text-center">
                {s === 1 ? 'Details' : s === 2 ? 'Message' : 'Recipients'}
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="camp-name">Campaign name</Label>
              <Input
                id="camp-name"
                placeholder="Post-visit follow-up"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="camp-desc">Description (optional)</Label>
              <Input
                id="camp-desc"
                placeholder="Automated SMS to recent customers"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Channels</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {CHANNELS.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      selectedChannels.includes(ch.id)
                        ? 'border-[var(--brass)] bg-[var(--brass)]/10'
                        : 'border-border/40 hover:border-[var(--brass)]/40'
                    )}
                  >
                    <ch.icon className={cn(
                      'w-5 h-5 mb-1.5',
                      selectedChannels.includes(ch.id) ? 'text-[var(--brass)]' : 'text-muted-foreground'
                    )} />
                    <div className="text-sm font-medium">{ch.label}</div>
                    <div className="text-[10px] text-muted-foreground">{ch.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="msg">Message template</Label>
              <Textarea
                id="msg"
                rows={4}
                placeholder="Hi! Thanks for visiting. Would you mind leaving us a quick review?"
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Tip: Use {'{{name}}'} for customer name, {'{{business}}'} for business name
              </p>
            </div>

            {/* Preview */}
            <div className="p-3 rounded-lg bg-accent/20 border border-border/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">Preview (SMS)</div>
              <div className="p-3 rounded-lg bg-background max-w-[280px]">
                <p className="text-sm">{messageTemplate || 'Your message preview...'}</p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Recipients ({validRecipients.length} valid)</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRecipient}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Customer name"
                  value={r.name}
                  onChange={e => updateRecipient(i, 'name', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Phone or email"
                  value={r.contact}
                  onChange={e => updateRecipient(i, 'contact', e.target.value)}
                  className="flex-1"
                />
                {recipients.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => removeRecipient(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}

            {/* Quick add sample recipients */}
            <div className="p-3 rounded-lg bg-accent/20">
              <div className="text-xs font-medium mb-2">Quick add sample recipients:</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: 'Sarah Chen', contact: '+1 415-555-2001' },
                  { name: 'Marcus Webb', contact: '+1 415-555-2002' },
                  { name: 'Priya Patel', contact: 'priya@example.com' },
                ].map(sample => (
                  <button
                    key={sample.contact}
                    onClick={() => {
                      if (!recipients.find(r => r.contact === sample.contact)) {
                        setRecipients([...recipients, sample])
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded-md border border-border/40 hover:border-[var(--brass)]/40 hover:bg-accent/30 transition-colors"
                  >
                    + {sample.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !name}
              >
                Continue
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleCreate(false)}
                  disabled={loading}
                >
                  Save as draft
                </Button>
                <Button
                  className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)]"
                  onClick={() => handleCreate(true)}
                  disabled={loading || validRecipients.length === 0}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send to {validRecipients.length} recipient{validRecipients.length !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

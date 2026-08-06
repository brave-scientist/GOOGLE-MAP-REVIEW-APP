'use client'

import { useState } from 'react'
import { LegalLayout } from '@/components/app/marketing-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Mail, MessageSquare, Phone, MapPin, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !message) {
      toast.error('Missing fields', { description: 'Please fill in name, email, and message' })
      return
    }
    setLoading(true)
    // Simulate sending
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    setSent(true)
    toast.success('Message sent!', { description: 'We will respond within 24 hours' })
    setName('')
    setEmail('')
    setSubject('')
    setMessage('')
    setTimeout(() => setSent(false), 5000)
  }

  return (
    <LegalLayout title="Contact Us" lastUpdated="August 2026">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="p-4 rounded-lg glass-card">
            <Mail className="w-5 h-5 text-[var(--brass)] mb-2" />
            <h3 className="font-semibold text-sm mb-1">Email</h3>
            <p className="text-xs text-muted-foreground mb-2">General inquiries and support</p>
            <a href="mailto:support@reviewreply.com" className="text-xs text-[var(--brass)] hover:underline">support@reviewreply.com</a>
          </div>
          <div className="p-4 rounded-lg glass-card">
            <MessageSquare className="w-5 h-5 text-[var(--brass)] mb-2" />
            <h3 className="font-semibold text-sm mb-1">Live Chat</h3>
            <p className="text-xs text-muted-foreground mb-2">In-app chat, Mon–Fri 9am–6pm PT</p>
            <span className="text-xs text-[var(--brass)]">Available for Pro+ plans</span>
          </div>
          <div className="p-4 rounded-lg glass-card">
            <Phone className="w-5 h-5 text-[var(--brass)] mb-2" />
            <h3 className="font-semibold text-sm mb-1">Phone</h3>
            <p className="text-xs text-muted-foreground mb-2">Enterprise customers only</p>
            <a href="tel:+14155550100" className="text-xs text-[var(--brass)] hover:underline">+1 415-555-0100</a>
          </div>
          <div className="p-4 rounded-lg glass-card">
            <MapPin className="w-5 h-5 text-[var(--brass)] mb-2" />
            <h3 className="font-semibold text-sm mb-1">Office</h3>
            <p className="text-xs text-muted-foreground">100 Market Street<br />San Francisco, CA 94102<br />United States</p>
          </div>
        </div>

        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5 glass-card" required />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 glass-card" required />
              </div>
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={e => setSubject(e.target.value)} className="mt-1.5 glass-card" placeholder="How can we help?" />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={6} value={message} onChange={e => setMessage(e.target.value)} className="mt-1.5 glass-card" required />
            </div>
            <Button type="submit" className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] w-full sm:w-auto" disabled={loading || sent}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : sent ? <Check className="w-4 h-4 mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              {sent ? 'Sent!' : 'Send message'}
            </Button>
          </form>
        </div>
      </div>
    </LegalLayout>
  )
}

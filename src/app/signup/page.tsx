'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'

const INDUSTRIES = [
  { value: 'restaurant', label: 'Restaurant / Cafe' },
  { value: 'dental', label: 'Dental / Medical' },
  { value: 'hospitality', label: 'Hotel / Hospitality' },
  { value: 'fitness', label: 'Fitness / Gym' },
  { value: 'beauty', label: 'Salon / Spa' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'legal', label: 'Legal / Accounting' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'home_services', label: 'Home Services' },
  { value: 'other', label: 'Other' },
]

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    industry: 'restaurant',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Account created!', { description: 'Welcome to ReviewReply Enterprise' })
        router.push(data.redirectTo || '/dashboard')
      } else {
        toast.error('Signup failed', { description: data.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 aurora-bg">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div className="relative w-full max-w-md mx-auto">
          <Link href="/" className="flex items-center gap-2.5 mb-12 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
              <Star className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <div className="font-display font-bold leading-tight">ReviewReply</div>
              <div className="text-[10px] text-muted-foreground font-mono">Enterprise</div>
            </div>
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              {[1, 2].map(s => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[var(--brass)]' : 'bg-muted'}`}
                />
              ))}
            </div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--brass)] mb-2">
              Step {step} of 2
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight mb-2">
              {step === 1 ? 'Create your account' : 'Tell us about your business'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 1 ? 'Start your 14-day free trial. No credit card required.' : 'We\'ll set up your review dashboard in seconds.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 && (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    placeholder="Sarah Chen"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="mt-1.5 glass-card"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@business.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                    className="mt-1.5 glass-card"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                    minLength={8}
                    className="mt-1.5 glass-card"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Minimum 8 characters</p>
                </div>
                <Button
                  type="button"
                  className="w-full bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-11"
                  onClick={() => {
                    if (form.name && form.email && form.password.length >= 8) setStep(2)
                    else toast.error('Please fill all fields', { description: 'Password must be 8+ characters' })
                  }}
                >
                  Continue
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <Label htmlFor="businessName">Business name</Label>
                  <Input
                    id="businessName"
                    placeholder="Bamboo Garden Restaurant"
                    value={form.businessName}
                    onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
                    required
                    className="mt-1.5 glass-card"
                  />
                </div>
                <div>
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={form.industry} onValueChange={v => setForm(f => ({ ...f, industry: v }))}>
                    <SelectTrigger className="mt-1.5 glass-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(ind => (
                        <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-lg bg-accent/20 border border-border/30">
                  <div className="text-xs font-medium mb-2">What happens next:</div>
                  <ul className="space-y-1.5">
                    {[
                      'We create your business profile',
                      'Seed 5 demo reviews to explore',
                      'You can connect Google & Facebook next',
                    ].map(item => (
                      <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="glass-card"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] btn-shimmer h-11"
                    disabled={loading}
                  >
                    {loading ? 'Creating account...' : 'Create account & start trial'}
                    {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--brass)] hover:underline font-medium">
              Log in
            </Link>
          </p>

          <p className="mt-4 text-center text-[10px] text-muted-foreground">
            By signing up, you agree to our{' '}
            <Link href="#" className="hover:underline">Terms</Link> and{' '}
            <Link href="#" className="hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-card/30 border-l border-border/30 flex-col justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 aurora-bg opacity-50" />
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-bold tracking-tight mb-6 leading-tight">
            Join growing businesses winning local search.
          </h2>
          <div className="space-y-3">
            {[
              { stat: '4.7★', label: 'Average rating lift in 90 days' },
              { stat: '3.2×', label: 'More reviews than manual outreach' },
              { stat: '<30s', label: 'Average AI draft reply time' },
              { stat: '26', label: 'Languages supported natively' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-4 p-3 rounded-lg glass-card">
                <div className="font-display text-2xl font-bold text-gradient-brass w-16">{s.stat}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

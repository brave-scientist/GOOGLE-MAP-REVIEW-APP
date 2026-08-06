'use client'
import { useState } from 'react'

interface PricingToggleProps {
  onToggle: (isAnnual: boolean) => void
}

export default function PricingToggle({ onToggle }: PricingToggleProps) {
  const [isAnnual, setIsAnnual] = useState(false)

  const handleToggle = (annual: boolean) => {
    setIsAnnual(annual)
    onToggle(annual)
  }

  return (
    <div className="mb-10 flex justify-center">
      {/* Annual billing not yet live — activate in Stripe when ready */}
      <div className="inline-flex rounded-full border border-cream/20 bg-ink-2 p-1">
        <button
          onClick={() => handleToggle(false)}
          className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
            !isAnnual ? 'bg-brass text-ink' : 'text-cream-dim hover:text-cream'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => handleToggle(true)}
          className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
            isAnnual ? 'bg-brass text-ink' : 'text-cream-dim hover:text-cream'
          }`}
        >
          Annual
        </button>
      </div>
    </div>
  )
}
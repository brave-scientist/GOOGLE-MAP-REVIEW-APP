'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const testimonials = [
  {
    quote: "I used to reply to reviews once a week if I remembered. Now every review gets a reply the same day. Our rating went from 4.1 to 4.6 in three months.",
    name: "Rosa M.",
    business: "Mama Rosa's Kitchen",
    rating: 5,
    category: "Restaurant",
  },
  {
    quote: "The 2-star reply it drafted was better than anything I would have written when I was annoyed. Calm, professional, offered to make it right. That's exactly what I needed.",
    name: "James K.",
    business: "ProFix Plumbing",
    rating: 5,
    category: "Contractor",
  },
  {
    quote: "Setup took maybe 8 minutes. I connected my Google profile, typed in my vibe — friendly, call everyone by name, mention the dogs — and it just works.",
    name: "Sarah L.",
    business: "PawsFirst Vet",
    rating: 5,
    category: "Veterinary",
  },
  {
    quote: "I was skeptical about the AI replies. I'm not skeptical anymore. My customers can't tell the difference and I save two hours a week.",
    name: "Marcus T.",
    business: "Iron & Oak BBQ",
    rating: 5,
    category: "Restaurant",
  },
  {
    quote: "The text message review requests are the best feature. I add a customer after their appointment and they get a text an hour later. We get 3-4 new reviews a week now.",
    name: "Priya S.",
    business: "Glow Studio",
    rating: 5,
    category: "Salon",
  },
  {
    quote: "Finally something built for a small business. Not a platform I need to take a course to use.",
    name: "David C.",
    business: "The Corner Shelf",
    rating: 5,
    category: "Retail",
  },
]

export default function TestimonialCarousel() {
  const [current, setCurrent] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [cardsPerView, setCardsPerView] = useState(3)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const updateCardsPerView = () => {
      if (window.innerWidth >= 1024) setCardsPerView(3)
      else if (window.innerWidth >= 768) setCardsPerView(2)
      else setCardsPerView(1)
    }
    updateCardsPerView()
    window.addEventListener('resize', updateCardsPerView)
    return () => window.removeEventListener('resize', updateCardsPerView)
  }, [])

  const maxIndex = Math.max(0, testimonials.length - cardsPerView)

  const next = useCallback(() => {
    setCurrent((c) => (c >= maxIndex ? 0 : c + 1))
  }, [maxIndex])

  useEffect(() => {
    if (isPaused) return
    timeoutRef.current = setTimeout(next, 4500)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [current, isPaused, next])

  const handleDotClick = (idx: number) => {
    setCurrent(idx)
    setIsPaused(true)
    setTimeout(() => setIsPaused(false), 6000)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* PLACEHOLDER: Replace with real beta testimonials before commercial launch */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-400 ease-out"
          style={{ transform: `translateX(-${current * (100 / cardsPerView)}%)` }}
        >
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="flex-shrink-0 px-3"
              style={{ width: `${100 / cardsPerView}%` }}
            >
              <div className="h-full rounded-xl bg-paper-2 p-6">
                <div className="mb-3 text-base tracking-wider text-coral">
                  {'★'.repeat(t.rating)}
                </div>
                <p className="mb-4 text-[15px] leading-relaxed text-[#33422F]">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, #C89B3C, #D4AF5A)`,
                    }}
                  >
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink-text">{t.name}</div>
                    <div className="text-xs text-[#6A7A6F]">
                      {t.business} · <span className="inline-block rounded bg-cream/10 px-1.5 py-0.5 font-mono text-[10px]">{t.category}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dot navigation */}
      <div className="mt-6 flex justify-center gap-2">
        {Array.from({ length: maxIndex + 1 }).map((_, i) => (
          <button
            key={i}
            onClick={() => handleDotClick(i)}
            className={`h-2 rounded-full transition-all ${
              current === i ? 'w-8 bg-brass' : 'w-2 bg-cream/20'
            }`}
            aria-label={`Go to testimonial ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
'use client'
import { useState, useRef, useEffect } from 'react'

const replyTemplates: Record<number, Record<string, string>> = {
  5: {
    restaurant: "Thank you so much — this honestly made our whole team's day! We're so glad you loved the food. We'd love to see you again soon — next time ask for us at the host stand and we'll take great care of you!",
    salon: "This is so kind, thank you! We always want you leaving feeling amazing, and it sounds like we hit the mark. Can't wait to see you at your next appointment!",
    dental: "Thank you! We know a dental visit isn't everyone's favourite thing, so hearing that you felt comfortable and well cared for genuinely means a lot to the whole team.",
    contractor: "Really appreciate you taking the time to leave this! We put a lot of care into every job and it's great to hear it shows. Don't hesitate to reach out for any future projects.",
    retail: "Thank you so much! Customers like you are exactly why we do this. Hope to see you back in the shop soon!",
  },
  4: {
    restaurant: "Thanks for the kind words! We're glad you had a good experience overall. If there's anything we can do even better next time, we'd love to hear it — we're always working to improve.",
    salon: "So glad you enjoyed your visit! We appreciate the feedback and we're always working to make the experience even better. See you next time!",
    dental: "Thank you, we really appreciate you sharing your experience! We're glad things went smoothly and we look forward to seeing you at your next visit.",
    contractor: "Thanks so much! We're glad the job met your expectations. If you ever have questions or need anything else done, we're just a call away.",
    retail: "Thank you! We're glad you had a great visit. Your feedback means a lot to us — see you next time!",
  },
  3: {
    restaurant: "Thank you for the honest feedback — we really appreciate it. It sounds like we got some things right but missed the mark in a few spots, and that's on us. We'd love the chance to do better. If you're open to it, please reach out to us directly so we can make it right.",
    salon: "Thanks for sharing this. We're glad parts of your visit were positive, and we hear you on the areas that fell short. We'd love to chat more about your experience — please feel free to reach us directly.",
    dental: "Thank you for the feedback. We want every patient to feel completely at ease and well-informed, and it sounds like we have some room to improve. Please reach out to us directly so we can address your concerns personally.",
    contractor: "Thank you for taking the time. We're glad we could complete the project, and we take your feedback seriously. If anything wasn't up to the standard you expected, please call us — we stand behind our work.",
    retail: "Thanks for the honest review. We're sorry it wasn't a perfect experience — please come in and see us, or give us a call, and we'll do our best to make it right.",
  },
  2: {
    restaurant: "Thank you for telling us — I'm genuinely sorry we let you down. What you described isn't the experience we want for anyone. Please reach out to us directly so we can make this right. We'd really appreciate the chance.",
    salon: "I'm really sorry to hear this. This is not the standard we hold ourselves to, and I want to address it personally. Please reach out to us directly and I'll make sure we take care of you.",
    dental: "Thank you for sharing this, even though I know it's not easy to leave a review like this. I want to personally address your concerns — please call our office and ask for the practice manager so we can make this right.",
    contractor: "I'm sorry to hear this — this is not how we operate and I want to get to the bottom of it. Please call me directly. We'll make it right.",
    retail: "I'm so sorry about your experience. Please come in or call us — I'd like to personally make this right for you.",
  },
  1: {
    restaurant: "I'm deeply sorry. What you described is unacceptable and not who we are. I'd like to speak with you personally — please call us or email us so we can make this right. Thank you for giving us the chance to do better.",
    salon: "I'm so sorry. There is no excuse for the experience you described and I take full responsibility. Please contact me directly — I want to make this right personally.",
    dental: "I'm very sorry to read this. Your comfort and care are our top priority and it's clear we failed you in this visit. Please call our office directly and ask for me by name — I want to address this personally and immediately.",
    contractor: "I'm sorry, this is not acceptable and not who we are. Please call me directly. I will personally ensure this is resolved to your satisfaction.",
    retail: "I'm so sorry. This experience is completely unacceptable. Please contact me directly or visit the store and ask for the manager — I'll make this right.",
  },
}

const exampleReviews: Record<number, Record<string, string>> = {
  5: {
    restaurant: "Absolutely loved it! The pasta was incredible and our server was so attentive. Best dinner we've had in months.",
    salon: "Best haircut I've had in years. The stylist actually listened to what I wanted. Leaving feeling amazing.",
    dental: "Honestly the most comfortable dental visit I've ever had. The whole team was gentle and explained everything.",
    contractor: "Fixed our leaking pipe same-day, cleaned up after themselves, and the price was fair. Highly recommend.",
    retail: "Such a great little shop. Found exactly what I needed and the owner was so helpful. Will be back!",
  },
  4: {
    restaurant: "Really good food and nice atmosphere. Service was a bit slow but the staff was friendly. Would go back.",
    salon: "Great cut and color, happy with the result. Just had to wait about 15 minutes past my appointment time.",
    dental: "Clean and modern office, staff was professional. A bit of a wait but the dentist was thorough.",
    contractor: "Did a solid job on the bathroom remodel. Took a day longer than quoted but the work quality is good.",
    retail: "Nice selection and friendly staff. Prices are a little high but the quality makes up for it.",
  },
  3: {
    restaurant: "Food was decent but nothing special. The place was loud and we had to wait 20 minutes for a table. Okay experience overall.",
    salon: "The haircut is fine but I felt rushed. The stylist was checking their phone during my appointment.",
    dental: "The dentist was knowledgeable but the front desk seemed disorganized. Mixed experience.",
    contractor: "They did the job but there was a miscommunication about the timeline. Eventually got it sorted.",
    retail: "Average experience. Found what I needed but the store was cluttered and hard to navigate.",
  },
  2: {
    restaurant: "Really disappointed. We waited 45 minutes for our food and when it came out it was cold. The manager didn't seem to care.",
    salon: "Not happy with my color at all. It's patchy and nothing like the photo I showed. Won't be back.",
    dental: "Felt rushed and the dentist was dismissive of my concerns about tooth pain. Still in pain a week later.",
    contractor: "Left a mess in our yard and had to come back twice to fix their own mistakes. Frustrating experience.",
    retail: "Rude staff and the item I bought was defective. Had to argue to get a refund. Won't return.",
  },
  1: {
    restaurant: "Worst experience ever. Food was cold, server was rude, and there was a hair in my dish. Never coming back.",
    salon: "Absolutely terrible. They completely ruined my hair. I'm in tears. Do not go here.",
    dental: "Nightmare. They billed me for services I didn't receive and the office manager refused to fix it.",
    contractor: "Took my deposit and never showed up. Won't return calls. Avoid at all costs.",
    retail: "Disgusting store, rude owner, overcharged me. Reported to BBB. Stay away.",
  },
}

const businessTypes = ['restaurant', 'salon', 'dental', 'contractor', 'retail'] as const
type BusinessType = typeof businessTypes[number]

export default function LiveDemo() {
  const [rating, setRating] = useState(3)
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant')
  const [reviewText, setReviewText] = useState(exampleReviews[3]!['restaurant']!)
  const [reply, setReply] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showPosted, setShowPosted] = useState(false)
  const [showSignupTooltip, setShowSignupTooltip] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Update example review when rating or business type changes
  useEffect(() => {
    setReviewText(exampleReviews[rating]![businessType]!)
  }, [rating, businessType])

  const generateReply = () => {
    setIsGenerating(true)
    setReply('')
    setShowPosted(false)
    const template = replyTemplates[rating]![businessType]!
    let i = 0
    intervalRef.current = setInterval(() => {
      if (i < template.length) {
        setReply(template.slice(0, i + 1))
        i++
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setIsGenerating(false)
        setShowPosted(true)
      }
    }, 14)
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <section className="py-20">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="mb-12 max-w-2xl">
          <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">Live demo</div>
          <h2 className="text-4xl font-bold">See it work — right now.</h2>
          <p className="mt-3 text-lg text-cream-dim">Pick a review below or write your own. No signup needed.</p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left panel: review input */}
          <div className="rounded-2xl border border-cream/10 bg-ink-2 p-6">
            <div className="mb-4 rounded-xl bg-ink-3 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`star-clickable ${star <= rating ? 'text-coral' : 'text-cream/20'}`}
                      onClick={() => setRating(star)}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div className="rounded bg-cream/5 px-2 py-0.5 font-mono text-xs text-cream-dim">Google · just now</div>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-brass-light">Business type</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                  className="w-full rounded-lg border border-cream/20 bg-ink-3 px-3 py-2 text-sm text-cream outline-none focus:border-brass"
                >
                  {businessTypes.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-brass-light">Review text</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-cream/20 bg-ink-3 px-3 py-2 text-sm text-cream outline-none focus:border-brass"
                />
              </div>
            </div>

            <button
              onClick={generateReply}
              disabled={isGenerating}
              className="btn-lift w-full rounded-lg bg-brass px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {isGenerating ? 'Drafting reply...' : 'Generate Reply'}
            </button>
          </div>

          {/* Right panel: reply output */}
          <div className="rounded-2xl border border-cream/10 bg-ink-2 p-6">
            {!reply && !isGenerating && (
              <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-cream-dim">
                Waiting for your review...
              </div>
            )}
            {(reply || isGenerating) && (
              <div className="rounded-xl border border-dashed border-brass/40 bg-brass/[0.08] p-4">
                <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-brass-light">
                  {isGenerating && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-light" />}
                  {isGenerating ? 'Drafting reply' : 'Draft reply'}
                </div>
                <div className="text-sm text-cream">
                  {reply}
                  {isGenerating && <span className="animate-pulse">|</span>}
                </div>
                {showPosted && (
                  <>
                    <div className="mt-3 flex items-center gap-2 font-mono text-xs text-green-400">
                      ✓ This reply matches your brand voice
                    </div>
                    <div className="mt-3 relative">
                      <button
                        onClick={() => setShowSignupTooltip(!showSignupTooltip)}
                        className="btn-lift rounded-lg border border-cream/30 px-4 py-2 text-xs font-semibold text-cream transition hover:border-brass hover:text-brass-light"
                      >
                        Post to Google
                      </button>
                      {showSignupTooltip && (
                        <div className="absolute left-0 top-full mt-2 rounded-lg bg-ink-3 px-3 py-2 text-xs text-brass-light shadow-lg">
                          Sign up to post real replies →
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
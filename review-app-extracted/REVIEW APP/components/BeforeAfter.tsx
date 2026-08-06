'use client'
import { useState } from 'react'

const withoutSteps = [
  { title: 'Review posted', desc: "A customer leaves a 2-star review at 7pm on a Tuesday." },
  { title: "Owner doesn't see it", desc: "You're at the end of a long shift. The review sits." },
  { title: '3 days later...', desc: "You notice it while scrolling. You type a frustrated reply and delete it. You write 'Thanks for the feedback' and cringe." },
  { title: 'Reviewer moves on', desc: "They already chose your competitor. They've told two friends." },
  { title: 'Your rating drops', desc: '4.2 stars. Other customers notice. Google ranks you lower.' },
]

const withSteps = [
  { title: 'Review posted', desc: "A customer leaves a 2-star review at 7pm on a Tuesday." },
  { title: 'ReviewReply-Lite detects it', desc: 'Within 20 minutes, a draft reply is ready — calm, specific, offering a resolution.' },
  { title: 'You tap Post', desc: '10 seconds. The reply is live. The reviewer sees a business that actually cares.' },
  { title: 'Reviewer reconsiders', desc: 'Reviewers who receive a personal reply update their rating 33% of the time.' },
  { title: 'Your reputation builds', desc: '4.7 stars. Google ranks you higher in local search. New customers call.' },
]

export default function BeforeAfter() {
  const [tab, setTab] = useState<'without' | 'with'>('without')

  return (
    <section className="bg-ink-2 py-20">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="mb-12 max-w-2xl">
          <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">The difference</div>
          <h2 className="text-4xl font-bold">What changes when you start using ReviewReply-Lite</h2>
        </div>

        {/* Tab switcher */}
        <div className="mb-10 flex gap-3">
          <button
            onClick={() => setTab('without')}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
              tab === 'without' ? 'bg-coral text-white' : 'border border-cream/30 text-cream hover:border-coral'
            }`}
          >
            <span className="hidden sm:inline">Without ReviewReply-Lite</span>
            <span className="sm:hidden">Before</span>
          </button>
          <button
            onClick={() => setTab('with')}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
              tab === 'with' ? 'bg-brass text-ink' : 'border border-cream/30 text-cream hover:border-brass'
            }`}
          >
            <span className="hidden sm:inline">With ReviewReply-Lite</span>
            <span className="sm:hidden">After</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="relative">
          <div
            className={`tab-content ${tab === 'without' ? '' : 'hidden-tab'}`}
          >
            <div className="space-y-4">
              {withoutSteps.map((step, i) => (
                <div
                  key={i}
                  className="rounded-xl border-l-4 border-coral bg-ink-3 p-5"
                >
                  <div className="mb-1 flex items-center gap-3">
                    <span className="font-mono text-sm text-coral">{`0${i + 1}`}</span>
                    <h3 className="text-lg font-bold text-cream">{step.title}</h3>
                  </div>
                  <p className="text-sm text-cream-dim">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`tab-content ${tab === 'with' ? '' : 'hidden-tab'}`}
          >
            <div className="space-y-4">
              {withSteps.map((step, i) => (
                <div
                  key={i}
                  className="rounded-xl border-l-4 border-green-500 bg-ink-3 p-5"
                >
                  <div className="mb-1 flex items-center gap-3">
                    <span className="font-mono text-sm text-green-400">{`0${i + 1}`}</span>
                    <h3 className="text-lg font-bold text-cream">{step.title}</h3>
                  </div>
                  <p className="text-sm text-cream-dim">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
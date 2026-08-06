"use client";

/**
 * app/(marketing)/page.tsx — the public marketing landing page.
 *
 * Faithful port of landing-page.html with full interactivity:
 * scroll animations, animated stat counters, live demo, before/after tabs,
 * logo carousel, testimonial carousel, pricing toggle, mobile responsive.
 */

import { useState, useEffect, useRef } from "react";
import ScrollReveal from "@/components/ScrollReveal";
import StatCounter from "@/components/StatCounter";
import LogoCarousel from "@/components/LogoCarousel";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import LiveDemo from "@/components/LiveDemo";
import BeforeAfter from "@/components/BeforeAfter";
import PricingToggle from "@/components/PricingToggle";

const REPLY_TEXT =
  "Thanks so much for the honest feedback, Marcus — a 25-minute wait is not the experience we want, even with a reservation. We are tightening up our seating flow this week. Hope you will give us another shot soon!";

export default function LandingPage() {
  const [typedReply, setTypedReply] = useState("");
  const [postedCheck, setPostedCheck] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isAnnual, setIsAnnual] = useState(false);
  const [priceFading, setPriceFading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function typeLoop() {
      setTypedReply("");
      setPostedCheck(false);
      let i = 0;
      intervalRef.current = setInterval(() => {
        if (i < REPLY_TEXT.length) {
          setTypedReply(REPLY_TEXT.slice(0, i + 1));
          i++;
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(() => setPostedCheck(true), 300);
          setTimeout(typeLoop, 4200);
        }
      }, 18);
    }
    typeLoop();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handlePricingToggle = (annual: boolean) => {
    setPriceFading(true);
    setTimeout(() => {
      setIsAnnual(annual);
      setPriceFading(false);
    }, 200);
  };

  return (
    <div className="bg-ink text-cream overflow-x-hidden">
      <ScrollReveal />

      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-cream/10 bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-display text-xl font-bold">
            <span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-brass" />
            ReviewReply<span className="text-brass-light">-Lite</span>
          </div>
          <div className="hidden items-center gap-8 text-sm font-medium md:flex">
            <a href="#how" className="opacity-80 transition hover:opacity-100">How it works</a>
            <a href="#features" className="opacity-80 transition hover:opacity-100">Features</a>
            <a href="#pricing" className="opacity-80 transition hover:opacity-100">Pricing</a>
            <a href="#faq" className="opacity-80 transition hover:opacity-100">FAQ</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm font-medium text-cream opacity-85 hover:opacity-100">Log in</a>
            <a href="#pricing" className="btn-lift rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition">Start free trial</a>
          </div>
        </nav>
      </header>

      <div className="awning" />

      {/* HERO */}
      <section className="py-20">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-14 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="reveal reveal-delay-1">
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-brass-light">
              <span className="text-coral">●</span> Built for single-location businesses
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.06] lg:text-[52px]" style={{ fontSize: "clamp(32px, 8vw, 52px)" }}>
              Every review gets a reply. <span className="text-brass-light">Before you even see it.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-cream-dim">
              ReviewReply-Lite watches your Google and Facebook reviews, drafts a reply that actually sounds like you, and asks happy customers to leave one — automatically. No spreadsheet required.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <a href="#pricing" className="btn-lift w-full rounded-lg bg-brass px-7 py-3.5 text-base font-semibold text-ink transition sm:w-auto">Start your 14-day free trial</a>
              <a href="#how" className="btn-lift w-full rounded-lg border-[1.5px] border-cream/30 px-7 py-3.5 text-base font-semibold text-cream transition hover:border-brass hover:text-brass-light sm:w-auto">See how it works</a>
            </div>
            <p className="mt-4 text-sm text-cream-dim">No setup call needed · Cancel anytime · Card required to start trial</p>
          </div>

          {/* Demo card */}
          <div className="reveal reveal-delay-2 rounded-[18px] border border-cream/10 bg-ink-2 p-5 shadow-2xl">
            <div className="mb-4 flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cream/20" />
              <span className="h-2 w-2 rounded-full bg-cream/20" />
              <span className="h-2 w-2 rounded-full bg-cream/20" />
            </div>
            <div className="mb-3.5 rounded-xl bg-ink-3 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-base tracking-wider text-coral">★★☆☆☆</div>
                <div className="rounded bg-cream/5 px-2 py-0.5 font-mono text-xs text-cream-dim">Google · 2h ago</div>
              </div>
              <div className="mb-1 text-sm font-semibold">Marcus T.</div>
              <div className="text-sm text-cream-dim">&ldquo;Food was good but we waited almost 25 minutes for a table even with a reservation.&rdquo;</div>
            </div>
            <div className="rounded-xl border border-dashed border-brass/40 bg-brass/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-brass-light">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-light" />
                Drafting reply
              </div>
              <div className="text-sm text-cream">{typedReply}<span className="animate-pulse">|</span></div>
              {postedCheck && (
                <div className="mt-3 flex items-center gap-2 font-mono text-xs text-green-400">
                  ✓ Posted to Google — 0:04 after the review came in
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* LOGO CAROUSEL */}
      <div className="px-6">
        <LogoCarousel />
      </div>

      <div className="awning" />

      {/* PROBLEM */}
      <section className="bg-paper py-20 text-ink-text">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mb-12 max-w-2xl">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-coral">The problem</div>
            <h2 className="mb-3.5 text-4xl font-bold text-ink-text">You are not ignoring your reviews. You just do not have four hours a week for them.</h2>
            <p className="text-lg text-[#4A5A4F]">Slow replies quietly cost local businesses new customers — and most owners find out only after it has already happened.</p>
          </div>
          <div className="stagger-children grid grid-cols-1 gap-7 sm:grid-cols-3">
            <StatCard num={<StatCounter end={62} suffix="%" />} label="of shoppers read a business review replies before deciding to visit" tag="Placeholder stat — replace with sourced figure" />
            <StatCard num={<><StatCounter end={4} suffix="+" /> days</>} label="average time an independent business takes to reply to a review" tag="Placeholder stat — replace with sourced figure" />
            <StatCard num={<StatCounter prefix="$" end={0} />} label="extra hours in your week to fix this manually" />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mb-12 max-w-2xl">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">How it works</div>
            <h2 className="text-4xl font-bold">Four steps. Ten minutes. Then it just runs.</h2>
          </div>
          <div className="stagger-children grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard num="01" title="Connect" desc="Link your Google Business Profile (and Facebook Page, if you have one) in a couple of clicks." />
            <StepCard num="02" title="Reply" desc="Every new review gets an AI-drafted reply in your voice, ready to post in one tap." />
            <StepCard num="03" title="Request" desc="Add a customer name and number — we text them a review link automatically." />
            <StepCard num="04" title="Grow" desc="More replies, more requests, more reviews — without adding it to your to-do list." />
          </div>
        </div>
      </section>

      {/* LIVE DEMO */}
      <LiveDemo />

      <div className="awning" />

      {/* BEFORE/AFTER */}
      <BeforeAfter />

      {/* FEATURES */}
      <section id="features" className="bg-paper py-20 text-ink-text">
        <div className="mx-auto max-w-[1180px] px-6 space-y-22">
          <FeatureRow eyebrow="Add customers your way" title="No spreadsheet? No problem." desc="Most of our owners have never built a CSV — so we did not make that the only way in." items={["Quick-add a customer name and number right from your dashboard", "Paste a rough list from your Notes app — we sort it out for you", "Already have a spreadsheet? Upload it too, if you would rather"]} />
          <FeatureRow reverse eyebrow="Replies that sound like you" title="Not a robot. Not generic. You — just faster." desc="Tell us your tone once. Every draft matches it — warm for the good ones, calm and specific for the tough ones." items={["One-tap posting, or edit the draft first — your call", "Negative reviews always wait for your approval before posting", "Auto-post available for 4–5 star reviews once you trust it"]} />
          <FeatureRow eyebrow="Know what is working" title="See which requests turn into real reviews." desc="Every review request is tracked — sent, delivered, clicked — so you know it is actually working, not just running quietly in the background." items={["Simple sent / clicked counts, no confusing analytics jargon", "SMS and email, whichever your customers actually respond to", "One dashboard for reviews and requests — nothing else to manage"]} />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mx-auto mb-12 max-w-2xl text-center">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">Pricing</div>
            <h2 className="text-4xl font-bold">One flat price. No per-review fees. No annual contract.</h2>
            <p className="mt-3 text-lg text-cream-dim">Cancel anytime. Every plan includes a 14-day free trial.</p>
          </div>
          <PricingToggle onToggle={handlePricingToggle} />
          <div className={`price-transition mx-auto grid max-w-3xl grid-cols-1 gap-7 sm:grid-cols-2 ${priceFading ? 'fading' : ''}`}>
            <PriceCard
              plan="Starter"
              price={isAnnual ? "$24.17" : "$29"}
              priceSuffix="/ mo"
              annualBadge={isAnnual ? "Save $58/yr" : undefined}
              desc="For a single location just getting review replies under control."
              features={["1 location", "Google review replies (AI-drafted)", "Quick-add + paste-list review requests", "Email review requests", "100 review requests included / month", "Email support"]}
              cta="Start free trial"
              featured={false}
            />
            <PriceCard
              plan="Pro"
              price={isAnnual ? "$49.17" : "$59"}
              priceSuffix="/ mo"
              annualBadge={isAnnual ? "Save $118/yr" : undefined}
              desc="For businesses that want Facebook covered and text-message requests."
              features={["1 location", "Google + Facebook review replies", "All review-request entry methods", "SMS + email review requests", "300 review requests included / month", "Priority support"]}
              cta="Start free trial"
              featured={true}
            />
          </div>
          <p className="mt-6 text-center text-sm text-cream-dim">Additional review requests beyond your plan monthly amount: $0.05 each.</p>
        </div>
      </section>

      <div className="awning" />

      {/* TESTIMONIALS */}
      <section className="bg-paper py-20 text-ink-text">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mx-auto mb-12 max-w-2xl text-center">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-coral">From our beta businesses</div>
            <h2 className="text-4xl font-bold text-ink-text">What early owners are saying</h2>
          </div>
          <TestimonialCarousel />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="reveal mb-12">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">FAQ</div>
            <h2 className="text-4xl font-bold">Questions owners actually ask</h2>
          </div>
          <div className="divide-y divide-cream/10">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={openFaq === i ? "pb-5" : ""}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between py-5 text-left font-display text-lg font-semibold text-cream">
                  {item.q}
                  <span className={`text-xl text-brass-light transition-transform ${openFaq === i ? "rotate-45" : ""}`}>+</span>
                </button>
                {openFaq === i && <p className="pb-5 pr-10 text-[15px] text-cream-dim">{item.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="pb-0">
        <div className="reveal mx-6 mb-0 rounded-3xl bg-ink-2 px-6 py-20 text-center">
          <h2 className="mb-4 text-4xl font-bold">Your next review is already on its way.</h2>
          <p className="mb-7 text-lg text-cream-dim">Get the reply drafted before you even open the app.</p>
          <a href="#pricing" className="btn-lift inline-block rounded-lg bg-brass px-7 py-3.5 text-base font-semibold text-ink transition">Start your 14-day free trial</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 pb-9 pt-14">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-11 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="mb-3.5 flex items-center gap-2 font-display text-xl font-bold"><span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-brass" />ReviewReply-Lite</div>
              <p className="text-sm text-cream-dim">The review reply and request tool built for single-location businesses.</p>
            </div>
            <FooterCol title="Product" links={[{ href: "#how", label: "How it works" }, { href: "#features", label: "Features" }, { href: "#pricing", label: "Pricing" }, { href: "#faq", label: "FAQ" }, { href: "/vs/birdeye", label: "vs Birdeye" }, { href: "/vs/podium", label: "vs Podium" }]} />
            <FooterCol title="Company" links={[{ href: "/terms", label: "Terms of Service" }, { href: "/privacy", label: "Privacy Policy" }]} />
            <div>
              <h4 className="mb-3.5 font-mono text-xs uppercase tracking-wide text-brass-light">Contact</h4>
              <p className="text-sm text-cream-dim">support@reviewreply.app</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-cream/10 pt-7 text-sm text-cream-dim">
            <div>© 2026 ReviewReply-Lite. All rights reserved.</div>
            <div>Made for businesses with one location and zero time to waste.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ num, label, tag }: { num: React.ReactNode; label: string; tag?: string }) {
  return (
    <div className="card-hover rounded-xl bg-paper-2 p-6">
      <div className="font-mono text-4xl font-semibold text-ink-text">{num}</div>
      <div className="mt-1.5 text-sm text-[#5A6A5F]">{label}</div>
      {tag && <div className="mt-2 inline-block rounded border border-coral/40 bg-coral/15 px-2 py-0.5 font-mono text-xs uppercase text-coral">{tag}</div>}
    </div>
  );
}

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="card-hover rounded-xl border border-cream/5 bg-ink-2 p-6">
      <div className="mb-3.5 font-mono text-sm text-brass-light">{num}</div>
      <h3 className="mb-2.5 text-xl font-bold">{title}</h3>
      <p className="text-sm text-cream-dim">{desc}</p>
    </div>
  );
}

function FeatureRow({ eyebrow, title, desc, items, reverse }: { eyebrow: string; title: string; desc: string; items: string[]; reverse?: boolean }) {
  return (
    <div className="mb-22 last:mb-0">
      <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
        <div className={`reveal-left ${reverse ? "lg:order-2" : ""}`}>
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-coral">{eyebrow}</div>
          <h3 className="mb-3.5 text-3xl font-bold text-ink-text">{title}</h3>
          <p className="mb-4 text-base text-[#4A5A4F]">{desc}</p>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="relative pl-6 text-[15px] text-[#3E4E43] before:absolute before:left-0 before:font-semibold before:text-coral before:content-['→']">{item}</li>
            ))}
          </ul>
        </div>
        <div className={`reveal-right ${reverse ? "lg:order-1" : ""}`}>
          <div className="overflow-hidden rounded-xl border border-[#14281e]/10 shadow-2xl">
            <img src={`https://placehold.co/640x460/1c3327/f6f1e4?font=roboto&text=${encodeURIComponent(title)}`} alt={`${title} mockup`} className="w-full" />
          </div>
          <div className="mt-2 inline-block rounded border border-coral/40 bg-coral/15 px-2 py-0.5 font-mono text-xs uppercase text-coral">Mockup — replace with real product screenshot</div>
        </div>
      </div>
    </div>
  );
}

function PriceCard({ plan, price, priceSuffix, annualBadge, desc, features, cta, featured }: { plan: string; price: string; priceSuffix: string; annualBadge?: string; desc: string; features: string[]; cta: string; featured: boolean }) {
  return (
    <div className={`price-card-hover rounded-2xl p-9 ${featured ? "border-2 border-brass bg-ink-2" : "border border-cream/10 bg-ink-2"}`}>
      {featured && <div className="mb-3 inline-block rounded bg-brass px-2.5 py-1 font-mono text-xs font-semibold text-ink">MOST POPULAR</div>}
      <div className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-cream-dim">{plan}</div>
      <div className="mb-0.5 font-mono text-5xl font-semibold">{price} <span className="text-base font-normal text-cream-dim">{priceSuffix}</span></div>
      {annualBadge && <div className="mb-1 inline-block rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">{annualBadge}</div>}
      <p className="mb-5 mt-2 text-sm text-cream-dim">{desc}</p>
      <ul className="mb-7 space-y-0">
        {features.map((f, i) => (
          <li key={i} className="relative border-b border-cream/5 py-2 pl-6 text-sm last:border-0 before:absolute before:left-0 before:text-brass-light before:content-['✓']">{f}</li>
        ))}
      </ul>
      <a href="/login" className={`btn-lift block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition ${featured ? "bg-brass text-ink hover:brightness-110" : "border border-cream/30 text-cream hover:border-brass hover:text-brass-light"}`}>{cta}</a>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h4 className="mb-3.5 font-mono text-xs uppercase tracking-wide text-brass-light">{title}</h4>
      {links.map((link) => (
        <a key={link.href} href={link.href} className="mb-2 block text-sm text-cream-dim transition hover:text-cream">{link.label}</a>
      ))}
    </div>
  );
}

const FAQ_ITEMS = [
  { q: "Do I need to know anything technical to set this up?", a: "No. Connecting your Google Business Profile takes about two minutes and works the same way as logging into any app with your Google account. No code, no spreadsheets required." },
  { q: "Will it ever post a reply I have not approved?", a: "Only if you turn on auto-post, and even then, only for 4 and 5-star reviews. Anything 1-3 stars always waits for your manual approval — no exceptions." },
  { q: "I do not have a customer spreadsheet. Can I still send review requests?", a: "Yes — that is exactly what the quick-add and paste-a-list options are for. Type in a name and number, or paste a rough list from your phone. No file required." },
  { q: "Is there a contract?", a: "No. Both plans are month-to-month, and you can cancel anytime from your billing settings — no phone call or support ticket needed." },
  { q: "What happens to my customer list if I cancel?", a: "Your customers contact details are deleted within 30 days of cancellation. We do not hold onto it \u201Cjust in case.\u201D" },
];
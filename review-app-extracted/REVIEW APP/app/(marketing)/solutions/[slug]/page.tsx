"use client";

/**
 * app/(marketing)/solutions/[slug]/page.tsx — Dynamic Niche/Industry landing pages.
 *
 * Implements premium SEO industry-focused copywriting for Dentists, Salons,
 * Restaurants, and Contractors. Reuses the core landing page components with
 * custom-tailored headlines, value props, and stats for high organic conversion.
 */

import { useState, useEffect, useRef } from "react";
import { useParams, notFound } from "next/navigation";
import ScrollReveal from "@/components/ScrollReveal";
import StatCounter from "@/components/StatCounter";
import LogoCarousel from "@/components/LogoCarousel";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import LiveDemo from "@/components/LiveDemo";
import BeforeAfter from "@/components/BeforeAfter";
import PricingToggle from "@/components/PricingToggle";

interface IndustryData {
  name: string;
  headline: string;
  subheadline: string;
  problem: string;
  statNumber: number;
  statLabel: string;
  mockReviewName: string;
  mockReviewText: string;
  mockReplyText: string;
}

const INDUSTRIES: Record<string, IndustryData> = {
  dental: {
    name: "Dental Practices",
    headline: "The review reply engine built for busy dental practices.",
    subheadline: "Patient trust is won or lost in the Google Reviews section. Automatically draft caring patient responses in one click, and collect feedback after every appointment.",
    problem: "Patient trust is your #1 asset. Slow or generic replies make your practice look uncaring.",
    statNumber: 84,
    statLabel: "of patients read dentist review replies before choosing a clinic.",
    mockReviewName: "Sarah K.",
    mockReviewText: "Dr. Evans was very gentle and explained everything perfectly, but the front desk was a bit slow to check me in.",
    mockReplyText: "Thank you for the kind words about Dr. Evans, Sarah! We appreciate your patience with our front desk check-in process. We are actively refining our scheduling slot flow this week. Hope to see you back soon!",
  },
  salon: {
    name: "Salons & Spas",
    headline: "Keep your chairs full. Let us handle your salon review replies.",
    subheadline: "Beauty clients decide where to book in seconds based on your latest rating. Reply with on-brand stylist drafts and text review requests instantly.",
    problem: "Your work is highly visual, but your online reputation is what actually fills your booking calendar.",
    statNumber: 91,
    statLabel: "of clients check salon reviews and replies before booking a new stylist.",
    mockReviewName: "Elena R.",
    mockReviewText: "Loved my highlights by Jordan! The booking system was slightly confusing though.",
    mockReplyText: "Thanks so much for the feedback, Elena! Jordan loved doing your highlights. We hear you on the booking system and are simplifying the online portal slots this week. See you for your next touch-up!",
  },
  restaurant: {
    name: "Restaurants & Bars",
    headline: "Never leave a diner hanging. Auto-reply to restaurant reviews.",
    subheadline: "Diners check reviews in seconds. Draft warm, specific replies in one tap and send automated text-review requests to your guests.",
    problem: "A 25-minute wait can turn into a 1-star review. How you reply determines if they ever come back.",
    statNumber: 93,
    statLabel: "of consumers check restaurant reviews and replies before deciding where to dine.",
    mockReviewName: "Marcus T.",
    mockReviewText: "Food was amazing but we waited almost 25 minutes for a table even with a reservation.",
    mockReplyText: "Thanks so much for the honest feedback, Marcus — a 25-minute wait is not the experience we want, even with a reservation. We are tightening up our seating flow this week. Hope you will give us another shot soon!",
  },
  contractor: {
    name: "Contractors & Home Services",
    headline: "Win more bids. The automated review tool for home contractors.",
    subheadline: "Homeowners pay thousands to contractors they trust. Send SMS review requests instantly after a job and build an unbeatable Google profile.",
    problem: "Prospects search for home service providers on their phones. The contractor with the most reviews wins the job.",
    statNumber: 88,
    statLabel: "of homeowners trust online contractor reviews as much as personal referrals.",
    mockReviewName: "David P.",
    mockReviewText: "Great roofing job, fast and clean cleanup. Took an extra day to get the final invoice though.",
    mockReplyText: "We appreciate the review, David! So glad you liked the cleanup and quality of the roof. Apologies for the invoice delay; we are moving to automated billing this month to fix that. Thanks for choosing us!",
  }
};

export default function IndustryLandingPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "restaurant";

  const industry = INDUSTRIES[slug];

  const [typedReply, setTypedReply] = useState("");
  const [postedCheck, setPostedCheck] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isAnnual, setIsAnnual] = useState(false);
  const [priceFading, setPriceFading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!industry) return;
    function typeLoop() {
      setTypedReply("");
      setPostedCheck(false);
      let i = 0;
      intervalRef.current = setInterval(() => {
        if (!industry) return;
        if (i < industry.mockReplyText.length) {
          setTypedReply(industry.mockReplyText.slice(0, i + 1));
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
  }, [industry]);

  if (!industry) {
    notFound();
    return null;
  }

  const handlePricingToggle = (annual: boolean) => {
    setPriceFading(true);
    setTimeout(() => {
      setIsAnnual(annual);
      setPriceFading(false);
    }, 200);
  };

  const FAQ_ITEMS = [
    { q: `How does ReviewReply help ${industry.name}?`, a: "We monitor your listings, generate customized drafts matching your precise brand voice guidelines, and allow you to request reviews from customers via SMS/email with a single click." },
    { q: "Do I need to install any software?", a: "No, ReviewReply is a fully cloud-based web application. It works perfectly on your desktop, iPad, or mobile phone so you can manage your reputation anywhere." },
    { q: "Can I manage multiple locations?", a: "Yes! Our premium Enterprise plan is built exactly for multi-location businesses and franchises with centralized management and a global dashboard." },
  ];

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
              <span className="text-coral">●</span> Tailored for {industry.name}
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.06] lg:text-[52px]" style={{ fontSize: "clamp(32px, 8vw, 52px)" }}>
              {industry.headline}
            </h1>
            <p className="mt-5 max-w-md text-lg text-cream-dim">
              {industry.subheadline}
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
                <div className="text-base tracking-wider text-coral">★★★★☆</div>
                <div className="rounded bg-cream/5 px-2 py-0.5 font-mono text-xs text-cream-dim">Google · New</div>
              </div>
              <div className="mb-1 text-sm font-semibold">{industry.mockReviewName}</div>
              <div className="text-sm text-cream-dim">&ldquo;{industry.mockReviewText}&rdquo;</div>
            </div>
            <div className="rounded-xl border border-dashed border-brass/40 bg-brass/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-brass-light">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-light" />
                Drafting reply in your voice
              </div>
              <div className="text-sm text-cream">{typedReply}<span className="animate-pulse">|</span></div>
              {postedCheck && (
                <div className="mt-3 flex items-center gap-2 font-mono text-xs text-green-400">
                  ✓ Posted to Google — 0:11 after the review came in
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
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-coral">The Reputation Gap</div>
            <h2 className="mb-3.5 text-4xl font-bold text-ink-text">{industry.problem}</h2>
            <p className="text-lg text-[#4A5A4F]">Your online reputation is the single biggest factor when customers research local businesses nearby.</p>
          </div>
          <div className="stagger-children grid grid-cols-1 gap-7 sm:grid-cols-3">
            <StatCard num={`${industry.statNumber}%`} label={industry.statLabel} />
            <StatCard num="4+ days" label="average response time of a local business without an automated reputation tool." />
            <StatCard num="0 hours" label="extra manual work added to your weekly to-do list." />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mb-12 max-w-2xl">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">How it works</div>
            <h2 className="text-4xl font-bold">Setup in minutes. Autopilot thereafter.</h2>
          </div>
          <div className="stagger-children grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard num="01" title="Connect" desc="Link Google Business Profile and Facebook in clicks." />
            <StepCard num="02" title="Auto-Draft" desc="Get on-brand draft replies in seconds based on your brand rules." />
            <StepCard num="03" title="Review Requests" desc="Text/email review links to customers automatically." />
            <StepCard num="04" title="Dominate" desc="More replies, higher ratings, more Google organic visits." />
          </div>
        </div>
      </section>

      {/* BEFORE/AFTER */}
      <BeforeAfter />

      {/* PRICING */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="reveal mx-auto mb-12 max-w-2xl text-center">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">Pricing</div>
            <h2 className="text-4xl font-bold">Find a plan that fits your business scale.</h2>
            <p className="mt-3 text-lg text-cream-dim">All plans include a 14-day free trial. Cancel anytime.</p>
          </div>
          <PricingToggle onToggle={handlePricingToggle} />
          <div className={`price-transition mx-auto grid max-w-5xl grid-cols-1 gap-7 md:grid-cols-3 ${priceFading ? 'fading' : ''}`}>
            <PriceCard
              plan="Starter"
              price={isAnnual ? "$24" : "$29"}
              priceSuffix="/ mo"
              desc="For small operations managing a single location."
              features={["1 location", "Google reviews replies", "Email review requests", "100 requests/mo included"]}
              cta="Start trial"
              featured={false}
            />
            <PriceCard
              plan="Pro"
              price={isAnnual ? "$49" : "$59"}
              priceSuffix="/ mo"
              desc="Best for single locations wanting text message requests."
              features={["1 location", "Google + Facebook reviews", "SMS + email requests", "300 requests/mo included", "Priority support"]}
              cta="Start trial"
              featured={true}
            />
            <PriceCard
              plan="Enterprise"
              price={isAnnual ? "$199" : "$249"}
              priceSuffix="/ mo"
              desc="Built for multi-location groups, agencies, and franchises."
              features={["Multi-location aggregate dashboard", "Google + Facebook reviews", "SMS + email requests", "2,000 requests/mo included", "24/7 account manager"]}
              cta="Start trial"
              featured={false}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="reveal mb-12">
            <div className="mb-5 font-mono text-xs uppercase tracking-widest text-brass-light">FAQ</div>
            <h2 className="text-4xl font-bold">Frequently Asked Questions</h2>
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

      {/* FOOTER */}
      <footer className="px-6 pb-9 pt-14 border-t border-cream/10">
        <div className="mx-auto max-w-[1180px] flex flex-wrap items-center justify-between gap-3.5 text-sm text-cream-dim">
          <div>© 2026 ReviewReply-Lite. All rights reserved.</div>
          <div>Built for businesses with zero time to waste.</div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ num, label }: { num: React.ReactNode; label: string }) {
  return (
    <div className="card-hover rounded-xl bg-paper-2 p-6">
      <div className="font-mono text-4xl font-semibold text-ink-text">{num}</div>
      <div className="mt-1.5 text-sm text-[#5A6A5F]">{label}</div>
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

function PriceCard({ plan, price, priceSuffix, desc, features, cta, featured }: { plan: string; price: string; priceSuffix: string; desc: string; features: string[]; cta: string; featured: boolean }) {
  return (
    <div className={`price-card-hover rounded-2xl p-9 flex flex-col justify-between ${featured ? "border-2 border-brass bg-ink-2" : "border border-cream/10 bg-ink-2"}`}>
      <div>
        {featured && <div className="mb-3 inline-block rounded bg-brass px-2.5 py-1 font-mono text-xs font-semibold text-ink">MOST POPULAR</div>}
        <div className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-cream-dim">{plan}</div>
        <div className="mb-0.5 font-mono text-4xl font-semibold">{price} <span className="text-base font-normal text-cream-dim">{priceSuffix}</span></div>
        <p className="mb-5 mt-2 text-sm text-cream-dim">{desc}</p>
        <ul className="mb-7 space-y-0">
          {features.map((f, i) => (
            <li key={i} className="relative border-b border-cream/5 py-2 pl-6 text-sm last:border-0 before:absolute before:left-0 before:text-brass-light before:content-['✓']">{f}</li>
          ))}
        </ul>
      </div>
      <a href="/login" className={`btn-lift block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition ${featured ? "bg-brass text-ink hover:brightness-110" : "border border-cream/30 text-cream hover:border-brass hover:text-brass-light"}`}>{cta}</a>
    </div>
  );
}

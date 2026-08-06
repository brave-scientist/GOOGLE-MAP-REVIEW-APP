"use client";

/**
 * components/OnboardingForm.tsx — multi-step onboarding (client component).
 *
 * Steps (Implementation-Plan Days 7-9):
 *   1. Business name + category dropdown + timezone (auto-detected, editable)
 *   2. Brand voice textarea (exact placeholder from Implementation-Plan Day 7)
 *   3. Connect Google Business Profile (mock) + optionally Facebook Page (mock)
 *
 * On completion → redirect to /dashboard.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MOCK_GOOGLE_LOCATIONS, MOCK_FACEBOOK_PAGES } from "@/lib/integrations/mock-data";

const CATEGORIES = [
  { value: "restaurant", label: "Restaurant / Café" },
  { value: "salon", label: "Salon / Spa" },
  { value: "dental", label: "Dental / Med Spa" },
  { value: "retail", label: "Retail Shop" },
  { value: "contractor", label: "Contractor / Trade" },
  { value: "other", label: "Other" },
] as const;

export default function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Step 1 fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("restaurant");
  const [timezone, setTimezone] = useState("America/New_York");

  // Step 2 fields
  const [brandVoice, setBrandVoice] = useState("");

  // Step 3 fields
  const [googleConnected, setGoogleConnected] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);

  useEffect(() => {
    // Auto-detect timezone from browser.
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // keep default
    }
  }, []);

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, timezone }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to create business");
      setBusinessId(data.business.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business");
    } finally {
      setBusy(false);
    }
  }

  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setBusy(true);
    try {
      // Update brand voice notes on the business.
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_voice_notes: brandVoice }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to save brand voice");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brand voice");
    } finally {
      setBusy(false);
    }
  }

  async function connectGoogle() {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      const loc = MOCK_GOOGLE_LOCATIONS[0]!;
      const res = await fetch(`/api/businesses/${businessId}/connect/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: loc.account_id, place_id: loc.place_id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Connect failed");
      setGoogleConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectFacebook() {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      const page = MOCK_FACEBOOK_PAGES[0]!;
      const res = await fetch(`/api/businesses/${businessId}/connect/facebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: page.page_id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Connect failed");
      setFacebookConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-ink px-6 py-12">
      <div className="mx-auto max-w-lg">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                s <= step ? "bg-brass" : "bg-cream/15"
              }`}
            />
          ))}
        </div>

        <p className="mb-6 font-mono text-xs uppercase tracking-widest text-brass-light">
          Step {step} of 3
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}

        {/* Step 1: Business info */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-5">
            <h1 className="font-display text-2xl font-bold text-cream">
              Tell us about your business
            </h1>
            <div>
              <label className="mb-2 block text-sm font-medium text-cream" htmlFor="biz-name">
                Business name
              </label>
              <input
                id="biz-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Copper Spoon"
                className="w-full rounded-lg border border-cream/15 bg-ink-2 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-cream" htmlFor="biz-cat">
                Category
              </label>
              <select
                id="biz-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-cream/15 bg-ink-2 px-4 py-3 text-cream focus:border-brass focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-cream" htmlFor="biz-tz">
                Timezone
              </label>
              <input
                id="biz-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-cream/15 bg-ink-2 px-4 py-3 text-cream focus:border-brass focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brass py-3 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {/* Step 2: Brand voice */}
        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-5">
            <h1 className="font-display text-2xl font-bold text-cream">
              How do you talk to customers?
            </h1>
            <p className="text-sm text-cream-dim">
              This directly shapes how the AI drafts replies on your behalf. Be specific —
              the better we know your voice, the better the drafts.
            </p>
            <textarea
              required
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={5}
              placeholder="Tell us how you talk to customers — e.g. casual, uses first names, mentions our dog Biscuit."
              className="w-full rounded-lg border border-cream/15 bg-ink-2 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brass py-3 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {/* Step 3: Connect platforms */}
        {step === 3 && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold text-cream">
              Connect your review platforms
            </h1>
            <p className="text-sm text-cream-dim">
              We'll pull your existing reviews and watch for new ones automatically.
            </p>

            <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-cream">Google Business Profile</span>
                {googleConnected ? (
                  <span className="text-sm text-green-400">✓ Connected</span>
                ) : (
                  <button
                    onClick={connectGoogle}
                    disabled={busy}
                    className="rounded-lg border border-brass px-4 py-2 text-sm font-medium text-brass-light transition hover:bg-brass hover:text-ink disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
              <p className="text-xs text-cream-dim">
                {googleConnected
                  ? MOCK_GOOGLE_LOCATIONS[0]!.name
                  : "Required — your Google reviews live here."}
              </p>
            </div>

            <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-cream">Facebook Page</span>
                {facebookConnected ? (
                  <span className="text-sm text-green-400">✓ Connected</span>
                ) : (
                  <button
                    onClick={connectFacebook}
                    disabled={busy}
                    className="rounded-lg border border-cream/30 px-4 py-2 text-sm font-medium text-cream transition hover:border-brass hover:text-brass-light disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
              <p className="text-xs text-cream-dim">
                {facebookConnected
                  ? MOCK_FACEBOOK_PAGES[0]!.name
                  : "Optional — add this to also cover Facebook reviews (Pro plan)."}
              </p>
            </div>

            <button
              onClick={finish}
              disabled={!googleConnected}
              className="w-full rounded-lg bg-brass py-3 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {googleConnected ? "Go to dashboard →" : "Connect Google to continue"}
            </button>
            {googleConnected && (
              <button
                onClick={finish}
                className="w-full text-center text-sm text-cream-dim underline hover:text-cream"
              >
                Skip Facebook for now
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
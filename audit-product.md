# Product Strategy Audit — ReviewReply-Lite

**Repo audited:** `/home/z/my-project/review-app-extracted/REVIEW APP/`
**Audit type:** Strategic product analysis (docs ↔ code reconciliation)
**Depth:** Very thorough — every markdown doc read end-to-end + cross-referenced against code
**Task ID:** `audit-3` · **Agent:** Product Strategist
**Date:** 2026-08-06

---

## Executive Summary

1. **ReviewReply-Lite is a tightly-scoped, well-documented $29–$59/mo SaaS for single-location businesses** (restaurants, salons, dental, retail, contractors) that auto-drafts replies to Google/Facebook reviews and sends review requests by SMS/email. The vision is sharp and the buyer persona is concrete: a non-technical owner who has "never built a spreadsheet."

2. **The documentation suite is genuinely excellent for a pre-launch product** — `Product-Roadmap.md`, `Implementation-Plan.md`, `AGENTS.md`, `Decision-Log.md`, `Data-Handling-Policy.md`, `Landing-Page-Prompt-Pack.md`, and `MOCK-TO-REAL.md` form a coherent operating system with explicit acceptance criteria, escalation triggers, and a running change log.

3. **The current build is a complete mock-mode demo**, not a production app. Every `lib/integrations/*` file has real API call code written but gated behind `USE_MOCKS=true` (default). The mock-mode path works end-to-end: signup → onboarding → mock Google connect → poll-reviews → AI draft (rule-based, not Claude) → post reply (simulated) → quick-add review request → mock SMS/email → mock billing. No real third-party account exists.

4. **The single biggest strategic risk is silent scope creep: an "Enterprise" tier ($249/mo, multi-location, organization dashboards) has been built into the code but is NOT in any locked doc, has NO Decision-Log entry authorizing it, and directly contradicts the Product-Roadmap's explicit non-goal: "Multi-location / enterprise dashboards (single-location only for launch)."** It also conflicts with the comparison pages' thesis ("we're simpler because we don't do enterprise").

5. **Three documented Phase features are silently broken or missing in mock mode**: (a) Facebook Connect (`/api/businesses/[id]/connect/facebook` route is referenced by `OnboardingForm.tsx` but doesn't exist); (b) click-tracking (`/r/[token]` route mentioned in code but never built — Phase 3 acceptance criterion); (c) plan-gating middleware (Phase 4 / Day 27 — never built).

6. **The locked AI model name `claude-sonnet-4-6` is not a real Anthropic model identifier.** The real-mode `callAnthropic()` will fail at runtime with a 400/404 from Anthropic. This bug is replicated in three locked docs.

7. **The README.md is essentially empty** (a single line `GOOGLE-MAP-REVIEW-APP` with a UTF-16 BOM, not "ReviewReply-Lite"). Anyone landing on the repo — including the founder, future hires, or beta testers — has no entry point. This is the most visible doc failure.

8. **Compliance posture is honest but not implemented.** `Data-Handling-Policy.md` explicitly disclaims GDPR/CCPA/SOC2 status (correctly, for a pre-launch product) but its own rules — 30-day deletion on cancellation, OAuth-token encryption, no-PII-in-logs — have **no code enforcing them**. No background deletion job exists. OAuth "encrypted" columns store plaintext mock strings. No audit trail of access.

9. **Zero automated tests exist** despite `vitest` being configured and AGENTS.md §4 mandating "every `lib/integrations/*` function has at least one test using mocked responses." The `pnpm test` script runs but exercises nothing.

10. **Differentiation thesis (vs Birdeye, vs Podium) is consistent and defensible** in the docs and comparison pages: simpler, cheaper, no contract, single-location, reviews-only. But the unapproved Enterprise tier dilutes it. Beta testers who see the Enterprise card on the marketing site will reasonably wonder whether the "we don't do enterprise" pitch is real.

---

## Stated Vision & Target Customer

### Vision (from `Product-Roadmap.md` §0)
> *"A $29–$59/mo tool that watches a single-location business's Google/Facebook reviews, drafts on-brand AI replies for one-click posting, and automatically requests reviews from recent customers."*

### Target customer
- **Owner or manager of one location** — restaurant, salon, dental/med spa, retail shop, contractor.
- **Not technical.** Expects something as simple as a text-message app.
- **Has never built a spreadsheet** (this is explicitly called out as a UX constraint — it shaped the entire Phase 3 entry-method prioritization).
- **Time-starved front-counter operator** (will use the app on a phone or tablet between customers).

### Core jobs the product must do (priority order)
1. Notify the owner the moment a new review arrives.
2. Draft a reply that sounds like a human who runs this business, not a corporate bot.
3. Let the owner post that reply in one tap.
4. Automatically ask recent customers to leave a review.

### Explicit non-goals for v1 (locked)
- Multi-location / enterprise dashboards (single-location only).
- Review monitoring beyond Google + Facebook (Yelp/TripAdvisor deferred).
- Social media scheduling, SEO tools, anything outside review reply/request.
- Native mobile app (responsive web only).

### Locked pricing (final, "do not revisit mid-build")
- Starter: $29/mo — 1 location, Google-only, email review requests, 100 requests/mo.
- Pro: $59/mo — 1 location, Google + Facebook, SMS + email review requests, 300 requests/mo.
- Overage: $0.05 per review-request beyond the plan's allotment (Stripe metered).
- Trial: 14 days, card required at signup.
- Beta cohort: exactly 8 businesses, with 5-of-8 activation gate.

---

## Full Feature Inventory (Doc-stated vs Code-implemented vs Gap)

| # | Feature (doc source) | Doc says | Code does | Status |
|---|---|---|---|---|
| 1 | Email/password signup + Google OAuth login | Phase 1 / Day 6 | Mock email-only login (any email works). Google OAuth not wired. | ⚠️ Mock only |
| 2 | Business onboarding (name, category, timezone, brand voice) | Phase 1 / Days 7–8 | `OnboardingForm.tsx` — 3-step flow, working in mock | ✅ Done |
| 3 | Google Business Profile OAuth connect (location picker) | Phase 1 / Day 8 | Mock connect — picks from `MOCK_GOOGLE_LOCATIONS`. No real OAuth. | ⚠️ Mock only |
| 4 | Facebook Page OAuth connect | Phase 1 / Day 9 | **`OnboardingForm.tsx` calls `/api/businesses/[id]/connect/facebook` but no such route exists.** UI gets a JSON 404. | ❌ **Broken in mock** |
| 5 | 20-minute review polling job | Phase 1 / Day 12 | `lib/inngest/poll-reviews.ts` — cron registered, manual trigger works | ✅ Done (mock data) |
| 6 | Dedup by `external_review_id` | Phase 1 | `LocalStore.upsertReview` + SQL unique constraint | ✅ Done |
| 7 | "New review" → email owner | Phase 1 / Day 13 #5 | Comment exists in poll job; no Resend call wired into the event | ❌ Not wired |
| 8 | Reviews list page (source icon, rating, reviewer, text, status) | Phase 1 / Day 14 | `app/(app)/reviews/page.tsx` + `ReviewCard.tsx` | ✅ Done |
| 9 | AI draft engine (Claude claude-sonnet-4-6) | Phase 2 / Day 16 | `lib/ai/draft-reply.ts` — rule-based generator now, real Anthropic call gated. **Model name `claude-sonnet-4-6` is not a real Anthropic model** — real call will fail. | ⚠️ Mock works; real path broken |
| 10 | 5★/4★/3★/1-2★ tone rules | Phase 2 | All four buckets implemented with varied phrasing + brand-voice parsing | ✅ Done |
| 11 | "Never invent facts" / "match brand voice" prompt design | Phase 2 | Both enforced in `buildPrompt()` and rule-based generator | ✅ Done |
| 12 | Editable draft textarea + Regenerate + Post Reply | Phase 2 / Day 17 | `ReviewCard.tsx` — all three actions | ✅ Done |
| 13 | Per-business auto-post toggle (4-5★ only, locked) | Phase 2 / Day 17 | `SettingsForm.tsx` + `generate-reply-draft.ts` enforces the 4-5★ rule | ✅ Done |
| 14 | Reply posting via Google/Facebook API | Phase 2 / Day 18 | Mock `postReply()` simulates success. Real Google `postReply` throws "requires review name resolution." Real Facebook `postReply` throws "requires page token + story id." | ❌ Real path unimplemented |
| 15 | Failure → error_message + Retry button | Phase 2 | `review_replies.error_message` column + status=failed path. Retry button UI missing. | ⚠️ Partial |
| 16 | Quick-add form (primary, name + phone, mobile-first) | Phase 3 / Day 21 | `RequestsManager.tsx` quick-add tab. Send happens immediately. | ✅ Done |
| 17 | Paste-a-list textarea (lenient parser, ≥90% parse) | Phase 3 / Day 22 | `paste-list-parser.ts` + preview UI | ✅ Done |
| 18 | CSV upload (tertiary) | Phase 3 / Day 23 | `upload/route.ts` reuses paste-list parser. **Quoted multi-line CSV fields won't parse correctly** (no real CSV parser lib). | ⚠️ Partial |
| 19 | Message template editor with merge fields | Phase 3 / Day 24 | `SettingsForm.tsx` — `{customer_name}`, `{business_name}`, `{review_link}` | ✅ Done |
| 20 | Twilio SMS send (with pacing for batches) | Phase 3 / Day 24 | `twilio.ts` mock + real REST call. Pacing 2s in `runSendBatch`. | ✅ Done (mock) |
| 21 | Resend email send | Phase 3 / Day 24 | `resend.ts` mock + real API call. From address hardcoded `notifications@reviewreply.app` — not a verified domain. | ⚠️ From-address needs fixing |
| 22 | Click-tracking short link `/r/{request_id}` | Phase 3 / Day 24 #7 | Code references it (`reviewLink = business.google_review_link ?? ${APP_URL}/r/${request.click_token}`), but **no `/r/[token]/page.tsx` route exists**. Status field `clicked` is never set anywhere. | ❌ **Not built** |
| 23 | Stripe Checkout (14-day trial, card required) | Phase 4 / Day 26 | `stripe.ts` real + mock. Mock path bypasses Stripe entirely and writes to DB directly. | ⚠️ Mock works |
| 24 | Stripe webhook handler | Phase 4 / Day 26 #2 | **`/api/webhooks/stripe/route.ts` does not exist.** Mock mode doesn't need it; real mode cannot function without it. | ❌ Not built |
| 25 | Plan gating middleware (Starter blocks FB + SMS) | Phase 4 / Day 27 #3 | **Not implemented anywhere.** Starter customers can connect Facebook and send SMS today. | ❌ **Not built** |
| 26 | Metered overage reporting to Stripe | Phase 4 / Day 27 #4 | `reportOverageUsage()` exists but is a no-op in mock mode; never called from the request-send path. | ❌ Not wired |
| 27 | Self-serve cancel button | Phase 4 / Day 28 | `BillingManager.tsx` cancel flow + `cancelSubscription()` | ✅ Done (mock) |
| 28 | Billing page (current plan, usage bar, invoices) | Phase 4 / Day 28 | `BillingManager.tsx` — plan/usage/cancel. **No invoice list.** | ⚠️ Partial |
| 29 | Guided onboarding checklist (visual progress) | Phase 5 / Day 31 | `OnboardingForm.tsx` 3-step progress bar | ✅ Done |
| 30 | Empty states (zero reviews, zero requests) | Phase 5 / Day 32 | Dashboard + Reviews + Requests pages all have empty states | ✅ Done |
| 31 | Notification preferences (email/SMS, daily digest) | Phase 5 / Day 33 | `SettingsForm.tsx` — three toggles. **Daily digest job does not exist.** | ⚠️ UI done, job missing |
| 32 | Marketing/landing page (hero, features, pricing, FAQ) | Phase 5 / Day 35 | `app/(marketing)/page.tsx` — full interactive port of `landing-page.html` | ✅ Done |
| 33 | Comparison pages: /vs/birdeye, /vs/podium | Phase 5 / Day 36 | Both exist as server components | ✅ Done |
| 34 | Privacy Policy + Terms of Service (live URLs) | Phase 5 / Day 34 | Both exist, clearly labeled as placeholder | ✅ Done (placeholder) |
| 35 | Shared support inbox monitored daily | Phase 5 / Day 37 | Not set up (out of code scope) | ❌ Deferred |
| 36 | Mobile-responsive QA pass | Phase 5 / Day 38 | Landing page + app shell responsive; mobile nav implemented | ✅ Done |
| 37 | Beta cohort recruitment (exactly 8 businesses) | Phase 6 / Day 41 | Not started | ⏸ Phase 6 |
| 38 | Activation metric tracking | Phase 6 / Day 42–50 | No activation dashboard exists; no PostHog events instrumented | ❌ Not built |
| 39 | Google/Meta API production approval | Phase 7 / Day 56 | Not submitted (mock mode) | ❌ Deferred |
| 40 | Twilio 10DLC registration | Phase 0 / Day 3 | Not started | ❌ Deferred |
| 41 | Stripe live mode + bank verification | Phase 7 / Day 58 | Not started | ❌ Deferred |
| 42 | Better Uptime monitor | Phase 7 / Day 59 | Not set up | ❌ Deferred |
| 43 | Sentry error monitoring | Phase 0 / Day 5 | Stubbed — Decision-Log notes skipped | ❌ Skipped |
| 44 | PostHog analytics | Phase 0 / Day 5 | Stubbed — Decision-Log notes skipped | ❌ Skipped |
| 45 | Enterprise tier / multi-location / org dashboard | **Explicit non-goal in Roadmap §0** | **`lib/types.ts` adds `enterprise` plan; `0002_add_organizations.sql` adds orgs; `org-dashboard/page.tsx` + `BillingManager.tsx` Enterprise card + industry landing pages all show $249/mo Enterprise tier** | 🚨 **Unapproved scope creep** |
| 46 | Annual pricing toggle | Not in locked pricing | `PricingToggle.tsx` shows Monthly/Annual toggle. Comment: "Annual billing not yet live." Solutions pages show $24/$49/$199 annual prices. | 🚨 Unapproved scope creep |
| 47 | Industry-specific landing pages (/solutions/[slug]) | Not mentioned in roadmap | `app/(marketing)/solutions/[slug]/page.tsx` — 4 industries (dental, salon, restaurant, contractor) | ⚠️ Added scope, useful, but undocumented |

### Summary of feature status
- **Done (mock or real):** 18
- **Partial:** 9
- **Mock-only (real path blocked on Phase 0 setup):** 9
- **Not built (but in roadmap):** 8
- **Broken in mock:** 2 (Facebook connect, click tracking)
- **Unapproved scope creep:** 3 (Enterprise tier, annual pricing, industry landing pages)

---

## Tech Stack Analysis

### Production dependencies (`package.json`)

| Dependency | Version | Purpose | Right choice? |
|---|---|---|---|
| `next` | 14.2.15 | Next.js App Router framework | ✅ Right — but **version has a security advisory** flagged in Decision-Log (2026-08-01). Should bump to latest 14.2.x patch before launch. |
| `react` / `react-dom` | ^18.3.1 | UI library | ✅ Right. React 19 exists but 18 is the safe choice for a production-bound app. |
| `@supabase/ssr` | ^0.5.2 | Supabase SSR cookie helpers for Next.js | ✅ Right — required for App Router + Supabase Auth. |
| `@supabase/supabase-js` | ^2.45.4 | Core Supabase JS client | ✅ Right. |
| `inngest` | ^3.27.0 | Background job queue + scheduler | ✅ Right. Trigger.dev is comparable; raw cron would not handle retries/visibility. |
| `stripe` | ^16.12.0 | Stripe Node SDK | ✅ Right. Standard. |
| `zod` | ^3.23.8 | Schema validation | ⚠️ Right choice but **underused** — API routes use ad-hoc `as` type casts instead of `z.parse()`. A genuine runtime validator would catch malformed payloads that TS doesn't. |

### Dev dependencies

| Dependency | Version | Purpose | Notes |
|---|---|---|---|
| `typescript` | ^5.6.2 | Type checking | ✅ Right. `strict: true`, `noUncheckedIndexedAccess: true` — strict config is good. |
| `tailwindcss` | ^3.4.13 | CSS framework | ✅ Right. v4 exists but v3 is stable and the design system is built around v3 conventions. |
| `autoprefixer` / `postcss` | recent | CSS pipeline | ✅ Standard. |
| `eslint` / `eslint-config-next` | 8.57.1 / 14.2.15 | Linting | ✅ Standard. Config is bare-bones — only `react/no-unescaped-entities` overridden. Could enforce PII-in-logs rule via custom rule. |
| `tsx` | ^4.19.1 | TS script runner (seed/migrate) | ✅ Right. |
| `vitest` | ^2.1.2 | Test runner | ⚠️ Installed and `pnpm test` runs, but **no tests directory exists**. Pure dead dependency until tests are written. |

### Notable absences
- ❌ `@sentry/nextjs` — Decision-Log notes Sentry was stubbed. Adding it is a Phase 0 / pre-launch task.
- ❌ `posthog-js` — same.
- ❌ Any CSV parser (e.g., `papaparse`, `csv-parse`). The CSV upload route reuses `parsePasteList`, which is line-oriented and will mis-parse quoted multi-line fields.
- ❌ Any OAuth client library (e.g., `openid-client`, `next-auth`). The real Google/Meta OAuth flows will need either hand-rolled HTTP or a library; current code has neither.
- ❌ Any rate-limit library (e.g., `upstash/ratelimit`). When real Twilio/Anthropic calls start hitting their respective APIs, a 429 backoff strategy will be needed.
- ❌ Any email-template rendering library. `resend.ts` accepts `html?` but the send path always passes plain text.

### Tech-stack verdict
The stack is **opinionated, correct, and the right size for a solo-maintained SaaS**. Supabase + Inngest + Stripe + Vercel is a textbook choice. The locked-decisions discipline (no substitutions without founder approval) is exactly right for a pre-launch product.

The **two real concerns** are:
1. The locked AI model name `claude-sonnet-4-6` is not a real Anthropic identifier. The closest real model as of the docs is `claude-sonnet-4-20250514` or `claude-3-5-sonnet-20241022`. The real-mode `callAnthropic()` will fail with a 400/404 from Anthropic's API the first time it runs.
2. The mock-mode build has accumulated real production blockers (missing webhook handler, missing plan-gating middleware, missing click-tracking route) that the docs do not flag. `MOCK-TO-REAL.md` undersells the remaining work.

---

## Architecture Decisions (`Decision-Log.md`)

### Documented decisions (sound, well-reasoned)
1. **Locked pricing & vendor stack** — sensible; eliminates mid-build analysis paralysis.
2. **Quick-add as primary entry method** over CSV-only — correct UX insight for the target persona.
3. **Exactly 8 beta businesses** as a go/no-go gate — converts a soft "5–10" into a hard acceptance criterion.
4. **Full mock-mode build approach** (real signatures + mock data, gated on `USE_MOCKS`) — correct; lets the entire app run with zero credentials while keeping the real path one-flag away.
5. **Local file-backed store fallback** (`local-store/db.json`) — pragmatic; lets the demo run without Supabase creds. Correctly noted as config-only swap.
6. **Rule-based AI generator** following all Phase 2 tone rules — bold but defensible. The Decision-Log explicitly says this is the functional stand-in, with the real Anthropic call one-file-swap away.
7. **`pnpm` installed via npm instead of corepack** — minor infra deviation, correctly logged.
8. **Next 14.2.15 security advisory noted, not patched** — correctly flagged for founder follow-up.
9. **Stripe simulated in local DB** — correct for mock mode.
10. **OAuth replaced with mock connect flow** — correct for mock mode.
11. **Sentry/PostHog/Better Uptime stubbed** — correct call; observability is post-launch polish.
12. **`pnpm-workspace.yaml` `onlyBuiltDependencies` for esbuild/protobufjs/unrs-resolver** — correct pnpm v11 workaround.
13. **Dev trigger route** (`/api/dev/trigger`) for manual job testing — explicitly required by AGENTS.md §4. Solid.
14. **App pages marked `force-dynamic`** — correct fix for the static-prerender/session-null issue.
15. **Landing page ported from HTML to React with interactive enhancements** — exceeds the kickoff requirement, well-documented.
16. **`data-review-id` attribute on ReviewCard** — minimal non-breaking testability improvement, correctly logged.
17. **Hydration mismatch fix on Posted timestamp** — clean approach (mount-gate the timestamp render).
18. **Missing `/requests` page fix (2026-08-03)** — caught and fixed the same class of bug that still exists for Facebook connect today.

### Missing Decision-Log entries (violations of AGENTS.md §1)
The following changes have been made in code **without a corresponding Decision-Log entry**, in violation of the rule that "locked pricing, plan gating, and beta cohort size (8) are not editable without an explicit new instruction from the founder recorded in `Decision-Log.md`":

1. 🚨 **Addition of an `enterprise` plan** ($249/mo, multi-location, 2,000 requests/mo) in:
   - `lib/types.ts` `SubscriptionPlan` union and `PLAN_LIMITS` / `PLAN_PRICES`
   - `app/(app)/billing/page.tsx` (ENTERPRISE_PRICE, ENTERPRISE_LIMIT constants)
   - `components/BillingManager.tsx` (Enterprise card with "Upgrade to Enterprise" button)
   - `app/(marketing)/solutions/[slug]/page.tsx` (Enterprise shown in 3-tier pricing on all industry pages)
   - `app/(marketing)/page.tsx` likely too (need to verify; given the consistency pattern, likely yes)
   
2. 🚨 **Addition of `organizations` table, multi-location, role system** in:
   - `supabase/migrations/0002_add_organizations.sql` — full org model with `individual` / `org_admin` / `location_manager` roles
   - `app/(app)/org-dashboard/page.tsx` — aggregate multi-location dashboard with leaderboard
   - `components/AppNav.tsx` — "Organization" nav item appears if user has >1 business
   - `scripts/seed.ts` — seeds with `role: "org_admin"` user
   - `lib/auth.ts` / `lib/db.ts` / `lib/types.ts` — all extended for org model
   
3. 🚨 **Addition of annual pricing toggle** showing $24/$49/$199 annual prices on industry landing pages, despite locked pricing being monthly-only and `PricingToggle.tsx` itself commenting "Annual billing not yet live — activate in Stripe when ready."

4. ⚠️ **Addition of `/solutions/[slug]` industry-specific landing pages** (dental, salon, restaurant, contractor). Not mentioned in `Product-Roadmap.md` Phase 5's "marketing/landing page" scope. Useful, but should be documented.

5. ⚠️ **The `SubscriptionPlan` enum migration was NOT added** — `0001_init.sql` defines `subscription_plan as enum ('starter','pro')` (no `enterprise`), but `lib/types.ts` extends the union to include `enterprise`. The SupabaseStore will fail at the database boundary in real mode if a Pro customer tries to switch to Enterprise. **The schema migration was never updated to match the code drift.**

### Verdict on documented decisions
The Decision-Log is being used **correctly for the mock-mode build** but is being **violated by the Enterprise/multi-location scope creep**. The pattern suggests an agent (or human) started adding enterprise features without going through the escalation procedure AGENTS.md §3 mandates.

---

## Gaps Between Vision and Implementation

### Strategic gaps (vision-level)
| Gap | Severity |
|---|---|
| Enterprise tier introduced without approval — dilutes the single-location positioning | 🚨 Critical |
| Annual pricing shown but not wired — locked pricing is monthly-only | 🚨 Critical |
| Click tracking (the "single most convincing metric for renewal") not built | 🔴 High |
| Plan gating not enforced — Starter customers get Pro features | 🔴 High |
| No activation-metric dashboard — Phase 6's leading indicator can't be measured | 🔴 High |
| No tests — AGENTS.md §4 violation; every integration needs mocked-response tests | 🔴 High |

### Tactical gaps (build-level)
| Gap | Severity |
|---|---|
| Facebook connect route missing (404 in mock UI) | 🔴 High |
| Stripe webhook handler missing (real-mode blocker) | 🔴 High |
| Google/Meta OAuth callback routes missing (real-mode blocker) | 🔴 High |
| `/r/[token]` click-tracking route missing | 🔴 High |
| Real Google `postReply` throws "requires review name resolution" | 🔴 High |
| Real Facebook `postReply` throws "requires page token + story id" | 🔴 High |
| Real Google `fetchReviews` has `accountId = ""` (unimplemented) | 🟡 Medium |
| Model name `claude-sonnet-4-6` not a real Anthropic model | 🔴 High |
| `subscription_plan` Postgres enum doesn't include `enterprise` — schema drift | 🔴 High |
| No background deletion job for the 30-day retention rule (Data-Handling §4) | 🔴 High |
| No OAuth-token encryption (Data-Handling §2.1) — columns store plaintext mock strings | 🟡 Medium (mock only) |
| No daily-digest job (Phase 5 / Day 33) despite settings toggle | 🟡 Medium |
| No retry button on failed reply posts (Phase 2 acceptance) | 🟡 Medium |
| No invoice list on billing page | 🟢 Low |
| Resend `from` address hardcoded to unverified domain | 🟡 Medium (real-mode blocker) |
| No new-review email notification job wired (Phase 1 / Day 13 #5) | 🟡 Medium |
| `README.md` essentially empty, wrong product name | 🟡 Medium (visibility) |
| `doc/doc-*.css/js` files are docco tooling leftovers, not product docs | 🟢 Low (cleanup) |

---

## Landing Page Prompt Pack — Design Intent & Fidelity

### Design intent (`Landing-Page-Prompt-Pack.md`)
A 10-prompt sequence (Prompt 0–9) for incrementally building the marketing page in Lovable/v0/Bolt/Claude Design, with a strict design system:

- **Color palette:** "storefront signage" mood — deep pine-green `#13261D` dominant, brass/gold `#C89B3C` accent, warm off-white `#F6F1E4` for text on dark, warm khaki paper `#EFEADC` for light sections, coral-red `#E8604A` only for star ratings / small alerts.
- **Typography:** Space Grotesk (display), Inter (body), IBM Plex Mono (stats/labels) — "ledger/receipt feel."
- **Recurring motif:** diagonal awning-stripe divider (alternating brass + dark-green).
- **Anti-patterns to avoid:** cream-background-with-serif-headline-and-terracotta-accent; plain-black-with-neon-green; broadsheet/newspaper hairline-rule layout. (These are explicitly called out as the "common AI-generated look" to avoid.)
- **Signature element:** hero right-column "app window" card with a 2-star Google review, an animated typewriter reply draft, and a "✓ Posted to Google — 0:04 after the review came in" confirmation that loops.
- **Placeholder discipline:** every placeholder (mockup image, stat, testimonial, contact) gets a small red-outlined coral pill so a non-technical person can spot every "thing I still need to replace" by scanning the page.
- **Locked pricing:** $29 Starter / $59 Pro only. The prompt-pack explicitly says "do not suggest alternative pricing or restructure the tiers."

### Fidelity assessment
- ✅ **Color tokens** faithfully ported to `tailwind.config.ts` (`ink`, `paper`, `brass`, `coral`, `cream`, `ink-text` — all the right hex values).
- ✅ **Typography** wired (Space Grotesk display, Inter sans, IBM Plex Mono).
- ✅ **Awning-stripe divider** implemented in `globals.css` (`.awning` class) and used across marketing pages.
- ✅ **Hero typewriter animation** ported to `app/(marketing)/page.tsx` with `useState`/`useEffect` typing loop and "✓ Posted to Google" confirmation.
- ✅ **Placeholder tags** implemented (coral-outlined pill, monospace, uppercase).
- ✅ **All 8 prompt sections** present (hero, problem, how it works, features, pricing, testimonials, FAQ, final CTA + footer).
- ✅ **Interactive enhancements** added beyond the spec (StatCounter, ScrollReveal, LogoCarousel, TestimonialCarousel, BeforeAfter, LiveDemo, PricingToggle) — Decision-Log entry 2026-08-02 documents this faithfully.
- ✅ **FAQ accordion** with `+` icon rotating to `×` — matches prompt 7.
- ✅ **Footer** four columns (Product, Company, Contact, logo) — matches prompt 8.
- 🚨 **VIOLATION:** Prompt 5 says "These exact prices ($29 and $59) and feature splits are final and locked — do not suggest alternative pricing or restructure the tiers." The industry landing pages (`/solutions/[slug]`) and the BillingManager render a **third "Enterprise" tier at $249/mo** that the prompt pack explicitly forbids.
- 🚨 **VIOLATION:** Prompt 5 specifies the Starter card features verbatim including "100 review requests included / month." The solutions pages replace this with an "Annual" pricing toggle showing $24/$49/$199 — prices that are not in the locked pricing.
- ⚠️ **MINOR DRIFT:** Prompt 0 says "Avoid the common AI-generated look of a cream background with a serif headline and a terracotta/orange accent." The industry landing pages reuse the storefront palette correctly, but the hero demo card on `/solutions/[slug]` uses a 4-star ("★★★★☆") review instead of the 2-star review the prompt pack specifies for the main landing page hero. This is intentional differentiation (per-industry), not a violation.

### Verdict
The landing-page prompt pack is being **followed faithfully on the main marketing page**. It is being **violated on the industry-specific landing pages** by the addition of the Enterprise tier and annual pricing. The founder must either (a) formally adopt Enterprise as a tier via a Decision-Log entry and update the prompt-pack to reflect the new three-tier structure, or (b) rip the Enterprise card out of the industry pages and BillingManager.

---

## Data Handling Policy — Compliance Posture

### What the policy honestly covers (`Data-Handling-Policy.md`)
- **Section 1:** Inventory of data held (owner PII, OAuth tokens, end-customer contact, review text, AI drafts).
- **Section 2:** Storage rules — OAuth tokens encrypted at rest; end-customer contact treated as PII, not exported to analytics, not logged in plaintext; database backups follow same encryption.
- **Section 3:** Access rules — only founder + support person have production DB access; secrets in env vars only; 2FA on Stripe/Twilio/Resend dashboards before go-live.
- **Section 4:** Deletion & retention — 30-day end-customer contact deletion on subscription cancellation; immediate OAuth token revocation; full account deletion within 30 days of request.
- **Section 5:** Third-party API compliance — Google Business Profile / Facebook Graph data-use policies; Twilio 10DLC registration accuracy.
- **Section 6:** Honest disclaimer — "This is not a GDPR/CCPA compliance program, a SOC 2 framework, or legal advice."

### Compliance posture assessment

| Framework | Posture | Notes |
|---|---|---|
| **GDPR** | 🟡 Aspirational | Policy §6 explicitly defers. For EU customers: no DPA template, no subprocessor list, no Article 28 contract template, no EU data-residency option (Supabase default region is US-East). Right-to-erasure / right-to-access have no code path. |
| **CCPA** | 🟡 Aspirational | Same deferral. No "Do Not Sell My Info" link (technically not required since the product doesn't sell data, but California consumers expect a visible opt-out path). No data-deletion request intake process. |
| **HIPAA** | 🟢 Not applicable | Product is not healthcare. If a dental practice enters patient contact info into the review-request tool, that's the practice's responsibility, not ReviewReply-Lite's — but the privacy policy should explicitly disclaim HIPAA-covered use. |
| **TCPA (SMS compliance)** | 🔴 At risk | Twilio 10DLC registration not done (Phase 0 deferred). The seeded review-request template has no opt-out language ("reply STOP to unsubscribe"). A2P 10DLC requires explicit opt-in documentation; the quick-add form has no consent checkbox. **Live SMS sending without 10DLC + opt-in language = carrier filtering within days.** |
| **SOC 2** | 🟢 Honestly deferred | Policy §6 explicitly says "not a SOC 2 framework." Correct for pre-launch. |
| **PCI-DSS** | 🟢 Not applicable | Stripe handles card data; ReviewReply-Lite never touches PAN. |
| **PII handling (internal)** | 🟡 Partial | Mock Twilio/Resend correctly redact contact info in logs. But: (a) OAuth "encrypted" columns store plaintext mock strings, (b) no lint rule prevents a future engineer from accidentally logging a full request body, (c) `console.log` calls in route handlers don't go through any redaction layer. |
| **Data retention enforcement** | 🔴 Not implemented | Policy §4 promises 30-day deletion on cancellation. **No background job, no admin endpoint, no scheduled cleanup exists.** Mock mode skips this; real mode would need a daily Inngest job that finds canceled-30-days-ago businesses and deletes their `review_requests` rows. |
| **Subprocessor disclosure** | 🔴 Missing | Privacy policy lists the vendors (Supabase, Inngest, Stripe, Twilio, Resend, Anthropic) but no formal subprocessor list with DPA availability per vendor. Required for any EU customer. |
| **Data Processing Agreement (DPA)** | 🔴 Missing | No DPA template. Enterprise buyers will ask for this on first contact. |

### Verdict
The Data-Handling-Policy is **admirably honest about what it is and isn't**. It does not overclaim. The gaps are real but appropriate for a pre-launch single-founder product — *except* for the TCPA/10DLC risk, which will block SMS sending at any volume, and the data-retention enforcement gap, which is a stated policy the code does not honor.

---

## Mock-to-Real Migration Plan

### What `MOCK-TO-REAL.md` correctly identifies as stubbed
- ✅ Every env var needed (22 variables, with where-to-get-it column).
- ✅ File-by-file breakdown of what's already real-coded vs. what still needs work.
- ✅ Google `fetchReviews` — `accountId = ""` needs resolution (acknowledged).
- ✅ Facebook `postReply` — needs page token + story ID (acknowledged).
- ✅ Resend `from` address — needs verified domain (acknowledged).
- ✅ OAuth callback routes need to be built (acknowledged).
- ✅ Stripe Checkout needs to be restored to real redirect (acknowledged).
- ✅ Phase 0 infrastructure list (Google Cloud, Meta Dev, Twilio 10DLC, Resend domain, Stripe products, Inngest, Supabase, Sentry, PostHog).
- ✅ Legal pages need professional review.

### What `MOCK-TO-REAL.md` MISSES (the undercount)
1. ❌ **Stripe webhook handler** (`/api/webhooks/stripe/route.ts`) — specified in Implementation-Plan Day 26 #2 but never built, and not mentioned in MOCK-TO-REAL. Real-mode billing cannot function without it (no `checkout.session.completed`, no `customer.subscription.updated`, no `invoice.payment_failed` handling).
2. ❌ **Plan-gating middleware** — specified in Day 27 #3 but not built. Not mentioned in MOCK-TO-REAL.
3. ❌ **Click-tracking route** (`/r/[token]`) — Phase 3 acceptance criterion. Not built. Not mentioned in MOCK-TO-REAL.
4. ❌ **Real Google `postReply` body** — MOCK-TO-REAL says "no changes needed" for `google-business-profile.ts` but the file actually throws "requires review name resolution" for the real path. Contradicts the doc.
5. ❌ **Real Facebook `postReply` body** — acknowledged as "needs page token + story ID resolution" but the doc undersells this: it's not a parameter fix, it's a different API surface (open_graph_story comments vs. reviews edge).
6. ❌ **OAuth flow rewrite for `OnboardingForm.tsx` step 3** — the doc says "Update OnboardingForm.tsx step 3 to redirect to real OAuth consent screens." This undersells the work: the current step 3 is a button-POST pattern, not a redirect-then-callback pattern. The whole client component needs restructuring.
7. ❌ **Facebook connect endpoint** — the mock-mode route `/api/businesses/[id]/connect/facebook` doesn't exist at all (only Google does). The mock-mode bug from Decision-Log 2026-08-03 (missing /requests page) repeats here. MOCK-TO-REAL doesn't mention building the mock-mode Facebook connect route, let alone the real one.
8. ❌ **AI model identifier** — locked as `claude-sonnet-4-6` in three docs and `lib/types.ts`. Not a real Anthropic model. MOCK-TO-REAL says "no changes needed" for `draft-reply.ts`. The first real call will fail with a 400/404.
9. ❌ **`subscription_plan` Postgres enum** — schema is `('starter','pro')` but code uses `'enterprise'`. SupabaseStore will throw on any Enterprise insert. MOCK-TO-REAL doesn't mention a migration to add `enterprise` to the enum.
10. ❌ **Sentry/PostHog SDK installation** — MOCK-TO-REAL §4 says "Set SENTRY_DSN and install `@sentry/nextjs`." Correct, but doesn't note that PostHog needs `posthog-js` (not just env vars) and that the PostHog/Sentry Next.js config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `instrumentation.ts`) need to be created.
11. ❌ **Better Uptime** monitor setup is mentioned but not detailed (just "add a monitor pointed at your production URL" — no mention of what endpoint to ping, alert routing, status page).
12. ❌ **OAuth token encryption** — Data-Handling §2.1 requires encryption at rest; no encryption function exists. MOCK-TO-REAL doesn't address this.

### Path to production (reconstructed)
A realistic reading of MOCK-TO-REAL plus the gaps above produces this critical path:

1. **Phase 0 infrastructure** (1–3 weeks of waiting on Google/Meta/Twilio approvals) — start Day 1.
2. **Fix the model name** — 5-minute code change, but needs Decision-Log entry because it's a "locked" choice.
3. **Build the missing mock-mode routes** (Facebook connect, click-tracking) — half-day each.
4. **Build the real-mode blockers** (Stripe webhook, OAuth callbacks, real `postReply` bodies, plan-gating middleware) — 1–2 weeks.
5. **Decision: rip out Enterprise or formally adopt it** (Decision-Log entry + schema migration + comparison-page updates + prompt-pack update) — 1 day either way, but founder must decide.
6. **Wire up Sentry + PostHog** — half-day.
7. **Write the tests** AGENTS.md §4 mandates — 1 week minimum for integration coverage.
8. **Build the deletion job** for Data-Handling §4 — half-day.
9. **Get legal review** of Terms + Privacy — 1–2 weeks elapsed (founder task, not dev).
10. **Beta cohort recruitment** — sales task, parallel.

Realistic timeline: **6–10 weeks from "flip USE_MOCKS=false" to commercial launch**, not the "config-only swap" the doc suggests.

---

## Existing Feature Inventory (Doc-stated vs Code-implemented vs Gap)

*(Consolidated into the table above under "Full Feature Inventory.")*

### Highlights
- **Doc-stated features:** 44 distinct features across Phases 0–7.
- **Code-implemented (mock or real):** 27 features fully done, 9 partial.
- **Doc-stated but missing in code:** 8 features (Facebook connect, click-tracking, Stripe webhook, plan gating, activation dashboard, daily digest, retry button, real OAuth callbacks).
- **Code-implemented but NOT doc-stated:** 3 features (Enterprise tier, multi-location org dashboard, industry-specific landing pages) — all three are **unapproved scope creep**.

---

## Competitive Positioning

### Competitors referenced in docs
| Competitor | Where referenced | Positioning thesis |
|---|---|---|
| **Birdeye** | `Product-Roadmap.md` Phase 5, `Implementation-Plan.md` Day 36, `app/vs/birdeye/page.tsx`, `Landing-Page-Prompt-Pack.md` Prompt 8 | Birdeye is "comprehensive reputation management for multi-location businesses and enterprises." ReviewReply-Lite is "for businesses that don't need a 6-month contract." Differentiation: $29/mo vs $300+/mo, month-to-month vs annual contract, self-serve vs sales process, single-location vs 10+ locations. |
| **Podium** | Same set of references, `app/vs/podium/page.tsx` | Podium is "full customer-communication platform — webchat, payments, team inboxes." ReviewReply-Lite is "just reviews" — narrower, cheaper ($29–$59 vs $400+), no contract. |

### Differentiation thesis (synthesized)
The pitch is **"Birdeye/Podium for the 90% of local businesses they don't serve"** — single-location, price-sensitive, non-technical owners who want one specific job done (review replies + review requests) without buying a full marketing suite or signing an annual contract.

### Assessment
- ✅ **The thesis is coherent and defensible.** Birdeye and Podium genuinely don't pursue single-location sub-$100/mo customers; their sales motions don't fit.
- ✅ **The comparison pages are well-written** — they acknowledge what the competitor does well (a sign of confidence) before making the case for ReviewReply-Lite.
- ⚠️ **The differentiation thesis is undermined by the unapproved Enterprise tier.** Showing a $249/mo Enterprise card on `/solutions/dental` while the comparison page says "we're the simpler, cheaper alternative" creates cognitive dissonance for any prospect who clicks through.
- ⚠️ **The "we don't do multi-location" claim on `/vs/birdeye` ("Best for: 1 location") is contradicted by the existence of `/org-dashboard` and the multi-location billing tier.**
- 🔴 **No third competitor mentioned.** Realistically, ReviewReply-Lite also competes with: (a)doing nothing (the status quo — most single-location owners just don't reply to reviews); (b) Google's native review-response UI (free, but no AI drafting, no review requests); (c) Word-of-mouth reputation tools like NiceJob, Grade.us, ReviewTrackers (smaller direct competitors). The docs don't address (a) or (b), which are the actual top-of-funnel alternatives for the target persona.

---

## Documentation Gaps for Enterprise Readiness

An enterprise SaaS (or a SaaS selling to enterprises, even at SMB prices) needs documentation the ReviewReply-Lite repo does not have:

| Missing doc | Why it matters | Priority |
|---|---|---|
| **Runbook / on-call doc** | What to do when poll-reviews stalls, when Stripe webhook fails, when Anthropic 429s, when a customer reports a missing reply | 🔴 High |
| **SLA / uptime targets** | Even a one-pager stating "we target 99.5% monthly uptime, review polling within 20 minutes" sets customer expectations | 🟡 Medium |
| **Security overview / whitepaper** | Subprocessor list, encryption details, access controls, pen-test status, SOC 2 roadmap. Required for any prospect with a security review process. | 🔴 High (for any B2B sale) |
| **API reference** | The API surface is internal-only today, but a public API (even read-only for "list my reviews") is a foreseeable Phase-2 feature. No OpenAPI spec exists. | 🟢 Low (post-launch) |
| **Integration guide** | How a customer connects Google Business Profile, what permissions are requested, what happens when they revoke. Currently scattered across onboarding UI. | 🟡 Medium |
| **Onboarding playbook for support** | The founder's future support person needs a checklist for "customer can't connect Google" / "AI draft is bad" / "customer wants to cancel." | 🔴 High (pre-beta) |
| **GDPR/CCPA DPA template** | Required for any EU or California customer. | 🟡 Medium (until first EU/CA customer) |
| **Subprocessor list** | Supabase, Inngest, Stripe, Twilio, Resend, Anthropic, Vercel — with their roles, data accessed, and DPA links. | 🟡 Medium |
| **Data retention enforcement runbook** | How the 30-day deletion rule is actually executed, verified, and audited. | 🔴 High (policy exists, no enforcement) |
| **Postmortem template** | Standardized format for incident write-ups. | 🟢 Low |
| **Deployment / release process** | How staging → production works, who approves, rollback procedure. Implementation-Plan mentions staging/production but no deploy runbook. | 🟡 Medium |
| **Pricing change-management doc** | Given how easily pricing has drifted (Enterprise, annual), a doc stating "pricing changes require founder sign-off + Decision-Log entry + comparison-page update + prompt-pack update" would prevent recurrence. | 🔴 High |
| **Feature request / customer feedback intake** | Where beta feedback goes, how it's triaged, how it maps to roadmap. | 🟡 Medium (pre-beta) |
| **Status page** | Better Uptime is mentioned in the plan but no public status page is set up. Prospects will look for one. | 🟢 Low |

### Dead / outdated docs to clean up
| Doc | Issue | Action |
|---|---|---|
| `README.md` | Contains only `GOOGLE-MAP-REVIEW-APP` with a UTF-16 BOM. Wrong product name (every other doc says ReviewReply-Lite). Essentially empty. | Rewrite with: project name, one-line pitch, how to run mock mode (`pnpm install && pnpm seed && pnpm dev`), env-var setup pointer, link to the doc suite. |
| `doc/doc-style.css`, `doc/doc-script.js`, `doc/doc-filelist.js` | These are **docco documentation generator artifacts** — highlight.js theme + sidebar JS for an old-style documentation site. They have nothing to do with the product. `doc-filelist.js` is literally `var tree={};`. | Delete the `doc/` directory or move to a `.archive/` folder. Not referenced anywhere in the codebase. |
| `dev-server.log` (431KB), `dev-server-err.log` (0 bytes) | Runtime artifacts, gitignored as of Decision-Log 2026-08-02. | Verify `.gitignore` is actually excluding them (it is). No action. |
| `pnpm-lock.yaml` (254KB) | Normal — lockfile. | No action. |
| `tsconfig.tsbuildinfo` (870KB) | TypeScript incremental build cache. | Confirm it's gitignored (it is, via `*.tsbuildinfo`). No action. |

---

## Strategic Risks

1. 🚨 **Enterprise tier scope creep without approval** — The locked pricing is $29/$59. The code introduces $249 Enterprise + multi-location + org dashboards across `lib/types.ts`, the schema migration, the billing UI, the marketing pages, and the AppNav. None of this is in `Product-Roadmap.md`, `Implementation-Plan.md`, or `Decision-Log.md`. **AGENTS.md §1 explicitly says "Locked pricing, plan gating, and beta cohort size (8) are not editable without an explicit new instruction from the founder recorded in Decision-Log.md."** This is the single biggest governance violation in the repo. The founder must either formally adopt Enterprise (and update all locked docs) or rip it out before any beta tester sees it.

2. 🔴 **Three documented Phase features are silently broken or missing in mock mode** — (a) Facebook connect 404s in the onboarding UI; (b) click-tracking route `/r/[token]` doesn't exist (Phase 3 acceptance criterion); (c) plan-gating middleware doesn't exist (Phase 4 / Day 27). The Decision-Log caught the equivalent bug for `/requests` on 2026-08-03 but the same audit was never done for the rest of the routes the UI calls. Beta testers will hit these immediately.

3. 🔴 **The locked AI model name `claude-sonnet-4-6` is not a real Anthropic model identifier.** The first real-mode `callAnthropic()` call will return a 400/404 from Anthropic. This bug is replicated in `Product-Roadmap.md`, `Implementation-Plan.md`, `MOCK-TO-REAL.md`, and `lib/types.ts`. Fixing it requires a Decision-Log entry (it's a "locked" choice) — but the fix is a one-line change to a real model name like `claude-sonnet-4-20250514` or `claude-3-5-sonnet-20241022`.

4. 🔴 **TCPA / 10DLC compliance gap blocks SMS sending at any volume.** The seeded review-request template has no opt-out language ("reply STOP"). The quick-add form has no consent checkbox. Twilio 10DLC registration hasn't been submitted (Phase 0 deferred). Live SMS sending without 10DLC + opt-in language = carrier filtering within days. **This is a hard launch blocker, not a polish item.**

5. 🔴 **Zero automated test coverage despite AGENTS.md §4 mandate.** Every `lib/integrations/*` file should have mocked-response tests. None do. `vitest` is installed and configured but the `tests/` directory doesn't exist. The mock-mode manual QA pass (Decision-Log 2026-08-02, "10/10 pass") is the only verification, and it didn't catch the Facebook-connect 404 or the missing click-tracking route. **A regression in any integration file will ship undetected.**

6. 🔴 **Data-retention policy is unenforceable in code.** `Data-Handling-Policy.md` §4 promises 30-day end-customer contact deletion on subscription cancellation. No background job, no admin endpoint, no scheduled cleanup exists. The policy is aspirational. If a customer asks "prove you deleted my data," there is no audit trail to point to. For any EU/CA customer this becomes a legal exposure.

7. 🟡 **The mock-mode demo will mislead stakeholders about launch readiness.** The Decision-Log's "10/10 API flows pass" entry is accurate for what it tested, but it didn't test the routes that don't exist. `MOCK-TO-REAL.md` says the swap is "config-only" but undersells the remaining work by ~6–10 weeks. A founder reading the Decision-Log and MOCK-TO-REAL together could reasonably conclude the product is "1–2 weeks from launch" when the realistic timeline is 2–3 months. **Expectation management is a strategic risk here.**

---

## Appendix A: File-by-File Reading Notes

### Documentation files (read end-to-end)
- `README.md` — 1 line, wrong product name, UTF-16 BOM. **Effectively dead.**
- `AGENTS.md` — 5.1KB. Operating rules for the executing agent. Well-written, includes escalation triggers and Definition of Done. ✅ Sound.
- `Product-Roadmap.md` — 22.7KB. Defines product, pricing, tech stack, data model, Phases 0–7, post-launch metrics, timeline. ✅ Excellent.
- `Implementation-Plan.md` — 25.6KB. Day-by-day execution tickets for Weeks 1–12. ✅ Excellent.
- `Decision-Log.md` — 17.5KB. Running record of 18 decisions including pre-launch baselines, Week 1 mock-mode decisions, and final QA pass. ✅ Honest and thorough — but missing the Enterprise tier decision.
- `Data-Handling-Policy.md` — 6.1KB. 6 sections covering data inventory, storage, access, deletion, third-party compliance, and honest disclaimer. ✅ Honest, but unenforceable in current code.
- `Landing-Page-Prompt-Pack.md` — 17.5KB. 10 prompts (0–9) with exact copy, color palette, typography, motif, and "what to swap before launch" checklist. ✅ Excellent — but violated by the Enterprise tier addition.
- `MOCK-TO-REAL.md` — 5.3KB. Env-var table + file-by-file changes + Phase 0 infrastructure list. ⚠️ Undersells the remaining work (missing Stripe webhook, plan gating, click tracking, real OAuth rewrite, OAuth-token encryption).

### Config files (read end-to-end)
- `package.json` — 1KB. Locked pnpm 11.18.0. Scripts: dev/build/start/lint/typecheck/test/test:watch/seed/migrate. Dependencies: 7 production, 9 dev. ✅ Minimal and correct.
- `tailwind.config.ts` — 1.1KB. Theme tokens derived from `landing-page.html` `:root`. ✅ Faithful to the design system.
- `tsconfig.json` — 713B. Strict mode + `noUncheckedIndexedAccess` + `noImplicitOverride`. ✅ Strict config.
- `next.config.mjs` — 292B. `reactStrictMode: true`, remote image patterns for `placehold.co` and `fonts.googleapis.com`. ✅ Minimal.
- `pnpm-workspace.yaml` — 144B. `onlyBuiltDependencies` for esbuild/protobufjs/unrs-resolver. ✅ Correct pnpm v11 workaround.
- `.eslintrc.json` — 103B. Extends `next/core-web-vitals`, turns off `react/no-unescaped-entities`. ⚠️ Bare-bones — could enforce PII-in-logs rule via custom rule.
- `.vscode/settings.json` — 7B. CSS validation off, Prettier as default formatter. ✅ Standard.
- `.env.example` — 2.7KB. Comprehensive, well-commented, all 22 env vars with usage notes. ✅ Excellent.
- `.env.local` — 885B. All provider keys blank, `USE_MOCKS=true`. ✅ Correct for mock mode.
- `postcss.config.mjs` — 164B. Tailwind + autoprefixer. ✅ Standard.
- `.gitignore` — 749B. Properly excludes `.env*`, `node_modules`, `.next`, `local-store`, dev logs. ✅ Correct.

### Schema / data files (read end-to-end)
- `supabase/migrations/0001_init.sql` — full schema with enums, tables, RLS policies, and an `on_auth_user_created` trigger. ✅ Production-grade.
- `supabase/migrations/0002_add_organizations.sql` — adds `organizations` table, `businesses.organization_id`, role column on users. ⚠️ Well-written SQL, but the feature it enables (multi-location Enterprise) is unapproved scope creep.
- `scripts/seed.ts` — 313 lines. Seeds 1 demo user (`owner@reviewreply.demo` with `role: "org_admin"`), 1 organization, 3 businesses across categories, 16 reviews per business (mixed 1–5★ ratings, both Google + Facebook sources), 5 review requests in mixed statuses, 2 batches, 3 subscriptions. ✅ Realistic demo data, but the org_admin role presupposes the Enterprise feature.

### Landing page assets (read end-to-end)
- `landing-page.html` — 29.9KB. Standalone HTML reference build of the marketing page. Color tokens, typography, hero with typewriter animation, problem section with placeholder stats, how-it-works, features, pricing, testimonials, FAQ, final CTA, footer. ✅ Faithful to the prompt pack.
- `doc/doc-style.css` — 404 lines. **Docco documentation generator highlight.js theme.** Not a product file. Should be deleted.
- `doc/doc-script.js` — 228 lines. **Docco sidebar/tree JS.** Not a product file. Should be deleted.
- `doc/doc-filelist.js` — 1 line (`var tree={};`). **Empty docco file-list placeholder.** Not a product file. Should be deleted.

---

## Appendix B: Recommended Next Actions (Priority-Ordered)

### P0 — Fix before any beta tester sees the app
1. **Founder decision: keep or kill the Enterprise tier.** If keeping: add Decision-Log entry, update `Product-Roadmap.md` §0 + non-goals, update `Implementation-Plan.md` §0, update `Landing-Page-Prompt-Pack.md` Prompt 5, update `app/vs/birdeye/page.tsx` comparison copy, add `enterprise` to the `subscription_plan` Postgres enum via a new migration `0003_add_enterprise_plan.sql`. If killing: remove `enterprise` from `lib/types.ts`, remove Enterprise card from `BillingManager.tsx`, remove Enterprise pricing from `/solutions/[slug]` pages, remove `org-dashboard` route, remove the Organization nav item from `AppNav.tsx`, revert `0002_add_organizations.sql` via a new migration.
2. **Fix the AI model name** `claude-sonnet-4-6` → a real Anthropic model identifier. Add Decision-Log entry (it's a locked choice).
3. **Build the missing `/api/businesses/[id]/connect/facebook` route** (mock-mode). Same pattern as the existing Google connect route.
4. **Build the click-tracking route** `/r/[token]/page.tsx` (Phase 3 acceptance criterion). Sets `review_requests.status = 'clicked'` and redirects to `business.google_review_link`.
5. **Build the plan-gating middleware** (Implementation-Plan Day 27 #3). Block Starter customers from `/connect/facebook` and from SMS-channel review requests; show in-app upgrade prompt.

### P1 — Fix before commercial launch
6. **Build the Stripe webhook handler** at `/api/webhooks/stripe/route.ts`.
7. **Build the real OAuth callback routes** (`/api/webhooks/google-oauth-callback`, `/api/webhooks/facebook-oauth-callback`) and rewrite `OnboardingForm.tsx` step 3 to use redirect-then-callback instead of button-POST.
8. **Implement the real Google `postReply` body** (currently throws).
9. **Implement the real Facebook `postReply` body** (currently throws).
10. **Fix the Google `fetchReviews` `accountId = ""` resolution** (currently empty string).
11. **Add 10DLC opt-in language to the review-request template** + a consent checkbox on the quick-add form.
12. **Build the data-retention deletion job** (daily Inngest function that finds canceled-30-days-ago businesses and deletes their `review_requests` rows).
13. **Write the integration tests** AGENTS.md §4 mandates. One mocked-response test per `lib/integrations/*` file.
14. **Patch Next.js 14.2.15** to the latest 14.2.x security release.
15. **Rewrite `README.md`** with the correct product name, one-line pitch, mock-mode run instructions, and a link to the doc suite.
16. **Delete the `doc/` directory** (docco tooling leftovers).

### P2 — Polish / pre-launch hardening
17. **Wire up Sentry** (`@sentry/nextjs`, `sentry.client.config.ts`, `sentry.server.config.ts`, `instrumentation.ts`).
18. **Wire up PostHog** (`posthog-js`, `app/layout.tsx` provider, key event instrumentation: signup, connect, draft-generated, reply-posted, request-sent, request-clicked, checkout-started, subscription-canceled).
19. **Build the new-review email notification job** (Phase 1 / Day 13 #5 — currently commented out in `poll-reviews.ts`).
20. **Build the daily-digest job** (Phase 5 / Day 33 — settings toggle exists, no job).
21. **Add the Retry button** on failed reply posts (Phase 2 acceptance).
22. **Add an invoice list** to the billing page.
23. **Set up Better Uptime** monitor on the production URL with SMS/email alerts.
24. **Get legal review** of Terms + Privacy (founder task).
25. **Write the onboarding playbook** for the future support person.
26. **Write the runbook** for common operational incidents.
27. **Write the security overview** one-pager for B2B prospects.

---

*End of audit report. Task `audit-3` complete.*

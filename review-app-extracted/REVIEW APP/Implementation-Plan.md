# Implementation Plan — ReviewReply-Lite
### From Zero to Commercial Launch
**Status: LOCKED.** Every decision below is final. This document exists so the executing agent does not need to make judgment calls mid-build. If something in here appears to conflict with a real-world constraint discovered during build (e.g., an API behaves differently than documented), stop and flag it back to the founder — do not silently substitute an alternative tool, provider, or approach.

**Companion document:** `Product-Roadmap.md` (defines *what* to build, feature scope, and acceptance criteria per phase). This document defines *the exact sequence and steps* to build it.

---

## 0. Locked Global Decisions (do not re-litigate any of these mid-build)

| Decision | Locked value |
|---|---|
| Product working name / repo name | `reviewreply-lite` |
| Frontend framework | Next.js 14+ (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API routes (single repo, no separate backend service) |
| Database + Auth + Storage | Supabase (single project) |
| Background jobs / scheduling | Inngest |
| AI model | Anthropic Claude API, model `claude-sonnet-4-6` |
| SMS | Twilio |
| Transactional email | Resend |
| Payments | Stripe |
| Hosting | Vercel (production + staging environments) |
| Error monitoring | Sentry |
| Product analytics | PostHog (cloud, free tier to start) |
| Uptime monitoring | Better Uptime |
| Package manager | pnpm |
| Node version | 20 LTS |
| Pricing | Starter $29/mo, Pro $59/mo (full detail in Product-Roadmap.md Section 0) |
| Beta cohort size | Exactly 8 businesses |
| Review polling interval | 20 minutes, fixed |
| Trial length | 14 days, card required |

**No substitutions.** If a tool in this list becomes unavailable or a signup is rejected, halt and escalate to the founder rather than picking an alternative unilaterally.

---

## 1. Repository Structure (create exactly this, Day 1)

```
reviewreply-lite/
├── app/
│   ├── (marketing)/              -- public landing page, pricing, legal pages
│   │   ├── page.tsx
│   │   ├── pricing/page.tsx
│   │   ├── terms/page.tsx
│   │   └── privacy/page.tsx
│   ├── (app)/                    -- authenticated dashboard
│   │   ├── dashboard/page.tsx
│   │   ├── reviews/page.tsx
│   │   ├── requests/page.tsx
│   │   ├── settings/page.tsx
│   │   └── billing/page.tsx
│   ├── api/
│   │   ├── businesses/
│   │   ├── webhooks/
│   │   │   ├── stripe/route.ts
│   │   │   ├── google-oauth-callback/route.ts
│   │   │   └── facebook-oauth-callback/route.ts
│   │   └── review-requests/
│   └── layout.tsx
├── lib/
│   ├── supabase/                 -- client + server helpers
│   ├── inngest/                  -- job functions
│   │   ├── poll-reviews.ts
│   │   ├── generate-reply-draft.ts
│   │   └── send-review-request.ts
│   ├── ai/
│   │   └── draft-reply.ts        -- Claude API prompt + call wrapper
│   ├── integrations/
│   │   ├── google-business-profile.ts
│   │   ├── facebook-graph.ts
│   │   ├── twilio.ts
│   │   ├── resend.ts
│   │   └── stripe.ts
│   └── parsing/
│       └── paste-list-parser.ts
├── supabase/
│   └── migrations/               -- SQL migration files, one per schema change
├── tests/
├── .env.example
├── package.json
└── README.md
```

**Rule:** every third-party call (Google, Facebook, Twilio, Resend, Stripe, Anthropic) lives in its own file under `lib/integrations/` or `lib/ai/`. Nothing calls an external API directly from an `app/api/` route handler — route handlers call the lib functions. This keeps every external dependency swappable/testable in one place, and is not optional.

---

## 2. Environment Variables (`.env.example` — create this file Day 1, exact keys)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANTHROPIC_API_KEY=

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_BUSINESS_PROFILE_API_KEY=

FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

RESEND_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_STARTER=
STRIPE_PRICE_ID_PRO=
STRIPE_PRICE_ID_OVERAGE=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

NEXT_PUBLIC_APP_URL=
```

Never commit `.env.local` with real values. Confirm `.gitignore` includes it before the first commit.

---

## 3. Week-by-Week, Day-by-Day Execution Tickets

### WEEK 1 — Accounts, Access Submissions, Scaffolding

**Day 1**
1. Create GitHub repo `reviewreply-lite`, private, initialize with the folder structure in Section 1.
2. Run `pnpm create next-app@latest` with TypeScript + Tailwind + App Router flags, matching folder structure above.
3. Create Vercel project, connect to GitHub repo, create two environments: `production` (branch: `main`) and `staging` (branch: `staging`).
4. Create Supabase project. Save URL + anon key + service role key into `.env.local` and into Vercel environment variables (both staging and production projects — use two separate Supabase projects, one per environment, do not share a database between staging and production).

**Day 2**
5. Create Google Cloud project named `reviewreply-lite`. Enable **Business Profile API**. Submit the API access request form (Google requires manual approval for this API — submit today, do not wait). Record the submission confirmation/reference number in `README.md` under a "Pending Approvals" section.
6. Create Google OAuth 2.0 credentials (Web application type) in the same project. Add authorized redirect URI: `https://reviewreply-lite.vercel.app/api/webhooks/google-oauth-callback` (production) and the staging equivalent.
7. Create Meta Developer account + app named `ReviewReply Lite`. Add the "Pages" product. Request permissions: `pages_manage_engagement`, `pages_read_engagement`, `pages_show_list`. Submit for App Review today (this cannot be submitted without a live Privacy Policy URL — see Day 3 to unblock this).

**Day 3**
8. Build and deploy a minimal static Privacy Policy page and Terms of Service page (`app/(marketing)/privacy/page.tsx`, `app/(marketing)/terms/page.tsx`) — placeholder legal text is acceptable at this stage but the URLs must be live and publicly reachable, since both Google and Meta require this before app review will even begin. Deploy to production Vercel URL today so the URLs exist.
9. Return to the Meta App Review submission from Day 2 and attach the now-live Privacy Policy URL. Submit.
10. Create Twilio account. Purchase one local phone number capable of SMS. Begin **10DLC brand + campaign registration** (this is a multi-step form requiring business legal name, EIN, and website URL — the website must be live, which it now is from Day 3). Submit today.

**Day 4**
11. Create Resend account, verify sending domain (add SPF, DKIM, DMARC DNS records at the domain registrar — this requires the domain to be purchased; if not yet purchased, purchase it today).
12. Create Stripe account. Complete business verification (bank account, business details) — this can take several days to fully activate for live payments, so start it now even though Checkout will run in test mode until later.
13. In Stripe (test mode), create two Products: `Starter` ($29/mo recurring) and `Pro` ($59/mo recurring), plus one metered Price `Overage` ($0.05/unit) attached to each. Record the four Price IDs into `.env.local`.
14. Create Anthropic API account, generate API key, set a billing limit alert at $50/mo for the build phase.

**Day 5**
15. Create Inngest account, connect to the Vercel project (Inngest has a native Vercel integration — use it).
16. Create Sentry project (Next.js template), install SDK, verify a test error appears in the Sentry dashboard.
17. Create PostHog project, install SDK, verify a test pageview event appears.
18. Create Better Uptime account, add a placeholder monitor pointed at the production Vercel URL.
19. Write the Supabase schema migration file (`supabase/migrations/0001_init.sql`) using the exact schema from `Product-Roadmap.md` Section 2, verbatim. Run the migration against both staging and production Supabase projects.
20. End-of-week check: confirm every item in Section 0's "Acceptance criteria" for Phase 0 is true. Update the README "Pending Approvals" section with current status of Google, Meta, and Twilio 10DLC submissions (all should show "submitted, pending" — none need to be approved yet to proceed to Week 2).

---

### WEEK 2 — Auth, Business Onboarding Shell

**Day 6**
1. Implement Supabase Auth: email/password signup + login pages (`app/(marketing)/signup`, `app/(marketing)/login`), plus Google OAuth login as a second option on the same pages.
2. Implement the `businesses` table insert flow: on first login, if no business exists for `owner_user_id`, redirect to an onboarding form (`app/(app)/onboarding/page.tsx`).

**Day 7**
3. Build onboarding Step 1: business name + category dropdown (`restaurant, salon, dental, retail, contractor, other`) + timezone auto-detected from browser, editable.
4. Build onboarding Step 2 (brand voice): a single free-text textarea with the exact placeholder copy: *"Tell us how you talk to customers — e.g. casual, uses first names, mentions our dog Biscuit."* Store in `brand_voice_notes`.

**Day 8**
5. Implement Google OAuth "Connect Business Profile" flow: initiate OAuth consent screen requesting Business Profile scopes, handle callback at `/api/webhooks/google-oauth-callback`, store returned account/location identifiers on the `businesses` row.
6. Build the location-picker UI shown after Google OAuth succeeds (a business account can have multiple locations — user selects the one matching their business).

**Day 9**
7. Implement Facebook OAuth "Connect Page" flow via Facebook Login for Business, handle callback at `/api/webhooks/facebook-oauth-callback`, store `facebook_page_id`.
8. Note: if Meta App Review is still pending, build and test this entire flow using a Meta test user / development-mode app access (Meta allows this before full App Review approval) — do not block this week's work on the App Review approval itself.

**Day 10**
9. Build the base authenticated dashboard shell (`app/(app)/dashboard/page.tsx`) with navigation: Dashboard, Reviews, Requests, Settings, Billing.
10. End-of-week check: a test user can sign up, complete onboarding, connect a Google Business Profile (or dev-mode test location if approval pending), and land on an empty dashboard shell.

---

### WEEK 3 — Review Ingestion Pipeline

**Day 11**
1. Build `lib/integrations/google-business-profile.ts`: function `fetchReviews(locationId, accessToken)` calling the Reviews endpoint, returning normalized review objects.
2. Build `lib/integrations/facebook-graph.ts`: equivalent `fetchPageRatings(pageId, accessToken)`.

**Day 12**
3. Build the Inngest scheduled function `lib/inngest/poll-reviews.ts`: runs every 20 minutes, iterates all businesses with a connected Google and/or Facebook account, calls the two functions above, and upserts into the `reviews` table using `external_review_id` for deduplication (per the exact schema in Product-Roadmap.md).

**Day 13**
4. Build the "new review" trigger: on successful insert of a new row into `reviews`, fire an Inngest event `review.received` that will later be consumed by both the reply-drafting job (Week 4) and a notification job.
5. Build the notification job: on `review.received`, send the business owner an email via Resend with subject `New {rating}-star review from {reviewer_name}`.

**Day 14**
6. Build `app/(app)/reviews/page.tsx`: list view of all reviews for the business, newest first, showing source icon (Google/Facebook), rating, reviewer name, review text, and status badge.

**Day 15**
7. Manual test: connect a real Google Business Profile with existing reviews. Confirm all existing reviews appear in the `reviews` table and on the Reviews page within one 20-minute polling cycle, with zero duplicates on a second manual trigger of the poll job.
8. End-of-week check: Phase 1 acceptance criteria from Product-Roadmap.md fully pass.

---

### WEEK 4 — AI Reply Drafting Engine

**Day 16**
1. Build `lib/ai/draft-reply.ts`: constructs the Claude API prompt using review text, star rating, business category, `brand_voice_notes`, and reviewer first name, following the exact tone rules from Product-Roadmap.md Phase 2 (5-star: warm + specific; 1–2 star: acknowledge + offline resolution path, never defensive; 3-star: acknowledge gap + invite back; never invent facts).
2. Build the Inngest function `lib/inngest/generate-reply-draft.ts`, triggered by `review.received`, calling `draft-reply.ts` and storing the result in `review_replies.draft_text`, setting `reviews.status = 'draft_generated'`.

**Day 17**
3. Build the reply UI on `app/(app)/reviews/page.tsx`: each review needing a reply shows the AI draft in an editable textarea, a "Regenerate" button, and a "Post Reply" button.
4. Build the per-business "auto-post" toggle in Settings, defaulting to **off**, with the locked rule that even when enabled, auto-post only applies to 4–5 star reviews — 1–3 star reviews always require manual approval regardless of the toggle state (this rule is not user-configurable; do not add a setting to override it).

**Day 18**
5. Build `lib/integrations/google-business-profile.ts` function `postReply(reviewId, replyText, accessToken)` and the Facebook equivalent in `facebook-graph.ts`.
6. Wire the "Post Reply" button to call the correct platform function based on `reviews.source`, update `review_replies.status` and `posted_at` on success, and store `error_message` + surface a "Retry" button on failure.

**Day 19**
7. Manual test: for a test business with real reviews spanning 1–5 stars, generate drafts for at least 10 reviews and manually assess: at least 8 of 10 should be plausible to post with light or no editing (per Phase 2 acceptance criteria).
8. If fewer than 8 of 10 pass, revise the prompt in `draft-reply.ts` and retest before proceeding — do not move to Week 5 with a failing draft-quality bar, since this is the core value proposition of the product.

**Day 20**
9. End-of-week check: post at least one real AI-drafted reply to a live Google review and confirm it appears on the live listing within a few minutes.

---

### WEEK 5 — Review Request Automation (Quick-Add Primary Path)

**Day 21**
1. Build the quick-add form as a persistent, always-visible component on `app/(app)/dashboard/page.tsx` — not a separate page. Fields: name (required), phone (required), email (optional). Mobile-first layout, large touch targets.
2. Wire quick-add submission directly to an insert into `review_requests` with `entry_method = 'quick_add'`, immediately queuing the send job (no batch confirmation step for single adds).

**Day 22**
3. Build `lib/parsing/paste-list-parser.ts`: accepts raw multi-line text, leniently extracts name + phone pairs from common loose formats (comma-separated, dash-separated, or newline-separated with a phone-number regex match per line). Returns a structured preview array plus an unparsed-line count.
4. Build the paste-a-list UI (`app/(app)/requests/page.tsx`, secondary section below quick-add): textarea input → "Parse" button → preview table of parsed contacts with a per-row remove option → "Send to All" confirm button, inserting rows with `entry_method = 'paste_list'`.

**Day 23**
5. Build CSV upload as the tertiary option on the same Requests page (collapsed/secondary UI placement, e.g. behind a "Have a spreadsheet instead?" link): standard file upload, parse via a CSV library, same preview-then-confirm pattern, `entry_method = 'csv_import'`.

**Day 24**
6. Build `lib/inngest/send-review-request.ts`: consumes queued `review_requests` rows, renders the message template with merge fields (`{customer_name}`, `{business_name}`, `{review_link}`), sends via Twilio (SMS) or Resend (email) based on `channel`, applies pacing (stagger sends within a batch by a few seconds each — not needed for single quick-adds), and updates `status`.
7. Build the trackable review link: generate a short redirect URL per request (`/r/{request_id}`) that logs a click (`status = 'clicked'`) before redirecting to the actual Google review URL.

**Day 25**
8. Build the message-template editor in Settings, pre-filled with a sensible default template, editable per business.
9. Manual test: submit a real (test) contact through quick-add, confirm SMS/email delivery in the same session; paste a 5–10 line loose-format test list and confirm ≥90% correct parsing; upload a 10-row test CSV and confirm identical send/status behavior across all three entry methods.
10. End-of-week check: Phase 3 acceptance criteria from Product-Roadmap.md fully pass.

---

### WEEK 6 — Billing

**Day 26**
1. Build Stripe Checkout integration: "Start Free Trial" buttons on the pricing page for both Starter and Pro, creating a Checkout Session with a 14-day trial and card collection required.
2. Build `app/api/webhooks/stripe/route.ts` handling `checkout.session.completed` (create/update `subscriptions` row), `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` (trigger a dunning email via Resend).

**Day 27**
3. Implement plan gating middleware: check `subscriptions.plan` before allowing Facebook connection or SMS sending (Starter plan blocks both, per the locked plan table in Product-Roadmap.md Section 0) — show an in-app upgrade prompt rather than a hard error.
4. Implement the 100/300 monthly review-request allotment counter and metered overage reporting to Stripe (`$0.05` per request beyond the plan limit) via Stripe's usage record API.

**Day 28**
5. Build `app/(app)/billing/page.tsx`: current plan, next billing date, update card (Stripe Customer Portal), view invoices, self-serve cancel button (no support ticket required).

**Day 29**
6. Full test pass in Stripe test mode: signup → trial starts → simulate trial end → card charged → active subscription → simulate a plan upgrade → simulate cancellation. Confirm each state correctly reflects in the `subscriptions` table and the UI.

**Day 30**
7. End-of-week check: Phase 4 acceptance criteria fully pass in test mode. Do not switch Stripe to live mode yet — that happens in Week 11 (Phase 7 prep), not now.

---

### WEEK 7–8 — Trust, Onboarding Polish, Marketing Site, Legal

**Day 31–32**
1. Build the guided onboarding checklist component (connect Google → connect Facebook → set brand voice → add first customer) with visual progress, persistent until fully complete.
2. Build empty states for: zero reviews yet, zero requests sent yet — each with a one-sentence explanation of what will happen once data arrives, not a blank screen.

**Day 33–34**
3. Build notification preference settings (new-review alert channel: email/SMS, optional daily digest toggle).
4. Replace placeholder legal pages with final Terms of Service and Privacy Policy content (have these reviewed before commercial launch — this is a genuine legal document, not just a build task; flag to the founder that professional legal review is recommended before Phase 7, not a step this plan can substitute for).

**Day 35–36**
5. Build the full marketing/landing page: hero, feature breakdown, pricing table matching the locked Starter/Pro pricing exactly, testimonials placeholder (to be filled during/after beta), FAQ.
6. Write and publish two comparison landing pages: `/vs/birdeye` and `/vs/podium`, each following the exact structure: what the competitor does well, who ReviewReply-Lite is actually built for (single-location, self-serve, no contract), and a direct pricing comparison table.

**Day 37–38**
7. Set up a shared support inbox (e.g., `support@[domain]`) and confirm at least one person will check it daily starting in Week 9 (beta launch).
8. Full QA pass across the entire authenticated app on both desktop and mobile viewport widths — this product will be used on phones at a front counter, so mobile layout is not optional polish, it is core functionality.

**Day 39–40**
9. End-of-week check: Phase 5 acceptance criteria fully pass — a person with zero context can sign up, connect a real business, and get a first AI-drafted reply live without founder intervention.

---

### WEEK 9–10 — Beta (Exactly 8 Businesses)

**Day 41**
1. Recruit exactly 8 single-location businesses (sales task — use the manual outreach channels defined in the original opportunity research: local business Facebook groups, direct outreach to businesses with visibly slow review response times). Offer 30 days free in exchange for structured feedback.

**Day 42–50**
2. Onboard each beta business personally (screen-share or in-person if needed) — do not rely on self-serve onboarding working perfectly yet; this week is about finding what breaks, not proving self-serve works (that's Phase 7's job).
3. Track for every beta business: time to first Google/Facebook connection, time to first AI-drafted reply posted, whether quick-add or paste-list was used naturally without prompting.
4. Log every bug, confusing UI moment, and edge case encountered (zero-review businesses, 500+ historical review businesses — confirm the reply-prompt only applies to reviews from the connection date forward, not historical backlog; multi-location OAuth ambiguity; timezone-related send-time bugs).

**Day 51–55**
5. Fix all Day 42–50 findings in priority order: anything that blocks a business from completing onboarding first, anything that produces a bad/embarrassing AI reply second, cosmetic issues last.
6. Re-test the specific activation metric: percentage of the 8 beta businesses that posted at least one AI-assisted reply within 7 days of connecting. Per Product-Roadmap.md, this is the key leading indicator — if fewer than 5 of 8 hit this, do not proceed to Phase 7 until the root cause is identified and fixed.

**End of Week 10 check:** at least 5 of 8 beta businesses have connected a real profile, received a real AI draft, and posted at least one real reply to a live review, per the locked Phase 6 acceptance criteria.

---

### WEEK 11–12 — Commercial Launch Prep and Launch

**Day 56–57**
1. Confirm production status of all Week 1 submissions: Google Business Profile API (must show production/approved, not development-mode caps), Meta App Review (must show approved for the requested Pages permissions), Twilio 10DLC (must show approved campaign status). If any are still pending, do not proceed to Day 58 — this is a hard blocker, not a soft one, since dev-mode caps and unapproved SMS sending will break real customer usage.

**Day 58**
2. Switch Stripe from test mode to live mode. Update all four Price IDs in production environment variables to the live-mode equivalents. Run one real end-to-end test transaction with a real card, then refund it.

**Day 59**
3. Remove all beta-related discounts/overrides from the 8 beta businesses' accounts, transitioning them to standard Starter/Pro billing (with a personal note/discount code as a thank-you, at the founder's discretion — this is a business decision, not a technical one).
4. Set up the Better Uptime monitor on the real production URL with SMS/email alerting to the founder.

**Day 60**
5. Publish the marketing site, pricing page, and both comparison pages live (already built in Weeks 7–8 — this is the "go live" flip, not new build work).
6. Submit a Product Hunt launch draft (optional, low-cost, per Product-Roadmap.md Phase 7).
7. Begin manual outreach distribution using the channels defined in the original opportunity scan (local business Facebook groups, direct outreach to slow-responding businesses).

**Commercial launch is declared complete when, per Product-Roadmap.md Phase 7:** a stranger with no relationship to the founder can find the site, sign up, pay with a real card, connect their real business, and get value with zero manual onboarding help — verified by having someone outside the beta cohort actually do this, not just by checklist review.

---

## 4. Testing Protocol (apply throughout, not just at the end)

- Every Inngest function must have a manual trigger path for testing without waiting for the real schedule (20-minute poll, message send) to fire naturally.
- Every external API integration (`lib/integrations/*`) must be testable against that provider's sandbox/test mode before any live-mode testing — Stripe test mode, Twilio test credentials, Meta development mode are all available and must be used first.
- No feature is marked complete until its exact acceptance criteria (as stated in Product-Roadmap.md, phase by phase) has been manually verified against a real or realistic test account — not just "the code runs without errors."

## 5. Change-Control Rule for This Document

This plan is locked. If a genuine blocker requires deviating from a locked decision (e.g., a named API is discontinued, a vendor rejects the account application), the executing agent must stop and flag this explicitly rather than silently substituting a different tool or approach — the founder makes that call, not the agent mid-build.

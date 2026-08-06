# Product Roadmap — ReviewReply-Lite
### AI Review Reply + Review Request Tool for Single-Location Businesses
**Roadmap scope:** Day 0 → Commercial Launch (paid, public, self-serve)
**Audience for this doc:** Development agent/engineer executing the build. Every phase below has explicit deliverables and acceptance criteria so progress can be checked objectively.

---

## 0. Product Definition (read this before building anything)

**One-line pitch:** A $29–$59/mo tool that watches a single-location business's Google/Facebook reviews, drafts on-brand AI replies for one-click posting, and automatically requests reviews from recent customers.

**Locked pricing (final, do not revisit mid-build):**
- **Starter — $29/mo:** 1 location, Google reviews only, AI reply drafting, quick-add + paste-list review requests, email review requests, 100 review-requests/month included.
- **Pro — $59/mo:** 1 location, Google + Facebook reviews, AI reply drafting, all three review-request entry methods, SMS + email review requests, 300 review-requests/month included, priority support.
- **Overage:** $0.05 per review-request sent beyond the plan's monthly allotment (billed via Stripe metered usage on top of the flat subscription).
- **Trial:** 14 days, credit card required at signup, auto-converts to Starter unless upgraded or canceled.

**Primary user:** Owner or manager of one location (restaurant, salon, dental/med spa, retail shop, contractor). Not technical. Expects something as simple as a text message app.

**Core jobs the product must do, in priority order:**
1. Notify the owner the moment a new review comes in.
2. Draft a reply that sounds like a human who runs this business, not a corporate bot.
3. Let the owner post that reply in one tap/click.
4. Automatically ask recent customers to leave a review, without the owner lifting a finger.

**Explicit non-goals for v1 (do not build, do not scope-creep into these):**
- Multi-location / enterprise dashboards (single-location only for launch).
- Review monitoring for platforms beyond Google + Facebook (Yelp/TripAdvisor are Phase-2-post-launch, not launch-blocking).
- Social media post scheduling, SEO tools, or any feature outside review reply/request.
- Native mobile app (responsive web app only for v1).

---

## 1. Tech Stack (recommended, opinionated)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React) + Tailwind CSS | Fast to build, SSR for a clean marketing site + app in one codebase |
| Backend | Next.js API routes or a separate Node.js (Express/Fastify) service | Keep it simple — one codebase unless job-queue complexity demands a split |
| Database | PostgreSQL, hosted on **Supabase** (locked — do not evaluate Neon or alternatives) | Relational data (businesses, reviews, replies, subscriptions) fits SQL well; Supabase also gives auth + storage in the same project, reducing vendor count |
| Auth | **Supabase Auth** (locked — do not evaluate Clerk or alternatives) | Same vendor as database, one less integration surface; email/password + Google OAuth are both native |
| Job queue / scheduling | **Inngest** (locked — do not evaluate Trigger.dev or raw cron) | Purpose-built for scheduled polling + retryable background jobs (review polling, message sending); raw cron would require hand-rolling retry/backoff logic this product needs from day one |
| AI reply drafting | **Anthropic Claude API, model: claude-sonnet-4-6** (locked) | Reply drafting is a short-context, tone-sensitive task — this model tier is the right fit, no fine-tuning needed for v1 |
| Reviews data source | Google Business Profile API (Business Profile Performance/Reviews API) + Facebook Graph API (Page ratings/reviews) | Official APIs — required to legally pull and post replies |
| Review-request delivery | SMS: **Twilio** (locked) · Email: **Resend** (locked — do not evaluate Postmark) | Twilio for SMS review requests (highest response rate); Resend for email — simpler API surface than Postmark, sufficient deliverability for transactional volume at this scale |
| Payments | Stripe (Checkout + Billing/Subscriptions) | Standard, handles subscription billing, proration, dunning out of the box |
| Hosting | Vercel (frontend/API) + Supabase/Neon (DB) | Zero-ops hosting appropriate for a solo-maintained product |
| Monitoring/errors | Sentry | Non-negotiable — you will not know why a customer's reply failed to post without this |
| Analytics | PostHog (self-hostable or cloud free tier) | Track activation/retention funnel from day one, not bolted on later |

---

## 2. Data Model (core schema)

```
businesses
  id (uuid, pk)
  owner_user_id (fk -> users.id)
  name
  category               -- restaurant, salon, dental, retail, contractor, other
  google_place_id
  google_business_profile_account_id
  facebook_page_id
  brand_voice_notes       -- free text: "casual, uses first names, mentions our dog Biscuit"
  timezone
  created_at

users
  id (uuid, pk)
  email
  auth_provider
  created_at

subscriptions
  id (uuid, pk)
  business_id (fk)
  stripe_customer_id
  stripe_subscription_id
  plan                   -- starter, pro
  status                 -- trialing, active, past_due, canceled
  current_period_end
  created_at

reviews
  id (uuid, pk)
  business_id (fk)
  source                 -- google, facebook
  external_review_id     -- the platform's own review ID (for idempotency)
  reviewer_name
  rating                 -- 1-5
  review_text
  review_created_at
  status                 -- new, draft_generated, replied, ignored
  fetched_at

review_replies
  id (uuid, pk)
  review_id (fk)
  draft_text              -- AI-generated draft
  final_text               -- what was actually posted (may be edited by owner)
  posted_at
  posted_by                -- 'owner' (manual approve) or 'auto' (if auto-approve enabled)
  status                   -- draft, posted, failed
  error_message             -- if posting to platform API failed

review_requests
  id (uuid, pk)
  business_id (fk)
  customer_name
  customer_contact          -- phone or email
  channel                   -- sms, email
  message_text
  sent_at
  status                    -- queued, sent, failed, clicked
  source                    -- manual_upload, pos_integration (future), csv_import

review_request_batches
  id (uuid, pk)
  business_id (fk)
  uploaded_at
  total_contacts
  sent_count
  failed_count
```

---

## Phase 0 — Foundations & Access (Week 1)
**Goal:** Nothing product-facing yet. Get every external dependency unblocked before writing app logic, because API approval delays are the single biggest launch-timeline risk in this build.

- [ ] Register Google Cloud project, enable **Google Business Profile API**, submit for API access approval (this has a manual Google review step — start it Day 1, it can take 1–3 weeks).
- [ ] Register Meta Developer app, enable **Pages API** with `pages_manage_engagement`, `pages_read_engagement`, `pages_show_list` permissions. Note: Meta requires App Review for these scopes before going live with real customers — start this submission Week 1, not at launch.
- [ ] Set up Anthropic API account and billing.
- [ ] Set up Twilio account, purchase a phone number, complete **10DLC registration** (required in the US for business SMS — also has a review delay, start early).
- [ ] Set up Resend/Postmark account and domain (SPF/DKIM/DMARC records) for transactional email deliverability.
- [ ] Set up Stripe account, create Products: `Starter ($29/mo)`, `Pro ($59/mo)`, plus a metered `Overage` price ($0.05/unit) attached to each subscription.
- [ ] Provision Supabase/Neon project, initialize schema from Section 2.
- [ ] Set up GitHub repo, Vercel project, staging + production environments.
- [ ] Set up Sentry + PostHog projects.

**Acceptance criteria:** All four third-party API applications (Google, Meta, Twilio 10DLC) are *submitted*, even if not yet approved — because approval latency, not build time, is the critical path here. Core repo, DB, hosting, and billing plumbing exist and deploy successfully with a placeholder page.

---

## Phase 1 — Core Data Pipeline: Pull Reviews (Weeks 2–3)
**Goal:** Reviews from a connected Google/Facebook business flow into our database automatically.

### Features to build
1. **Business onboarding flow**
   - Owner signs up (email or Google OAuth).
   - Owner connects Google Business Profile (OAuth flow, select their location from the account's list of locations).
   - Owner connects Facebook Page (OAuth flow, select page).
   - Owner fills a short "brand voice" form (tone, common phrases, things to always/never mention) — this directly feeds the AI reply prompt.

2. **Review polling job**
   - Scheduled Inngest job, fixed 20-minute interval, per connected business: call Google Business Profile Reviews endpoint and Facebook Page ratings endpoint.
   - Deduplicate using `external_review_id` — never create a duplicate row for the same platform review.
   - New reviews inserted with `status = new`.
   - On new review insert, trigger the reply-drafting job (Phase 2) and an owner notification (email/SMS: "New 3-star review from Jane at [Business]").

### API endpoints (internal)
```
POST /api/businesses                  -- create business record
POST /api/businesses/:id/connect/google
POST /api/businesses/:id/connect/facebook
GET  /api/businesses/:id/reviews
POST /api/webhooks/google-oauth-callback
POST /api/webhooks/facebook-oauth-callback
```

**Acceptance criteria:** Connecting a real Google Business Profile and Facebook Page pulls actual existing reviews into the `reviews` table within one polling cycle. Restarting the polling job never creates duplicate review rows.

---

## Phase 2 — AI Reply Drafting Engine (Weeks 3–4)
**Goal:** Every new review gets a good, on-brand draft reply automatically, ready for one-click approval.

### Reply generation logic
- Input to the LLM call: review text, star rating, business category, brand-voice notes, reviewer's first name.
- **Prompt design principles (critical — this is the actual product quality bar):**
  - 5-star reviews: warm, specific (reference something from the review text, not generic "thanks!"), short.
  - 1–2 star reviews: acknowledge specifically, no generic corporate apology language, offer an offline path to resolve (e.g., "please call us at [phone]"), never argue or get defensive.
  - 3-star reviews: acknowledge the specific gap mentioned, invite them back.
  - Never invent facts not in the review or business profile.
  - Match the business's stated brand voice tone exactly — this is the #1 differentiator vs. a generic ChatGPT wrapper.
- Store draft in `review_replies.draft_text`, set `reviews.status = draft_generated`.

### Owner-facing UI
- Dashboard list of reviews needing a reply, each showing: original review, AI draft, an editable text box, "Post Reply" button, "Regenerate" button.
- Optional **auto-post toggle** per business (posts AI draft automatically for 4–5 star reviews only, always requires manual approval for 1–3 star reviews — this default should be baked in, not just a suggestion, since auto-posting a bad reply to a negative review is a real trust risk).

### Reply posting
- "Post Reply" button calls the platform's reply-to-review API (Google Business Profile / Facebook) with `final_text`.
- On success: `review_replies.status = posted`, `posted_at` set.
- On failure: store `error_message`, surface a retry button in UI, alert via Sentry.

**Acceptance criteria:** A test business with 10 real reviews across 1–5 stars produces drafts that a human would plausibly post without heavy editing for at least 8 of the 10. Posting a reply via the UI actually appears on the live Google/Facebook listing within a few minutes.

---

## Phase 3 — Review Request Automation (Weeks 4–5)
**Goal:** Owner adds recent customers → they automatically get a review-request SMS/email.

**Important product decision:** most single-location owners (front desk staff, solo operators) do not know how to build a CSV and will not use a feature that requires one. Manual quick-add must be the primary, default entry method — CSV upload is a secondary option for power users, not the main path. Three entry methods, in priority order of expected real-world usage:

1. **Quick-add form (primary, build this first)**
   - Sits directly on the dashboard, always visible — not buried in a settings/import page.
   - Two fields only: name + phone (email optional/secondary field). Large touch targets, mobile-friendly (this will often be used on a phone or tablet at a front counter, between customers).
   - Submitting the form immediately queues the review-request send — no separate "batch" step required for a single add. This should feel as fast as adding a contact to a phone.
   - After adding, the customer appears instantly in a running list on the dashboard with send status.

2. **Paste-a-list textarea (secondary, build this second)**
   - A simple text box: "Paste names and numbers, one per line" — accepts loose formats like `Jane Smith, 555-1234` or `Jane Smith - 555-1234` and parses leniently (don't force a strict format from a non-technical user).
   - Good for someone who already has a rough list in Notes app, a group text, or a paper log they're transcribing.
   - Shows a parsed preview ("Found 8 contacts") before confirming send, so the owner can catch parsing mistakes.

3. **CSV bulk upload (tertiary, build this last)**
   - Kept for power users, agencies managing multiple client accounts, or businesses with an existing POS export.
   - Not removed — just not the first thing a new user is pushed toward.

4. **Review-request message templates**, editable per business, with merge fields (`{customer_name}`, `{business_name}`, `{review_link}`).
5. **Send logic**: whether a contact arrives via quick-add, paste, or CSV, all three funnel into the same `review_requests` table and the same send job — send via Twilio (SMS) or Resend (email) with a direct link to leave a Google review.
6. **Click tracking**: shortened/trackable link so the dashboard can show "X requests sent, Y clicked" — this is the single most convincing metric for renewal, so it must exist even in a minimal form.
7. Rate/pacing logic: don't blast all contacts in one batch instantly — space sends (e.g., 1 every few seconds) to look natural and avoid carrier spam flagging. For single quick-adds this is a non-issue; it mainly applies to paste-list and CSV batches.

### Data model note
Add an `entry_method` field to `review_requests` (`quick_add`, `paste_list`, `csv_import`) — this lets you measure in Phase-post-launch analytics which method users actually use, and validate (or correct) this prioritization with real data instead of assumption.

### API endpoints
```
POST /api/businesses/:id/review-requests/quick-add   -- single manual add, primary path
POST /api/businesses/:id/review-requests/parse-paste  -- parse pasted text, return preview
POST /api/businesses/:id/review-requests/upload        -- CSV bulk upload, secondary path
GET  /api/businesses/:id/review-requests                -- list + status, all methods combined
POST /api/businesses/:id/review-requests/send-batch
```

**Acceptance criteria:**
- A non-technical tester can add a single customer via the quick-add form and receive the SMS/email within the same test session, with zero instruction beyond "add a customer."
- Pasting a loosely-formatted list of 5–10 names/numbers correctly parses at least 90% of entries into a usable preview.
- Uploading a CSV of 10 real (test) contacts still works identically to the original spec, with the dashboard correctly showing sent/failed/clicked counts across all three entry methods combined.

---

## Phase 4 — Billing & Account Management (Week 5–6)
**Goal:** A visitor can sign up, pick a plan, enter a card, and become a paying customer with zero manual intervention.

- Stripe Checkout integration for the locked `Starter ($29/mo)` and `Pro ($59/mo)` plans defined in Section 0.
- Stripe webhook handling: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Free trial: 14 days, card required at signup, auto-converts to Starter on day 15 unless the user upgrades to Pro or cancels.
- Plan gating (final, locked): Starter = 1 location, Google reviews only, 100 review-requests/mo included, email support; Pro = 1 location, Google + Facebook reviews, SMS + email review requests, 300 review-requests/mo included, priority support. Overage on either plan bills at $0.05/review-request via Stripe metered billing.
- Billing settings page: update card, view invoices, cancel subscription (self-serve cancellation — do not force a support ticket to cancel, this damages trust and conversion in this buyer segment).

**Acceptance criteria:** Full signup → trial → card charged → active subscription flow works end-to-end in Stripe test mode, then verified once in live mode with a real card before launch.

---

## Phase 5 — Trust, Onboarding Polish & Launch Prep (Weeks 6–8)
**Goal:** Everything a first real, paying, non-technical customer needs to succeed without you personally walking them through it.

- **Guided onboarding checklist** on first login: connect Google → connect Facebook (optional) → set brand voice → upload first customer list. Show progress visually (this category's users abandon setup easily — do not skip this).
- **Empty states** for zero reviews yet, zero requests sent yet — explain what will happen, don't just show a blank screen.
- **Notification preferences** (email/SMS on new review, daily digest option).
- **Marketing/landing page**: clear value prop, pricing table, comparison-style content ("Birdeye alternative for single-location businesses," "Podium alternative") — this content should exist before launch since it's a primary acquisition channel per the earlier market research.
- **Legal pages**: Terms of Service, Privacy Policy (required for Stripe, Google API, Meta API compliance — Meta and Google both require a live privacy policy URL during app review, so this must exist before Phase 0's API approvals will even clear).
- **Support channel**: a real inbox (even just a shared email) monitored daily — this segment expects to reach a human.

**Acceptance criteria:** A friend or beta tester with zero context can sign up, connect a real business, and get their first AI-drafted reply live without you intervening.

---

## Phase 6 — Beta (Weeks 8–10)
**Goal:** exactly 8 real businesses using it free for 30 days in exchange for feedback, before charging full price publicly.

- Manually recruit 8 single-location businesses (this is a sales task, not a dev task — see distribution plan from earlier research). Do not proceed to Phase 7 with fewer than 8 active beta businesses, and do not delay Phase 7 to recruit more than 8 — 8 is the locked number for this cycle.
- Fix real-world edge cases: businesses with zero reviews, businesses with 500+ historical reviews (don't try to backfill/reply to all of them — only reply-prompt for reviews from connection date forward), multi-word brand names causing OAuth location-matching issues, timezone bugs in scheduled sends.
- Track activation metric: % of connected businesses that post at least one AI-assisted reply within 7 days. This is the single most important leading indicator of whether the core loop works.

**Acceptance criteria:** At least 5 beta businesses have connected a real profile, received real AI drafts, and posted at least one real reply to a live review.

---

## Phase 7 — Commercial Launch (Week 10–12)
**Goal:** Public, paid, self-serve availability.

- [ ] Google Business Profile API + Meta App Review both formally approved for production use (not just development mode) — confirm before flipping to public, since dev-mode API access typically has hard user caps.
- [ ] Twilio 10DLC registration approved (SMS sending at volume will be throttled/blocked without this).
- [ ] Stripe account fully activated for live payments (bank account verified).
- [ ] Remove any beta/discount pricing; standard plans live.
- [ ] Launch on Product Hunt (optional but low-cost) + begin manual outreach distribution (per the earlier distribution plan: local business Facebook groups, direct outreach to businesses with visibly slow review response times).
- [ ] Publish the comparison/SEO landing pages built in Phase 5.
- [ ] Set up a basic status/uptime monitor (e.g., Better Uptime) — a review-reply outage during a business's bad-review moment is the worst possible failure mode for this product.

**Commercial launch = done when:** a stranger with no relationship to the founder can find the site, sign up, pay, connect their real business, and get value with zero manual onboarding help.

---

## Post-Launch Metrics to Track From Day 1 (build the dashboard for these, don't just plan to check them manually)

| Metric | Why it matters |
|---|---|
| Activation rate (connected → first reply posted within 7 days) | Leading indicator of whether the core value loop works |
| Time from review received → reply posted | The actual value prop; should trend toward minutes, not days |
| Review-request send → click-through rate | Proves the second core feature works and is a strong renewal-conversation talking point |
| Monthly churn % | Local-business SaaS churn is real; track from customer #1, don't wait until it's a crisis |
| Trial → paid conversion rate | Tells you if the 14-day trial length and gating are right |
| AI draft edit rate (% of replies owner heavily edits before posting) | Directly measures reply-quality — rising edit rate over time signals a prompt-tuning problem |

---

## Realistic Timeline Summary

| Phase | Weeks | Cumulative |
|---|---|---|
| 0 — Foundations & API access | 1 | Week 1 |
| 1 — Review data pipeline | 2 | Week 3 |
| 2 — AI reply engine | 1 | Week 4 |
| 3 — Review request automation | 1 | Week 5 |
| 4 — Billing | 1 | Week 6 |
| 5 — Trust/onboarding/launch prep | 2 | Week 8 |
| 6 — Beta with real businesses | 2 | Week 10 |
| 7 — Commercial launch | 2 | Week 12 |

**Total: ~10–12 weeks to commercial launch**, longer than the 3–5 week estimate given in the original opportunity scan — that earlier number was a bare-technical-MVP estimate; this roadmap includes the API-approval lead times (Google/Meta/Twilio all have manual review steps that are the actual critical path, not the coding) and a real beta cycle, which is what a genuine commercial launch requires.

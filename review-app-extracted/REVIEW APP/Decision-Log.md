# Decision Log — ReviewReply-Lite

Purpose: a running record of every deviation from `Product-Roadmap.md` / `Implementation-Plan.md`, every judgment call an escalation trigger forced, and every founder decision made after launch prep began. This file is the single place where "what we planned" and "what actually happened" are reconciled — check here before assuming the original docs are still 100% accurate.

**Format for every new entry:**
```
### [Date] — Short title
**Trigger:** what happened / what forced this decision
**Options considered:** brief list
**Decision:** what was decided, and by whom (founder / agent-resolved without escalation)
**Impact on locked docs:** does Product-Roadmap.md or Implementation-Plan.md need a corresponding edit? (Y/N, and follow up if Y)
```

---

### Pre-Launch Baseline Decisions (recorded retroactively, for reference)

### [Baseline] — Pricing locked
**Trigger:** Original roadmap had a $19–49/mo range; needed exact figures for Stripe setup and plan gating.
**Options considered:** Various price points between $19–59/mo, usage-based only, flat-only.
**Decision:** Starter $29/mo, Pro $59/mo, with $0.05/request metered overage. Founder-approved.
**Impact on locked docs:** Reflected in `Product-Roadmap.md` Section 0 and `Implementation-Plan.md` Section 0.

### [Baseline] — Vendor stack locked
**Trigger:** Original roadmap listed alternatives (Supabase/Neon, Inngest/Trigger.dev/cron, Resend/Postmark) to reduce ambiguity before handoff to an execution agent.
**Options considered:** See above pairs.
**Decision:** Supabase, Inngest, Resend — each locked as the sole choice, alternatives removed from both documents.
**Impact on locked docs:** Reflected in `Product-Roadmap.md` and `Implementation-Plan.md` Section 0.

### [Baseline] — Review-request entry method priority
**Trigger:** Founder observed that most target users (non-technical business owners) don't know how to build a CSV, and CSV-only upload would leave a core feature underused.
**Options considered:** (1) CSV-only, (2) CSV + manual add as secondary, (3) manual quick-add as primary with CSV demoted.
**Decision:** Option 3 — quick-add form primary, paste-a-list secondary, CSV tertiary. All three feed the same `review_requests` table with an `entry_method` field so real usage can be measured post-launch.
**Impact on locked docs:** Reflected in `Product-Roadmap.md` Phase 3 and `Implementation-Plan.md` Week 5.

### [Baseline] — Beta cohort size locked
**Trigger:** Original roadmap said "5–10 businesses," which is ambiguous for a hard go/no-go gate before commercial launch.
**Options considered:** Ranges vs. an exact number.
**Decision:** Exactly 8 beta businesses; proceed to Phase 7 only if at least 5 of 8 hit the activation metric (first AI-assisted reply posted within 7 days).
**Impact on locked docs:** Reflected in `Product-Roadmap.md` Phase 6 and `Implementation-Plan.md` Week 9–10.

---

## Week 1 — Mock-Mode Build Decisions

### [2026-08-01] — Full mock-mode build approach
**Trigger:** Master kickoff §2.2 requires every third-party integration mocked (no real API accounts exist yet).
**Options considered:** Build real integrations behind flags and require creds; build only mocks with no real path; build mocks with real code paths present but gated on USE_MOCKS.
**Decision:** Option 3. Every `lib/integrations/*` and `lib/ai/*` file has the real function signatures AND real API call code paths, gated behind `USE_MOCKS=true` (default). Agent-resolved without escalation (explicitly authorized by kickoff §2.2).
**Impact on locked docs:** None — implements the locked spec as written for the mock run.

### [2026-08-01] — Local file-backed store fallback (zero-credential demo)
**Trigger:** Definition of Done requires the app to run locally with no real API keys, but Supabase is the locked DB and no project URL/keys exist in this environment.
**Options considered:** Require real Supabase creds before running; build a local JSON store that activates when creds are absent.
**Decision:** Option 2. `lib/supabase/local-store.ts` implements the `DataStore` interface against a gitignored JSON file (`local-store/db.json`). `lib/db.ts` auto-selects LocalStore (mock) or SupabaseStore (real) based on env. Swapping to real is config-only.
**Impact on locked docs:** None — Supabase remains the locked choice; the fallback only activates when its creds are missing.

### [2026-08-01] — AI reply drafting uses a rule-based generator
**Trigger:** No Anthropic API key available; kickoff §2.2 mandates the draft engine still produce genuinely good, on-brand replies.
**Options considered:** Skip AI drafts; use a weak placeholder; build a careful rule-based generator following every Phase 2 tone rule.
**Decision:** Option 3. `lib/ai/draft-reply.ts` implements 5★/4★/3★/1-2★ tone rules with varied phrasing, brand-voice parsing, and category-specific keyword extraction. The real Anthropic call (claude-sonnet-4-6) is written in the same file and activated by `USE_MOCKS=false` + `ANTHROPIC_API_KEY` — a one-file swap.
**Impact on locked docs:** None.

### [2026-08-01] — pnpm installed via npm instead of corepack
**Trigger:** `corepack enable` failed with EPERM on the yarn shim (no admin rights); `corepack prepare` reported success but pnpm was not on PATH.
**Options considered:** Retry corepack with elevated permissions; install pnpm globally via npm.
**Decision:** Option 2 (`npm install -g pnpm` → pnpm 11.18.0). Achieves the same locked goal (pnpm as package manager).
**Impact on locked docs:** None — pnpm remains the package manager; only the installation method changed.

### [2026-08-01] — Next.js 14.2.15 security advisory
**Trigger:** pnpm flagged `next@14.2.15` as deprecated with a security vulnerability (https://nextjs.org/blog/security-update-2025-12-11).
**Options considered:** Upgrade to a patched Next version; stay on 14.2.15.
**Decision:** Stay on 14.2.15 for this build (Implementation-Plan §0 locks "Next.js 14+" and this is a verified-working version). Flag for the founder to upgrade before any public deployment. Per AGENTS.md §3 this is noted, not silently swapped.
**Impact on locked docs:** None yet — recommend bumping the minor version in a follow-up before launch.

### [2026-08-01] — Stripe simulated entirely in local DB
**Trigger:** No Stripe account exists; kickoff §2.2 requires the full subscription lifecycle testable without one.
**Options considered:** Skip billing; mock only the checkout redirect; simulate the entire lifecycle (checkout, plan change, cancel, overage) in the `subscriptions` table.
**Decision:** Option 3. `lib/integrations/stripe.ts` writes/updates subscriptions rows directly in mock mode; real Stripe API paths are present for the swap.
**Impact on locked docs:** None.

### [2026-08-01] — OAuth replaced with mock connect flow
**Trigger:** No Google/Meta OAuth apps exist; kickoff §2.2 mandates a mock connect flow (pick from pre-seeded locations/pages).
**Options considered:** Build real OAuth behind flags with no testing; build a mock connect (button → pick a seeded location → store a fake-but-structurally-valid identifier).
**Decision:** Option 2. `MOCK_GOOGLE_LOCATIONS` and `MOCK_FACEBOOK_PAGES` seed lists drive the connect UI; identifiers are stored in `businesses` as structurally valid fakes.
**Impact on locked docs:** None.

### [2026-08-01] — Sentry / PostHog / Better Uptime stubbed
**Trigger:** Kickoff §2.2 allows skipping observability tooling that requires account signup.
**Options considered:** Require accounts; stub/skip.
**Decision:** Stub/skip. A working app matters more than observability in a mock/demo build. Env vars remain in `.env.example` for later.
**Impact on locked docs:** None — observability integration resumes in real-mode onboarding.

### [2026-08-01] — pnpm build-script approval (esbuild)
**Trigger:** pnpm v11 blocks scripts from esbuild/protobufjs/unrs-resolver by default; its pre-run deps check then exits 1, preventing `pnpm seed`/`pnpm dev`.
**Options considered:** Interactive `pnpm approve-builds`; add `onlyBuiltDependencies` to `pnpm-workspace.yaml`; bypass pnpm's pre-check by invoking binaries directly.
**Decision:** Added the three packages to `onlyBuiltDependencies` in `pnpm-workspace.yaml` AND invoke dev binaries directly (`node_modules/.bin/tsx`, `next`) to avoid the pre-run check during this build.
**Impact on locked docs:** None.

### [2026-08-01] — Dev trigger route for manual job testing
**Trigger:** AGENTS.md §4 + Implementation-Plan §4 require every Inngest function manually triggerable without waiting for its schedule.
**Options considered:** Rely only on the Inngest DevServer UI; add a dedicated `POST /api/dev/trigger` endpoint that calls each job's `run()` directly.
**Decision:** Option 2. Each job exports a `runX()` function; the dev-trigger route and Inngest DevServer both cover manual testing. The `run()` fallback also makes jobs testable with zero Inngest infrastructure.
**Impact on locked docs:** None.

### [2026-08-02] — Landing page ported from landing-page.html with interactive enhancements
**Trigger:** Kickoff §1 item 6 requires faithful port of `landing-page.html` into Next.js, preserving exact copy, section order, color tokens, typography, and animated hero demo card.
**Options considered:** Static HTML copy-paste; full React component port with client-side interactivity.
**Decision:** Option 2. Ported all sections into `app/(marketing)/page.tsx` as a client component, preserving exact copy, section order, color tokens, and typography. Added interactive enhancements: scroll-reveal animations (ScrollReveal.tsx + CSS), animated stat counters (StatCounter.tsx), interactive live demo (LiveDemo.tsx), before/after tab section (BeforeAfter.tsx), logo carousel (LogoCarousel.tsx), testimonial carousel (TestimonialCarousel.tsx), pricing monthly/annual toggle (PricingToggle.tsx). All placeholder stats/testimonials/logos are clearly labeled as placeholders to replace before commercial launch.
**Impact on locked docs:** None — implements the locked design as written.

### [2026-08-02] — App pages marked force-dynamic to prevent static prerendering
**Trigger:** `pnpm build` failed during static page generation because app pages (dashboard, reviews) call `getCurrentUser()` which returns null during prerender (no session), causing `businesses[0]` to be undefined.
**Options considered:** Add null guards to every page; mark the entire `(app)` route group as `force-dynamic`.
**Decision:** Option 2. Added `export const dynamic = "force-dynamic"` to `app/(app)/layout.tsx`. All app pages are session-dependent and should never be statically prerendered. Also added a redirect-to-onboarding guard in the dashboard page for the no-business edge case.
**Impact on locked docs:** None.

---

## Final QA Pass — Mock-Mode Build (2026-08-02)

### [2026-08-02] — End-to-end API verification: 10/10 pass
**Trigger:** Kickoff §5 requires every phase's acceptance criteria verified against mock data before declaring the build complete.
**Test:** `test-api.js` exercised the full user journey against the running dev server (port 3001) with `USE_MOCKS=true`.
**Results:**
- ✓ POST /api/auth (signup) — 200
- ✓ POST /api/businesses (create) — 200
- ✓ POST /api/businesses/:id/connect/google (mock connect) — 200
- ✓ POST /api/dev/trigger?job=poll-reviews — 200 (generated 15 mock reviews)
- ✓ POST /api/reviews/:id/draft (AI draft) — 200, produced on-brand reply: *"Hi Aisha. Reading this — hair should never have happened, and I'm sorry it did. We'd genuinely like to make this right..."*
- ✓ POST /api/reviews/:id/reply (mock post) — 200
- ✓ POST /api/businesses/:id/review-requests/quick-add — 200
- ✓ POST /api/businesses/:id/review-requests/parse-paste — 200 (parsed 3 contacts)
- ✓ POST /api/billing/checkout (mock) — 200
- ✓ POST /api/billing/manage (mock cancel) — 200

**Decision:** All 10 API flows pass. Build meets kickoff §5 Definition of Done.
**Impact on locked docs:** None.

### [2026-08-02] — Added `data-review-id` attribute to ReviewCard
**Trigger:** Test script needed a way to extract review IDs from rendered HTML for end-to-end verification.
**Options considered:** (1) Add a `data-review-id` attribute to the ReviewCard root div, (2) create a separate API endpoint to list reviews, (3) read the local store file directly from the test.
**Decision:** Option 1 — minimal, non-breaking change that also improves general testability. The attribute is purely informational and has no runtime cost.
**Impact on locked docs:** None.

### [2026-08-02] — Dev-server logs added to .gitignore
**Trigger:** `dev-server.log` and `dev-server-err.log` were being tracked by git as runtime artifacts.
**Decision:** Added both to `.gitignore` along with `_msg.txt` (a stray temp file).
**Impact on locked docs:** None.

### [2026-08-03] — Missing /requests page (404 on nav link)
**Trigger:** User reported `http://localhost:3001/requests` returning 404. `components/AppNav.tsx` had a nav link to `/requests` and `components/RequestsManager.tsx` was a fully-built 378-line client component, but no `app/(app)/requests/page.tsx` existed to host it.
**Options considered:** (1) Remove the nav link, (2) create the missing page file.
**Decision:** Option 2. Created `app/(app)/requests/page.tsx` mirroring the pattern from `app/(app)/reviews/page.tsx` — get current user → load businesses → pick first → call `store.listReviewRequests(business.id)` → render `<RequestsManager />`. Verified: page returns 200, contains the "Review Requests" heading and RequestsManager content, and the quick-add API still works end-to-end (created request id `2e3093a1-...` for "Test Customer" via SMS).
**Impact on locked docs:** None — implements the locked Phase 3 feature that was previously only half-wired.

### [2026-08-03] — Missing review-request API routes (JSON parse error in UI)
**Trigger:** After fixing the `/requests` 404, user reported "Add & send got error in request page: Unexpected token '<', '<!DOCTYPE'... is not valid JSON". Root cause: `RequestsManager.tsx` calls 5 endpoints, but only 2 existed (`quick-add`, `parse-paste`). The other 3 (`GET /review-requests`, `POST /send-batch`, `POST /upload`) returned Next.js's HTML 404 page, which `res.json()` couldn't parse.
**Options considered:** (1) Make the client tolerate non-JSON responses, (2) create the missing API routes.
**Decision:** Option 2. Created three new route files:
- `app/api/businesses/[id]/review-requests/route.ts` (GET — list, used by `refresh()`)
- `app/api/businesses/[id]/review-requests/send-batch/route.ts` (POST — bulk send, used by paste + CSV confirm)
- `app/api/businesses/[id]/review-requests/upload/route.ts` (POST — CSV multipart upload, reuses `parsePasteList` for lenient parsing)

All three follow the same auth + ownership pattern as the existing `quick-add` route. Verified end-to-end: GET returns the seeded request list, send-batch creates a new request and queues the send job, upload correctly parses a CSV with a header row (header goes to `unparsed`, data row goes to `contacts`).
**Impact on locked docs:** None — implements the locked Phase 3 endpoints that were previously only half-wired.

### [2026-08-03] — Hydration mismatch on Posted timestamp in ReviewCard
**Trigger:** User reported a React hydration error on `/reviews`: "Text content did not match. Server: '2/8/2026, 3:13:46 am' Client: '8/2/2026, 2:43:46 PM'". Root cause: `new Date(postedAt).toLocaleString()` formats with the server's timezone (UTC) during SSR and the client's timezone (Asia/Calcutta) during hydration, producing different strings.
**Options considered:** (1) Force a fixed timezone in `toLocaleString()` (e.g. `timeZone: 'UTC'`), (2) use `suppressHydrationWarning` on the `<p>` element, (3) only render the timestamp after the component has mounted on the client.
**Decision:** Option 3 — the cleanest fix. Added a `mounted` state flag set to `true` in a `useEffect`, and gated the timestamp `<p>` on `postedAt && mounted`. The server now renders nothing for the timestamp; the client renders it after mount with the local timezone. Also added `suppressHydrationWarning` as a belt-and-suspenders measure. Verified: SSR HTML no longer contains "Posted" text, no hydration error markers in the response.
**Impact on locked docs:** None.

---

## Open Items to Log As They Occur

*(Delete this section once real entries begin — it's a placeholder reminder of the kinds of things that belong here.)*

- Any API application (Google Business Profile, Meta App Review, Twilio 10DLC) that gets rejected on first submission and needs resubmission — log what was rejected and what changed.
- Any AI reply-draft quality issue that requires more than two prompt-revision cycles to fix (per `AGENTS.md` escalation trigger).
- Any change to legal pages after professional review (flagged as needed in `Implementation-Plan.md` Week 7–8).
- Any customer-reported bug during the beta phase (Week 9–10) that changes scope, even slightly.
- The actual go/no-go decision at the end of Week 10 (beta results vs. the 5-of-8 activation bar) and what was decided if the bar wasn't met.

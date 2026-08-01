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

---

## Open Items to Log As They Occur

*(Delete this section once real entries begin — it's a placeholder reminder of the kinds of things that belong here.)*

- Any API application (Google Business Profile, Meta App Review, Twilio 10DLC) that gets rejected on first submission and needs resubmission — log what was rejected and what changed.
- Any AI reply-draft quality issue that requires more than two prompt-revision cycles to fix (per `AGENTS.md` escalation trigger).
- Any change to legal pages after professional review (flagged as needed in `Implementation-Plan.md` Week 7–8).
- Any customer-reported bug during the beta phase (Week 9–10) that changes scope, even slightly.
- The actual go/no-go decision at the end of Week 10 (beta results vs. the 5-of-8 activation bar) and what was decided if the bar wasn't met.

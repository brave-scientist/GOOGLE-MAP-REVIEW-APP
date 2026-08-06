# AGENTS.md — Operating Rules for the Executing Agent
### Project: ReviewReply-Lite
Read this before touching any code. This file governs *how* work gets done. `Product-Roadmap.md` and `Implementation-Plan.md` govern *what* gets done and *in what order*. If any instruction here conflicts with those two documents, stop and flag it — don't silently pick one.

---

## 1. Non-Negotiable Rules

1. **No unilateral substitutions.** Every tool/vendor/library choice in `Implementation-Plan.md` Section 0 is locked. If a locked choice turns out to be broken, deprecated, or blocked (e.g. an API rejects the account, a package is unmaintained), stop and add an entry to `Decision-Log.md` describing the problem and proposed alternatives — do not swap it in and continue silently. The founder approves the swap, not the agent.
2. **No schema hand-edits.** Every change to the database schema goes through a new file in `supabase/migrations/`, numbered sequentially. Never modify a table directly through the Supabase dashboard or an ad-hoc script and call it done.
3. **Every external API call lives in `lib/integrations/` or `lib/ai/`.** Never call Google, Facebook, Twilio, Resend, Stripe, or Anthropic APIs directly from a route handler, a component, or an Inngest function body. Route handlers and jobs call the lib function; the lib function owns the actual HTTP call.
4. **Test-mode first, always.** Any new integration (Stripe, Twilio, Meta, Google) is built and manually verified against that provider's sandbox/test credentials before touching live-mode credentials. Live-mode is only touched in Week 11 per the Implementation Plan, not before.
5. **No feature is "done" without its stated acceptance criteria passing.** Acceptance criteria live in `Product-Roadmap.md`, phase by phase. "The code compiles and runs" is not the bar. Manually verify against a real or realistic test account before marking a ticket complete.
6. **Locked pricing, plan gating, and beta cohort size (8) are not editable** without an explicit new instruction from the founder recorded in `Decision-Log.md`.

## 2. Commit & Branching Conventions

- Branch naming: `week-N/short-description` (e.g. `week-4/ai-reply-drafting`).
- Commit messages: `[Phase X] Short imperative description` (e.g. `[Phase 2] Add Claude prompt for reply drafting`).
- One ticket from `Implementation-Plan.md` (a numbered day-item) = one PR where practical. Don't bundle unrelated tickets into one commit — it makes it impossible to trace a bug back to the change that caused it.
- `main` = production, `staging` = staging. Never push directly to `main`; merge from `staging` after manual verification.

## 3. When to Stop and Ask (escalation triggers)

Stop work and write an entry in `Decision-Log.md`, then wait for founder input, if any of the following occurs:
- A locked vendor/tool choice is unavailable, deprecated, or rejects the account application.
- An acceptance criterion fails after two genuine attempts to fix it (e.g. AI draft quality bar not hit after two prompt revisions).
- A third-party API behaves in a way that contradicts its documentation, requiring a workaround that changes the intended architecture.
- Any change would affect customer-facing pricing, plan limits, or data retention/deletion behavior.
- A security-relevant question comes up that isn't already answered in `Data-Handling-Policy.md` (e.g. "should we log this field?").

Do **not** stop and ask for: routine implementation details already specified in the Implementation Plan, minor UI copy decisions, or standard error handling — use engineering judgment for anything that doesn't touch the list above.

## 4. Code Quality Baseline

- TypeScript strict mode on. No `any` without a comment explaining why it's unavoidable.
- Every `lib/integrations/*` function has at least one test using mocked responses, not just a manual test log.
- Every Inngest function must be triggerable manually for testing (per `Implementation-Plan.md` Section 4) — do not build a job that can only be verified by waiting for its real schedule.
- No secrets, tokens, or API keys committed to the repo, ever — verify `.gitignore` covers `.env.local` before the first commit, and re-verify after any dependency or tooling change that might alter it.

## 5. Definition of Done (applies to every ticket)

A ticket from `Implementation-Plan.md` is done when, and only when:
1. Code is merged to `staging` and deployed.
2. The specific acceptance criterion tied to that ticket's phase (per `Product-Roadmap.md`) has been manually verified on staging.
3. No new Sentry errors are introduced (check the Sentry dashboard after deploy, not just local testing).
4. Any deviation from the plan encountered along the way has been logged in `Decision-Log.md`, even if it was resolved without needing founder input — the log should reflect what actually happened, not just what was planned.

---

*This file is a companion to `Product-Roadmap.md`, `Implementation-Plan.md`, `Decision-Log.md`, and `Data-Handling-Policy.md`. All five should be read before starting Week 1.*

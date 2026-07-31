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

## Open Items to Log As They Occur

*(Delete this section once real entries begin — it's a placeholder reminder of the kinds of things that belong here.)*

- Any API application (Google Business Profile, Meta App Review, Twilio 10DLC) that gets rejected on first submission and needs resubmission — log what was rejected and what changed.
- Any AI reply-draft quality issue that requires more than two prompt-revision cycles to fix (per `AGENTS.md` escalation trigger).
- Any change to legal pages after professional review (flagged as needed in `Implementation-Plan.md` Week 7–8).
- Any customer-reported bug during the beta phase (Week 9–10) that changes scope, even slightly.
- The actual go/no-go decision at the end of Week 10 (beta results vs. the 5-of-8 activation bar) and what was decided if the bar wasn't met.

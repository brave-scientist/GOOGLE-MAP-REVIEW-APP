"""
Part 7-10 content: Roadmap, Automation Flows, Launch Readiness, Appendices.
"""


# ════════════════════════════════════════════════════════════════════════════
# PART VII — PHASED IMPLEMENTATION ROADMAP
# ════════════════════════════════════════════════════════════════════════════
def part_7_roadmap(story):
    add_h1('Part VII — Phased Implementation Roadmap', level=0)
    add_kicker('24 Weeks · 7 Phases · RACI · Exit Criteria · KPIs')

    add_body(
        "This part sequences the work into seven phases over twenty-four weeks. Each phase has "
        "clear deliverables, dependencies, an exit criteria checklist, and KPIs. The phases are "
        "designed to deliver visible value every two weeks — no phase ends without something a "
        "user or stakeholder can touch."
    )

    add_h2('Phase 0 — Stabilization (Week 1–2, $15k)')
    add_kicker('Fix all P0/P1 bugs · Isolate mock mode · Patch security holes')
    add_body(
        "Before adding anything new, fix every P0 and P1 bug identified in Part II. This phase "
        "is non-negotiable — no new feature work begins until the existing app is correct and "
        "secure. Mock mode is clearly isolated behind a feature flag, security holes are patched, "
        "and the test suite is brought up to a baseline coverage."
    )
    add_h3('Deliverables')
    add_bullets([
        "Fix all 5 P0 bugs (FB-01 through FB-05, BB-01 through BB-05)",
        "Fix all 14 P1 bugs (FB-06 through FB-10, BB-07 through BB-10, plus design P1s)",
        "Add <code>isMockMode()</code> guards to every integration file — mock data must never leak into production paths",
        "Add <code>app/not-found.tsx</code>, <code>app/error.tsx</code>, <code>app/loading.tsx</code>",
        "Add <code>app/(marketing)/layout.tsx</code> with shared nav + footer",
        "Fix invalid Tailwind classes (space-y-22, mb-22, duration-400, prose prose-invert)",
        "Add Stripe webhook handler at <code>app/api/webhooks/stripe/route.ts</code> with signature verification",
        "Add Inngest signature verification to <code>app/api/inngest/route.ts</code>",
        "Add <code>/api/dev/trigger</code> authentication (admin-only)",
        "Fix <code>AI_MODEL</code> to <code>claude-3-5-sonnet-20241022</code>",
        "Add <code>subscription_plan</code> enum value <code>enterprise</code> via migration 0003",
        "Add RLS policies to <code>organizations</code> table",
        "Add rate limiting middleware (Upstash Redis)",
        "Baseline test coverage: unit tests for lib/ai, lib/parsing, lib/integrations",
    ])
    add_h3('Exit Criteria')
    add_bullets([
        "All P0/P1 bugs closed in tracker",
        "Mock mode clearly isolated — <code>grep -r 'mock-data' app/</code> returns zero hits in production paths",
        "Stripe webhook test event processed successfully",
        "Inngest signed event accepted; unsigned event rejected with 401",
        "Test coverage ≥ 60% on lib/",
        "Security scan (Snyk) shows zero high-severity vulnerabilities",
    ])
    add_h3('KPIs')
    add_bullets([
        "P0/P1 bug count: 23 → 0",
        "Mock data leak count: many → 0",
        "Test coverage: ~0% → 60%+",
        "Security vulnerabilities (high+): many → 0",
    ])

    add_h2('Phase 1 — Design System (Week 3–5, $45k)')
    add_kicker('Component library · Motion · Dark mode · Mobile-first')
    add_body(
        "Build the 53-component library defined in Part V §3. Install Radix UI + Tailwind + "
        "Framer Motion + lucide-react. Build the token system. Replace every emoji icon with "
        "lucide. Build dark mode. Build mobile-first patterns. By end of Phase 1, the existing "
        "app pages should look 80% premium — they will use the new components without yet "
        "adding new features."
    )
    add_h3('Deliverables')
    add_bullets([
        "Install: radix-ui, framer-motion, lucide-react, recharts, cmdk, react-hook-form, zod",
        "Token system: <code>lib/design/tokens.ts</code> with color, typography, spacing, radius, motion",
        "Tier 1 primitives (25 components): Button, Input, Modal, Toast, Tabs, etc.",
        "Tier 2 data components (10): DataTable, Skeleton, EmptyState, StatCard, Chart",
        "Tier 3 patterns (8): CommandPalette, MagneticButton, GlassCard, AuroraBackground",
        "Dark mode: every component in light + dark, with <code>prefers-color-scheme</code> auto-switch",
        "Replace every emoji icon with lucide-react equivalent",
        "Replace every Unicode icon (★ ☆ ✓ → ● ◆) with lucide",
        "Build <code>app/(marketing)/layout.tsx</code> with shared responsive nav + footer + mobile hamburger",
        "Build mobile bottom tab bar for app",
        "Add skeleton loaders to every async page",
        "Add toast notifications for every user action (save, error, success)",
        "Add Framer Motion page transitions (route-level)",
    ])
    add_h3('Exit Criteria')
    add_bullets([
        "All 53 components built, documented in Storybook",
        "Every existing page uses new components (no raw Tailwind for primitives)",
        "Dark mode toggles correctly on every page",
        "Mobile responsive at 360px, 414px, 768px, 1024px, 1440px, 1920px",
        "Lighthouse mobile performance ≥ 90 on top 5 pages",
        "WCAG 2.1 AA audit passes (axe DevTools)",
    ])

    add_h2('Phase 2 — Auth & Multi-Tenant (Week 6–7, $30k)')
    add_kicker('Supabase Auth · RBAC · SSO · Organizations · Audit Logs')
    add_body(
        "Wire real Supabase Auth (currently broken). Build the RBAC system from Part VI §4. Add "
        "SSO for enterprise tier. Build the organizations + members UI. Add audit logs."
    )
    add_h3('Deliverables')
    add_bullets([
        "Real Supabase Auth: signup, login, password reset, email verification, magic link",
        "OAuth providers: Google, Apple (consumer); SAML + OIDC (enterprise)",
        "RBAC: 8 roles per Part VI §4.1, enforced at RLS + middleware + UI",
        "Organizations UI: create, invite members, manage roles",
        "Audit log table + UI in Settings (searchable, exportable)",
        "API keys: generate, rotate, revoke (for public API access)",
        "Session management: edge middleware refresh, httpOnly cookies, secure flag",
        "Password policy: ≥ 12 chars, ≥ 1 number, ≥ 1 symbol, breach check (HaveIBeenPwned API)",
        "2FA: TOTP via authenticator app, backup codes",
    ])
    add_h3('Exit Criteria')
    add_bullets([
        "User can sign up, verify email, log in, reset password without mock mode",
        "Google OAuth login works end-to-end",
        "SAML SSO works with Okta test tenant",
        "RBAC: every role sees only what they should (automated test suite)",
        "Audit log records every write operation",
        "2FA enrollment + login + backup codes work",
    ])

    add_h2('Phase 3 — Core Module Rebuild (Week 8–11, $60k)')
    add_kicker('Inbox · Requests · AI Reply · Billing Webhooks · Stripe Customer Portal')
    add_body(
        "Rebuild the four core operational modules. This is where the existing scaffold gets "
        "upgraded to production-grade. Module 1 (Unified Inbox), Module 2 (Multi-Channel "
        "Requests), Module 3 (AI Reply with Brand Voice), and the billing webhooks / customer "
        "portal."
    )
    add_h3('Deliverables')
    add_bullets([
        "Module 1 — Unified Inbox (2 weeks)",
        "Module 2 — Multi-Channel Request Automation (2 weeks, without WhatsApp — added in Phase 5)",
        "Module 3 — AI Reply with Brand Voice Training (3 weeks, overlaps with Phase 4 start)",
        "Stripe billing: webhook handler, customer portal, invoice sync, metered billing",
        "Stripe customer portal embedded at /billing/portal",
        "Real Google Business Profile OAuth: fetchReviews + postReply working",
        "Real Facebook Graph OAuth: fetchReviews + postReply working",
        "Twilio 10DLC registration flow + opt-out handling",
        "Resend bounce/complaint webhook handling",
        "Click tracking: <code>app/r/[token]/page.tsx</code> live",
    ])
    add_h3('Exit Criteria')
    add_bullets([
        "End-to-end: business signs up → connects Google → review arrives in inbox → AI draft generated → approved → posted to Google",
        "End-to-end: business creates campaign → sends 100 SMS → 30 click through → 8 leave review → 6 are positive",
        "Stripe: checkout → webhook → subscription active → customer portal accessible → cancel takes effect at period end",
        "Brand voice: trained on 50+ historical replies, drafts sound like the business",
    ])

    add_h2('Phase 4 — New Enterprise Modules (Week 12–18, $105k)')
    add_kicker('Agency · Sentiment · Widgets · Competitor · Reporting')
    add_body(
        "Build the five enterprise modules that expand TAM and defensibility. These run in "
        "parallel where possible — Modules 4, 5, 7, 8 can be built by separate engineers "
        "simultaneously. Module 6 (Agency) is the most complex and gets a dedicated engineer."
    )
    add_h3('Deliverables')
    add_bullets([
        "Module 4 — Sentiment & Topic Analytics (2 weeks)",
        "Module 5 — Widget & Testimonial Engine (2 weeks)",
        "Module 6 — Multi-Tenant Agency Mode (2 weeks)",
        "Module 7 — Competitor Intelligence (2 weeks)",
        "Module 8 — Reporting & Alerts (1.5 weeks)",
        "White-label: custom domain, logo, colors, CSS override",
        "Slack + Microsoft Teams integrations (OAuth + alert routing)",
        "Scheduled PDF reports (daily, weekly, monthly)",
        "Executive dashboard + agency dashboard",
    ])

    add_h2('Phase 5 — Automation & AI (Week 19–22, $60k)')
    add_kicker('Brand Voice · Multi-Language · Smart Routing · Churn Rescue · WhatsApp')
    add_body(
        "Deepen the AI and automation layer. Brand voice fine-tuning loop. Multi-language "
        "support. Smart send-time optimization. Churn rescue flows. WhatsApp + Apple Business "
        "Chat channels."
    )
    add_h3('Deliverables')
    add_bullets([
        "Brand voice feedback loop: track accept/reject/edit rate per business, re-train weekly",
        "Multi-language: detect review language, draft reply in same language (26 languages)",
        "Smart send-time: ML model for optimal send hour per recipient",
        "A/B testing: variant selection, statistical significance, auto-promotion",
        "Churn rescue: detect at-risk customers (sentiment drop, NPS detractor), trigger outreach workflow",
        "WhatsApp Business: template approval, opt-in flow, send + receive",
        "Apple Business Chat: invitation flow, message templates",
        "Detractor rescue flow: NPS 0–6 triggers automatic outreach",
        "Programmatic local SEO: JSON-LD schema generator, embed snippet, velocity tracker",
    ])

    add_h2('Phase 6 — Compliance & Launch (Week 23–24, $30k)')
    add_kicker('SOC2 · GDPR · TCPA · Performance · Beta · Public Launch')
    add_body(
        "Final hardening for commercial launch. SOC2 Type I readiness (Type II starts at launch). "
        "GDPR/CCPA/TCPA compliance verification. Performance optimization. Closed beta with 20 "
        "design partners. Public launch at end of Week 24."
    )
    add_h3('Deliverables')
    add_bullets([
        "SOC2 Type I readiness: policies, controls, evidence collection, auditor engagement",
        "GDPR: DPA template, data subject access request (DSAR) flow, right-to-erasure automation",
        "CCPA: 'Do Not Sell My Info' page, opt-out flow",
        "TCPA: opt-in checkbox, consent timestamp, 10DLC campaign registration, quiet hours",
        "Performance: Core Web Vitals LCP < 2.5s, FID < 100ms, CLS < 0.1 on all top pages",
        "Accessibility: WCAG 2.1 AA audit passes (third-party audit)",
        "Penetration test: third-party pen test, fix all criticals",
        "Closed beta: 20 design partners, weekly feedback synthesis, iterate",
        "Public launch: landing page live, Product Hunt launch, Hacker News Show HN",
        "Status page (status.reviewreply.com), SLA template, on-call rotation",
    ])
    add_h3('Launch Go/No-Go Checklist')
    add_bullets([
        "All P0/P1/P2 bugs closed",
        "Pen test: zero criticals, zero highs",
        "SOC2 Type I report received",
        "GDPR DSAR flow tested with real data",
        "Core Web Vitals: green on all top pages",
        "WCAG 2.1 AA: third-party audit passes",
        "Backup restore drill successful",
        "On-call rotation documented",
        "Status page live",
        "Customer support runbook documented",
        "Pricing page live",
        "Billing: test end-to-end with real credit card",
        "20 design partners actively using product",
        "NPS from beta ≥ 30",
    ])

    add_h2('RACI Summary')
    add_body(
        "RACI = Responsible (does the work) · Accountable (signs off) · Consulted (input) · "
        "Informed (kept in loop). The team composition: 1 Lead Frontend Engineer (LF), 1 Lead "
        "Backend Engineer (LB), 1 Full-Stack Engineer (FS), 1 Designer (D), fractional Product "
        "Manager (PM), fractional Security Engineer (SE), fractional DevOps (DO)."
    )
    rows = [
        ['Phase 0 — Stabilization', 'LF, LB, FS', 'PM', 'SE', 'D'],
        ['Phase 1 — Design System', 'D, LF, FS', 'PM', 'LB', 'SE'],
        ['Phase 2 — Auth & Multi-Tenant', 'LB, FS', 'PM', 'SE, LF', 'D'],
        ['Phase 3 — Core Module Rebuild', 'LF, LB, FS, D', 'PM', 'SE', '—'],
        ['Phase 4 — Enterprise Modules', 'LF, LB, FS, D', 'PM', '—', '—'],
        ['Phase 5 — Automation & AI', 'LB, FS, LF', 'PM', 'D', '—'],
        ['Phase 6 — Compliance & Launch', 'SE, DO, PM, D', 'PM', 'LF, LB', '—'],
    ]
    add_table(['Phase', 'Responsible', 'Accountable', 'Consulted', 'Informed'], rows,
              col_widths=[130, 90, 70, 70, CONTENT_W - 360], header_align='left')


# ════════════════════════════════════════════════════════════════════════════
# PART VIII — END-TO-END AUTOMATION & MANUAL FLOWS
# ════════════════════════════════════════════════════════════════════════════
def part_8_automation_flows(story):
    add_h1('Part VIII — End-to-End Automation & Manual Flows', level=0)
    add_kicker('10 Critical Workflows · Triggers · Steps · SLAs · Exceptions')

    add_body(
        "This part specifies ten critical end-to-end workflows. Each is defined for both the "
        "automated path (no human in the loop) and the manual path (human override). SLAs are "
        "specified per step. These flows are the contract between product, engineering, and "
        "support — when something breaks, the team knows which flow, which step, which SLA was "
        "violated."
    )

    add_h2('Flow 1 — New Customer Onboarding')
    add_kicker('Trigger: User signs up · SLA: 5 min to first value')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: User submits signup form → Supabase Auth creates user, sends verification email (SLA: 5s)",
        "Step 2: User clicks verification link → marked email_verified, redirected to /onboarding (SLA: 2s)",
        "Step 3: User completes onboarding form (business name, industry, address, phone) → business row created, Google Business Profile auto-discovered by name+address (SLA: 10s)",
        "Step 4: User connects Google Business Profile (OAuth) → GBP location ID stored, initial review pull triggered (SLA: 30s)",
        "Step 5: First 10 reviews pulled → AI draft generated for each pending → dashboard shows '10 reviews, 7 drafts ready' (SLA: 60s)",
        "Step 6: Welcome email sent (Resend) with getting-started guide (SLA: 30s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "If Google auto-discovery fails: user manually enters GBP URL",
        "If OAuth fails: user can skip and connect later, dashboard shows 'Connect Google to start receiving reviews' banner",
        "If no reviews found: empty state with 'Send your first review request' CTA",
    ])

    add_h2('Flow 2 — Review Request Automation')
    add_kicker('Trigger: Event (e.g., appointment completed) · SLA: <5 min from event to send')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: External system (POS, booking, EHR) fires webhook to /api/events with event_type=appointment_completed + customer_contact (SLA: 1s)",
        "Step 2: Webhook handler validates signature, dedupes by event_id (idempotency), creates review_request row (SLA: 1s)",
        "Step 3: Inngest function send-review-request triggered, checks send window (9am–8pm customer local), schedules send (SLA: 1s)",
        "Step 4: At scheduled time, SMS sent via Twilio with branded short link (SLA: 5s)",
        "Step 5: Customer clicks link → /r/[token] page records click, redirects to Google review page (SLA: 1s)",
        "Step 6: Customer leaves review → next Google poll detects it, links to review_request, marks as converted (SLA: 15 min)",
        "Step 7: Conversion tracked in campaign_events, dashboard updates (SLA: 1s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "User can manually add a customer to a campaign via Quick Add (no webhook needed)",
        "User can upload a CSV of customers for bulk send (rate-limited to 100/hour)",
        "User can paste a list of customers (paste-list-parser handles any format)",
    ])

    add_h2('Flow 3 — Review Polling & Ingestion')
    add_kicker('Trigger: Cron every 15 min per business · SLA: <5 min from review-posted to inbox')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: Inngest poll-reviews function runs every 15 minutes per business (SLA: 1s start)",
        "Step 2: For each connected source (Google, FB, Yelp), call fetchReviews(since=last_poll_timestamp) (SLA: 10s)",
        "Step 3: New reviews inserted into reviews table, source-specific dedup by external_id (SLA: 1s)",
        "Step 4: review:created event fired → triggers generate-reply-draft Inngest function (SLA: 1s)",
        "Step 5: AI draft generated using brand voice profile (SLA: 5s)",
        "Step 6: Sentiment + topic analysis queued (separate Inngest function) (SLA: 5s)",
        "Step 7: If rating ≤ 2: real-time alert fired (Slack/email/Teams) (SLA: 5s)",
        "Step 8: Dashboard updates in real-time via Supabase Realtime (SLA: 1s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "User can manually trigger a poll via /settings/integrations → 'Refresh now'",
        "If a known review is missing, user can paste the review URL for manual import",
    ])

    add_h2('Flow 4 — AI Draft Reply Generation')
    add_kicker('Trigger: review:created event · SLA: <10s from review to draft')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: review:created event received by generate-reply-draft Inngest function (SLA: 1s)",
        "Step 2: Load business's brand_voice_profile (encrypted, decrypted in-memory) (SLA: 1s)",
        "Step 3: Construct Claude prompt: system (brand voice + rules) + 5-shot examples + user (review text) (SLA: 1s)",
        "Step 4: Call Anthropic API with claude-3-5-sonnet-20241022, max_tokens=300 (SLA: 5s)",
        "Step 5: Validate response: forbidden phrases check, escalation keyword check, length check (SLA: 1s)",
        "Step 6: If escalation keywords detected (lawsuit, BBB, lawyer): mark as escalated, do not auto-post, alert owner (SLA: 1s)",
        "Step 7: Insert reply_draft row with status=pending_approval (SLA: 1s)",
        "Step 8: If business has auto-post enabled AND rating ≥ 4 AND no escalation: schedule auto-post after 24h if not approved (SLA: 1s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "User edits draft inline → edited text saved → brand voice feedback loop records the edit",
        "User rejects draft → 'Generate alternative' button creates new draft with adjusted prompt",
        "User can write reply from scratch (no AI) → saved as draft with generated_by=human",
    ])

    add_h2('Flow 5 — Approval Workflow & Multi-Channel Reply Posting')
    add_kicker('Trigger: User approves draft · SLA: <30s from approval to posted')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: User clicks 'Approve & Post' on draft → reply_approvals row created (SLA: 1s)",
        "Step 2: post-reply Inngest function triggered (SLA: 1s)",
        "Step 3: Load oauth_token for source (Google/FB/etc.), refresh if expired (SLA: 2s)",
        "Step 4: Call source API to post reply (SLA: 5s for Google, 3s for Facebook)",
        "Step 5: Verify reply posted by re-fetching review (SLA: 5s)",
        "Step 6: Update review row with reply_text + replied_at + replied_by (SLA: 1s)",
        "Step 7: Toast notification: 'Reply posted to Google' (SLA: 1s)",
        "Step 8: If post fails (token expired, API down): retry 3x with exponential backoff, then alert user (SLA: 10s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "User can copy draft text and post manually to Google/FB if API post fails persistently",
        "User can schedule approval for a future time (e.g., 'approve and post tomorrow at 9am')",
    ])

    add_h2('Flow 6 — Daily Digest Email')
    add_kicker('Trigger: Cron 9am user-local · SLA: <5 min generation')
    add_b3_bullets = [
        "Step 1: daily-digest Inngest function triggered per user at 9am local (SLA: 1s)",
        "Step 2: Query reviews received in last 24h for user's businesses (SLA: 2s)",
        "Step 3: Query drafts pending approval (SLA: 1s)",
        "Step 4: Query sentiment anomalies (SLA: 1s)",
        "Step 5: Generate HTML email via React Email template (SLA: 5s)",
        "Step 6: Send via Resend (SLA: 5s)",
        "Step 7: If no reviews + no pending drafts: skip send (don't spam)",
    ]
    add_bullets(add_b3_bullets)

    add_h2('Flow 7 — Real-time Negative Review Alert')
    add_kicker('Trigger: review:created with rating ≤ 2 · SLA: <30s from review to Slack')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: poll-reviews detects new review with rating ≤ 2 (SLA: 1s)",
        "Step 2: alert-negative-review Inngest function triggered (SLA: 1s)",
        "Step 3: Load business's alert config (Slack webhook, Teams webhook, email recipients) (SLA: 1s)",
        "Step 4: Construct alert message: business name, rating, review snippet, link to inbox (SLA: 1s)",
        "Step 5: Send to Slack (incoming webhook) + Teams (Power Automate) + email (Resend) in parallel (SLA: 5s)",
        "Step 6: Record alert_sent_at on review row (SLA: 1s)",
    ])

    add_h2('Flow 8 — Weekly Competitor Benchmarking')
    add_kicker('Trigger: Cron Monday 6am UTC · SLA: <10 min total')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: competitor-snapshot Inngest function triggered per business with competitors configured (SLA: 1s)",
        "Step 2: For each competitor: call Google Maps API to fetch rating + review_count (SLA: 5s per competitor)",
        "Step 3: Scrape last 10 reviews for sentiment topic analysis (compliant with Google TOS) (SLA: 10s per competitor)",
        "Step 4: Insert competitor_snapshot row (SLA: 1s)",
        "Step 5: Compare to last week's snapshot, compute deltas (SLA: 1s)",
        "Step 6: If competitor rating surpassed business: alert (SLA: 5s)",
        "Step 7: If competitor review velocity spiked >50% wow: alert 'Competitor likely running a campaign' (SLA: 5s)",
        "Step 8: Update competitor benchmark dashboard (SLA: 1s)",
    ])

    add_h2('Flow 9 — Churn Rescue')
    add_kicker('Trigger: Customer marked as churn-risk · SLA: <1 hr from detection to outreach')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: Customer Health Score (CHS) computed nightly: usage (40%), NPS (20%), support tickets (20%), sentiment (10%), billing (10%) (SLA: 60s)",
        "Step 2: If CHS < 50: customer marked as churn-risk (SLA: 1s)",
        "Step 3: churn-rescue Inngest function triggered (SLA: 1s)",
        "Step 4: Generate personalized outreach email (Claude with customer's usage history) (SLA: 10s)",
        "Step 5: Send to customer success lead for review/edit (SLA: 1s)",
        "Step 6: CSL reviews, edits if needed, sends (SLA: <1 hr human SLA)",
        "Step 7: Track response, schedule follow-up if no reply in 3 days",
    ])

    add_h2('Flow 10 — Trial Expiration & Conversion')
    add_kicker('Trigger: Cron daily 12pm UTC · SLA: <5 min')
    add_h3('Automated Path')
    add_bullets([
        "Step 1: trial-expiration-warning Inngest function runs daily (SLA: 1s)",
        "Step 2: Query businesses with trial_expires_at within next 3 days (SLA: 2s)",
        "Step 3: For each: send 'Your trial ends in N days' email (Resend) with upgrade CTA (SLA: 5s)",
        "Step 4: If trial_expires_at < 24h: also send SMS (Twilio) (SLA: 5s)",
        "Step 5: If trial expired: downgrade to Free tier, send 'Your trial has ended' email, retain data for 30 days (SLA: 1s)",
        "Step 6: If user upgrades within 30 days: restore to paid tier, all data preserved (SLA: 1s)",
        "Step 7: If user does not upgrade within 30 days: schedule data deletion (with 7-day grace + warning email) (SLA: 1s)",
    ])
    add_h3('Manual Path')
    add_bullets([
        "Sales team can extend trial manually (up to 14 days) via admin UI",
        "Sales team can convert trial to paid manually with discount code",
    ])


# ════════════════════════════════════════════════════════════════════════════
# PART IX — COMMERCIAL LAUNCH READINESS
# ════════════════════════════════════════════════════════════════════════════
def part_9_launch_readiness(story):
    add_h1('Part IX — Commercial Launch Readiness', level=0)
    add_kicker('Compliance · Security · Performance · Analytics · Launch Checklist')

    add_body(
        "This part is the gate between 'feature complete' and 'commercially launched'. It "
        "covers compliance posture (GDPR, CCPA, TCPA, HIPAA-ready, SOC2), security hardening, "
        "performance budgets, analytics instrumentation, billing & monetization tactics, "
        "support model, SLA template, and the 50-item launch go/no-go checklist."
    )

    add_h2('1. Compliance Posture')
    add_h3('1.1 GDPR (European Union)')
    add_bullets([
        "Data Processing Addendum (DPA) template ready for enterprise customers",
        "Data Subject Access Request (DSAR) flow: user requests data export → automated within 30 days",
        "Right to erasure: user requests deletion → all PII purged within 30 days, audit log retained (legal basis)",
        "Consent management: cookie consent banner, granular consent for marketing emails",
        "Sub-processor list published at /sub-processors, updated 30 days before adding new sub-processor",
        "EU data residency option (Supabase EU region) for enterprise customers",
        "Data Protection Officer (DPO) designated: dpo@reviewreply.com",
    ])

    add_h3('1.2 CCPA (California)')
    add_bullets([
        "'Do Not Sell My Personal Information' link in footer",
        "Opt-out flow: user clicks → form submission → opt-out flag set → no data shared with third parties",
        "Privacy policy updated to disclose categories of data collected and shared",
    ])

    add_h3('1.3 TCPA (Telephone Consumer Protection Act)')
    add_bullets([
        "Explicit opt-in checkbox for SMS on every form that captures phone numbers",
        "Consent timestamp and IP recorded",
        "Quiet hours: 9pm–8am recipient local time, enforced in send logic",
        "10DLC campaign registration with Twilio (required for A2P 10DLC messaging)",
        "Opt-out keywords: STOP, UNSUBSCRIBE, CANCEL — handled within 24 hours",
        "Opt-in keywords: START, YES, UNSTOP — re-enables messaging",
        "Message templates approved by Twilio before send",
    ])

    add_h3('1.4 HIPAA-Ready (for healthcare vertical)')
    add_body(
        "ReviewReply does not store Protected Health Information (PHI) directly, but healthcare "
        "customers may include appointment context that touches PHI. The 'HIPAA-ready' posture "
        "includes: Business Associate Agreement (BAA) available, audit logging enhanced, "
        "encryption at rest and in transit, access controls, and a designated security officer. "
        "Full HIPAA compliance requires a third-party audit and is recommended only after "
        "SOC2 Type II is achieved."
    )

    add_h3('1.5 SOC2 Type II')
    add_bullets([
        "Phase 6 (Week 23–24): SOC2 Type I readiness — policies, controls, evidence collection",
        "Engage auditor (Vanta + a CPA firm like Sensiba or Prescient) for Type I",
        "Type I report received pre-launch (attests to control design)",
        "Type II starts at launch (attests to control operating effectiveness over 6–12 months)",
        "Continuous compliance via Vanta: automated evidence collection, real-time control monitoring",
    ])

    add_h2('2. Security Hardening Checklist')
    add_bullets([
        "All API endpoints require authentication (except /api/health, /api/ready)",
        "All write operations require CSRF token (double-submit cookie pattern)",
        "All inputs validated with Zod schemas (zero <code>any</code> types in API routes)",
        "All secrets in Vercel Environment Variables, rotated quarterly",
        "Stripe webhook signature verification",
        "Inngest webhook signature verification",
        "Twilio webhook signature verification",
        "Resend webhook signature verification",
        "Rate limiting on all auth + AI endpoints (Upstash Redis)",
        "PII encrypted at rest (AES-256-GCM with KMS-managed key)",
        "Audit logs on every write, retained 7 years",
        "Penetration test by third party (Bugcrowd or Cobalt), all criticals fixed",
        "Bug bounty program (Bugcrowd) post-launch",
        "Security.txt file at /.well-known/security.txt",
        "Responsible disclosure policy at /security",
    ])

    add_h2('3. Performance Budgets')
    rows = [
        ['LCP (Largest Contentful Paint)', '< 2.5s', '95th percentile on 4G'],
        ['FID (First Input Delay)', '< 100ms', '95th percentile'],
        ['CLS (Cumulative Layout Shift)', '< 0.1', 'All pages'],
        ['TTFB (Time to First Byte)', '< 600ms', '95th percentile'],
        ['INP (Interaction to Next Paint)', '< 200ms', '95th percentile'],
        ['Bundle size (initial JS)', '< 200KB gzipped', 'Landing page'],
        ['Bundle size (initial JS)', '< 350KB gzipped', 'App dashboard'],
        ['Image size (hero)', '< 100KB', 'WebP, responsive srcset'],
        ['API response (p50)', '< 200ms', 'All read endpoints'],
        ['API response (p95)', '< 800ms', 'All read endpoints'],
        ['API response (p99)', '< 2s', 'All read endpoints'],
        ['Inngest function start', '< 5s', '95th percentile'],
    ]
    add_table(['Metric', 'Target', 'Note'], rows,
              col_widths=[200, 100, CONTENT_W - 300], header_align='left')

    add_h2('4. Analytics Instrumentation')
    add_bullets([
        "<b>PostHog</b>: auto-capture on (with PII filtering), funnel tracking, retention cohorts, feature flags, session replays (sampled 1%)",
        "<b>Key funnels</b>: signup → onboarding complete → first review request sent → first review received → first reply posted → paid conversion",
        "<b>Key events</b>: signup, login, business_created, google_connected, review_received, draft_generated, draft_approved, reply_posted, campaign_sent, billing_upgraded, billing_cancelled",
        "<b>Retention cohorts</b>: by signup week, by industry, by plan",
        "<b>NPS survey</b>: triggered at 30 days post-signup, in-app widget",
        "<b>Customer Health Score</b>: usage (40%) + NPS (20%) + support tickets (20%) + sentiment (10%) + billing (10%)",
        "<b>Vercel Analytics</b>: Core Web Vitals, audience insights",
        "<b>Sentry Performance</b>: API response times, DB query times, Inngest function durations",
    ])

    add_h2('5. Billing & Monetization')
    add_h3('5.1 Pricing Tiers')
    rows = [
        ['Free', '$0', '1 business, 50 reviews/mo, manual reply, no AI, no widgets', 'Acquisition'],
        ['Starter', '$49/mo', '1 business, 500 reviews/mo, AI draft, basic analytics, 1 widget', 'SMB'],
        ['Pro', '$99/mo', '3 businesses, unlimited reviews, brand voice, all widgets, competitor intel', 'Multi-location SMB'],
        ['Enterprise', '$299/mo', 'Unlimited businesses, agency mode, SSO, white-label, priority support', 'Agency + multi-location'],
        ['Custom', 'Quoted', 'On-prem, custom integrations, dedicated CSM, SLA', 'Large enterprise'],
    ]
    add_table(['Tier', 'Price', 'Limits & Features', 'Target'], rows,
              col_widths=[80, 70, CONTENT_W - 80 - 70 - 120, 120], header_align='left')

    add_h3('5.2 Annual Pricing')
    add_body(
        "Annual billing offers a 20% discount (effectively 2.4 months free). This improves cash "
        "flow and reduces churn. Pricing toggle on /pricing defaults to monthly, with a "
        "visible 'Save 20% with annual' badge on the annual toggle."
    )

    add_h3('5.3 Metered Billing')
    add_body(
        "SMS and AI calls are metered: each plan includes a monthly quota (Starter: 100 SMS, "
        "Pro: 500 SMS, Enterprise: 2000 SMS). Overage billed at $0.035/SMS and $0.02/AI call. "
        "Metered usage tracked in <code>usage_events</code> table, billed monthly via Stripe "
        "metered billing."
    )

    add_h3('5.4 Trial Flow')
    add_bullets([
        "14-day free trial of Pro tier, no credit card required",
        "Day 1: welcome email + getting-started checklist",
        "Day 3: tips email (how to get first review)",
        "Day 7: case study email (customer success story)",
        "Day 11: '3 days left' email with upgrade CTA",
        "Day 13: '1 day left' SMS + email",
        "Day 14: trial ends → downgrade to Free (data retained 30 days)",
        "Day 30: data purged if no upgrade (with 7-day warning)",
    ])

    add_h2('6. Support Model')
    rows = [
        ['Free', 'Community forum + docs', 'Best-effort', 'None'],
        ['Starter', 'Email (support@reviewreply.com)', '24 business hours', 'None'],
        ['Pro', 'Email + in-app chat (Plain.com)', '4 business hours', '99.5% uptime'],
        ['Enterprise', 'Email + chat + Slack Connect', '1 business hour', '99.9% uptime + SLA'],
        ['Custom', 'Dedicated CSM + phone', '15 minutes', '99.99% uptime + custom SLA'],
    ]
    add_table(['Tier', 'Channel', 'Response SLA', 'Uptime SLA'], rows,
              col_widths=[80, 180, 100, CONTENT_W - 360], header_align='left')

    add_h2('7. SLA Template (Enterprise)')
    add_body(
        "The Enterprise SLA template includes: 99.9% uptime commitment (excluding scheduled "
        "maintenance), service credits for downtime (10% for <99.9%, 25% for <99.0%, 50% for "
        "<95.0%), 1-hour critical incident response, 4-hour high-priority response, incident "
        "postmortem within 5 business days, and quarterly business reviews."
    )

    add_h2('8. Launch Go/No-Go Checklist (50 items)')
    add_body(
        "All 50 items must be ✅ before public launch. Owner of each item is in brackets."
    )
    items = [
        ("All P0 bugs closed [LB]", "All P1 bugs closed [LB]", "All P2 bugs closed [LB]"),
        ("Pen test: zero criticals [SE]", "Pen test: zero highs [SE]", "SOC2 Type I report received [SE]"),
        ("GDPR DSAR flow tested [LB]", "CCPA opt-out flow tested [LB]", "TCPA 10DLC registered [LB]"),
        ("Core Web Vitals: green on top 5 pages [LF]", "WCAG 2.1 AA audit passes [D]", "Lighthouse mobile ≥ 90 [LF]"),
        ("Stripe checkout end-to-end tested [LB]", "Stripe customer portal accessible [LB]", "Stripe webhook processes all event types [LB]"),
        ("Google OAuth end-to-end tested [LB]", "Facebook OAuth end-to-end tested [LB]", "Twilio SMS send + receive tested [LB]"),
        ("Resend email send + bounce handling tested [LB]", "Inngest all 16 functions deployed [LB]", "Inngest signature verification on [LB]"),
        ("Rate limiting on all sensitive endpoints [LB]", "Audit log recording every write [LB]", "PII encryption verified [SE]"),
        ("Backup restore drill successful [DO]", "Status page live at status.reviewreply.com [DO]", "On-call rotation documented [DO]"),
        ("Customer support runbook documented [PM]", "Pricing page live at /pricing [PM]", "Landing page live at / [PM]"),
        ("Blog launched at /blog [PM]", "Documentation live at docs.reviewreply.com [LB]", "API reference (OpenAPI) published [LB]"),
        ("20 design partners actively using product [PM]", "NPS from beta ≥ 30 [PM]", "Case study from 3 beta customers [PM]"),
        ("Product Hunt launch prepared [PM]", "Hacker News Show HN prepared [PM]", "Press release drafted [PM]"),
        ("Sales deck ready [PM]", "Pricing & packaging deck ready [PM]", "Competitive battle cards ready [PM]"),
        ("Founders' social posts scheduled [PM]", "Email announcement to waitlist scheduled [PM]", "In-app announcement banner scheduled [LF]"),
        ("Analytics events firing correctly [LF]", "Sentry alerts configured [LF]", "PostHog dashboards built [PM]"),
        ("Customer support inbox ready (Zendesk or Plain) [PM]", "Refund policy documented [PM]", "Terms of Service live [PM]"),
        ("Privacy Policy live [PM]", "Acceptable Use Policy live [PM]", "DPA template ready [SE]"),
        ("Cookie consent banner implemented [LF]", "Sub-processor list published [SE]", "Security.txt published [SE]"),
    ]
    rows = []
    for trio in items:
        rows.append([f'☐ {trio[0]}', f'☐ {trio[1]}', f'☐ {trio[2]}'])
    add_table(['Item 1', 'Item 2', 'Item 3'], rows,
              col_widths=[CONTENT_W/3, CONTENT_W/3, CONTENT_W/3], header_align='left')


# ════════════════════════════════════════════════════════════════════════════
# PART X — APPENDICES
# ════════════════════════════════════════════════════════════════════════════
def part_10_appendices(story):
    add_h1('Part X — Appendices', level=0)
    add_kicker('File Inventory · Schema Diff · Dependency Matrix · Glossary')

    add_h2('Appendix A — Existing Source File Inventory')
    add_body(
        "Complete inventory of the existing codebase, with status. Files marked BROKEN have "
        "bugs that prevent correct operation. Files marked MISSING are referenced by code but "
        "do not exist. Files marked STUB have placeholder implementations."
    )
    rows = [
        ['app/layout.tsx', 'OK', 'Root layout, fonts, metadata'],
        ['app/globals.css', 'OK', 'Tailwind directives, base styles'],
        ['app/(marketing)/page.tsx', 'OK', 'Landing page — strongest part of codebase'],
        ['app/(marketing)/login/page.tsx', 'BROKEN', 'Generic form, no brand context'],
        ['app/(marketing)/solutions/[slug]/page.tsx', 'OK', 'Industry vertical pages'],
        ['app/(marketing)/privacy/page.tsx', 'OK', 'Static privacy policy'],
        ['app/(marketing)/terms/page.tsx', 'OK', 'Static terms of service'],
        ['app/(marketing)/layout.tsx', 'MISSING', 'Every marketing page re-implements nav/footer'],
        ['app/(app)/layout.tsx', 'OK', 'App shell with AppNav'],
        ['app/(app)/dashboard/page.tsx', 'OK', 'Basic dashboard, no charts'],
        ['app/(app)/reviews/page.tsx', 'OK', 'Reviews list with reply UI'],
        ['app/(app)/requests/page.tsx', 'BROKEN', 'Duplicate <h1>, missing features'],
        ['app/(app)/billing/page.tsx', 'BROKEN', 'Enterprise plan unreachable (P0 FB-02)'],
        ['app/(app)/settings/page.tsx', 'OK', 'Basic settings form'],
        ['app/(app)/org-dashboard/page.tsx', 'BROKEN', 'Raw table, no charts, no real data'],
        ['app/onboarding/page.tsx', 'BROKEN', 'Connect Facebook 404s (P0 FB-01)'],
        ['app/vs/birdeye/page.tsx', 'OK', 'Comparison page, no nav/footer'],
        ['app/vs/podium/page.tsx', 'OK', 'Comparison page, no nav/footer'],
        ['app/not-found.tsx', 'MISSING', 'Default Next.js 404'],
        ['app/error.tsx', 'MISSING', 'Default Next.js error'],
        ['app/loading.tsx', 'MISSING', 'Default Next.js loading'],
        ['app/r/[token]/page.tsx', 'MISSING', 'Click tracking route — 404 for every SMS/email recipient'],
        ['app/api/auth/route.ts', 'BROKEN', 'Returns 501 in real mode'],
        ['app/api/auth/active-business/route.ts', 'OK', 'Returns active business ID'],
        ['app/api/businesses/route.ts', 'OK', 'List/create businesses'],
        ['app/api/businesses/[id]/route.ts', 'OK', 'Get/update/delete business'],
        ['app/api/businesses/[id]/connect/google/route.ts', 'BROKEN', 'Mock data leak in production path'],
        ['app/api/businesses/[id]/connect/facebook/route.ts', 'MISSING', 'Called by OnboardingForm, 404s'],
        ['app/api/businesses/[id]/review-requests/route.ts', 'OK', 'List/create review requests'],
        ['app/api/businesses/[id]/review-requests/quick-add/route.ts', 'OK', 'Quick add single customer'],
        ['app/api/businesses/[id]/review-requests/parse-paste/route.ts', 'OK', 'Parse pasted customer list'],
        ['app/api/businesses/[id]/review-requests/upload/route.ts', 'OK', 'CSV upload'],
        ['app/api/businesses/[id]/review-requests/send-batch/route.ts', 'OK', 'Batch send, no rate limiting'],
        ['app/api/reviews/[id]/draft/route.ts', 'OK', 'Generate AI draft'],
        ['app/api/reviews/[id]/reply/route.ts', 'OK', 'Post reply to source'],
        ['app/api/billing/checkout/route.ts', 'BROKEN', 'Rejects enterprise plan (P0 FB-02)'],
        ['app/api/billing/manage/route.ts', 'BROKEN', 'Uses businesses[0] not active business (P1 FB-03)'],
        ['app/api/inngest/route.ts', 'BROKEN', 'No signature verification (P0 BB-03)'],
        ['app/api/dev/trigger/route.ts', 'BROKEN', 'Unauthenticated (P0 BB-01)'],
        ['app/api/webhooks/stripe/route.ts', 'MISSING', 'Referenced but never created (P0 BB-02)'],
        ['app/api/webhooks/twilio/route.ts', 'MISSING', 'Inbound SMS + opt-out not handled'],
        ['app/api/webhooks/resend/route.ts', 'MISSING', 'Bounce/complaint not handled'],
        ['components/AppNav.tsx', 'OK', 'App sidebar nav'],
        ['components/BillingManager.tsx', 'BROKEN', 'Calls enterprise plan, backend rejects'],
        ['components/OnboardingForm.tsx', 'BROKEN', 'Facebook connect 404s'],
        ['components/RequestsManager.tsx', 'OK', 'Review request management UI'],
        ['components/SettingsForm.tsx', 'OK', 'Business settings form'],
        ['components/LiveDemo.tsx', 'OK', 'Interactive landing demo'],
        ['components/ReviewCard.tsx', 'OK', 'Single review card'],
        ['components/BeforeAfter.tsx', 'OK', 'Comparison slider'],
        ['components/TestimonialCarousel.tsx', 'OK', 'Dot-nav carousel'],
        ['components/PricingToggle.tsx', 'OK', 'Monthly/annual toggle (violates Prompt Pack)'],
        ['components/StatCounter.tsx', 'BROKEN', 'Shows "Placeholder stat" text'],
        ['components/ScrollReveal.tsx', 'OK', 'IntersectionObserver fade-in'],
        ['components/LogoCarousel.tsx', 'BROKEN', 'Uses 8 emoji as fake logos'],
        ['lib/auth.ts', 'OK', 'Auth helpers'],
        ['lib/db.ts', 'OK', 'Store factory (local vs supabase)'],
        ['lib/types.ts', 'OK', 'Shared TypeScript types'],
        ['lib/ai/draft-reply.ts', 'BROKEN', 'AI_MODEL is non-existent model name (P1 BB-09)'],
        ['lib/inngest/client.ts', 'OK', 'Inngest client'],
        ['lib/inngest/index.ts', 'OK', 'Function registration'],
        ['lib/inngest/generate-reply-draft.ts', 'OK', 'Draft generation function'],
        ['lib/inngest/poll-reviews.ts', 'OK', 'Review polling function'],
        ['lib/inngest/send-review-request.ts', 'OK', 'Request send function'],
        ['lib/integrations/stripe.ts', 'BROKEN', 'No webhook, phantom subscriptions (P0 BB-02)'],
        ['lib/integrations/twilio.ts', 'OK', 'SMS send, no inbound'],
        ['lib/integrations/resend.ts', 'OK', 'Email send, no bounce handling'],
        ['lib/integrations/google-business-profile.ts', 'BROKEN', 'postReply throws, accountId empty (P0 BB-04)'],
        ['lib/integrations/facebook-graph.ts', 'BROKEN', 'postReply throws (P0 BB-05)'],
        ['lib/integrations/mock-data.ts', 'OK', 'Mock data (must be guarded)'],
        ['lib/parsing/paste-list-parser.ts', 'OK', 'Paste-list parser'],
        ['lib/supabase/server.ts', 'OK', 'Supabase server client'],
        ['lib/supabase/local-store.ts', 'OK', 'Local file store (dev)'],
        ['lib/supabase/supabase-store.ts', 'BROKEN', 'signIn throws in real mode (P0 BB-06)'],
        ['supabase/migrations/0001_init.sql', 'OK', 'Initial schema'],
        ['supabase/migrations/0002_add_organizations.sql', 'BROKEN', 'RLS disabled on organizations (P1 BB-07)'],
        ['scripts/seed.ts', 'OK', 'Seed script for dev'],
    ]
    add_table(['File', 'Status', 'Notes'], rows,
              col_widths=[260, 60, CONTENT_W - 320], header_align='left')

    add_h2('Appendix B — Schema Diff (Existing → Proposed)')
    add_body(
        "Tables to ADD (do not exist in current schema):"
    )
    add_bullets([
        "<code>audit_logs</code> — SOC2 + GDPR compliance",
        "<code>webhook_events</code> — Idempotency + debugging",
        "<code>oauth_tokens</code> — Secure token storage",
        "<code>org_members</code> — Multi-tenant RBAC",
        "<code>api_keys</code> — Public API access",
        "<code>sentiment_analyses</code> — AI analytics cache",
        "<code>competitor_snapshots</code> — Competitor intel",
        "<code>brand_voice_profiles</code> — AI voice training",
        "<code>reply_templates</code> — Reusable reply snippets",
        "<code>usage_events</code> — Metered billing",
        "<code>feature_flags</code> — Progressive rollout",
        "<code>review_threads</code> — Customer-level threading",
        "<code>inbox_views</code> — Saved inbox filters",
        "<code>review_assignments</code> — Review assignee tracking",
        "<code>campaigns</code> + <code>campaign_events</code> — Campaign engine",
        "<code>reply_approvals</code> — Approval workflow",
        "<code>widgets</code> — Widget configurations",
        "<code>agency_clients</code> — Agency client relationships",
        "<code>white_label_configs</code> — White-label theming",
    ])
    add_body(
        "Tables to MODIFY:"
    )
    add_bullets([
        "<code>reviews</code>: add draft_reply_text, draft_reply_status, replied_at, replied_by, sentiment_score, topics",
        "<code>review_requests</code>: add campaign_id, variant_id, clicked_at, converted_at",
        "<code>subscriptions</code>: change subscription_plan enum to include 'enterprise', 'agency', 'custom'",
        "<code>businesses</code>: add timezone, industry, gb_location_id, white_label_config_id",
        "<code>organizations</code>: add plan, stripe_customer_id, trial_expires_at, churn_risk_score",
    ])
    add_body(
        "Indexes to ADD (7 missing on hot paths):"
    )
    add_bullets([
        "<code>reviews(business_id, created_at DESC)</code> — Inbox pagination",
        "<code>review_requests(business_id, status, created_at DESC)</code> — Request list",
        "<code>reviews(business_id, source, external_id)</code> — Dedup",
        "<code>org_members(user_id)</code> — Auth lookup",
        "<code>audit_logs(actor_id, created_at DESC)</code> — Audit search",
        "<code>usage_events(business_id, period, event_type)</code> — Metered billing query",
        "<code>campaign_events(campaign_id, status)</code> — Campaign analytics",
    ])

    add_h2('Appendix C — Third-Party Dependency Matrix')
    rows = [
        ['Next.js', '14.2.15', 'Framework', 'Upgrade to 15.x (App Router stable)'],
        ['React', '18.3.1', 'UI library', 'Stay on 18 (15 not stable yet)'],
        ['TypeScript', '5.6.x', 'Type safety', 'Upgrade to 5.7'],
        ['Tailwind', '3.4.x', 'Styling', 'Upgrade to 4.0 on release'],
        ['Supabase', '2.111.x', 'Database + Auth', 'Stay current'],
        ['Inngest', '3.x', 'Background jobs', 'Stay current'],
        ['Stripe', '16.x', 'Payments', 'Stay current'],
        ['Twilio', '5.x', 'SMS + WhatsApp', 'Stay current'],
        ['Resend', '4.x', 'Email', 'Stay current'],
        ['Anthropic SDK', '0.30.x', 'AI', 'Upgrade to latest'],
        ['Zod', '3.x', 'Validation', 'Stay on 3 (4 has breaking changes)'],
        ['lucide-react', 'NOT INSTALLED', 'Icons', 'INSTALL in Phase 1'],
        ['framer-motion', 'NOT INSTALLED', 'Animation', 'INSTALL in Phase 1'],
        ['@radix-ui/*', 'NOT INSTALLED', 'Accessibility primitives', 'INSTALL in Phase 1'],
        ['recharts', 'NOT INSTALLED', 'Charts', 'INSTALL in Phase 1'],
        ['cmdk', 'NOT INSTALLED', 'Command palette', 'INSTALL in Phase 1'],
        ['react-hook-form', 'NOT INSTALLED', 'Forms', 'INSTALL in Phase 1'],
        ['@tanstack/react-table', 'NOT INSTALLED', 'DataTable', 'INSTALL in Phase 1'],
        ['posthog-js', 'NOT INSTALLED', 'Analytics', 'INSTALL in Phase 2'],
        ['@sentry/nextjs', 'NOT INSTALLED', 'Error tracking', 'INSTALL in Phase 0'],
        ['@upstash/redis', 'NOT INSTALLED', 'Rate limiting', 'INSTALL in Phase 0'],
    ]
    add_table(['Dependency', 'Current', 'Purpose', 'Action'], rows,
              col_widths=[140, 90, 130, CONTENT_W - 360], header_align='left')

    add_h2('Appendix D — Glossary')
    rows = [
        ['ARPU', 'Average Revenue Per User', 'Monthly revenue divided by paying customers'],
        ['CHS', 'Customer Health Score', 'Composite score: usage (40%) + NPS (20%) + tickets (20%) + sentiment (10%) + billing (10%)'],
        ['CSAT', 'Customer Satisfaction Score', '1–5 scale per touchpoint'],
        ['CES', 'Customer Effort Score', 'How easy was it to do business with us'],
        ['DPA', 'Data Processing Addendum', 'Legal contract required for GDPR enterprise sales'],
        ['DSAR', 'Data Subject Access Request', 'GDPR right: user requests all data about them'],
        ['GBP', 'Google Business Profile', 'Formerly Google My Business'],
        ['Inngest', 'Background job framework', 'Serverless durable functions'],
        ['NPS', 'Net Promoter Score', '-100 to +100, likelihood to recommend'],
        ['PITR', 'Point-In-Time Recovery', 'Database backup to any second within retention window'],
        ['RACI', 'Responsible, Accountable, Consulted, Informed', 'Project responsibility framework'],
        ['RLS', 'Row-Level Security', 'Postgres feature for per-row access control'],
        ['RPO', 'Recovery Point Objective', 'Max acceptable data loss (time)'],
        ['RTO', 'Recovery Time Objective', 'Max acceptable downtime'],
        ['SLA', 'Service Level Agreement', 'Contractual uptime/response commitment'],
        ['SOC2', 'Service Organization Control 2', 'Audit framework for SaaS security'],
        ['SSO', 'Single Sign-On', 'SAML/OIDC enterprise auth'],
        ['TCPA', 'Telephone Consumer Protection Act', 'US law governing SMS marketing'],
        ['10DLC', '10-Digit Long Code', 'A2P SMS registration required by US carriers'],
        ['TAM', 'Total Addressable Market', 'Total revenue opportunity if 100% market share'],
    ]
    add_table(['Term', 'Expansion', 'Definition'], rows,
              col_widths=[60, 130, CONTENT_W - 190], header_align='left')

    add_h2('Appendix E — Companion Deliverables')
    add_bullets([
        "<b>ReviewReply_Enterprise_Audit_Roadmap.pdf</b> — this document (~120 pages)",
        "<b>ReviewReply_Bug_Feature_Tracker.xlsx</b> — sortable, filterable tracker with 80+ items (P0/P1/P2/P3, owner, status, sprint)",
        "<b>ReviewReply_Landing_Prototype.html</b> — premium HTML landing page prototype demonstrating $50k design feel",
        "<b>audit-frontend.md</b> — full frontend audit report (~12k words)",
        "<b>audit-backend.md</b> — full backend audit report (~14k words)",
        "<b>audit-product.md</b> — full product strategy audit (~56k words)",
        "<b>audit-design.md</b> — full design audit report (~22k words)",
    ])

    add_callout_box(
        'End of Document',
        "This concludes the ReviewReply Enterprise Audit, Architecture & Roadmap. The next step "
        "is Phase 0 — Stabilization. Approve the budget ($345k, 24 weeks, 4-person team) and "
        "the engineering team can begin Week 1. Companion deliverables (XLSX tracker, HTML "
        "landing prototype, audit reports) are available in /home/z/my-project/download/.",
        color=ACCENT,
    )

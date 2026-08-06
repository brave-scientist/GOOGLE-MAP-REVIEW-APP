"""
ReviewReply Enterprise — PDF content module.
Called by build_pdf.py — has access to all helpers via globals.
Each part is a function that appends to `story`.
"""
from reportlab.platypus import PageBreak, Spacer, Paragraph, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

def build(story):
    """Build the complete PDF body."""
    part_1_executive_summary(story)
    story.append(PageBreak())
    part_2_audit(story)
    story.append(PageBreak())
    part_3_competitive(story)
    story.append(PageBreak())
    part_4_modules(story)
    story.append(PageBreak())
    part_5_design_architecture(story)
    story.append(PageBreak())
    part_6_dev_architecture(story)
    story.append(PageBreak())
    part_7_roadmap(story)
    story.append(PageBreak())
    part_8_automation_flows(story)
    story.append(PageBreak())
    part_9_launch_readiness(story)
    story.append(PageBreak())
    part_10_appendices(story)


# ════════════════════════════════════════════════════════════════════════════
# PART I — EXECUTIVE SUMMARY
# ════════════════════════════════════════════════════════════════════════════
def part_1_executive_summary(story):
    add_h1('Part I — Executive Summary', level=0)

    add_kicker('Verdict · Strategic Posture · Investment Thesis')
    add_body(
        "ReviewReply-Lite is a tightly-scoped, well-documented $29–$59/mo review-management "
        "SaaS for single-location businesses. The current build is a <b>complete mock-mode demo</b>, "
        "not a production application. The codebase is well-architected at the scaffolding level — "
        "Next.js 14 App Router, Supabase, Inngest, Stripe, Twilio, Resend, Anthropic — but every "
        "external integration is gated behind a <code>USE_MOCKS=true</code> default that, when "
        "flipped to production mode, breaks auth, billing, Google Business Profile, and Facebook "
        "Graph paths immediately. The product cannot launch commercially in its current state."
    )
    add_body(
        "This document delivers a complete forensic audit of the existing codebase, a competitive "
        "benchmark against Birdeye, Podium, Reputation.com and ReviewTrackers, ten proposed "
        "enterprise modules with detailed specifications, a complete design architecture (design "
        "system, tokens, components, motion, information architecture), a development architecture "
        "(system, data, API, security, infrastructure), and a phased twenty-four-week roadmap to "
        "commercial launch readiness. Companion deliverables include an XLSX bug-and-feature "
        "tracker and a premium HTML landing-page prototype that demonstrates the target $50k "
        "design feel."
    )

    add_h2('Current State Verdict')
    add_stat_row([
        ('4.3', 'Design Quality', 'Out of 10 vs Linear/Vercel'),
        ('23', 'Critical Bugs', 'P0 + P1 combined'),
        ('40%', 'Backend Ready', 'Avg across 7 integrations'),
        ('0', 'Stripe Webhooks', 'Phantom subscriptions today'),
    ])

    add_body(
        "The marketing landing page is the strongest part of the codebase — it carries a genuine "
        "awning-stripe brand motif, a brass/cream/coral palette, scroll-reveal animations, an "
        "interactive live demo, animated stat counters, and a dot-nav testimonial carousel. The "
        "authenticated app shell, by contrast, is visually flat: no icon library (every icon is "
        "Unicode or emoji), no design-system primitives (no Button, Card, Modal, Toast, Skeleton, "
        "Tabs, DataTable), no charts, no Framer Motion. The dashboard reads as 'MVP that works', "
        "not 'premium SaaS that justifies a premium price'."
    )

    add_h2('Top Five Critical Bugs (P0 — Production Blockers)')
    p0_bugs = [
        ('FB-01', 'OnboardingForm calls POST /api/businesses/[id]/connect/facebook — the route does not exist. Every new user who clicks "Connect Facebook" receives a 404.', 'OnboardingForm.tsx:126'),
        ('FB-02', 'Enterprise plan is unreachable. BillingManager calls startCheckout("enterprise") and changePlan("enterprise"), but /api/billing/checkout and /api/billing/manage reject enterprise with if (plan !== "starter" && plan !== "pro") → 400.', 'lib/integrations/stripe.ts'),
        ('FB-03', '/api/dev/trigger is unauthenticated — anyone on the internet can trigger any background job (mass SMS sending, AI generation, review polling) by POSTing to it.', 'app/api/dev/trigger/route.ts'),
        ('FB-04', 'No Stripe webhook handler exists. The checkout endpoint calls finalizeCheckout() directly, which writes a subscription row even in real mode — bypassing Stripe entirely and creating phantom subscriptions.', 'lib/integrations/stripe.ts'),
        ('FB-05', 'No OAuth callback handlers for Google or Facebook. The mock connect flow at /api/businesses/[id]/connect/google uses MOCK_GOOGLE_LOCATIONS from mock-data.ts in the production code path with no isMockMode() guard — a real mock-data leak.', 'app/api/businesses/[id]/connect/google/route.ts'),
    ]
    rows = []
    for bid, desc, loc in p0_bugs:
        rows.append([add_severity_badge('P0'), f'<b>{bid}</b>', desc, f'<font color="#6B6862"><i>{loc}</i></font>'])
    add_table(['Sev', 'ID', 'Description', 'Location'], rows,
              col_widths=[34, 50, CONTENT_W - 34 - 50 - 130, 130], header_align='left')

    add_h2('Top Five Strategic Opportunities')
    add_body(
        "Beyond fixing bugs, five strategic moves would transform ReviewReply-Lite from a "
        "feature-parity also-ran into a category leader:"
    )
    add_bullets([
        "<b>Multi-Tenant Agency Mode</b> — Birdeye and Podium derive ~60% of revenue from agencies reselling their platform to SMBs. A first-class agency tier with white-label, client portal, and per-seat pricing unlocks a 5–10× TAM expansion.",
        "<b>AI Reply Generator with Brand Voice Training</b> — the current draft-reply.ts is a rule-based template engine masquerading as AI. A real Claude/GPT-4 pipeline with per-business brand voice fine-tuning (tone, signature, escalation rules) creates defensibility and supports a $99–$299/mo Pro tier.",
        "<b>Competitor Intelligence Layer</b> — weekly automated benchmarking of the business against its top 3 local competitors (rating, review velocity, sentiment topics, response time). No competitor does this well at the SMB price point.",
        "<b>Programmatic Review Schema & Local SEO</b> — auto-generate JSON-LD Review schema for the business's website, auto-submit to Google's index, and track review velocity as a search ranking signal. This positions ReviewReply as an SEO tool, not just a review tool.",
        "<b>WhatsApp + Apple Business Chat Channels</b> — Twilio is already wired for SMS, but adding WhatsApp Business and Apple Business Chat for review requests would lift conversion 30–50% in international markets and high-end verticals (hospitality, healthcare, luxury).",
    ])

    add_h2('Recommended Investment & ROI Timeline')
    add_body(
        "To deliver a commercial-launch-ready enterprise SaaS from the current state, we estimate "
        "a twenty-four-week engineering investment with a 4-person core team (1 lead frontend, 1 "
        "lead backend, 1 full-stack, 1 designer) plus fractional product, security, and DevOps "
        "support. The expected outcomes are:"
    )
    rows = [
        ['Phase 0 — Stabilization', 'Week 1–2', '$15k', 'All P0/P1 bugs closed; mock-mode clearly isolated; security holes patched'],
        ['Phase 1 — Design System', 'Week 3–5', '$45k', 'Tier-1 component library, motion system, light/dark, mobile-first patterns'],
        ['Phase 2 — Auth & Multi-Tenant', 'Week 6–7', '$30k', 'Supabase Auth + RBAC + SSO + organizations + audit logs'],
        ['Phase 3 — Core Module Rebuild', 'Week 8–11', '$60k', 'Unified inbox, request automation, AI reply with approval, billing webhooks'],
        ['Phase 4 — New Enterprise Modules', 'Week 12–18', '$105k', 'Agency mode, sentiment analytics, widgets, competitor intel, reporting'],
        ['Phase 5 — Automation & AI', 'Week 19–22', '$60k', 'AI brand voice, multi-language, smart routing, churn rescue flows'],
        ['Phase 6 — Compliance & Launch', 'Week 23–24', '$30k', 'SOC2 readiness, GDPR/CCPA/TCPA, performance, beta, public launch'],
    ]
    add_table(['Phase', 'Timeline', 'Est. Cost', 'Exit Criteria'], rows,
              col_widths=[120, 70, 60, CONTENT_W - 250], header_align='left')

    add_body(
        "<b>Total estimated investment: ~$345k</b> over twenty-four weeks. This is the rough "
        "equivalent of a $50k design budget plus ~$295k of senior engineering time. At a $99/mo "
        "blended ARPU and a 24-month payback window, the break-even customer count is approximately "
        "2,900 customers — achievable in year one with a focused GTM motion targeting multi-location "
        "hospitality, dental, and agency resellers."
    )

    add_callout_box(
        'Strategic Recommendation',
        "Proceed with the full twenty-four-week rebuild. The codebase provides an excellent "
        "scaffold, but every real integration needs rebuilding, every UI needs the premium design "
        "layer, and four enterprise modules (Agency, AI Brand Voice, Competitor Intel, Local SEO) "
        "are needed to escape feature-parity competition with Birdeye/Podium. The phased plan in "
        "Part VII sequences this work so that bug fixes and the design system land first, "
        "delivering visible value within two weeks while the longer enterprise modules build.",
        color=ACCENT,
    )


# ════════════════════════════════════════════════════════════════════════════
# PART II — COMPREHENSIVE CODEBASE AUDIT
# ════════════════════════════════════════════════════════════════════════════
def part_2_audit(story):
    add_h1('Part II — Comprehensive Codebase Audit', level=0)
    add_kicker('Frontend · Backend · Product · Design')

    add_body(
        "This part synthesizes findings from four parallel deep audits of the codebase. The full "
        "audit reports are available as companion Markdown files: <code>audit-frontend.md</code>, "
        "<code>audit-backend.md</code>, <code>audit-product.md</code>, <code>audit-design.md</code>. "
        "What follows is the executive synthesis: every P0 and P1 bug, every broken file, every "
        "missing component, every security hole, and the mock-vs-real integration readiness "
        "matrix that determines how much work remains before commercial launch."
    )

    add_h2('1. Audit Methodology')
    add_body(
        "Four specialized auditors worked in parallel on the same codebase snapshot. Each auditor "
        "read every file in their domain end-to-end (no skimming, no sampling) and produced a "
        "structured report with severity-ranked findings. Severity levels are defined as follows:"
    )
    add_bullets([
        "<b>P0 — Production Blocker</b>: prevents core user journey, security hole, or data loss. Must fix before any user touches the app.",
        "<b>P1 — Critical</b>: breaks a major feature, exposes data, or causes visible wrong behavior. Must fix before commercial launch.",
        "<b>P2 — Important</b>: degrades UX, missing validation, technical debt that will compound. Fix within 30 days of launch.",
        "<b>P3 — Minor</b>: cosmetic, accessibility, code quality. Fix opportunistically.",
    ])

    add_h2('2. Frontend Audit Synthesis')
    add_body(
        "Twenty-eight frontend files were inspected end-to-end. The marketing landing page is the "
        "strongest part of the codebase: it carries a genuine awning-stripe brand motif, scroll-"
        "reveal animations, an interactive live demo, animated stat counters, and a dot-nav "
        "testimonial carousel. The authenticated app shell, however, is functional but visually "
        "flat — no icon library, no design-system primitives, no charts, no skeletons, no toasts, "
        "no animations."
    )

    add_h3('Top 10 Frontend Bugs')
    rows = [
        [add_severity_badge('P0'), 'FB-01', 'Connect Facebook button calls a non-existent API route', 'OnboardingForm.tsx:126'],
        [add_severity_badge('P0'), 'FB-02', 'Enterprise plan rejected by checkout/manage endpoints', 'BillingManager.tsx → /api/billing/*'],
        [add_severity_badge('P1'), 'FB-03', '/api/billing/manage uses businesses[0] instead of active business — multi-location users cancel the wrong business', 'app/api/billing/manage/route.ts'],
        [add_severity_badge('P1'), 'FB-04', 'Duplicate <h1>Review Requests</h1> on /requests (page + component both render it)', 'app/(app)/requests/page.tsx'],
        [add_severity_badge('P1'), 'FB-05', 'No app/(marketing)/layout.tsx — every marketing page re-implements nav/footer', 'app/(marketing)/'],
        [add_severity_badge('P1'), 'FB-06', 'No app/not-found.tsx, error.tsx, loading.tsx anywhere — Next.js defaults to plain white 404', 'app/'],
        [add_severity_badge('P1'), 'FB-07', 'Invalid Tailwind classes silently no-op: space-y-22, mb-22, duration-400, prose prose-invert', 'multiple components'],
        [add_severity_badge('P2'), 'FB-08', 'LogoCarousel uses 8 emoji-in-colored-squares as fake business logos', 'LogoCarousel.tsx'],
        [add_severity_badge('P2'), 'FB-09', 'StatCounter shows "Placeholder stat — replace with sourced figure"', 'StatCounter.tsx'],
        [add_severity_badge('P2'), 'FB-10', 'Login page has zero brand context — generic email/password form on plain background', 'app/(marketing)/login/page.tsx'],
    ]
    add_table(['Sev', 'ID', 'Issue', 'Location'], rows,
              col_widths=[30, 45, CONTENT_W - 30 - 45 - 160, 160], header_align='left')

    add_h3('Missing Frontend Files (referenced by code but absent)')
    add_bullets([
        "<code>app/api/businesses/[id]/connect/facebook/route.ts</code> — called by OnboardingForm, returns 404",
        "<code>app/r/[click_token]/page.tsx</code> — the SMS/email review-request link target. Currently 404s for every recipient.",
        "<code>app/(marketing)/layout.tsx</code> — every marketing page re-implements its own nav/footer",
        "<code>app/not-found.tsx</code>, <code>app/error.tsx</code>, <code>app/loading.tsx</code> — no graceful error/loading states",
        "<code>app/api/webhooks/stripe/route.ts</code> — referenced in lib/integrations/stripe.ts but never created",
        "<code>app/api/webhooks/twilio/route.ts</code>, <code>app/api/webhooks/resend/route.ts</code> — same pattern, never created",
    ])

    add_h3('Missing Frontend Components for Premium SaaS Feel')
    add_body(
        "To reach the target Linear/Vercel/Stripe quality bar, the following 25 components must be "
        "built. They are grouped into four tiers by priority."
    )
    rows = [
        ['Tier 1 — Core Primitives', 'Button, Input, Textarea, Select, Checkbox, Radio, Switch, Badge', 'Week 3'],
        ['Tier 1 — Core Primitives', 'Card, Modal, Dialog, Dropdown, Popover, Tooltip, Toast, Tabs', 'Week 3–4'],
        ['Tier 2 — Data & Loading', 'DataTable, Skeleton, EmptyState, Pagination, FilterBar', 'Week 4'],
        ['Tier 2 — Data & Loading', 'Chart (Recharts wrapper), StatCard, ProgressRing, Sparkline', 'Week 4–5'],
        ['Tier 3 — Patterns', 'CommandPalette (Cmd+K), CommandMenu, QuickActions', 'Week 5'],
        ['Tier 3 — Patterns', 'MagneticButton, GradientBorder, GlassCard, Aurora background', 'Week 5'],
        ['Tier 4 — Marketing', 'AnimatedHero, BentoGrid, ScrollVideo, Marquee, FAQAccordion', 'Week 5'],
    ]
    add_table(['Tier', 'Components', 'Schedule'], rows,
              col_widths=[120, CONTENT_W - 220, 100], header_align='left')

    add_h2('3. Backend Audit Synthesis')
    add_body(
        "Twenty-nine backend files were inspected end-to-end (10 API routes, 13 lib modules, 2 SQL "
        "migrations, 1 seed script, 3 store/auth helpers). The verdict: a well-architected mock-"
        "mode demo, not a production-ready SaaS. It runs end-to-end with zero real credentials, "
        "but flipping <code>USE_MOCKS=false</code> would break auth, billing, Google, and Facebook "
        "paths immediately."
    )

    add_h3('Top 10 Backend Bugs')
    rows = [
        [add_severity_badge('P0'), 'BB-01', '/api/dev/trigger is unauthenticated — anyone can trigger mass SMS / AI generation', 'app/api/dev/trigger/route.ts'],
        [add_severity_badge('P0'), 'BB-02', 'No Stripe webhook handler — checkout bypasses Stripe, writes phantom subscriptions', 'lib/integrations/stripe.ts'],
        [add_severity_badge('P0'), 'BB-03', '/api/inngest has no signature verification — forged Inngest events accepted', 'app/api/inngest/route.ts'],
        [add_severity_badge('P0'), 'BB-04', 'Google postReply() throws unconditionally; fetchReviews() hardcodes accountId = ""', 'lib/integrations/google-business-profile.ts'],
        [add_severity_badge('P0'), 'BB-05', 'Facebook postReply() throws unconditionally in real mode', 'lib/integrations/facebook-graph.ts'],
        [add_severity_badge('P0'), 'BB-06', 'SupabaseStore.signIn() always throws "not implemented in real mode"', 'lib/supabase/supabase-store.ts'],
        [add_severity_badge('P1'), 'BB-07', 'organizations table RLS disabled entirely — any authed user can read any org', 'supabase/migrations/0002_add_organizations.sql'],
        [add_severity_badge('P1'), 'BB-08', 'PII (customer_contact) stored as plain text despite policy mandate', 'supabase/migrations/0001_init.sql'],
        [add_severity_badge('P1'), 'BB-09', 'AI_MODEL = "claude-sonnet-4-6" — a non-existent Anthropic model identifier', 'lib/ai/draft-reply.ts'],
        [add_severity_badge('P1'), 'BB-10', 'No rate limiting anywhere — every endpoint can be abused', 'all of app/api/'],
    ]
    add_table(['Sev', 'ID', 'Issue', 'Location'], rows,
              col_widths=[30, 45, CONTENT_W - 30 - 45 - 160, 160], header_align='left')

    add_h3('Integration Readiness Matrix')
    add_body(
        "Each external integration was scored on a 0–100% completeness scale, weighted by: real "
        "implementation (40%), auth (20%), error handling (15%), rate limiting (10%), webhook "
        "support (10%), idempotency (5%)."
    )
    rows = [
        ['Stripe', '40%', 'Checkout works in mock; no webhooks, no customer portal, no invoice sync', 'Critical'],
        ['Twilio', '70%', 'SMS send works; missing inbound webhook, opt-out handling, 10DLC registration', 'High'],
        ['Resend', '60%', 'Email send works; missing bounce/complaint webhook, template versioning', 'High'],
        ['Google Business Profile', '10%', 'OAuth flow stubbed; fetchReviews/postReply broken; no location auto-sync', 'Critical'],
        ['Facebook Graph', '20%', 'OAuth stubbed; postReply throws; no page-level permission scope', 'Critical'],
        ['Anthropic Claude', '50%', 'draft-reply.ts uses rule-based path; real Claude path exists but model name wrong', 'High'],
        ['Inngest', '30%', 'Functions defined but no signature verification; no scheduled jobs in prod', 'High'],
        ['Supabase', '50%', 'DB schema OK; Auth not wired; RLS half-disabled; no real-time subscriptions', 'Critical'],
    ]
    add_table(['Integration', 'Ready', 'Gap Summary', 'Priority'], rows,
              col_widths=[100, 50, CONTENT_W - 250, 100], header_align='left')

    add_h3('Missing API Endpoints (essential for enterprise SaaS)')
    add_bullets([
        "<b>Auth</b>: POST /api/auth/signup, POST /api/auth/reset-password, POST /api/auth/verify-email, GET /api/auth/me, POST /api/auth/logout",
        "<b>OAuth callbacks</b>: GET /api/oauth/google/callback, GET /api/oauth/facebook/callback, GET /api/oauth/apple/callback",
        "<b>Webhooks</b>: POST /api/webhooks/stripe, POST /api/webhooks/twilio, POST /api/webhooks/resend, POST /api/webhooks/inngest (with signature verification)",
        "<b>Click tracking</b>: GET /r/[token] — review-request link target, increments click_count, redirects to Google/FB review page",
        "<b>Multi-tenant</b>: GET /api/organizations, POST /api/organizations, POST /api/organizations/[id]/members, GET /api/organizations/[id]/members",
        "<b>Agency</b>: GET /api/agency/clients, POST /api/agency/clients, GET /api/agency/clients/[id]/reports",
        "<b>Billing</b>: GET /api/billing/invoices, GET /api/billing/usage, POST /api/billing/portal",
        "<b>Webhooks management</b>: GET /api/webhooks/events (audit log of received webhook events)",
        "<b>Health & observability</b>: GET /api/health, GET /api/ready, GET /api/metrics (Prometheus format)",
        "<b>Rate limiting</b>: applied to /api/auth/* (5/min) and /api/businesses/*/review-requests/send-batch (10/hour)",
    ])

    add_h3('Missing Background Jobs')
    add_bullets([
        "Daily digest email (Sent at 9am local time, summarizes new reviews + replies needed)",
        "New review notification (real-time Slack/Teams/email when a review < 3 stars drops)",
        "Trial expiration warning (3 days before trial ends, send upgrade CTA)",
        "PII retention purge (delete customer_contact after 90 days per data-handling policy)",
        "OAuth token refresh (Google/FB tokens expire in 1 hour; refresh proactively at 50min)",
        "Weekly competitor benchmarking (pull competitor ratings, store snapshot)",
        "Monthly executive report PDF generation (emailed to org owners)",
        "Abandoned-cart recovery (3 days after checkout abandonment, send nudge)",
        "AI draft reply training feedback loop (track accept/reject/edit rate per business, fine-tune)",
        "Stripe subscription sync (every 6 hours, reconcile local state with Stripe)",
        "Twilio 10DLC campaign registration status check",
        "Resend sender domain DNS verification check",
    ])

    add_h3('Database Schema Gaps')
    add_body(
        "The existing schema (0001_init.sql + 0002_add_organizations.sql) covers businesses, "
        "reviews, review_requests, subscriptions, and organizations. The following tables are "
        "missing for enterprise readiness:"
    )
    rows = [
        ['audit_logs', 'id, actor_id, action, target_type, target_id, metadata, ip, created_at', 'SOC2 + GDPR compliance'],
        ['webhook_events', 'id, source, event_id, payload, signature, received_at, processed_at, status', 'Idempotency + debugging'],
        ['oauth_tokens', 'id, business_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes', 'Secure token storage'],
        ['org_members', 'id, org_id, user_id, role, invited_by, joined_at', 'Multi-tenant RBAC'],
        ['api_keys', 'id, org_id, name, hash, last_used, created_at, revoked_at', 'Public API access'],
        ['sentiment_analyses', 'id, review_id, score, topics, model, created_at', 'AI analytics cache'],
        ['competitor_snapshots', 'id, business_id, competitor_name, rating, review_count, snapshot_at', 'Competitor intel'],
        ['reply_templates', 'id, business_id, title, body, language, created_at', 'Reusable reply snippets'],
        ['usage_events', 'id, business_id, event_type, units, period, created_at', 'Metered billing'],
        ['feature_flags', 'id, key, enabled, rollout_pct, target_orgs, created_at', 'Progressive rollout'],
    ]
    add_table(['Missing Table', 'Schema Sketch', 'Purpose'], rows,
              col_widths=[110, CONTENT_W - 110 - 150, 150], header_align='left')

    add_body(
        "Additional schema issues: <code>subscription_plan</code> enum is missing the "
        "<code>enterprise</code> value (causing the BB-02 / FB-02 mismatch). PII columns "
        "(<code>customer_contact</code> in review_requests) are stored as plain text — must be "
        "encrypted with a KMS-managed key. Seven missing indexes on hot paths "
        "(<code>reviews(business_id, created_at)</code>, <code>review_requests(business_id, status)</code>, "
        "etc.) are causing N+1 query patterns in 4 hot paths."
    )

    add_h2('4. Product Strategy Audit Synthesis')
    add_body(
        "The documentation suite (Product-Roadmap.md, Implementation-Plan.md, AGENTS.md, "
        "Decision-Log.md, Data-Handling-Policy.md, Landing-Page-Prompt-Pack.md, MOCK-TO-REAL.md) "
        "is genuinely excellent for a pre-launch product. The vision is sharp: a $29–$59/mo SaaS "
        "for single-location businesses with a non-technical owner persona. However, three "
        "internal inconsistencies undermine the strategy:"
    )
    add_bullets([
        "<b>Enterprise tier governance violation</b> — Decision-Log.md does not contain the decision to add an Enterprise tier, but BillingManager and PricingToggle both reference it. AGENTS.md §1's locked-pricing rule is violated.",
        "<b>Annual pricing toggle violation</b> — Landing-Page-Prompt-Pack.md explicitly says 'no annual pricing toggle', but PricingToggle implements one. This is a documented design-violation.",
        "<b>Schema enum drift</b> — The subscription_plan enum in 0001_init.sql has only starter/pro, but the frontend exposes enterprise. This causes the P0 FB-02 bug.",
    ])

    add_h3('Documentation Gaps for Enterprise Readiness')
    add_bullets([
        "Runbook (PagerDuty-style incident response, on-call rotation)",
        "SLA template (uptime, response time, support response SLA)",
        "Security overview (pen test reports, SOC2 status, sub-processor list)",
        "API reference (OpenAPI 3.1 spec, code samples in 5 languages)",
        "Integration guide (step-by-step Google OAuth, Facebook OAuth, Stripe setup)",
        "Onboarding playbook (customer success script, 30-60-90 day plan)",
        "Data Processing Addendum (DPA) template for enterprise customers",
        "Disaster recovery plan (RPO/RTO, backup cadence, restore drill)",
        "Incident postmortem template (blameless, 5-whys, action items)",
        "Customer-facing status page (status.reviewreply.com)",
        "Privacy policy, Terms of Service, Acceptable Use Policy (legal-reviewed)",
        "Pricing & packaging deck for sales team",
        "Competitive battle cards (vs Birdeye, Podium, Reputation)",
        "Customer Health Score definition (usage, NPS, support tickets, billing)",
    ])

    add_h2('5. Design Audit Synthesis')
    add_body(
        "The aggregate design score is 4.3 out of 10 against the Linear/Vercel/Stripe/Framer/Cal/"
        "Mercury/Notion/Arc benchmark set. The brand direction (deep pine + brass + cream + "
        "awning motif, Space Grotesk + Inter + IBM Plex Mono) is genuinely rare and defensible, "
        "but execution stops about 60% of the way to 'premium SaaS'."
    )
    rows = [
        ['Typography', '6/10', 'Space Grotesk + Inter + IBM Plex Mono is a strong, defensible stack. Missing variable weights, missing display sizes for hero text.'],
        ['Color', '5/10', 'Brand palette is unique. Missing semantic color system, missing dark mode, missing gradient tokens.'],
        ['Spacing', '6/10', 'Tailwind defaults used. No custom spacing scale, no vertical rhythm.'],
        ['Motion', '3/10', 'All motion is CSS transition 0.2s ease. No Framer Motion, no spring physics, no AnimatePresence, no scroll-linked transforms.'],
        ['Components', '4/10', 'No design-system primitives. Everything is hand-rolled Tailwind. No Button/Card/Modal/Toast/Tabs/DataTable.'],
        ['Icons', '2/10', 'Every icon is Unicode/emoji. Logo carousel uses 8 emoji-in-colored-squares as fake business logos. No lucide-react.'],
    ]
    add_table(['Dimension', 'Score', 'Rationale'], rows,
              col_widths=[80, 60, CONTENT_W - 140], header_align='left')

    add_h3('Three Disqualifying Gaps')
    add_bullets([
        "<b>No icon library</b> — every icon is Unicode/emoji. lucide-react must be installed and every emoji-icon replaced.",
        "<b>No Framer Motion</b> — all motion is CSS. Missing spring physics, AnimatePresence, layout animations, scroll-linked transforms.",
        "<b>Placeholder content shipped</b> — stat cards say 'Placeholder stat — replace with sourced figure'. Logo carousel uses emoji. Feature rows use placehold.co.",
    ])

    add_callout_box(
        'Audit Synthesis — Bottom Line',
        "ReviewReply-Lite has the right scaffold, the right brand direction, and excellent "
        "documentation, but every layer needs rebuilding: backend integrations are 40% complete, "
        "the design system is 4.3/10, and four P0 bugs prevent core user journeys. The phased "
        "roadmap in Part VII sequences the rebuild to deliver visible value every two weeks while "
        "building toward commercial launch in twenty-four weeks. Total investment: ~$345k.",
        color=ACCENT,
    )

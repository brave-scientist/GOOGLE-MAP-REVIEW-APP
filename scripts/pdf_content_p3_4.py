"""
Part 3-6 content: Competitive Benchmark, Enterprise Modules, Design Arch, Dev Arch.
Appended to the same build() function via import.
"""
from reportlab.platypus import PageBreak, Spacer, Paragraph, Table, TableStyle, HRFlowable
from reportlab.lib import colors

def register(part_2_module):
    """Append parts 3-6 to the existing build function."""
    # This is a noop — we directly add to story in the next file
    pass


# ════════════════════════════════════════════════════════════════════════════
# PART III — COMPETITIVE BENCHMARK & MARKET POSITIONING
# ════════════════════════════════════════════════════════════════════════════
def part_3_competitive(story):
    add_h1('Part III — Competitive Benchmark & Market Positioning', level=0)
    add_kicker('Birdeye · Podium · Reputation.com · ReviewTrackers · Trustpilot')

    add_body(
        "The review-management market is mature and crowded. To position ReviewReply Enterprise "
        "correctly, we benchmark five top competitors across price, target customer, feature "
        "depth, and defensibility. The goal is not feature-parity with Birdeye — that game is "
        "already lost. The goal is to find the wedge where ReviewReply can win: a modern, "
        "premium-feeling product at a price point that respects SMB budgets, with enterprise-"
        "grade automation that Birdeye/Podium reserve for their $3k+/mo tiers."
    )

    add_h2('1. Competitor Matrix')
    rows = [
        ['Birdeye', '$3,000–$10,000/mo', 'Multi-location mid-market & enterprise', 'Strong automation + analytics', 'Expensive, dated UI, slow onboarding'],
        ['Podium', '$399–$1,500/mo', 'SMB + mid-market, payments focus', 'Payment + video + messaging', 'Pricing opaque, aggressive sales'],
        ['Reputation.com', '$5,000–$25,000/mo', 'Enterprise, multi-location chains', 'Deep analytics + benchmarking', 'Enterprise sales cycle only'],
        ['ReviewTrackers', '$79–$499/mo', 'SMB + mid-market', 'Local SEO focus', 'Limited automation'],
        ['Trustpilot', '$175–$1,250/mo', 'E-commerce & SaaS', 'Massive consumer trust signal', 'Less local-business focus'],
        ['Grade.us', '$110–$440/mo', 'Agencies & SMBs', 'Agency white-label', 'Limited AI'],
    ]
    add_table(['Competitor', 'Price Tier', 'Target Customer', 'Strengths', 'Weaknesses'], rows,
              col_widths=[80, 90, 110, 90, CONTENT_W - 370], header_align='left')

    add_h2('2. Feature Parity Comparison')
    add_body(
        "The matrix below maps ReviewReply Enterprise (target) against the top three competitors "
        "across the features that matter most to SMB and mid-market buyers. <b>✓</b> = supported, "
        "<b>◐</b> = partial, <b>✗</b> = not supported."
    )
    rows = [
        ['Unified Review Inbox (Google + FB + Yelp)', '✓', '✓', '✓', '◐ → ✓'],
        ['AI Reply Draft Generation', '✓', '◐', '✓', '✗ → ✓'],
        ['Brand Voice Training', '✗', '✗', '◐', '✗ → ✓'],
        ['Multi-Channel Request (SMS + Email + QR)', '✓', '✓', '✓', '◐ → ✓'],
        ['WhatsApp / Apple Business Chat', '◐', '✓', '✗', '✗ → ✓'],
        ['Sentiment + Topic Analytics', '✓', '◐', '✓', '✗ → ✓'],
        ['Competitor Benchmarking', '✓', '✗', '✓', '✗ → ✓'],
        ['Branded Widget & Testimonial Engine', '✓', '✗', '✓', '◐ → ✓'],
        ['Multi-Tenant Agency Mode', '✓', '◐', '✓', '✓ → ✓'],
        ['Local SEO + Schema Markup', '✓', '◐', '✓', '✓ → ✓'],
        ['Real-time Slack/Teams Alerts', '✓', '✗', '✓', '✗ → ✓'],
        ['Executive PDF Reports (scheduled)', '✓', '◐', '✓', '✗ → ✓'],
        ['Public API + Webhooks', '✓', '✗', '✓', '◐ → ✓'],
        ['SOC2 Type II', '✓', '✓', '✓', '✗ → ✓'],
        ['SSO (SAML / OIDC)', '✓', '◐', '✓', '✗ → ✓'],
    ]
    add_table(['Feature', 'Birdeye', 'Podium', 'Reputation', 'ReviewReply (target)'], rows,
              col_widths=[CONTENT_W - 4*60, 60, 60, 60, 60], header_align='left')

    add_h2('3. Market Sizing & TAM')
    add_body(
        "The global online review management software market was valued at approximately $1.8B "
        "in 2024 and is projected to reach $5.4B by 2030 (CAGR ~17%). The North American SMB "
        "segment alone accounts for ~$720M of the 2024 spend. Birdeye and Podium together hold "
        "approximately 38% market share; the remaining 62% is fragmented across dozens of "
        "players including Reputation.com, ReviewTrackers, Grade.us, Trustpilot, and long-tail "
        "agency tools."
    )
    add_body(
        "ReviewReply Enterprise's target wedge is the <b>$49–$299/mo mid-market</b> — above "
        "Grade.us and ReviewTrackers on feature depth, below Birdeye and Podium on price, with "
        "a premium product experience that neither delivers. At 1% capture of the NA SMB segment "
        "in 24 months, that is ~7,200 customers × $99 ARPU = ~$8.6M ARR. At 5% capture (the "
        "stated 24-month goal), that is ~$43M ARR."
    )

    add_h2('4. Differentiation Thesis')
    add_body(
        "ReviewReply Enterprise will differentiate on three axes that no competitor combines today:"
    )

    add_h3('4.1 Premium Product Experience at SMB Price')
    add_body(
        "Birdeye and Podium are functionally powerful but visually dated — they feel like "
        "enterprise software from 2015. ReviewReply Enterprise will deliver a Linear/Vercel-grade "
        "product experience (dark mode, Framer Motion micro-interactions, command palette, "
        "skeleton loaders, real-time collaboration) at a $49–$299/mo price point. This is "
        "achievable because we are building on a modern stack (Next.js 14, Supabase, Tailwind) "
        "without 10 years of technical debt."
    )

    add_h3('4.2 AI Brand Voice, Not Just AI Reply')
    add_body(
        "Every competitor now has an 'AI reply generator'. None of them train the AI on the "
        "specific business's voice. ReviewReply Enterprise will ship a Brand Voice training "
        "module that ingests the business's historical replies, marketing copy, and owner-"
        "supplied tone guidelines to produce drafts that sound like the owner wrote them — not "
        "like ChatGPT. This is a 6–12 month defensibility window before competitors catch up."
    )

    add_h3('4.3 Competitor Intelligence Built In')
    add_body(
        "Reputation.com offers competitor benchmarking at $5k+/mo. No $49–$299/mo competitor "
        "does. ReviewReply Enterprise will include weekly automated benchmarking of the "
        "business against its top 3 local competitors (rating, review velocity, sentiment "
        "topics, response time) as part of every plan. This converts the product from a "
        "tool into a strategic dashboard."
    )

    add_callout_box(
        'Positioning Statement',
        "For multi-location businesses and the agencies that serve them, ReviewReply Enterprise "
        "is the only review-management platform that combines a $50k-feel product experience, "
        "brand-trained AI replies, and built-in competitor intelligence at a price that "
        "respects SMB budgets. Unlike Birdeye ($3k+/mo) and Podium (opaque pricing), we publish "
        "our prices and let you self-serve. Unlike ReviewTrackers (limited AI), we automate "
        "the entire reply workflow end-to-end.",
        color=ACCENT_2,
    )


# ════════════════════════════════════════════════════════════════════════════
# PART IV — PROPOSED ENTERPRISE FEATURE MODULES
# ════════════════════════════════════════════════════════════════════════════
def part_4_modules(story):
    add_h1('Part IV — Proposed Enterprise Feature Modules', level=0)
    add_kicker('Ten Modules · User Stories · API Surface · Effort')

    add_body(
        "This part specifies ten new enterprise modules that, combined with the existing feature "
        "set, will position ReviewReply Enterprise for commercial launch. Each module is defined "
        "by: purpose, target user, primary user stories, key features, data model impact, API "
        "surface, UX flow, and a build-effort estimate. The modules are ordered by dependency — "
        "Module 1 (Unified Inbox) must land before Module 5 (Widgets), because widgets display "
        "reviews from the inbox."
    )

    modules = [
        ('Module 1', 'Unified Review Inbox', '2 weeks', '$30k'),
        ('Module 2', 'Multi-Channel Request Automation', '2 weeks', '$30k'),
        ('Module 3', 'AI Reply Generator + Brand Voice', '3 weeks', '$45k'),
        ('Module 4', 'Sentiment & Topic Analytics', '2 weeks', '$30k'),
        ('Module 5', 'Widget & Testimonial Engine', '2 weeks', '$25k'),
        ('Module 6', 'Multi-Tenant Agency Mode', '2 weeks', '$35k'),
        ('Module 7', 'Competitor Intelligence', '2 weeks', '$30k'),
        ('Module 8', 'Reporting & Alerts', '1.5 weeks', '$22k'),
        ('Module 9', 'Local SEO & Schema Markup', '1.5 weeks', '$22k'),
        ('Module 10', 'Customer Experience Analytics', '2 weeks', '$28k'),
    ]
    rows = [[m[0], m[1], m[2], m[3]] for m in modules]
    add_table(['#', 'Module', 'Build Effort', 'Est. Cost'], rows,
              col_widths=[60, CONTENT_W - 60 - 80 - 80, 80, 80], header_align='left')

    add_body(
        "<b>Total module build: ~20 weeks, ~$297k.</b> Combined with the stabilization, design "
        "system, and architecture work in Parts I and V–VII, the full twenty-four-week rebuild "
        "totals ~$345k. Detailed specifications for each module follow."
    )

    # ───── Module 1 ─────
    add_h2('Module 1 — Unified Review Inbox')
    add_kicker('Multi-Channel · Threading · Bulk Actions · Saved Views')
    add_body(
        "The unified inbox is the operational heart of ReviewReply Enterprise. It aggregates "
        "reviews from Google Business Profile, Facebook Pages, Yelp (via partnership API), "
        "Trustpilot (via API), and Apple Maps (via RSS) into a single, filterable, actionable "
        "stream. Reviews are threaded by customer (when identifiable), and support bulk "
        "actions: assign, archive, mark-as-read, bulk-approve-AI-draft."
    )
    add_h3('Primary User Stories')
    add_bullets([
        "As a business owner, I want to see every review across every platform in one inbox so I never miss one.",
        "As a manager, I want to assign a 1-star review to a specific employee so they can draft a response.",
        "As an agency, I want to filter by client + status=sentiment:negative + age:<24h so I can prioritize escalations.",
        "As a multi-location operator, I want saved views per location so each store manager sees only their reviews.",
    ])
    add_h3('Key Features')
    add_bullets([
        "Real-time websocket updates (Supabase Realtime) — new review appears in inbox within 5 seconds of polling",
        "Faceted filter sidebar: source, rating, sentiment, status, assignee, location, age, language",
        "Saved views (per user) + shared views (per org)",
        "Bulk select + bulk action (assign, archive, mark-read, approve-draft)",
        "Threaded view: all reviews from same customer grouped",
        "Keyboard shortcuts: J/K to navigate, E to escalate, R to reply, A to assign",
        "Command palette (Cmd+K) for power users: jump to any review by customer name or text search",
        "Inline AI draft generation with one-click edit-and-post",
        " snooze: hide a review until a future date (useful for pending-offline-resolution cases)",
    ])
    add_h3('Data Model Impact')
    add_body(
        "New table <code>review_threads</code> (groups reviews from same customer). New table "
        "<code>inbox_views</code> (saved filter configurations). New table "
        "<code>review_assignments</code> (review_id, assignee_id, assigned_at, status). Add "
        "<code>source</code> enum extension: <code>google</code>, <code>facebook</code>, "
        "<code>yelp</code>, <code>trustpilot</code>, <code>apple_maps</code>, "
        "<code>bing_places</code>."
    )
    add_h3('API Surface')
    add_bullets([
        "GET /api/inbox?filters=... — paginated, cursor-based",
        "POST /api/inbox/[id]/assign — assign to user",
        "POST /api/inbox/bulk — bulk action",
        "GET /api/inbox/views — list saved views",
        "POST /api/inbox/views — create saved view",
        "WS /api/inbox/stream — websocket for realtime updates",
    ])

    # ───── Module 2 ─────
    add_h2('Module 2 — Multi-Channel Request Automation')
    add_kicker('SMS · Email · QR · WhatsApp · Apple Business Chat · Funnels')
    add_body(
        "The existing review-request flow supports SMS (Twilio) and email (Resend). Module 2 "
        "extends this to a multi-channel campaign engine with conversion funnels, A/B testing "
        "on message copy, smart send-time optimization, and opt-out management that meets TCPA "
        "and GDPR requirements."
    )
    add_h3('Primary User Stories')
    add_bullets([
        "As a restaurant owner, I want to send a review request 30 minutes after a customer's reservation so the experience is fresh.",
        "As a dental office manager, I want to send requests only between 9am and 8pm patient local time, per TCPA.",
        "As an agency, I want to A/B test two message variants across 100 clients to find the highest-converting copy.",
        "As a multi-location operator, I want a per-location QR poster that customers can scan to leave a review.",
    ])
    add_h3('Key Features')
    add_bullets([
        "Campaign builder: trigger (event | schedule | manual | API), audience filter, channel mix, message template, send window",
        "Smart send-time: ML model picks the optimal send hour per recipient based on past open/click patterns",
        "A/B testing: variant selection, statistical significance tracking, auto-promotion of winner",
        "QR code generator: per-location, per-campaign, trackable (scans → clicks → reviews)",
        "WhatsApp Business template approval workflow (Meta requires pre-approval)",
        "Apple Business Chat invitation with custom intent",
        "Opt-out management: STOP/UNSTOP via SMS, unsubscribe link in email, persisted in customer_contact preferences",
        "TCPA compliance: opt-in checkbox capture, consent timestamp, 9pm–8am quiet hours, 10DLC campaign registration status",
        "Conversion funnel dashboard: sent → delivered → clicked → review posted → review positive (4+ stars)",
    ])
    add_h3('Data Model Impact')
    add_body(
        "New table <code>campaigns</code> (id, business_id, name, trigger_config, audience_filter, "
        "channel_mix, message_variants, send_window, status). New table <code>campaign_events</code> "
        "(id, campaign_id, customer_id, channel, status, sent_at, delivered_at, clicked_at, "
        "converted_at). Extend <code>review_requests</code> with <code>campaign_id</code> and "
        "<code>variant_id</code>."
    )

    # ───── Module 3 ─────
    add_h2('Module 3 — AI Reply Generator with Brand Voice Training')
    add_kicker('Claude · Brand Voice · Approval Workflow · Multi-Language')
    add_body(
        "The existing <code>lib/ai/draft-reply.ts</code> is a rule-based template engine — it "
        "interpolates variables into pre-written templates and calls it 'AI'. Module 3 replaces "
        "this with a real Claude-based pipeline that learns each business's voice from their "
        "historical replies and produces drafts that sound like the owner wrote them."
    )
    add_h3('Primary User Stories')
    add_bullets([
        "As a business owner, I want AI to draft replies that sound like me — not like ChatGPT — so customers feel heard.",
        "As a manager, I want to approve or edit AI drafts before they post, with a 24-hour auto-post-if-no-approval SLA.",
        "As a multi-location operator, I want different brand voices per location (a fine-dining location vs a quick-serve location).",
        "As an agency, I want to train a brand voice once for a client and reuse across all their locations.",
    ])
    add_h3('Key Features')
    add_bullets([
        "Brand Voice training: ingest last 50–200 approved replies, extract voice signature (tone, length, signature, escalation rules, do-not-say list)",
        "Voice profile storage: encrypted per-business vector embedding + few-shot example set",
        "Draft generation: Claude 3.5 Sonnet with brand voice system prompt + 5-shot examples from approved replies",
        "Sentiment-aware drafting: 1-star reviews get apologetic + offer-to-make-it-right; 5-star get warm + invitation to return",
        "Approval workflow: draft → reviewer (optional) → approver → post. Configurable per business.",
        "Auto-post SLA: if no approval within X hours, draft auto-posts (configurable per sentiment tier)",
        "Multi-language: detect review language, draft reply in same language (26 languages)",
        "Edit feedback loop: track accept/reject/edit rate per business, fine-tune voice profile weekly",
        "Forbidden phrases: per-business blocklist (e.g., 'unfortunately', 'we regret', competitor names)",
        "Escalation detection: if review mentions 'lawsuit', 'BBB', 'health inspector', 'lawyer' — auto-escalate, do not auto-post",
    ])
    add_h3('Data Model Impact')
    add_body(
        "New table <code>brand_voice_profiles</code> (id, business_id, voice_signature_enc, "
        "few_shot_examples_json, last_trained_at, accept_rate, reject_rate). New table "
        "<code>reply_approvals</code> (id, draft_id, approver_id, status, decided_at, "
        "edited_text). Extend <code>reviews</code> with <code>draft_reply_text</code>, "
        "<code>draft_reply_status</code> enum (none, draft, pending, approved, rejected, posted)."
    )

    # ───── Module 4 ─────
    add_h2('Module 4 — Sentiment & Topic Analytics')
    add_kicker('Sentiment Scoring · Topic Extraction · Trend Detection')
    add_body(
        "Reviews are a goldmine of unstructured feedback. Module 4 turns each review into "
        "structured signal: sentiment score (-1.0 to +1.0), topic tags (food, service, price, "
        "cleanliness, wait time, etc.), and emergent topic trends over time. This powers the "
        "analytics dashboard, alert routing, and the executive PDF reports in Module 8."
    )
    add_h3('Key Features')
    add_bullets([
        "Per-review sentiment score (-1.0 to +1.0) using Claude with calibrated prompt",
        "Per-review topic extraction (multi-label, 12 standard topics + custom topics per business)",
        "Topic sentiment matrix: each topic has its own sentiment score, so 'food is great but service is slow' shows up correctly",
        "Weekly trend: sentiment by topic over last 12 weeks, with anomaly detection",
        "Alerting: if any topic's sentiment drops >0.3 week-over-week, alert the owner",
        "NPS correlation: if business captures NPS, correlate sentiment score with NPS score",
    ])
    add_h3('API Surface')
    add_bullets([
        "GET /api/analytics/sentiment?range=30d — overall sentiment time series",
        "GET /api/analytics/topics?range=30d — topic frequency + sentiment matrix",
        "GET /api/analytics/anomalies — list of recent sentiment anomalies",
        "POST /api/analytics/reprocess — re-run sentiment on historical reviews (admin only)",
    ])

    # ───── Module 5 ─────
    add_h2('Module 5 — Widget & Testimonial Engine')
    add_kicker('Branded Widgets · Video Testimonials · Case Study Generator')
    add_body(
        "Positive reviews are marketing assets. Module 5 turns them into embeddable widgets "
        "(carousel, grid, slider, floating badge) for the business's website, generates "
        "video-testimonial request flows, and auto-generates case-study drafts from clusters "
        "of positive reviews."
    )
    add_h3('Key Features')
    add_bullets([
        "Widget builder: choose layout (carousel, grid, masonry, slider, floating badge), filter (rating ≥ 4, topic, source), color theme, font",
        "Embed snippet: <script src=\"https://cdn.reviewreply.com/widget.js\" data-widget-id=\"...\"></script>",
        "Widget analytics: impressions, clicks, CTR",
        "Video testimonial request flow: send email with Calendly link, record video via webcam, auto-transcribe",
        "Case study generator: cluster 5+ positive reviews by topic, generate case-study draft with Claude, editable in UI",
        "SEO-friendly widget: server-side rendering option, JSON-LD Review markup embedded",
        "White-label: agency tier can remove 'Powered by ReviewReply' badge",
    ])

    # ───── Module 6 ─────
    add_h2('Module 6 — Multi-Tenant Agency Mode')
    add_kicker('White-Label · Client Portal · Per-Seat Pricing · RBAC')
    add_body(
        "Agencies are the highest-LTV channel for review-management SaaS. Birdeye derives an "
        "estimated 60% of revenue from agency resellers. Module 6 turns ReviewReply Enterprise "
        "into a first-class agency platform: white-label, client portal, per-seat pricing, "
        "and a role-based access control system that supports agency admins, agency staff, "
        "client admins, and client staff."
    )
    add_h3('Key Features')
    add_bullets([
        "Agency workspace: an agency can manage N client businesses under one login",
        "White-label: custom domain (agency.com), custom logo, custom colors, remove ReviewReply branding",
        "Client portal: each client gets a read-only view of their own reviews and metrics",
        "Per-seat pricing: agency pays per staff seat, not per business",
        "RBAC: 4 standard roles (Agency Admin, Agency Staff, Client Admin, Client Staff) + custom roles",
        "Bulk actions across all client businesses: bulk assign, bulk approve-draft, bulk export",
        "Agency-level reporting: aggregate metrics across all clients, client leaderboard",
        "Client onboarding flow: invite client, assign businesses, set permission scope",
    ])
    add_h3('Data Model Impact')
    add_body(
        "New table <code>agency_clients</code> (id, agency_id, client_name, contact_email, "
        "plan, status). Extend <code>org_members</code> with <code>role</code> enum "
        "(owner, admin, staff, viewer, agency_admin, agency_staff, client_admin, client_staff). "
        "New table <code>white_label_configs</code> (id, org_id, custom_domain, logo_url, "
        "primary_color, secondary_color, custom_css)."
    )

    # ───── Module 7 ─────
    add_h2('Module 7 — Competitor Intelligence')
    add_kicker('Weekly Snapshots · Benchmark Dashboard · Gap Analysis')
    add_body(
        "Module 7 pulls competitor data weekly (rating, review count, review velocity, sentiment "
        "topics, response time) via Google Maps API + scraping (where allowed) and presents a "
        "comparative dashboard. This is the killer feature that converts ReviewReply from a tool "
        "into a strategic weapon — no $49–$299/mo competitor offers this."
    )
    add_h3('Key Features')
    add_bullets([
        "Competitor discovery: business enters their Google Maps URL, we suggest top 5 nearby competitors",
        "Weekly snapshot: rating, review count, review velocity (last 7 days), sentiment topics, response time",
        "Comparative dashboard: business vs competitors, with rank + delta vs last week",
        "Alerts: if a competitor's rating surpasses the business, or if competitor review velocity spikes (likely running a campaign)",
        "Gap analysis: which sentiment topics is the business losing on? (e.g., 'food' 4.6 vs competitor 4.9)",
        "Strategy suggestions: Claude-generated 'you are losing on food quality, here are 3 action items based on competitor reviews'",
    ])

    # ───── Module 8 ─────
    add_h2('Module 8 — Reporting & Alerts')
    add_kicker('Slack · Teams · Email · Scheduled PDFs · Executive Dashboards')
    add_body(
        "Module 8 is the communication layer: it routes real-time alerts (Slack, Teams, email, "
        "SMS) for critical events, generates scheduled PDF reports (daily, weekly, monthly), "
        "and provides executive dashboards for owners and agency leads."
    )
    add_h3('Key Features')
    add_bullets([
        "Alert rules engine: trigger (new review, sentiment < threshold, response time > SLA, competitor rating change), channel (Slack/Teams/email/SMS), recipients",
        "Slack integration: OAuth, channel picker, threaded replies",
        "Microsoft Teams integration: via Power Automate connector",
        "Scheduled PDF reports: daily digest (9am local), weekly summary (Monday 9am), monthly executive (1st of month)",
        "Executive dashboard: rating trend, review velocity, response time, sentiment by topic, top positives, top negatives",
        "Agency dashboard: aggregate across all clients, client leaderboard, churn-risk flags",
    ])

    # ───── Module 9 ─────
    add_h2('Module 9 — Local SEO & Schema Markup')
    add_kicker('JSON-LD · Review Velocity · Local Search Recommendations')
    add_body(
        "Reviews are a top-3 local search ranking factor. Module 9 turns ReviewReply into a "
        "local-SEO tool: programmatic schema markup, review-velocity tracking, and Claude-"
        "generated local-SEO recommendations (e.g., 'your review velocity dropped 30% this "
        "week, run a request campaign')."
    )
    add_h3('Key Features')
    add_bullets([
        "JSON-LD Review schema generator: per business, with aggregations (reviewCount, ratingValue, bestRating, worstRating)",
        "Embed snippet for business's website: <script type=\"application/ld+json\">...</script>",
        "Review velocity tracker: reviews per week, with trend + benchmark vs competitors",
        "Local SEO recommendations: Claude-generated weekly action items based on review velocity, sentiment topics, and competitor gaps",
        "Google Business Profile optimization: auto-suggest categories, services, hours based on review topics",
        "Citation consistency checker: business name, address, phone consistency across Google, Facebook, Yelp, Apple Maps",
    ])

    # ───── Module 10 ─────
    add_h2('Module 10 — Customer Experience Analytics')
    add_kicker('NPS · CSAT · CES · Customer Journey Mapping')
    add_body(
        "Module 10 closes the loop between reviews and customer experience. It captures NPS, "
        "CSAT, and CES via post-interaction surveys (in-app, SMS, email), correlates them with "
        "review sentiment, and produces a customer-journey heatmap showing where experience "
        "breaks down."
    )
    add_h3('Key Features')
    add_bullets([
        "NPS survey: post-interaction trigger, 0–10 scale, free-text reason",
        "CSAT survey: per-touchpoint (reception, service, checkout), 1–5 scale",
        "CES (Customer Effort Score): 'how easy was it to do business with us?'",
        "Correlation engine: NPS vs review sentiment, CSAT vs review topics",
        "Customer journey map: 7 stages (discover, consider, book, arrive, experience, checkout, follow-up), with sentiment per stage",
        "Detractor rescue flow: NPS 0–6 triggers automatic outreach workflow",
    ])

    add_callout_box(
        'Module Sequencing Rationale',
        "Modules 1–4 form the operational core (inbox, requests, AI, analytics) and must ship "
        "first. Modules 5–7 are growth features (widgets, agency, competitor) that expand TAM "
        "and defensibility. Modules 8–10 are analytics and CX features that increase ARPU and "
        "retention. The phased roadmap in Part VII sequences these across the 24-week build.",
        color=ACCENT,
    )

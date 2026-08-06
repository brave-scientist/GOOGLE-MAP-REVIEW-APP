"""
Part 5-6 content: Design Architecture + Development Architecture.
"""


# ════════════════════════════════════════════════════════════════════════════
# PART V — DESIGN ARCHITECTURE
# ════════════════════════════════════════════════════════════════════════════
def part_5_design_architecture(story):
    add_h1('Part V — Design Architecture', level=0)
    add_kicker('Design System · Tokens · Components · Motion · IA')

    add_body(
        "This part specifies the complete design architecture for ReviewReply Enterprise. The "
        "goal is to deliver a product experience that feels like it cost $50,000 to design — "
        "Linear-grade micro-interactions, Stripe-grade editorial polish, Vercel-grade geometric "
        "restraint. The architecture is organized into seven layers: philosophy, tokens, "
        "primitives, patterns, motion, information architecture, and accessibility."
    )

    add_h2('1. Design Philosophy')
    add_body(
        "Three principles govern every design decision. They are listed in priority order — when "
        "two conflict, the higher one wins."
    )
    add_bullets([
        "<b>Clarity over cleverness.</b> A user should never wonder what a button does. Every interactive element communicates its affordance within 200ms of being seen.",
        "<b>Motion with purpose.</b> Animation is not decoration — it explains state changes, confirms actions, and reduces perceived latency. Every animation has a reason; if it does not, it is removed.",
        "<b>Restraint at scale.</b> A premium feel comes from what is left out, not what is added. Whitespace, limited color palette, and consistent rhythm matter more than visual richness.",
    ])

    add_h2('2. Design Tokens')
    add_body(
        "All design values are defined as tokens in a single source of truth "
        "(<code>lib/design/tokens.ts</code>) and exposed as CSS custom properties via Tailwind. "
        "This enables runtime theme switching (light/dark) and future white-label overrides."
    )

    add_h3('2.1 Color System')
    add_body(
        "The brand palette is preserved — brass (#97781B), cream, deep pine — but extended with "
        "a complete semantic system and a true dark mode. Light and dark variants are calibrated "
        "for WCAG 2.1 AA contrast (≥ 4.5:1 for body text)."
    )
    rows = [
        ['bg.primary', '#FFFFFF', '#0A0A0B', 'Page background'],
        ['bg.secondary', '#F7F7F4', '#121110', 'Section backgrounds, cards'],
        ['bg.tertiary', '#F0F0EE', '#1F1E1A', 'Hover states, inputs'],
        ['text.primary', '#1F1E1C', '#FAFAF9', 'Body text'],
        ['text.secondary', '#6B6862', '#B5B3AC', 'Captions, meta'],
        ['text.tertiary', '#89867F', '#89867F', 'Disabled, placeholders'],
        ['accent.brand', '#97781B', '#D6B44F', 'Primary brand accent (brass)'],
        ['accent.secondary', '#4464C3', '#7B96E8', 'Secondary accent (blue)'],
        ['semantic.success', '#3B774F', '#70A983', 'Positive sentiment, success states'],
        ['semantic.warning', '#947C4A', '#C1AE89', 'Pending, caution'],
        ['semantic.error', '#97524C', '#C07169', 'Negative sentiment, errors'],
        ['semantic.info', '#4F78A0', '#7694B2', 'Information, hints'],
        ['border.subtle', '#E5E3DC', '#2A2925', 'Default borders, dividers'],
        ['border.default', '#C3BBA4', '#3D3A33', 'Input borders'],
        ['border.strong', '#957F3D', '#635D49', 'Emphasized borders'],
    ]
    add_table(['Token', 'Light', 'Dark', 'Usage'], rows,
              col_widths=[110, 70, 70, CONTENT_W - 250], header_align='left')

    add_h3('2.2 Typography Scale')
    add_body(
        "Type uses a modular scale with a 1.250 ratio (major third). Three families: "
        "<b>Space Grotesk</b> for display, <b>Inter</b> for UI/body, <b>JetBrains Mono</b> for "
        "code and meta. All three are loaded as variable fonts with full weight ranges."
    )
    rows = [
        ['display.xl', 'Space Grotesk', '72 / 80 / 900', '-2%', 'Hero headlines'],
        ['display.lg', 'Space Grotesk', '56 / 64 / 800', '-1.5%', 'Landing hero'],
        ['display.md', 'Space Grotesk', '40 / 48 / 700', '-1%', 'Page titles'],
        ['display.sm', 'Space Grotesk', '32 / 40 / 700', '-0.5%', 'Section titles'],
        ['heading.lg', 'Inter', '24 / 32 / 700', '-0.25%', 'H2 in app'],
        ['heading.md', 'Inter', '20 / 28 / 600', '0', 'H3 in app'],
        ['heading.sm', 'Inter', '16 / 24 / 600', '0', 'H4 in app'],
        ['body.lg', 'Inter', '18 / 28 / 400', '0', 'Long-form reading'],
        ['body.md', 'Inter', '16 / 24 / 400', '0', 'Default body'],
        ['body.sm', 'Inter', '14 / 20 / 400', '0', 'UI body, table cells'],
        ['caption', 'Inter', '12 / 16 / 500', '+0.5%', 'Captions, labels'],
        ['overline', 'JetBrains Mono', '11 / 16 / 500', '+1.5%', 'Kickers, eyebrows (uppercase)'],
        ['code.md', 'JetBrains Mono', '14 / 20 / 400', '0', 'Code blocks'],
    ]
    add_table(['Token', 'Font', 'Size/Line/Weight', 'Track', 'Usage'], rows,
              col_widths=[90, 90, 110, 50, CONTENT_W - 340], header_align='left')

    add_h3('2.3 Spacing & Layout')
    add_body(
        "Spacing uses a 4px base unit. Layout uses a 12-column grid at desktop (≥ 1024px), "
        "8-column at tablet (≥ 640px), 4-column at mobile (< 640px). Maximum content width "
        "for marketing pages: 1200px. For app: 1440px (dense data UIs need width)."
    )
    rows = [
        ['space.0', '0px', 'Touching'],
        ['space.1', '4px', 'Icon-to-text'],
        ['space.2', '8px', 'Tight groupings'],
        ['space.3', '12px', 'Related items'],
        ['space.4', '16px', 'Default padding'],
        ['space.6', '24px', 'Card padding'],
        ['space.8', '32px', 'Section gap'],
        ['space.12', '48px', 'Page section gap'],
        ['space.16', '64px', 'Hero spacing'],
        ['space.24', '96px', 'Page-level breaks'],
        ['radius.sm', '6px', 'Buttons, inputs'],
        ['radius.md', '8px', 'Cards'],
        ['radius.lg', '12px', 'Modals'],
        ['radius.xl', '16px', 'Hero cards'],
        ['radius.full', '9999px', 'Pills, avatars'],
    ]
    add_table(['Token', 'Value', 'Usage'], rows,
              col_widths=[90, 70, CONTENT_W - 160], header_align='left')

    add_h2('3. Component Library')
    add_body(
        "The component library is built on top of Radix UI primitives (for accessibility) + "
        "Tailwind (for styling) + Framer Motion (for animation). This is the same stack used "
        "by Linear, Cal.com, and shadcn/ui. The library is organized into 4 tiers."
    )

    add_h3('Tier 1 — Core Primitives (25 components)')
    add_bullets([
        "<b>Button</b> — 5 variants (primary, secondary, ghost, destructive, outline), 4 sizes (xs, sm, md, lg), loading state, icon slot, magnetic hover effect",
        "<b>Input</b> — text, email, password, search, with leading/trailing icon, error state, character counter",
        "<b>Textarea</b> — auto-resize, character counter, mention support",
        "<b>Select</b> — searchable, multi-select, async (debounced search), custom render",
        "<b>Checkbox</b> — indeterminate state, custom icon",
        "<b>Radio</b> — card variant, inline variant",
        "<b>Switch</b> — with label, description, loading state",
        "<b>Slider</b> — range, multi-thumb, with tooltips",
        "<b>DatePicker</b> — single, range, with shortcuts",
        "<b>TimePicker</b> — 12/24 hour, with timezone",
        "<b>Badge</b> — 5 colors (default, success, warning, error, info), with dot, dismissible",
        "<b>Tag</b> — multi-color, with avatar, removable",
        "<b>Avatar</b> — with fallback initials, status dot, group stacking",
        "<b>Tooltip</b> — with delay, arrow, rich content",
        "<b>Popover</b> — with anchor, dismissable",
        "<b>Dropdown</b> — with search, keyboard nav",
        "<b>Modal</b> — 3 sizes, with header/footer, dismissable",
        "<b>Dialog</b> — alert, confirm, prompt variants",
        "<b>Drawer</b> — left, right, bottom, full screen",
        "<b>Toast</b> — 4 variants, with action, promise-based API",
        "<b>Skeleton</b> — pulse, with shape variants (text, circle, rect)",
        "<b>Progress</b> — linear, circular, with label",
        "<b>Spinner</b> — 3 sizes, with label",
        "<b>Tabs</b> — underline, pill, segmented variants",
        "<b>Accordion</b> — single, multi, with chevron",
    ])

    add_h3('Tier 2 — Data & Loading (10 components)')
    add_bullets([
        "<b>DataTable</b> — sortable, filterable, paginated, with bulk select, row expansion, virtualization",
        "<b>EmptyState</b> — with illustration, headline, description, CTA",
        "<b>ErrorState</b> — with illustration, error code, retry CTA",
        "<b>Pagination</b> — page numbers, with jump-to",
        "<b>FilterBar</b> — multi-facet, with active count, clear all",
        "<b>SortMenu</b> — dropdown with active indicator",
        "<b>StatCard</b> — number, label, delta vs period, sparkline",
        "<b>Chart</b> — Recharts wrapper (line, bar, area, pie, radar, heatmap)",
        "<b>Sparkline</b> — minimal inline chart",
        "<b>ProgressRing</b> — circular progress with center label",
    ])

    add_h3('Tier 3 — Patterns (8 components)')
    add_bullets([
        "<b>CommandPalette</b> — Cmd+K, fuzzy search, recent items, actions, navigation",
        "<b>QuickActions</b> — floating action button with action menu",
        "<b>MagneticButton</b> — cursor-tracking magnetic effect on hover",
        "<b>GradientBorder</b> — animated gradient border on hover",
        "<b>GlassCard</b> — backdrop-blur glass effect",
        "<b>AuroraBackground</b> — animated gradient mesh background",
        "<b>ScrollVideo</b> — scroll-linked video playback (for landing)",
        "<b>BentoGrid</b> — responsive bento-box layout",
    ])

    add_h3('Tier 4 — Marketing (10 components)')
    add_bullets([
        "<b>AnimatedHero</b> — word-by-word reveal with gradient text",
        "<b>Marquee</b> — infinite logo carousel",
        "<b>FAQAccordion</b> — with search",
        "<b>PricingTable</b> — monthly/annual toggle, feature comparison, CTA",
        "<b>TestimonialCarousel</b> — with dot nav, autoplay",
        "<b>BeforeAfter</b> — draggable slider comparison",
        "<b>LiveDemo</b> — interactive product demo with typewriter",
        "<b>StatCounter</b> — animated count-up on scroll",
        "<b>ScrollReveal</b> — fade-in-up on scroll into view",
        "<b>FooterCTA</b> — final-conversion CTA with gradient bg",
    ])

    add_h2('4. Motion System')
    add_body(
        "Motion is built on Framer Motion. Every animation is defined as a token in "
        "<code>lib/design/motion.ts</code>, so motion is consistent across the app and tunable "
        "in one place. Three principles: (1) every state change is animated, (2) animations "
        "respect <code>prefers-reduced-motion</code>, (3) no animation exceeds 400ms."
    )
    rows = [
        ['motion.fade-in', 'opacity 0→1, y 8→0', '250ms', 'ease-out', 'Default reveal'],
        ['motion.fade-in-up', 'opacity 0→1, y 16→0', '350ms', 'ease-out', 'Section reveals'],
        ['motion.scale-in', 'opacity 0→1, scale 0.96→1', '200ms', 'ease-out', 'Modal open'],
        ['motion.slide-in-right', 'x 100%→0', '300ms', 'ease-in-out', 'Drawer open'],
        ['motion.slide-in-bottom', 'y 100%→0', '300ms', 'ease-in-out', 'Mobile sheet'],
        ['motion.hover-lift', 'y 0→-2', '150ms', 'ease-out', 'Card hover'],
        ['motion.tap-scale', 'scale 1→0.97', '100ms', 'ease-out', 'Button tap'],
        ['motion.spring-bounce', 'scale, with spring', '400ms', 'spring', 'Notification badge'],
        ['motion.shimmer', 'background-position 0→100%', '1500ms', 'linear', 'Skeleton loader'],
        ['motion.glow-pulse', 'box-shadow intensity', '2000ms', 'ease-in-out', 'Active states'],
    ]
    add_table(['Token', 'Properties', 'Duration', 'Easing', 'Usage'], rows,
              col_widths=[110, 130, 60, 70, CONTENT_W - 370], header_align='left')

    add_h2('5. Information Architecture')
    add_body(
        "The app is organized into 6 top-level sections, accessible via the sidebar nav. The "
        "marketing site has 8 top-level pages. Mobile uses a bottom tab bar with 5 items."
    )

    add_h3('5.1 App Navigation (Sidebar)')
    rows = [
        ['/', 'Dashboard', 'Overview of metrics, recent reviews, alerts', 'Home icon'],
        ['/inbox', 'Inbox', 'Unified review inbox with filters', 'Inbox icon'],
        ['/reviews', 'Reviews', 'All reviews with reply management', 'Star icon'],
        ['/requests', 'Requests', 'Review request campaigns + send history', 'Send icon'],
        ['/analytics', 'Analytics', 'Sentiment, topics, trends, competitor', 'Chart icon'],
        ['/widgets', 'Widgets', 'Embeddable widget builder + testimonials', 'Code icon'],
        ['/reports', 'Reports', 'Scheduled reports + executive dashboards', 'File icon'],
        ['/settings', 'Settings', 'Business profile, integrations, billing, team', 'Settings icon'],
    ]
    add_table(['Route', 'Label', 'Description', 'Icon'], rows,
              col_widths=[60, 80, CONTENT_W - 60 - 80 - 70, 70], header_align='left')

    add_h3('5.2 Marketing Navigation')
    rows = [
        ['/', 'Home', 'Hero, social proof, features, pricing, CTA'],
        ['/features', 'Features', '10 module deep-dives with interactive demos'],
        ['/solutions/[slug]', 'Solutions', 'Per-vertical pages (dental, hospitality, agency, etc.)'],
        ['/vs/birdeye', 'vs Birdeye', 'Comparison page with feature matrix'],
        ['/vs/podium', 'vs Podium', 'Comparison page with feature matrix'],
        ['/pricing', 'Pricing', '4 tiers (Free, Starter $49, Pro $99, Enterprise $299)'],
        ['/about', 'About', 'Company story, team, investors, careers'],
        ['/blog', 'Blog', 'SEO content + customer stories'],
    ]
    add_table(['Route', 'Label', 'Description'], rows,
              col_widths=[100, 80, CONTENT_W - 180], header_align='left')

    add_h2('6. Responsive Breakpoints')
    add_body(
        "Mobile-first. Six breakpoints covering all common device classes. Every page is "
        "designed at mobile first, then enhanced at each larger breakpoint."
    )
    rows = [
        ['xs', '< 480px', 'Small mobile (iPhone SE)', 'Single column, bottom tab bar'],
        ['sm', '480–639px', 'Large mobile (iPhone 14)', 'Single column, bottom tab bar'],
        ['md', '640–1023px', 'Tablet (iPad)', 'Two column where appropriate, bottom tab bar'],
        ['lg', '1024–1279px', 'Small laptop', 'Sidebar visible, multi-column'],
        ['xl', '1280–1535px', 'Desktop', 'Full sidebar, multi-column'],
        ['2xl', '≥ 1536px', 'Large desktop', 'Full sidebar, max content width'],
    ]
    add_table(['Token', 'Range', 'Device', 'Layout'], rows,
              col_widths=[50, 100, 130, CONTENT_W - 280], header_align='left')

    add_h2('7. Accessibility (WCAG 2.1 AA)')
    add_bullets([
        "All interactive elements have visible focus rings (2px solid accent, 2px offset)",
        "Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components",
        "All form inputs have associated <label> elements",
        "All images have alt text (decorative images have alt=\"\")",
        "All modals trap focus and restore on close",
        "Keyboard navigation works for every interaction (Tab, Shift+Tab, Enter, Space, Esc)",
        "Skip-to-main-content link on every page",
        "ARIA live regions for dynamic content (new review arrives, toast appears)",
        "prefers-reduced-motion respected (animations disabled or simplified)",
        "prefers-color-scheme respected (auto-switch to dark mode)",
        "Screen reader tested with VoiceOver (macOS), NVDA (Windows), TalkBack (Android)",
    ])

    add_h2('8. Figma File Structure Recommendation')
    add_body(
        "For the design team, the Figma file should be organized as follows. This structure "
        "mirrors the token system in code, enabling a 1:1 mapping between design and implementation."
    )
    add_bullets([
        "<b>Cover & TOC</b> — file metadata, version history, change log",
        "<b>01 — Foundations</b> — color, typography, spacing, radius, shadow, motion tokens",
        "<b>02 — Icons</b> — lucide icon set with custom brand additions",
        "<b>03 — Primitives</b> — Button, Input, Select, Modal, Toast, etc. (Tier 1 + 2)",
        "<b>04 — Patterns</b> — CommandPalette, QuickActions, EmptyState, etc. (Tier 3)",
        "<b>05 — Marketing</b> — landing page, pricing, comparison, blog templates (Tier 4)",
        "<b>06 — App Pages</b> — Dashboard, Inbox, Reviews, Requests, Analytics, Settings",
        "<b>07 — Email Templates</b> — review request, digest, win-back, onboarding",
        "<b>08 — Widget Themes</b> — 6 widget layouts × 4 color themes",
        "<b>09 — Mobile</b> — every app page designed mobile-first",
        "<b>10 — Dark Mode</b> — every primitive and page in dark variant",
        "<b>11 — White-Label</b> — agency theme variants (3 reference themes)",
        "<b>12 — Prototypes</b> — interactive Figma prototypes for user testing",
    ])

    add_callout_box(
        'Design Architecture — Bottom Line',
        "The design system is the single highest-leverage investment in the rebuild. It enables "
        "every subsequent feature to ship at premium quality without bespoke design work. The "
        "53-component library takes 3 weeks to build (Phase 1) and pays for itself across the "
        "remaining 21 weeks of feature work. Skip it and the app will look like Birdeye — "
        "functional but not premium.",
        color=ACCENT,
    )


# ════════════════════════════════════════════════════════════════════════════
# PART VI — DEVELOPMENT ARCHITECTURE
# ════════════════════════════════════════════════════════════════════════════
def part_6_dev_architecture(story):
    add_h1('Part VI — Development Architecture', level=0)
    add_kicker('System · Data · API · Security · Infrastructure')

    add_body(
        "This part specifies the complete development architecture for ReviewReply Enterprise. "
        "It covers: system architecture, multi-tenant data model, API design, authentication & "
        "authorization, background jobs, integration layer, security architecture, observability, "
        "infrastructure, CI/CD, and disaster recovery. The goal is a system that scales from 0 "
        "to 100,000 businesses without re-architecture."
    )

    add_h2('1. System Architecture Overview')
    add_body(
        "The system is a serverless-first architecture on Vercel + Supabase, with edge functions "
        "for latency-sensitive paths and Inngest for background job orchestration. This stack "
        "minimizes operational overhead while scaling to 100k+ businesses."
    )
    add_bullets([
        "<b>Frontend</b>: Next.js 14 App Router on Vercel. Server Components for data-heavy pages, Client Components for interactivity. Edge runtime for auth middleware.",
        "<b>Backend</b>: Next.js Route Handlers (Node runtime) + Vercel Edge Functions for low-latency paths. No separate backend service — keeps the deploy surface small.",
        "<b>Database</b>: Supabase Postgres (managed). Row-Level Security (RLS) for multi-tenant isolation. Read replicas via Supabase connection pooler (PgBouncer) at scale.",
        "<b>Auth</b>: Supabase Auth (email/password, magic link, Google, Apple, SAML for enterprise). JWT in httpOnly cookies. Edge middleware for session refresh.",
        "<b>Background Jobs</b>: Inngest for all async work (review polling, AI draft generation, email send, scheduled reports, churn rescue).",
        "<b>Realtime</b>: Supabase Realtime (Postgres changes broadcast) for live inbox updates.",
        "<b>Storage</b>: Supabase Storage for user uploads (logos, brand voice samples). Cloudflare R2 for widget CDN.",
        "<b>CDN</b>: Vercel Edge Network for app + landing. Cloudflare for widget assets.",
        "<b>Email</b>: Resend for transactional. Customer.io for lifecycle/marketing (separate concern).",
        "<b>SMS/WhatsApp</b>: Twilio (SMS + WhatsApp Business).",
        "<b>Payments</b>: Stripe (checkout, customer portal, webhooks, metered billing).",
        "<b>AI</b>: Anthropic Claude 3.5 Sonnet (default), OpenAI GPT-4o (fallback), with abstraction layer for cost optimization.",
        "<b>Observability</b>: Sentry (errors), PostHog (product analytics), Vercel Analytics (web vitals), Datadog (infra metrics) — Datadog only at scale.",
        "<b>Customer Support</b>: Plain.com (in-app) + Zendesk (email) at scale.",
    ])

    add_h2('2. Multi-Tenant Data Model')
    add_body(
        "The data model uses a hierarchical multi-tenant structure: Organization → Businesses → "
        "Locations → Users. RLS policies enforce isolation at every level. The model supports "
        "both single-business accounts (a restaurant owner) and agency accounts (an agency "
        "managing 50 client businesses)."
    )

    add_h3('2.1 Core Entity Hierarchy')
    rows = [
        ['organizations', 'Top-level tenant. Has plan, billing, owner.', 'id, name, plan, stripe_customer_id, created_at'],
        ['org_members', 'User ↔ Org membership with role.', 'id, org_id, user_id, role, joined_at'],
        ['businesses', 'A business (e.g., a restaurant). Belongs to an org.', 'id, org_id, name, industry, address, timezone, gb_location_id'],
        ['locations', 'A specific location of a multi-location business.', 'id, business_id, name, address, phone, gb_location_id'],
        ['users', 'A person who can log in. Has email, name, avatar.', 'id, email, name, avatar_url, created_at'],
        ['reviews', 'A review from Google/FB/etc. on a business.', 'id, business_id, source, external_id, author, rating, text, created_at'],
        ['review_threads', 'Groups reviews from same customer.', 'id, business_id, customer_hash, review_ids[]'],
        ['review_requests', 'A request sent to a customer asking for a review.', 'id, business_id, customer_contact, channel, status, sent_at, clicked_at, converted_at'],
        ['reply_drafts', 'AI-generated draft reply, pending approval.', 'id, review_id, draft_text, status, generated_by, generated_at'],
        ['reply_approvals', 'Approval/rejection record for a draft.', 'id, draft_id, approver_id, status, decided_at, edited_text'],
        ['campaigns', 'A multi-channel review-request campaign.', 'id, business_id, name, trigger_config, audience_filter, channel_mix, message_variants'],
        ['campaign_events', 'Per-recipient event for a campaign.', 'id, campaign_id, customer_id, channel, status, sent_at, delivered_at, clicked_at'],
    ]
    add_table(['Table', 'Description', 'Key Columns'], rows,
              col_widths=[110, CONTENT_W - 110 - 220, 220], header_align='left')

    add_h3('2.2 Enterprise Extensions')
    rows = [
        ['audit_logs', 'Every write operation, for SOC2.', 'id, actor_id, action, target_type, target_id, metadata, ip, created_at'],
        ['webhook_events', 'Inbound webhook receipts for idempotency.', 'id, source, event_id, payload, signature, received_at, processed_at, status'],
        ['oauth_tokens', 'Encrypted Google/FB/Apple OAuth tokens.', 'id, business_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes'],
        ['api_keys', 'Public API keys for customer integrations.', 'id, org_id, name, hash, last_used, created_at, revoked_at'],
        ['sentiment_analyses', 'Cached AI sentiment + topic analysis per review.', 'id, review_id, score, topics, model, created_at'],
        ['competitor_snapshots', 'Weekly competitor data snapshot.', 'id, business_id, competitor_name, rating, review_count, sentiment_topics, snapshot_at'],
        ['brand_voice_profiles', 'Per-business trained AI voice profile.', 'id, business_id, voice_signature_enc, few_shot_examples, last_trained_at, accept_rate'],
        ['usage_events', 'Metered billing events (SMS sent, emails sent, AI calls).', 'id, business_id, event_type, units, period, created_at'],
        ['feature_flags', 'Per-org feature flag overrides.', 'id, org_id, key, enabled, rollout_pct, target_orgs'],
        ['widgets', 'Embeddable widget configurations.', 'id, business_id, layout, filters, theme, embed_snippet, created_at'],
    ]
    add_table(['Table', 'Description', 'Key Columns'], rows,
              col_widths=[110, CONTENT_W - 110 - 220, 220], header_align='left')

    add_h3('2.3 RLS Policy Strategy')
    add_body(
        "Every table has RLS enabled. The pattern is: a user can only access rows where the "
        "owning organization has them as a member. This is enforced by a single SQL function "
        "<code>auth.user_orgs()</code> that returns the set of org_ids the current JWT belongs "
        "to. RLS policies then check <code>org_id IN auth.user_orgs()</code>."
    )
    add_body(
        "Agency mode adds a second layer: an agency user can access rows where the org is a "
        "client of one of their agency orgs. This is enforced by <code>auth.user_agencies()</code> "
        "which returns the set of agency org_ids. The combined policy is: <code>org_id IN "
        "auth.user_orgs() OR org_id IN (SELECT client_org_id FROM agency_clients WHERE "
        "agency_org_id IN auth.user_agencies())</code>."
    )

    add_h2('3. API Design')
    add_body(
        "RESTful API with predictable resource naming. All responses are JSON. Errors use RFC "
        "7807 Problem Details format. Pagination is cursor-based (not offset) for performance "
        "on large tables. All list endpoints support filtering, sorting, and field selection."
    )

    add_h3('3.1 REST Conventions')
    add_bullets([
        "<b>Resource naming</b>: plural nouns (/api/businesses, /api/businesses/[id]/reviews)",
        "<b>HTTP methods</b>: GET (read), POST (create), PATCH (update), DELETE (remove), PUT (rarely, for full replaces)",
        "<b>Status codes</b>: 200 (OK), 201 (Created), 204 (No Content), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 422 (Unprocessable), 429 (Too Many Requests), 500 (Server Error)",
        "<b>Pagination</b>: cursor-based, with <code>cursor</code>, <code>limit</code> (default 50, max 100), <code>has_more</code>",
        "<b>Filtering</b>: query params (<code>?status=active&amp;rating_gte=4</code>)",
        "<b>Sorting</b>: <code>?sort=-created_at,name</code> (minus prefix = descending)",
        "<b>Field selection</b>: <code>?fields=id,name,rating</code> (whitelist)",
        "<b>Idempotency</b>: POST accepts <code>Idempotency-Key</code> header (stored for 24h)",
        "<b>Versioning</b>: URL-based (<code>/api/v1/...</code>, <code>/api/v2/...</code>)",
    ])

    add_h3('3.2 Error Response Format (RFC 7807)')
    add_body(
        "Every error response follows RFC 7807 Problem Details for HTTP APIs. This makes error "
        "handling consistent and machine-parseable. Example response shape:"
    )
    add_quote(
        'HTTP/1.1 422 Unprocessable Entity<br/>'
        'Content-Type: application/problem+json<br/><br/>'
        '{<br/>'
        '&nbsp;&nbsp;"type": "https://docs.reviewreply.com/errors/validation",<br/>'
        '&nbsp;&nbsp;"title": "Validation failed",<br/>'
        '&nbsp;&nbsp;"status": 422,<br/>'
        '&nbsp;&nbsp;"detail": "The review_id field is required.",<br/>'
        '&nbsp;&nbsp;"instance": "/api/v1/reviews/draft",<br/>'
        '&nbsp;&nbsp;"errors": [<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;{"field": "review_id", "code": "required", "message": "Review ID is required"}<br/>'
        '&nbsp;&nbsp;]<br/>'
        '}'
    )

    add_h2('4. Authentication & Authorization')
    add_body(
        "Supabase Auth handles all credential storage and session management. Sessions are JWT "
        "stored in httpOnly Secure cookies. Edge middleware refreshes the JWT on every request "
        "if it is within 60 seconds of expiry. Role-based access control (RBAC) is enforced at "
        "three layers: (1) RLS at the database, (2) middleware at the route, (3) UI at the "
        "component (hide/disable buttons the user cannot use)."
    )

    add_h3('4.1 RBAC Matrix')
    rows = [
        ['Owner', 'Full access including billing, delete org, manage members', 'All resources'],
        ['Admin', 'Everything except billing and org deletion', 'All resources except /billing'],
        ['Staff', 'Read/write reviews, requests, analytics. No team management.', 'Reviews, Requests, Analytics'],
        ['Viewer', 'Read-only access to everything', 'All resources (read-only)'],
        ['Agency Admin', 'Manages agency org + all client orgs', 'Agency + all client orgs'],
        ['Agency Staff', 'Manages assigned client businesses only', 'Assigned client businesses'],
        ['Client Admin', 'Full access to their own client org', 'Own client org only'],
        ['Client Staff', 'Read/write their own reviews', 'Own client reviews only'],
    ]
    add_table(['Role', 'Permissions', 'Scope'], rows,
              col_widths=[90, CONTENT_W - 90 - 130, 130], header_align='left')

    add_h3('4.2 SSO (SAML / OIDC) for Enterprise')
    add_body(
        "Enterprise tier ($299+/mo) supports SAML 2.0 and OIDC SSO. Implementation uses "
        "Supabase Auth's enterprise SSO features. Configuration flow: enterprise customer "
        "uploads SP metadata → ReviewReply provides IdP metadata → customer configures IdP → "
        "test login → roll out. Supported IdPs: Okta, Azure AD, Google Workspace, OneLogin."
    )

    add_h2('5. Background Jobs (Inngest)')
    add_body(
        "Inngest is the single background-job system. Every async task is an Inngest function "
        "with: trigger (event | schedule | manual), retry policy, concurrency limit, and "
        "dead-letter queue. All functions are defined in <code>lib/inngest/</code> and "
        "registered via the single <code>/api/inngest</code> webhook (with signature "
        "verification)."
    )

    add_h3('5.1 Inngest Function Catalog')
    rows = [
        ['poll-reviews', 'Every 15 minutes per business', 'Pull new reviews from Google/FB/etc., store in DB', '5'],
        ['generate-reply-draft', 'On review:created event', 'Generate AI draft reply for new review', '3'],
        ['send-review-request', 'On campaign:send event', 'Send SMS/email/WhatsApp per recipient', '50'],
        ['send-batch-review-requests', 'On campaign:send-batch event', 'Batch send with rate limiting', '10'],
        ['post-reply', 'On reply:approved event', 'Post approved reply to Google/FB', '3'],
        ['daily-digest', 'Cron: 9am user-local', 'Generate and send daily digest email', '60'],
        ['weekly-summary', 'Cron: Monday 9am user-local', 'Generate and send weekly summary PDF', '60'],
        ['monthly-executive', 'Cron: 1st of month 9am user-local', 'Generate and send monthly executive PDF', '120'],
        ['trial-expiration-warning', 'Cron: daily 12pm UTC', 'Send trial-expiring-soon email', '60'],
        ['pii-retention-purge', 'Cron: daily 2am UTC', 'Delete customer_contact older than 90 days', '120'],
        ['oauth-token-refresh', 'Cron: hourly', 'Refresh Google/FB tokens expiring within 1 hour', '60'],
        ['competitor-snapshot', 'Cron: weekly Monday 6am UTC', 'Pull competitor data, store snapshot', '300'],
        ['stripe-subscription-sync', 'Cron: every 6 hours', 'Reconcile local subscription state with Stripe', '60'],
        ['ai-voice-retrain', 'On brand_voice:retrain event', 'Re-train per-business AI voice profile', '300'],
        ['sentiment-anomaly-detect', 'Cron: daily 4am UTC', 'Detect sentiment anomalies, create alerts', '120'],
        ['abandoned-cart-recovery', 'On checkout:abandoned event (3 day delay)', 'Send nudge email to abandoned checkout', '60'],
    ]
    add_table(['Function', 'Trigger', 'Description', 'Timeout (s)'], rows,
              col_widths=[140, 130, CONTENT_W - 140 - 130 - 60, 60], header_align='left')

    add_h2('6. Security Architecture')
    add_body(
        "Security is layered: network (Cloudflare WAF + DDoS), edge (Vercel Edge rate "
        "limiting), application (Zod input validation, CSRF tokens, RBAC), database (RLS, "
        "encrypted columns), and operational (audit logs, secret rotation, pen tests)."
    )

    add_h3('6.1 PII Encryption')
    add_body(
        "Customer contact information (phone, email) is encrypted at rest using AES-256-GCM "
        "with a KMS-managed key (Supabase Vault). Encryption happens in the application layer "
        "before insert, so even DBAs with direct DB access cannot read PII. Decryption happens "
        "in the application layer on read, with audit logging of every decryption event."
    )

    add_h3('6.2 Rate Limiting')
    rows = [
        ['/api/auth/*', '5 per minute per IP', 'Brute-force protection'],
        ['/api/businesses/*/review-requests/send-batch', '10 per hour per org', 'SMS cost abuse'],
        ['/api/reviews/[id]/draft', '20 per minute per org', 'AI cost abuse'],
        ['/api/inngest', '100 per second', 'Inngest webhook flood'],
        ['/api/webhooks/stripe', '50 per second', 'Stripe webhook flood'],
        ['All other endpoints', '100 per minute per user', 'General abuse'],
    ]
    add_table(['Endpoint', 'Limit', 'Purpose'], rows,
              col_widths=[200, 130, CONTENT_W - 330], header_align='left')

    add_h3('6.3 Audit Logs')
    add_body(
        "Every write operation (create, update, delete) is logged in the <code>audit_logs</code> "
        "table with: actor_id, action, target_type, target_id, metadata (JSON of changed "
        "fields), IP address, user agent, and timestamp. Logs are retained for 7 years for SOC2 "
        "and GDPR compliance. A dedicated audit log UI in Settings lets org owners search and "
        "export logs."
    )

    add_h2('7. Observability')
    add_bullets([
        "<b>Sentry</b>: error tracking + performance monitoring. Source maps uploaded on every deploy. Alerting into Slack #engineering-alerts.",
        "<b>PostHog</b>: product analytics (funnels, retention, feature flags, session replays). Auto-capture on, with PII filtering.",
        "<b>Vercel Analytics</b>: Core Web Vitals + audience insights.",
        "<b>Datadog</b>: at scale (>$50k MRR) — infra metrics, APM, log aggregation, synthetic monitoring.",
        "<b>Logflare / Supabase Logs</b>: application logs, structured JSON, 30-day retention.",
        "<b>Status page</b>: status.reviewreply.com (powered by Atlassian Statuspage or Better Stack).",
        "<b>Uptime monitoring</b>: Better Stack or Pingdom, 1-minute checks on /api/health, alert if 2 consecutive failures.",
    ])

    add_h2('8. Infrastructure & CI/CD')
    add_body(
        "The infra is intentionally serverless-first to minimize operational overhead. CI/CD is "
        "GitHub Actions → Vercel preview deploy per PR → automated tests → merge to main → "
        "production deploy. Database migrations run via Supabase CLI as part of the deploy "
        "pipeline."
    )
    add_bullets([
        "<b>Frontend deploy</b>: Vercel, auto-deploy on main merge. Preview deploys per PR.",
        "<b>Database migrations</b>: Supabase CLI, applied via GitHub Actions on merge to main. Roll-forward only — no destructive migrations without a paired forward migration.",
        "<b>Edge functions</b>: deployed via Vercel CLI as part of frontend deploy.",
        "<b>Inngest functions</b>: deployed via Inngest CLI on merge to main.",
        "<b>Widget CDN</b>: Cloudflare R2 + Workers, deployed via wrangler CLI.",
        "<b>Secrets</b>: Vercel Environment Variables (encrypted at rest), Doppler for local dev.",
        "<b>Feature flags</b>: PostHog feature flags, with database override for per-org targeting.",
        "<b>Staging environment</b>: full staging stack on Vercel + Supabase staging project. E2E tests run against staging before production deploy.",
    ])

    add_h2('9. Disaster Recovery')
    rows = [
        ['Database (Supabase)', 'Daily automated + 6-hour PITR', '15 minutes', 'Supabase dashboard + CLI restore'],
        ['Vercel deploys', 'Every deploy is rollback-able', '< 1 minute', 'Vercel dashboard one-click rollback'],
        ['Inngest functions', 'Function code in git, deployable from any commit', '< 5 minutes', 'Re-run Inngest CLI deploy'],
        ['Widget CDN (R2)', 'Source in git, redeployable', '< 5 minutes', 'Re-run wrangler deploy'],
        ['Secrets (Doppler)', 'Versioned, restorable to any prior version', '< 1 minute', 'Doppler dashboard'],
        ['Audit logs', 'Replicated to S3 (read replica)', '< 1 hour', 'Manual restore from S3'],
    ]
    add_table(['Component', 'Backup Cadence', 'RTO', 'Restore Method'], rows,
              col_widths=[140, 130, 70, CONTENT_W - 340], header_align='left')

    add_body(
        "<b>RPO (Recovery Point Objective)</b>: 15 minutes (PITR). <b>RTO (Recovery Time "
        "Objective)</b>: 1 hour for full system restoration. A quarterly disaster-recovery "
        "drill is mandatory: restore staging DB to a fresh Supabase project, verify all "
        "critical user journeys work, document any gaps, file issues for fixes."
    )

    add_callout_box(
        'Development Architecture — Bottom Line',
        "The serverless-first stack (Vercel + Supabase + Inngest) is correct for ReviewReply's "
        "scale (0–100k businesses). It minimizes operational overhead, scales automatically, "
        "and lets a small team ship fast. The architecture's main risk is vendor lock-in — "
        "mitigated by keeping business logic in framework-agnostic modules under <code>lib/</code> "
        "so a future migration to AWS/Railway/Render is possible without rewriting the app.",
        color=ACCENT_2,
    )

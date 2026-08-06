#!/usr/bin/env python3
"""
ReviewReply Enterprise — Bug & Feature Tracker Workbook
5 sheets: Summary, P0 Critical Bugs, P1-P3 Bugs, Feature Roadmap, Module Specs.
"""
import sys, os
XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
sys.path.insert(0, XLSX_SKILL_DIR)
sys.path.insert(0, os.path.join(XLSX_SKILL_DIR, "templates"))

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.worksheet.table import Table, TableStyleInfo

# ── Design tokens ───────────────────────────────────────
HEADER_BG = "1F1E1C"
HEADER_FG = "FFFFFF"
ACCENT = "97781B"
ACCENT_LIGHT = "F3EAD0"
CARD_BG = "F7F7F4"
STRIPE = "F4F4F2"
P0_BG = "B91C1C"
P1_BG = "C2410C"
P2_BG = "A16207"
P3_BG = "3F6212"
TEXT_PRIMARY = "1F1E1C"
TEXT_MUTED = "6B6862"
BORDER = "C3BBA4"

# Status colors
STATUS_TODO_BG = "F3F4F6"
STATUS_TODO_FG = "374151"
STATUS_PROGRESS_BG = "FEF3C7"
STATUS_PROGRESS_FG = "92400E"
STATUS_DONE_BG = "D1FAE5"
STATUS_DONE_FG = "065F46"
STATUS_BLOCKED_BG = "FEE2E2"
STATUS_BLOCKED_FG = "991B1B"

# ── Styles ──────────────────────────────────────────────
thin_border = Border(
    left=Side(style="thin", color=BORDER),
    right=Side(style="thin", color=BORDER),
    top=Side(style="thin", color=BORDER),
    bottom=Side(style="thin", color=BORDER),
)

def header_style(cell):
    cell.font = Font(name="Calibri", size=11, bold=True, color=HEADER_FG)
    cell.fill = PatternFill("solid", fgColor=HEADER_BG)
    cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    cell.border = thin_border

def title_style(cell):
    cell.font = Font(name="Calibri", size=18, bold=True, color=TEXT_PRIMARY)
    cell.alignment = Alignment(horizontal="left", vertical="center")

def subtitle_style(cell):
    cell.font = Font(name="Calibri", size=11, color=TEXT_MUTED, italic=True)
    cell.alignment = Alignment(horizontal="left", vertical="center")

def cell_style(cell, bold=False, italic=False, color=TEXT_PRIMARY, bg=None, align="left"):
    cell.font = Font(name="Calibri", size=10, bold=bold, italic=italic, color=color)
    cell.alignment = Alignment(horizontal=align, vertical="top", wrap_text=True)
    cell.border = thin_border
    if bg:
        cell.fill = PatternFill("solid", fgColor=bg)

def severity_cell(cell, level):
    bg_map = {"P0": P0_BG, "P1": P1_BG, "P2": P2_BG, "P3": P3_BG}
    cell.value = level
    cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.fill = PatternFill("solid", fgColor=bg_map.get(level, "6B6862"))
    cell.border = thin_border

def status_cell(cell, status):
    bg_map = {
        "TODO": (STATUS_TODO_BG, STATUS_TODO_FG),
        "In Progress": (STATUS_PROGRESS_BG, STATUS_PROGRESS_FG),
        "Done": (STATUS_DONE_BG, STATUS_DONE_FG),
        "Blocked": (STATUS_BLOCKED_BG, STATUS_BLOCKED_FG),
        "Planned": ("DBEAFE", "1E40AF"),
        "Phase 0": ("E0E7FF", "3730A3"),
        "Phase 1": ("EDE9FE", "5B21B6"),
        "Phase 2": ("FCE7F3", "9D174D"),
        "Phase 3": ("FED7AA", "9A3412"),
        "Phase 4": ("FEE2E2", "991B1B"),
        "Phase 5": ("D1FAE5", "065F46"),
        "Phase 6": ("CFFAFE", "155E75"),
    }
    bg, fg = bg_map.get(status, (STATUS_TODO_BG, STATUS_TODO_FG))
    cell.value = status
    cell.font = Font(name="Calibri", size=10, bold=True, color=fg)
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.border = thin_border

# ── Build workbook ─────────────────────────────────────
wb = Workbook()
wb.properties.creator = "Z.ai"
wb.properties.title = "ReviewReply Enterprise Bug & Feature Tracker"

# ═══════════════════════════════════════════════════════
# SHEET 1: SUMMARY
# ═══════════════════════════════════════════════════════
ws = wb.active
ws.title = "Summary"
ws.sheet_view.showGridLines = False
ws.column_dimensions['A'].width = 4
ws.column_dimensions['B'].width = 28
ws.column_dimensions['C'].width = 18
ws.column_dimensions['D'].width = 14
ws.column_dimensions['E'].width = 14
ws.column_dimensions['F'].width = 14
ws.column_dimensions['G'].width = 18

ws['B2'] = "ReviewReply Enterprise"
title_style(ws['B2'])
ws.merge_cells('B2:G2')
ws.row_dimensions[2].height = 28

ws['B3'] = "Bug & Feature Tracker — v1.0 · Aug 2026 · Prepared by Z.ai Strategic Engineering"
subtitle_style(ws['B3'])
ws.merge_cells('B3:G3')

ws['B5'] = "PROJECT HEALTH"
ws['B5'].font = Font(name="Calibri", size=9, bold=True, color=ACCENT)
ws['B5'].alignment = Alignment(horizontal="left")

# Stat cards
stats = [
    ("Total Issues", "82", "Across all severities"),
    ("P0 Critical", "5", "Production blockers — fix immediately"),
    ("P1 Important", "18", "Critical for launch"),
    ("P2 Moderate", "32", "Fix within 30 days of launch"),
    ("P3 Minor", "27", "Cosmetic / tech debt"),
    ("Feature Modules", "10", "Proposed enterprise modules"),
    ("Total Investment", "$345k", "24-week rebuild"),
    ("Timeline", "24 wks", "Phase 0 → Phase 6"),
]

row = 7
for label, value, sub in stats:
    ws.cell(row=row, column=2, value=label).font = Font(name="Calibri", size=9, color=TEXT_MUTED, bold=True)
    ws.cell(row=row, column=2).alignment = Alignment(horizontal="left", vertical="center")
    ws.cell(row=row, column=3, value=value).font = Font(name="Calibri", size=20, bold=True, color=ACCENT)
    ws.cell(row=row, column=3).alignment = Alignment(horizontal="left", vertical="center")
    ws.cell(row=row, column=4, value=sub).font = Font(name="Calibri", size=9, color=TEXT_MUTED, italic=True)
    ws.cell(row=row, column=4).alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[row].height = 22
    row += 1

row += 1
ws.cell(row=row, column=2, value="PHASE PROGRESS").font = Font(name="Calibri", size=9, bold=True, color=ACCENT)
row += 1
phases = [
    ("Phase 0", "Stabilization", "Week 1–2", "TODO", "$15k"),
    ("Phase 1", "Design System", "Week 3–5", "Planned", "$45k"),
    ("Phase 2", "Auth & Multi-Tenant", "Week 6–7", "Planned", "$30k"),
    ("Phase 3", "Core Module Rebuild", "Week 8–11", "Planned", "$60k"),
    ("Phase 4", "Enterprise Modules", "Week 12–18", "Planned", "$105k"),
    ("Phase 5", "Automation & AI", "Week 19–22", "Planned", "$60k"),
    ("Phase 6", "Compliance & Launch", "Week 23–24", "Planned", "$30k"),
]
headers = ["Phase", "Focus", "Timeline", "Status", "Budget"]
for i, h in enumerate(headers):
    c = ws.cell(row=row, column=2+i, value=h)
    header_style(c)
ws.row_dimensions[row].height = 24
row += 1
for phase, focus, timeline, status, budget in phases:
    ws.cell(row=row, column=2, value=phase).font = Font(name="Calibri", size=10, bold=True, color=TEXT_PRIMARY)
    ws.cell(row=row, column=2).border = thin_border
    ws.cell(row=row, column=2).alignment = Alignment(horizontal="left", vertical="center")
    ws.cell(row=row, column=3, value=focus)
    cell_style(ws.cell(row=row, column=3))
    ws.cell(row=row, column=4, value=timeline)
    cell_style(ws.cell(row=row, column=4), align="center")
    status_cell(ws.cell(row=row, column=5), status)
    ws.cell(row=row, column=6, value=budget)
    cell_style(ws.cell(row=row, column=6), align="right", bold=True)
    ws.row_dimensions[row].height = 20
    row += 1

# ═══════════════════════════════════════════════════════
# SHEET 2: P0 CRITICAL BUGS
# ═══════════════════════════════════════════════════════
ws2 = wb.create_sheet("P0 Critical Bugs")
ws2.sheet_view.showGridLines = False
ws2.column_dimensions['A'].width = 4
ws2.column_dimensions['B'].width = 8
ws2.column_dimensions['C'].width = 8
ws2.column_dimensions['D'].width = 50
ws2.column_dimensions['E'].width = 38
ws2.column_dimensions['F'].width = 14
ws2.column_dimensions['G'].width = 12
ws2.column_dimensions['H'].width = 12
ws2.column_dimensions['I'].width = 14

ws2['B2'] = "P0 Critical Bugs — Production Blockers"
title_style(ws2['B2'])
ws2.merge_cells('B2:I2')
ws2.row_dimensions[2].height = 28

ws2['B3'] = "These must be fixed before any user touches the app. Fix in Phase 0 (Week 1–2)."
subtitle_style(ws2['B3'])
ws2.merge_cells('B3:I3')

headers = ["ID", "Severity", "Description", "Location", "Area", "Phase", "Owner", "Status"]
for i, h in enumerate(headers):
    c = ws2.cell(row=5, column=2+i, value=h)
    header_style(c)
ws2.row_dimensions[5].height = 24

p0_bugs = [
    ("FB-01", "P0", "OnboardingForm calls POST /api/businesses/[id]/connect/facebook — route does not exist. Every new user clicking 'Connect Facebook' gets a 404.", "OnboardingForm.tsx:126", "Frontend", "Phase 0", "Lead BE", "TODO"),
    ("FB-02", "P0", "Enterprise plan rejected by checkout/manage endpoints. BillingManager calls startCheckout('enterprise') but /api/billing/checkout rejects with if (plan !== 'starter' && plan !== 'pro').", "lib/integrations/stripe.ts", "Backend", "Phase 0", "Lead BE", "TODO"),
    ("BB-01", "P0", "/api/dev/trigger is unauthenticated — anyone on the internet can trigger any background job (mass SMS sending, AI generation, review polling).", "app/api/dev/trigger/route.ts", "Backend/Security", "Phase 0", "Lead BE", "TODO"),
    ("BB-02", "P0", "No Stripe webhook handler exists. Checkout endpoint calls finalizeCheckout() directly, bypassing Stripe entirely and creating phantom subscriptions.", "lib/integrations/stripe.ts", "Backend/Billing", "Phase 0", "Lead BE", "TODO"),
    ("BB-03", "P0", "/api/inngest has no signature verification — forged Inngest events are accepted, allowing arbitrary background job injection.", "app/api/inngest/route.ts", "Backend/Security", "Phase 0", "Lead BE", "TODO"),
    ("BB-04", "P0", "Google postReply() throws unconditionally in real mode; fetchReviews() hardcodes accountId = '' — integration is non-functional.", "lib/integrations/google-business-profile.ts", "Backend/Integration", "Phase 0", "Lead BE", "TODO"),
    ("BB-05", "P0", "Facebook postReply() throws unconditionally in real mode — integration is non-functional.", "lib/integrations/facebook-graph.ts", "Backend/Integration", "Phase 0", "Lead BE", "TODO"),
    ("BB-06", "P0", "SupabaseStore.signIn() always throws 'not implemented in real mode' — auth is completely broken in production.", "lib/supabase/supabase-store.ts", "Backend/Auth", "Phase 0", "Lead BE", "TODO"),
]
row = 6
for bug in p0_bugs:
    bid, sev, desc, loc, area, phase, owner, status = bug
    ws2.cell(row=row, column=2, value=bid)
    cell_style(ws2.cell(row=row, column=2), bold=True, align="center")
    severity_cell(ws2.cell(row=row, column=3), sev)
    ws2.cell(row=row, column=4, value=desc)
    cell_style(ws2.cell(row=row, column=4))
    ws2.cell(row=row, column=5, value=loc)
    cell_style(ws2.cell(row=row, column=5), italic=True, color=TEXT_MUTED)
    ws2.cell(row=row, column=6, value=area)
    cell_style(ws2.cell(row=row, column=6), align="center")
    ws2.cell(row=row, column=7, value=phase)
    cell_style(ws2.cell(row=row, column=7), align="center")
    ws2.cell(row=row, column=8, value=owner)
    cell_style(ws2.cell(row=row, column=8), align="center")
    status_cell(ws2.cell(row=row, column=9), status)
    ws2.row_dimensions[row].height = 50
    row += 1

# ═══════════════════════════════════════════════════════
# SHEET 3: P1-P3 BUGS
# ═══════════════════════════════════════════════════════
ws3 = wb.create_sheet("P1-P3 Bugs")
ws3.sheet_view.showGridLines = False
for col, w in [('A', 4), ('B', 8), ('C', 8), ('D', 55), ('E', 36), ('F', 14), ('G', 12), ('H', 12), ('I', 14)]:
    ws3.column_dimensions[col].width = w

ws3['B2'] = "P1 / P2 / P3 Bugs — Critical → Minor"
title_style(ws3['B2'])
ws3.merge_cells('B2:I2')
ws3.row_dimensions[2].height = 28

ws3['B3'] = "P1 fix in Phase 0. P2 fix within 30 days of launch. P3 opportunistic."
subtitle_style(ws3['B3'])
ws3.merge_cells('B3:I3')

for i, h in enumerate(headers):
    c = ws3.cell(row=5, column=2+i, value=h)
    header_style(c)
ws3.row_dimensions[5].height = 24

other_bugs = [
    # P1
    ("FB-03", "P1", "/api/billing/manage uses businesses[0] instead of getActiveBusiness() — multi-location users cancel/change the wrong business.", "app/api/billing/manage/route.ts", "Backend/Billing", "Phase 0", "Lead BE", "TODO"),
    ("FB-04", "P1", "Duplicate <h1>Review Requests</h1> on /requests (page.tsx + RequestsManager.tsx both render it).", "app/(app)/requests/page.tsx", "Frontend/SEO", "Phase 0", "Lead FE", "TODO"),
    ("FB-05", "P1", "No app/(marketing)/layout.tsx — every marketing page re-implements nav/footer; /vs/* and /privacy /terms are dead-end pages.", "app/(marketing)/", "Frontend/IA", "Phase 1", "Designer", "TODO"),
    ("FB-06", "P1", "No app/not-found.tsx, error.tsx, loading.tsx anywhere — Next.js defaults to plain white 404.", "app/", "Frontend/UX", "Phase 0", "Lead FE", "TODO"),
    ("FB-07", "P1", "Invalid Tailwind classes silently no-op: space-y-22, mb-22, duration-400, prose prose-invert.", "multiple components", "Frontend/Code", "Phase 0", "Lead FE", "TODO"),
    ("BB-07", "P1", "organizations table RLS disabled entirely — any authed user can read any org's data.", "supabase/migrations/0002_add_organizations.sql", "Backend/Security", "Phase 0", "Sec Eng", "TODO"),
    ("BB-08", "P1", "PII (customer_contact) stored as plain text despite data-handling policy mandate requiring encryption.", "supabase/migrations/0001_init.sql", "Backend/Security", "Phase 0", "Sec Eng", "TODO"),
    ("BB-09", "P1", "AI_MODEL = 'claude-sonnet-4-6' is a non-existent Anthropic model identifier. First real API call will fail.", "lib/ai/draft-reply.ts", "Backend/AI", "Phase 0", "Lead BE", "TODO"),
    ("BB-10", "P1", "No rate limiting anywhere — every endpoint can be abused (auth brute-force, AI cost abuse, SMS spam).", "all of app/api/", "Backend/Security", "Phase 0", "Lead BE", "TODO"),
    ("D-01", "P1", "No icon library — every icon is Unicode/emoji (★ ☆ ✓ → ● ◆ 🍕). Logo carousel uses 8 emoji as fake business logos.", "multiple components", "Design", "Phase 1", "Designer", "TODO"),
    ("D-02", "P1", "No Framer Motion — all motion is CSS transition 0.2s ease. Missing spring physics, AnimatePresence, layout animations.", "all components", "Design/Motion", "Phase 1", "Lead FE", "TODO"),
    ("D-03", "P1", "Placeholder content shipped — stat cards say 'Placeholder stat — replace with sourced figure'.", "StatCounter.tsx", "Design/Content", "Phase 1", "Designer", "TODO"),
    ("D-04", "P1", "Login page has zero brand context — generic email/password form on plain background.", "app/(marketing)/login/page.tsx", "Design/UX", "Phase 1", "Designer", "TODO"),
    ("D-05", "P1", "Marketing nav has no mobile hamburger menu — nav items overflow horizontally on mobile.", "landing-page.html", "Design/Responsive", "Phase 1", "Lead FE", "TODO"),
    ("D-06", "P1", "No skeleton loaders — loading state is 'Saving…' text only.", "all async pages", "Design/UX", "Phase 1", "Lead FE", "TODO"),
    ("D-07", "P1", "No empty-state illustrations — just plain text 'No reviews yet'.", "all list pages", "Design/UX", "Phase 1", "Designer", "TODO"),
    ("D-08", "P1", "No modals/dialogs/dropdowns/toasts/tabs primitives — all hand-rolled or absent.", "components/", "Design/System", "Phase 1", "Lead FE", "TODO"),
    ("D-09", "P1", "No charts anywhere — multi-location org-dashboard is a raw <table>.", "app/(app)/org-dashboard/page.tsx", "Design/DataViz", "Phase 1", "Lead FE", "TODO"),
    # P2
    ("FB-08", "P2", "LogoCarousel uses 8 emoji-in-colored-squares as fake business logos.", "LogoCarousel.tsx", "Frontend/Content", "Phase 1", "Designer", "TODO"),
    ("FB-09", "P2", "StatCounter shows 'Placeholder stat — replace with sourced figure' text.", "StatCounter.tsx", "Frontend/Content", "Phase 1", "Designer", "TODO"),
    ("FB-10", "P2", "Login page has zero brand context — generic form.", "app/(marketing)/login/page.tsx", "Frontend/Design", "Phase 1", "Designer", "TODO"),
    ("BB-11", "P2", "N+1 queries in 4 hot paths — iterate all businesses to find one review by ID.", "lib/supabase/supabase-store.ts", "Backend/Perf", "Phase 0", "Lead BE", "TODO"),
    ("BB-12", "P2", "0 Zod schemas despite zod being a dependency — no input validation anywhere.", "all of app/api/", "Backend/Safety", "Phase 0", "Lead BE", "TODO"),
    ("BB-13", "P2", "Mock data leaks into production path — connect/google/route.ts uses MOCK_GOOGLE_LOCATIONS with no isMockMode guard.", "app/api/businesses/[id]/connect/google/route.ts", "Backend", "Phase 0", "Lead BE", "TODO"),
    ("BB-14", "P2", "7 missing indexes on hot paths — reviews(business_id, created_at), review_requests(business_id, status), etc.", "supabase/migrations/", "Backend/Perf", "Phase 0", "Lead BE", "TODO"),
    ("BB-15", "P2", "autoPostIfEligible hardcodes token = 'mock-token' even in production path.", "lib/integrations/index.ts", "Backend", "Phase 0", "Lead BE", "TODO"),
    ("BB-16", "P2", "No CSRF protection on route handlers — POST endpoints vulnerable to cross-site request forgery.", "all of app/api/", "Backend/Security", "Phase 0", "Sec Eng", "TODO"),
    ("D-10", "P2", "No dark mode — only light theme, despite brand being dark-friendly.", "tailwind.config.ts", "Design", "Phase 1", "Lead FE", "TODO"),
    ("D-11", "P2", "No command palette (Cmd+K) — power users have no shortcut-driven navigation.", "app/(app)/", "Design/UX", "Phase 1", "Lead FE", "TODO"),
    ("D-12", "P2", "Mobile app nav is horizontal overflow scroll — no bottom tab bar.", "app/(app)/layout.tsx", "Design/Responsive", "Phase 1", "Lead FE", "TODO"),
    ("D-13", "P2", "No toast notification system — save success/failure has no UI feedback.", "components/", "Design/UX", "Phase 1", "Lead FE", "TODO"),
    ("D-14", "P2", "No keyboard shortcuts — no J/K nav, no Cmd+Enter to submit.", "app/(app)/", "Design/UX", "Phase 1", "Lead FE", "TODO"),
    ("D-15", "P2", "OG image + favicon not configured — social shares have no preview.", "app/layout.tsx", "Design/SEO", "Phase 1", "Designer", "TODO"),
    ("P-01", "P2", "Annual pricing toggle violates Landing-Page-Prompt-Pack.md (explicitly forbids it).", "components/PricingToggle.tsx", "Product/Gov", "Phase 0", "PM", "TODO"),
    ("P-02", "P2", "Enterprise tier not in Decision-Log.md — violates AGENTS.md §1 locked-pricing rule.", "BillingManager + Decision-Log.md", "Product/Gov", "Phase 0", "PM", "TODO"),
    ("P-03", "P2", "Schema enum drift — subscription_plan enum missing 'enterprise' value.", "supabase/migrations/0001_init.sql", "Product/Schema", "Phase 0", "Lead BE", "TODO"),
    ("P-04", "P2", "TCPA compliance missing — no opt-in checkbox, no consent timestamp, no 10DLC registration.", "OnboardingForm + send paths", "Product/Compliance", "Phase 6", "Sec Eng", "TODO"),
    ("P-05", "P2", "No data retention enforcement — policy says 90 days but no purge job exists.", "lib/inngest/", "Product/Compliance", "Phase 6", "Lead BE", "TODO"),
    ("P-06", "P2", "No audit log table — SOC2 readiness requires audit trail of every write operation.", "supabase/migrations/", "Product/Compliance", "Phase 6", "Sec Eng", "TODO"),
    ("P-07", "P2", "No DPA template — enterprise customers will require Data Processing Addendum.", "/legal/", "Product/Legal", "Phase 6", "PM", "TODO"),
    # P3
    ("FB-11", "P3", "BeforeAfter slider uses placeholder stock images.", "components/BeforeAfter.tsx", "Frontend/Content", "Phase 1", "Designer", "TODO"),
    ("FB-12", "P3", "TestimonialCarousel uses generic testimonials.", "components/TestimonialCarousel.tsx", "Frontend/Content", "Phase 1", "PM", "TODO"),
    ("FB-13", "P3", "LiveDemo typewriter text is generic.", "components/LiveDemo.tsx", "Frontend/Content", "Phase 1", "Designer", "TODO"),
    ("D-16", "P3", "LogoCarousel lacks hover animation (slight scale-up on hover).", "LogoCarousel.tsx", "Design/Motion", "Phase 1", "Lead FE", "TODO"),
    ("D-17", "P3", "Buttons lack magnetic hover effect (premium touch).", "components/", "Design/Motion", "Phase 1", "Lead FE", "TODO"),
    ("D-18", "P3", "No page transition animations (route-level).", "app/", "Design/Motion", "Phase 1", "Lead FE", "TODO"),
    ("D-19", "P3", "Focus rings missing on several interactive elements.", "components/", "Design/A11y", "Phase 1", "Lead FE", "TODO"),
    ("D-20", "P3", "No prefers-reduced-motion support — animations always run.", "components/", "Design/A11y", "Phase 1", "Lead FE", "TODO"),
    ("D-21", "P3", "No prefers-color-scheme support — no auto dark mode.", "app/globals.css", "Design/A11y", "Phase 1", "Lead FE", "TODO"),
    ("D-22", "P3", "Pricing toggle has no annual discount badge.", "PricingToggle.tsx", "Design/UX", "Phase 1", "Designer", "TODO"),
    ("D-23", "P3", "Stat counter animation is linear, not eased.", "StatCounter.tsx", "Design/Motion", "Phase 1", "Lead FE", "TODO"),
    ("D-24", "P3", "Mobile bottom tab bar missing.", "app/(app)/layout.tsx", "Design/Responsive", "Phase 1", "Lead FE", "TODO"),
    ("D-25", "P3", "Footer lacks proper sitemap structure.", "landing-page.html", "Design/SEO", "Phase 1", "Lead FE", "TODO"),
    ("D-26", "P3", "No 404 page illustration.", "app/not-found.tsx (missing)", "Design/UX", "Phase 1", "Designer", "TODO"),
    ("D-27", "P3", "No 500 page illustration.", "app/error.tsx (missing)", "Design/UX", "Phase 1", "Designer", "TODO"),
    ("BB-17", "P3", "Error messages not localized — hard-coded English.", "all of app/api/", "Backend/I18n", "Phase 5", "Lead BE", "TODO"),
    ("BB-18", "P3", "API responses not cached — repeated identical queries hit DB.", "all of app/api/", "Backend/Perf", "Phase 3", "Lead BE", "TODO"),
    ("BB-19", "P3", "No OpenAPI spec generated from route handlers.", "lib/", "Backend/DX", "Phase 3", "Lead BE", "TODO"),
    ("BB-20", "P3", "No automated API integration tests.", "tests/", "Backend/QA", "Phase 3", "Lead BE", "TODO"),
    ("BB-21", "P3", "Stripe customer portal not embedded — users can't self-manage subscription.", "app/(app)/billing/", "Backend/Billing", "Phase 3", "Lead BE", "TODO"),
    ("BB-22", "P3", "No webhook event log UI — debugging webhook issues requires DB access.", "app/(app)/settings/", "Backend/DX", "Phase 3", "Lead FE", "TODO"),
    ("BB-23", "P3", "No feature flag system — can't progressively roll out features.", "lib/", "Backend", "Phase 3", "Lead BE", "TODO"),
    ("BB-24", "P3", "No usage metering UI — users can't see their SMS/email/AI usage.", "app/(app)/billing/", "Backend/Billing", "Phase 3", "Lead FE", "TODO"),
    ("BB-25", "P3", "No public API — enterprise customers can't integrate programmatically.", "app/api/", "Backend", "Phase 4", "Lead BE", "TODO"),
    ("BB-26", "P3", "No API key management UI.", "app/(app)/settings/", "Backend", "Phase 4", "Lead FE", "TODO"),
    ("BB-27", "P3", "Resend bounce/complaint webhooks not handled — bad email addresses silently dropped.", "lib/integrations/resend.ts", "Backend", "Phase 3", "Lead BE", "TODO"),
    ("BB-28", "P3", "Twilio inbound SMS not handled — STOP/UNSTOP keywords don't work.", "lib/integrations/twilio.ts", "Backend", "Phase 3", "Lead BE", "TODO"),
    ("BB-29", "P3", "Twilio 10DLC campaign registration flow not built.", "lib/integrations/twilio.ts", "Backend/Compliance", "Phase 6", "Lead BE", "TODO"),
    ("BB-30", "P3", "Google OAuth token refresh not handled — tokens expire in 1 hour.", "lib/integrations/google-business-profile.ts", "Backend", "Phase 3", "Lead BE", "TODO"),
]
row = 6
for bug in other_bugs:
    bid, sev, desc, loc, area, phase, owner, status = bug
    ws3.cell(row=row, column=2, value=bid)
    cell_style(ws3.cell(row=row, column=2), bold=True, align="center")
    severity_cell(ws3.cell(row=row, column=3), sev)
    ws3.cell(row=row, column=4, value=desc)
    cell_style(ws3.cell(row=row, column=4))
    ws3.cell(row=row, column=5, value=loc)
    cell_style(ws3.cell(row=row, column=5), italic=True, color=TEXT_MUTED)
    ws3.cell(row=row, column=6, value=area)
    cell_style(ws3.cell(row=row, column=6), align="center")
    ws3.cell(row=row, column=7, value=phase)
    cell_style(ws3.cell(row=row, column=7), align="center")
    ws3.cell(row=row, column=8, value=owner)
    cell_style(ws3.cell(row=row, column=8), align="center")
    status_cell(ws3.cell(row=row, column=9), status)
    ws3.row_dimensions[row].height = 42
    row += 1

# Add freeze pane + filter
ws2.freeze_panes = "B6"
ws2.auto_filter.ref = f"B5:I{5 + len(p0_bugs)}"
ws3.freeze_panes = "B6"
ws3.auto_filter.ref = f"B5:I{5 + len(other_bugs)}"

# ═══════════════════════════════════════════════════════
# SHEET 4: FEATURE ROADMAP
# ═══════════════════════════════════════════════════════
ws4 = wb.create_sheet("Feature Roadmap")
ws4.sheet_view.showGridLines = False
for col, w in [('A', 4), ('B', 8), ('C', 36), ('D', 18), ('E', 12), ('F', 12), ('G', 14), ('H', 14), ('I', 12)]:
    ws4.column_dimensions[col].width = w

ws4['B2'] = "Feature Roadmap — 10 Enterprise Modules"
title_style(ws4['B2'])
ws4.merge_cells('B2:I2')
ws4.row_dimensions[2].height = 28

ws4['B3'] = "Sequenced for dependency order. Each module has owner, build effort, and target phase."
subtitle_style(ws4['B3'])
ws4.merge_cells('B3:I3')

f_headers = ["#", "Module", "Description", "Build Effort", "Cost", "Phase", "Owner", "Priority", "Status"]
for i, h in enumerate(f_headers):
    c = ws4.cell(row=5, column=2+i, value=h)
    header_style(c)
ws4.row_dimensions[5].height = 24

features = [
    ("M1", "Unified Review Inbox", "Multi-channel inbox (Google + FB + Yelp + Trustpilot + Apple Maps) with threading, bulk actions, saved views, keyboard shortcuts, command palette.", "2 weeks", "$30k", "Phase 3", "Lead FE", "P1", "Planned"),
    ("M2", "Multi-Channel Request Automation", "Campaign builder, smart send-time, A/B testing, QR codes, WhatsApp, Apple Business Chat, TCPA-compliant opt-out.", "2 weeks", "$30k", "Phase 3", "Lead BE", "P1", "Planned"),
    ("M3", "AI Reply + Brand Voice", "Claude 3.5 pipeline with per-business brand voice training, approval workflow, multi-language, escalation detection, auto-post SLA.", "3 weeks", "$45k", "Phase 3", "Lead BE", "P1", "Planned"),
    ("M4", "Sentiment & Topic Analytics", "Per-review sentiment score, multi-label topic extraction, topic sentiment matrix, weekly trends, anomaly detection, NPS correlation.", "2 weeks", "$30k", "Phase 4", "Lead BE", "P2", "Planned"),
    ("M5", "Widget & Testimonial Engine", "Branded widgets (carousel, grid, masonry, slider, badge), video testimonials, case-study generator, white-label option.", "2 weeks", "$25k", "Phase 4", "Lead FE", "P2", "Planned"),
    ("M6", "Multi-Tenant Agency Mode", "White-label, client portal, per-seat pricing, 4-role RBAC, bulk actions, agency-level reporting.", "2 weeks", "$35k", "Phase 4", "Lead FE", "P1", "Planned"),
    ("M7", "Competitor Intelligence", "Weekly competitor snapshots (rating, velocity, sentiment), benchmark dashboard, gap analysis, Claude-generated strategy suggestions.", "2 weeks", "$30k", "Phase 4", "Lead BE", "P2", "Planned"),
    ("M8", "Reporting & Alerts", "Slack/Teams/email alerts, scheduled PDF reports (daily/weekly/monthly), executive + agency dashboards.", "1.5 weeks", "$22k", "Phase 4", "Lead FE", "P2", "Planned"),
    ("M9", "Local SEO & Schema", "JSON-LD Review schema generator, embed snippet, review velocity tracker, Claude-generated local SEO recommendations.", "1.5 weeks", "$22k", "Phase 5", "Lead BE", "P3", "Planned"),
    ("M10", "Customer Experience Analytics", "NPS, CSAT, CES surveys, correlation with reviews, customer journey map, detractor rescue flow.", "2 weeks", "$28k", "Phase 5", "Lead FE", "P3", "Planned"),
]
row = 6
for f in features:
    fid, name, desc, effort, cost, phase, owner, prio, status = f
    ws4.cell(row=row, column=2, value=fid)
    cell_style(ws4.cell(row=row, column=2), bold=True, align="center")
    ws4.cell(row=row, column=3, value=name)
    cell_style(ws4.cell(row=row, column=3), bold=True)
    ws4.cell(row=row, column=4, value=desc)
    cell_style(ws4.cell(row=row, column=4))
    ws4.cell(row=row, column=5, value=effort)
    cell_style(ws4.cell(row=row, column=5), align="center")
    ws4.cell(row=row, column=6, value=cost)
    cell_style(ws4.cell(row=row, column=6), align="right", bold=True, color=ACCENT)
    ws4.cell(row=row, column=7, value=phase)
    cell_style(ws4.cell(row=row, column=7), align="center")
    ws4.cell(row=row, column=8, value=owner)
    cell_style(ws4.cell(row=row, column=8), align="center")
    ws4.cell(row=row, column=9, value=prio)
    cell_style(ws4.cell(row=row, column=9), align="center", bold=True, color=ACCENT)
    ws4.row_dimensions[row].height = 60
    row += 1

ws4.freeze_panes = "B6"
ws4.auto_filter.ref = f"B5:J{5 + len(features)}"

# ═══════════════════════════════════════════════════════
# SHEET 5: PHASE TIMELINE
# ═══════════════════════════════════════════════════════
ws5 = wb.create_sheet("Phase Timeline")
ws5.sheet_view.showGridLines = False
for col in range(1, 30):
    ws5.column_dimensions[get_column_letter(col)].width = 12
ws5.column_dimensions['A'].width = 4
ws5.column_dimensions['B'].width = 22
ws5.column_dimensions['C'].width = 38

ws5['B2'] = "24-Week Phase Timeline (Gantt-style)"
title_style(ws5['B2'])
ws5.merge_cells('B2:Z2')
ws5.row_dimensions[2].height = 28

ws5['B3'] = "Each cell = 1 week. Filled cell = active phase."
subtitle_style(ws5['B3'])
ws5.merge_cells('B3:Z3')

# Phase headers
phase_colors = {
    "Phase 0": ("FEE2E2", "991B1B"),
    "Phase 1": ("EDE9FE", "5B21B6"),
    "Phase 2": ("FCE7F3", "9D174D"),
    "Phase 3": ("FED7AA", "9A3412"),
    "Phase 4": ("FEE2E2", "991B1B"),
    "Phase 5": ("D1FAE5", "065F46"),
    "Phase 6": ("CFFAFE", "155E75"),
}

# Week headers row 5
ws5.cell(row=5, column=2, value="Phase")
header_style(ws5.cell(row=5, column=2))
ws5.cell(row=5, column=3, value="Focus")
header_style(ws5.cell(row=5, column=3))
for w in range(1, 25):
    c = ws5.cell(row=5, column=3+w, value=f"W{w}")
    header_style(c)
    c.alignment = Alignment(horizontal="center", vertical="center")
ws5.row_dimensions[5].height = 24

phases_gantt = [
    ("Phase 0", "Stabilization (P0/P1 bugs, security, mock isolation)", 1, 2),
    ("Phase 1", "Design System (53 components, motion, dark mode)", 3, 5),
    ("Phase 2", "Auth & Multi-Tenant (Supabase Auth, RBAC, SSO, audit logs)", 6, 7),
    ("Phase 3", "Core Module Rebuild (Inbox, Requests, AI Reply, Billing webhooks)", 8, 11),
    ("Phase 4", "Enterprise Modules (Agency, Sentiment, Widgets, Competitor, Reporting)", 12, 18),
    ("Phase 5", "Automation & AI (Brand voice, multi-lang, smart routing, WhatsApp)", 19, 22),
    ("Phase 6", "Compliance & Launch (SOC2, GDPR, TCPA, pen test, beta, public launch)", 23, 24),
]

row = 6
for phase, focus, start_w, end_w in phases_gantt:
    bg, fg = phase_colors[phase]
    ws5.cell(row=row, column=2, value=phase)
    ws5.cell(row=row, column=2).font = Font(name="Calibri", size=10, bold=True, color=fg)
    ws5.cell(row=row, column=2).fill = PatternFill("solid", fgColor=bg)
    ws5.cell(row=row, column=2).border = thin_border
    ws5.cell(row=row, column=2).alignment = Alignment(horizontal="center", vertical="center")
    ws5.cell(row=row, column=3, value=focus)
    cell_style(ws5.cell(row=row, column=3))
    for w in range(1, 25):
        c = ws5.cell(row=row, column=3+w)
        c.border = thin_border
        if start_w <= w <= end_w:
            c.fill = PatternFill("solid", fgColor=bg)
        else:
            c.fill = PatternFill("solid", fgColor="FFFFFF")
    ws5.row_dimensions[row].height = 26
    row += 1

# Milestones row
row += 1
ws5.cell(row=row, column=2, value="MILESTONES").font = Font(name="Calibri", size=9, bold=True, color=ACCENT)
row += 1
ws5.cell(row=row, column=2, value="Event")
header_style(ws5.cell(row=row, column=2))
ws5.cell(row=row, column=3, value="Description")
header_style(ws5.cell(row=row, column=3))
for w in range(1, 25):
    c = ws5.cell(row=row, column=3+w, value=f"W{w}")
    header_style(c)
    c.alignment = Alignment(horizontal="center", vertical="center")
ws5.row_dimensions[row].height = 24
row += 1

milestones = [
    ("M1", "All P0/P1 bugs closed", 2),
    ("M2", "Design system v1.0 shipped", 5),
    ("M3", "Auth + RBAC live", 7),
    ("M4", "End-to-end review → reply → post works", 11),
    ("M5", "Agency mode + 5 enterprise modules live", 18),
    ("M6", "Brand voice + multi-language + WhatsApp live", 22),
    ("M7", "PUBLIC LAUNCH", 24),
]
for m_id, desc, week in milestones:
    ws5.cell(row=row, column=2, value=m_id)
    cell_style(ws5.cell(row=row, column=2), bold=True, align="center", color=ACCENT)
    ws5.cell(row=row, column=3, value=desc)
    cell_style(ws5.cell(row=row, column=3))
    for w in range(1, 25):
        c = ws5.cell(row=row, column=3+w)
        c.border = thin_border
        if w == week:
            c.value = "★"
            c.font = Font(name="Calibri", size=14, bold=True, color=ACCENT)
            c.fill = PatternFill("solid", fgColor=ACCENT_LIGHT)
            c.alignment = Alignment(horizontal="center", vertical="center")
        else:
            c.fill = PatternFill("solid", fgColor="FFFFFF")
    ws5.row_dimensions[row].height = 22
    row += 1

# ═══════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════
output_path = "/home/z/my-project/download/ReviewReply_Bug_Feature_Tracker.xlsx"
wb.save(output_path)
size_kb = os.path.getsize(output_path) / 1024
print(f"✅ XLSX tracker saved: {output_path}")
print(f"   Sheets: {len(wb.sheetnames)} ({', '.join(wb.sheetnames)})")
print(f"   Size: {size_kb:.1f} KB")

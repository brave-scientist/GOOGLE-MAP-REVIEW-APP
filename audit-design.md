# Design Audit — ReviewReply-Lite

**Task ID:** `audit-4`
**Agent:** Design Critic
**Scope:** Full design-quality audit of the Next.js 14 review-management SaaS at `/home/z/my-project/review-app-extracted/REVIEW APP/`
**Benchmark:** Linear / Vercel / Stripe / Framer / Cal.com / Mercury / Notion / Arc Browser
**Verdict scale:** "Premium SaaS, $50k design budget" feel

Files studied end-to-end: `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts`, `app/(marketing)/page.tsx`, `app/(marketing)/login/page.tsx`, `app/(marketing)/solutions/[slug]/page.tsx`, `app/(marketing)/privacy/page.tsx`, `app/(marketing)/terms/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/reviews/page.tsx`, `app/(app)/requests/page.tsx`, `app/(app)/billing/page.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/org-dashboard/page.tsx`, `app/onboarding/page.tsx`, `app/vs/birdeye/page.tsx`, `app/vs/podium/page.tsx`, `landing-page.html`, all 11 components in `components/`, `package.json`, `Landing-Page-Prompt-Pack.md`.

---

## 1. Executive Design Verdict

ReviewReply-Lite has a **coherent, intentional identity** — the "storefront signage" mood (deep pine-green, brass, cream, awning-stripe motif) is the rarest thing in AI-generated SaaS design, and the typewriter reply hero is a genuine signature moment. **But it is not a $50k premium SaaS.** It is a *well-articulated starter* that gets the color story and brand voice right, then stops about 60% of the way to "premium." The gap is structural, not aesthetic: there is **no Framer Motion** (all motion is CSS-only `transition: 0.2s ease`), **no icon library** (every icon is a unicode glyph — ★ ☆ ✓ → ● ◆ ◈ ⬡ ▣ ❋ ✦ ◎), **no component primitives** (no shadcn/ui, no Radix — modals, dropdowns, popovers, toasts, tabs, tooltips are all hand-rolled or absent), **no data visualization** (no charts anywhere), **no skeleton loaders**, **no empty-state illustrations**, **no dark/light toggle**, and **placeholder content shipped to production** ("Placeholder stat — replace with sourced figure," `placehold.co` images, fake emoji business logos). The dashboard reads like a Day-3 tutorial: plain `rounded-xl border border-cream/10 bg-ink-2` cards with raw `<table>` markup and `<select>` dropdowns. To reach Linear/Vercel/Stripe quality, the team needs to **install three dependencies** (`framer-motion`, `lucide-react`, `shadcn/ui` + Radix), **rip out the placeholders**, **add a data-viz layer** (Recharts or Visx), **redesign every empty/loading/error state with illustration**, and **layer in 8–10 signature micro-interactions** (command palette, magnetic buttons, gradient borders, scroll-tied hero parallax, animated stat counters with tabular numerals, etc.). Brand direction: keep. Execution: rebuild the component layer.

---

## 2. Design System Scorecard

| Dimension | Score | Rationale |
|---|---|---|
| **Typography** | **6 / 10** | Font selection is genuinely good — Space Grotesk (display) + Inter (body) + IBM Plex Mono (stats/labels) is a thoughtful, non-default SaaS stack with a "ledger/receipt" rationale. Tight `letter-spacing: -0.02em` on headings is correct. But: only one weight used in practice (700 for display), no italic anywhere, no optical sizing, no `font-feature-settings` for tabular numerals on the mono stat numbers, no display-grade scale (h1 jumps from 32px to 52px with no intermediate steps). Headlines max at 52px — premium sites routinely hit 72–96px on hero. No `clamp()`-based fluid type system outside the hero. Body copy at 14.5–15px is fine but lacks the editorial hierarchy of Stripe/Mercury. |
| **Color** | **5 / 10** | The palette is intentional and rare (deep pine `#13261D`, brass `#C89B3C`, cream `#F6F1E4`, coral `#E8604A`) — points for not being another "cream + serif + terracotta" or "black + neon-green" SaaS. But the system is **too narrow**: 4 base colors + 1 accent, no semantic tokens (success/warning/info are ad-hoc Tailwind defaults `green-400`, `green-500`, `coral`), no proper light mode (paper sections are light but the app is dark-only), no glass tokens (`backdrop-blur` is used once on the nav with no token system), no gradient stops defined. Cream-dim `#CFC9B4` on ink `#13261D` is contrast ratio ~7.5:1 (passes AA but feels washed out at small sizes — premium sites push to 10:1+). Coral on ink for star ratings is ~4.3:1 — borderline fail for AA on small text. |
| **Spacing** | **6 / 10** | Tailwind defaults used throughout. Sections are consistently `py-20` (good rhythm). Cards are `p-5` to `p-9` (consistent). But: no extended spacing scale (no `space-22`, `space-30` for editorial breathing room), no container max-width system beyond `max-w-[1180px]` and `max-w-6xl` (inconsistent — marketing is 1180px, app is 1152px), no vertical-rhythm tokens, no responsive padding scaling (`px-6` everywhere regardless of viewport). Premium sites like Cal.com and Linear use ~150% more whitespace between hero elements. |
| **Motion** | **3 / 10** | **Critical gap.** `framer-motion` is not in `package.json`. All animation is hand-rolled CSS: `.btn-lift { transition: transform 0.15s ease } translateY(-2px)`, `.card-hover translateY(-3px)`, `ScrollReveal` via `IntersectionObserver` adding a `.visible` class, `StatCounter` count-up via `requestAnimationFrame`, typewriter via `setInterval`. None of this is wrong, but it caps out at "functional." Missing: spring physics, layout animations, `AnimatePresence` for enter/exit, gesture interactions (drag, hover-following), scroll-linked transforms (parallax, progress bars), magnetic buttons, view transitions API. Easing is uniformly `ease` or `cubic-bezier(0.16, 1, 0.3, 1)` — fine but overused. No reduced-motion media query. |
| **Components** | **4 / 10** | 11 hand-built components, all custom CSS, no primitives. Buttons: 1 variant (rectangular `rounded-lg bg-brass py-3 font-semibold`). Inputs: 1 variant (`border-cream/15 bg-ink-3 px-4 py-3`). Cards: 1 variant (`rounded-xl border-cream/10 bg-ink-2 p-5`). **Missing entirely**: Modal/Dialog, Dropdown menu, Popover, Tooltip, Toast, Tabs (proper accessible ones), Accordion (FAQ uses a hand-rolled `+` rotate), Data Table (uses raw `<table>`), Combobox, Command Palette, Sheet/Drawer, Skeleton, Avatar (uses initials), Badge (uses raw `<span>`), SegmentedControl. No `aria-*` on most interactive elements. No focus-visible ring system. No `prefers-reduced-motion` handling. No `prefers-color-scheme` light mode. |
| **Icons** | **2 / 10** | **Worst-scoring dimension.** No icon library. Every icon is a unicode glyph or emoji: `★ ☆ ✓ → ● ◆ ◈ ⬡ ▣ ❋ ✦ ◎ 🍕`. The "logo carousel" uses 8 emoji-in-colored-squares as fake business logos — this alone disqualifies the site from "premium." The nav uses a rotated `2.5×2.5` brass square as the logo mark (acceptable, on-brand). The FAQ uses `+` rotated to `×` (functional, not premium). No SVG icons for: settings, billing, reviews, requests, dashboard, search, menu, close, check, arrow, chevron, info, alert, etc. No favicon system. No app icon. No OG image. This is the single most visible gap. |

**Aggregate: 4.3 / 10** — Functionally competent, structurally incomplete.

---

## 3. Current Design System Analysis

### 3.1 Tokens (`tailwind.config.ts` + `globals.css`)

```ts
colors: {
  ink:    { DEFAULT: "#13261D", 2: "#1C3327", 3: "#24402F" },  // 3-step dark scale
  paper:  { DEFAULT: "#EFEADC", 2: "#E5DFC9" },                 // 2-step light scale
  brass:  { DEFAULT: "#C89B3C", light: "#E0BC6E" },             // 2-step accent
  coral:  "#E8604A",                                            // single accent
  cream:  { DEFAULT: "#F6F1E4", dim: "#CFC9B4" },               // 2-step text
  "ink-text": "#152018",                                        // text on paper
}
fontFamily: {
  display: ['Space Grotesk'],
  sans:    ['Inter'],
  mono:    ['IBM Plex Mono'],
}
```

**What's there:** a unique, defensible color story. **What's missing:** semantic colors (`success`, `warning`, `info`, `danger`), elevated surface tokens (currently ad-hoc `bg-ink-2`), border tokens (currently `border-cream/10` inline), text-color tokens for secondary/tertiary (currently `text-cream-dim`), gradient tokens, shadow tokens (no `shadow` extension in config — defaults leak), radius tokens (mixed `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[18px]`), container tokens, animation keyframes (only `pulse`, `blink`, `scroll-left` defined in CSS).

### 3.2 Base styles (`globals.css`)

```css
html { scroll-behavior: smooth; }
body { @apply bg-ink text-cream font-sans antialiased; line-height: 1.5; }
h1, h2, h3 { @apply font-display font-bold; letter-spacing: -0.02em; }
```

Plus: `.awning` (signature storefront stripe — **genuinely good**), `.reveal` / `.stagger-children` / `.reveal-left` / `.reveal-right` (CSS scroll-reveal system), `.btn-lift` / `.card-hover` / `.price-card-hover` / `.star-clickable` (micro-interaction classes), `.carousel-track` / `.carousel-wrapper` (logo carousel), `.tab-content` (FAQ accordion), `.price-transition`.

**Critique:** The CSS file is 183 lines and tries to do what Framer Motion + Tailwind plugins should do. The reveal system is a poor man's `whileInView`. The micro-interactions are 2018-era (`translateY(-2px)` on hover). No CSS custom properties exposed beyond the colors. No `:focus-visible` global. No `::selection` styling. No custom scrollbar.

### 3.3 Typography hierarchy

| Element | Size | Weight | Notes |
|---|---|---|---|
| H1 hero | `clamp(32px, 8vw, 52px)` | 700 | Space Grotesk, line-height 1.06 |
| H2 section | `text-4xl` (36px) | 700 | Space Grotesk |
| H3 card | `text-xl`–`text-3xl` | 700 | Space Grotesk |
| Body | `text-sm`–`text-lg` (14–18px) | 400 | Inter |
| Eyebrow / mono label | `text-xs uppercase tracking-widest` | 500 | IBM Plex Mono |
| Stat number | `text-4xl`–`text-5xl font-mono font-semibold` | 600 | IBM Plex Mono |

**Gap vs premium:** no display size between H2 (36px) and H1 (52px), no H4 token, body max-width is `max-w-md` (28rem) on hero — too narrow for editorial copy. No `text-balance` or `text-pretty` utilities used. No `tabular-nums` on the stat counters (numbers shift width as they count up — visible jitter).

### 3.4 Spacing & layout

- Marketing container: `max-w-[1180px] px-6`
- App container: `max-w-6xl px-6 py-8`
- Section padding: `py-20` (80px) uniform
- Card padding: `p-5` to `p-9`
- Grid gaps: `gap-4` (stats) / `gap-6` (cards) / `gap-7` (pricing) / `gap-14` (hero) / `gap-16` (feature rows)

**Gap vs premium:** Linear and Cal.com use ~120px–160px section padding on desktop. Vercel uses fluid `clamp(80px, 12vw, 160px)`. The 80px everywhere here feels denser than premium.

### 3.5 Motion inventory

| Pattern | Implementation | Premium? |
|---|---|---|
| Hero typewriter | `setInterval(..., 18)` char-by-char + blinking cursor + posted-check fade | Functional, charming |
| Scroll reveal | `IntersectionObserver` toggling `.visible` class | Basic |
| Stagger children | Hardcoded `:nth-child(1)` through `:nth-child(5)` CSS delays | Brittle, caps at 5 |
| Stat counter | `requestAnimationFrame` with cubic ease-out | Functional |
| Logo carousel | CSS `animation: scroll-left 28s linear infinite` | Functional, no parallax |
| Testimonial carousel | `setTimeout` + `translateX` | Functional, no spring |
| Button hover | `transform: translateY(-2px)` + `box-shadow` | Basic |
| Card hover | `translateY(-3px)` + shadow | Basic |
| FAQ accordion | `+` rotated to `×` + content shown/hidden | No height animation |
| Star click | `scale(1.25)` on hover | Basic |

**Gap vs premium:** No spring physics anywhere. No layout animations (when a review posts, the card just stays — it should animate state change). No `AnimatePresence` for tab switches in `BeforeAfter` / `RequestsManager` (uses `display: none` instead). No scroll-linked transforms. No gesture interactions.

---

## 4. Premium Benchmark Gap (Linear / Vercel / Stripe / Framer)

| Benchmark feature | Present here? | Gap severity |
|---|---|---|
| Glassmorphic sticky nav with gradient border | Partial (nav has `backdrop-blur`, no gradient border) | Medium |
| Spring physics on all interactive elements | ❌ None | **Critical** |
| Layout animations (`AnimatePresence`) | ❌ None | **Critical** |
| Command palette (Cmd+K) | ❌ None | High |
| Magnetic buttons (hover-following transform) | ❌ None | High |
| Gradient borders (1px linear-gradient ring) | ❌ None | High |
| Animated gradient mesh background | ❌ None | High |
| 3D product mockup with parallax | ❌ None | High |
| Custom SVG icon set | ❌ None (emoji/unicode) | **Critical** |
| Real logo grid (grayscale → color on hover) | ❌ Emoji squares | **Critical** |
| Skeleton loaders | ❌ "Saving…" text | High |
| Empty-state illustrations | ❌ Plain text | High |
| Toast notifications | ❌ Inline error text | High |
| Data visualization (charts) | ❌ None | High |
| Dark/light mode toggle | ❌ Dark only | Medium |
| Reduced-motion media query | ❌ None | Medium |
| Focus-visible ring system | ❌ Ad-hoc `focus:outline-none focus:border-brass` | Medium |
| Tabular numerals on stats | ❌ Default `tabular-nums` not set | Low |
| `prefers-color-scheme` support | ❌ None | Medium |
| Editorial serif accents (Stripe-style) | ❌ All Space Grotesk | Low (brand choice) |
| View transitions API | ❌ None | Low |
| Custom scrollbar | ❌ Default | Low |
| `::selection` styling | ❌ None | Low |

---

## 5. Landing Page Critique

### What works
1. **Hero typewriter demo** — genuinely the signature moment. The review card → dashed drafting box → typed reply → posted-check sequence is a real product demonstration, not a static mockup. This is the page's strongest asset.
2. **Awning-stripe dividers** — on-brand, intentional, breaks up sections visually. A real design decision, not a default.
3. **Color story** — pine + brass + cream is rare and defensible. Avoids the AI-default cream+terracotta.
4. **Pricing card hierarchy** — the "MOST POPULAR" badge floating above the Pro card is correct.
5. **FAQ accordion** — clean `+` to `×` rotation, clear typography.
6. **Footer** — dense but organized, four-column layout.

### What doesn't work
1. **Placeholder content shipped to production** — stat cards literally say *"Placeholder stat — replace with sourced figure"*. Logo carousel caption says *"Trusted by single-location businesses"* above 8 emoji-in-square "logos" (🍕 Mama Rosa's, ✦ Glow Studio, ◎ SmileCare, ⬡ ProFix, ▣ Corner Shelf, ◈ Iron & Oak, ◆ LuxCuts, ❋ PawsFirst). This is the single most damaging tell against premium positioning.
2. **Feature-row "mockups" are `placehold.co` images** — `https://placehold.co/640x460/1c3327/f6f1e4?font=roboto&text=Quick-add+customer...` — pixelated, generic, off-brand (uses Roboto, not Space Grotesk). Each has a `MOCKUP — REPLACE` coral tag below it. Three of these in a row.
3. **No motion beyond CSS** — when the hero typewriter loops, there's no spring on the posted-check; when the testimonial carousel advances, there's no `AnimatePresence` (it's a hard `translateX` jump); when the pricing toggle flips, the price "fades" via opacity but doesn't spring.
4. **No 3D, no parallax, no scroll-tied transforms** — the hero demo card is static. Linear, Vercel, Stripe all have at least one element that responds to scroll position.
5. **Hero headline caps at 52px** — premium hero headlines are 64–96px. The `clamp(32px, 8vw, 52px)` is too modest.
6. **Sub-headline max-width is `max-w-md` (28rem / 448px)** — too narrow, forces awkward line breaks.
7. **Buttons are flat rectangles** — `rounded-lg bg-brass px-7 py-3.5` with `translateY(-2px)` hover. No gradient, no glow, no focus ring, no `whileTap` spring, no shadow system.
8. **Nav has no mobile menu** — `nav-links` is `hidden md:flex`, but on mobile there's just "Log in" + "Start free trial" — no hamburger, no full-screen drawer. Users on phones cannot navigate to #how / #features / #pricing / #faq from the top.
9. **Testimonial avatars are gradient circles with initials** — fine, but every premium site (Linear, Stripe, Cal.com) uses real photos or illustrated avatars. The `linear-gradient(135deg, #C89B3C, #D4AF5A)` on all 6 testimonials makes them look identical.
10. **The "Live Demo" section's "Post to Google" button reveals a tooltip saying "Sign up to post real replies →"** — clever funnel, but the tooltip styling (`absolute left-0 top-full mt-2 rounded-lg bg-ink-3 px-3 py-2`) is bare-bones. No arrow, no animation, no Radix.
11. **The Before/After tabs use `position: absolute; inset: 0; opacity: 0; pointer-events: none` to hide inactive content** — this means both tabs render simultaneously and only opacity differs. No exit animation. Layout jumps when switching.
12. **The Final CTA is `rounded-3xl bg-ink-2 px-6 py-20`** — fine, but no gradient mesh, no animated background, no sparkle. Linear/Vercel/Stripe finales have at least one motion element.

### Verdict
The landing page is **the best-executed surface in the app** — the brand voice is right, the signature moment exists, the structure is logical. But it is **"well-articulated starter," not "premium."** The placeholders and emoji logos are disqualifying. The motion is 2018-era. The hero is undersized. Replace the placeholders, install Framer Motion, redesign the logo grid with real SVGs, add a scroll-tied parallax to the hero demo card, and the page lifts 3 points.

---

## 6. Dashboard Critique

### 6.1 Layout (`app/(app)/layout.tsx`)
- Top nav only (`AppNav`), no sidebar. Fine for a 5-page SaaS but **not enterprise-grade**. Linear, Vercel, Stripe all use a left sidebar with collapsible sections for app shells.
- Container: `max-w-6xl px-6 py-8`. Too narrow for data-dense dashboards.
- Auth/business guards in the layout — good.
- No breadcrumbs. No contextual subnav. No command palette trigger.

### 6.2 Dashboard page (`app/(app)/dashboard/page.tsx`)
- 4 stat cards in a 2×2 / 4-col grid — each is `rounded-xl border p-5` with a big mono number + label. **No sparklines, no trend indicators, no comparison-to-last-period, no chart, no animation.**
- The "needs reply" stat uses `border-coral/40 bg-coral/5` accent — correct prioritization.
- Recent reviews panel: list with reviewer name, star string (★☆☆☆☆ built via `"".repeat()`), truncated text, source tag. **No avatar, no relative timestamp, no filter, no sort, no pagination.**
- Recent requests panel: list with customer name, entry method, status badge. **No phone number, no channel icon, no retry button, no time-since-sent.**
- Both panels have a "View all →" link in brass — good.
- **No activity feed. No "what's new since you last logged in." No onboarding checklist for new users. No empty-state illustration when reviews.length === 0** (just "No reviews yet. New ones will appear here once the poll job runs.").
- Business header: `text-2xl` business name + tiny status line ("✓ Google connected · ✓ Facebook connected · starter plan · trialing"). **No logo, no avatar, no location info, no timezone.**

### 6.3 Reviews page (`app/(app)/reviews/page.tsx`)
- Just renders `<ReviewCard>` for each review. No filters (by rating, by source, by status, by date). No sort. No bulk actions. No search. No pagination. No skeleton on initial load (server component, so it blocks).
- Empty state: `rounded-xl border border-cream/10 bg-ink-2 p-8 text-center` with two lines of plain text.

### 6.4 `ReviewCard` component
- Card with reviewer name, star string, source tag, status badge.
- Draft textarea (`border-brass/30 bg-brass/5`) + "Post Reply" + "Regenerate" buttons.
- When replied: shows the final_text in a green-bordered box.
- **No avatar, no relative timestamp ("2 hours ago"), no review URL link, no "view on Google" link, no image attachments, no review title, no reviewer photo.**
- **No character counter on the draft textarea.** Google review replies have a length limit; the user has no visibility.
- **No "edit and re-post" flow once replied** — once posted, the reply is shown read-only. Can't correct a typo.
- **No tone/variant picker** — single draft per click. Linear-style "show 3 variants" would be premium.
- **No undo.** Once you click "Post Reply," it's live.

### 6.5 Requests page (`RequestsManager`)
- 3-tab switcher (Quick add / Paste a list / Upload CSV) — uses `setTab` state, no animation between tabs.
- Quick-add form: 3 inputs (name, phone, email) in a 3-col grid + "Add & send" button. **No phone validation, no email validation, no country-code picker, no duplicate detection.**
- Paste-a-list: textarea + "Parse" button → preview list + "Send to N" button. Functional but **no edit-before-send on the parsed contacts.**
- CSV upload: native file input with `file:bg-brass` styling — works but **no drag-and-drop, no progress bar, no error row highlighting.**
- "All requests" list: name + entry method + channel + status badge. **No pagination, no filter, no search, no date, no per-row actions (resend, delete).**

### 6.6 Billing page (`BillingManager`)
- Current plan card + usage card with progress bar + 3 plan cards + cancel section.
- Usage progress bar: `h-2 rounded-full bg-ink-3` with `bg-brass` fill, width set via inline style. **No animated fill on mount, no overage warning color shift, no breakdown by day.**
- Plan cards: 3-col grid, each with name, price, feature list, button. The "current plan" border-highlight is correct.
- Cancel flow: inline 2-step confirm ("Cancel subscription" → "Yes, cancel my subscription"). **No "we're sorry to see you go" pause-and-survey, no retention offer, no exit-intent modal.**

### 6.7 Settings page (`SettingsForm`)
- 3 sections (Auto-post / Message template / Notifications), each `rounded-xl border-cream/10 bg-ink-2 p-5`.
- Auto-post toggle is a **native checkbox** (`type="checkbox" className="h-5 w-5"`). Premium sites use a custom switch with spring animation (Linear, Vercel, Stripe all do).
- Message template textarea with merge-field hints. **No live preview of the rendered message.**
- Notifications: 3 native checkboxes. **No email/SMS preview, no frequency picker, no quiet-hours setting.**
- "Save settings" button + "✓ Saved" inline confirmation. **No toast, no autosave, no dirty-state warning.**

### 6.8 Org-dashboard page
- 4 aggregate stat cards + a leaderboard table.
- Table: raw `<table>` with `divide-y divide-cream/5`. **No sort on columns (it's pre-sorted by response rate), no row click to drill in, no pagination, no filter by category, no export.**
- Response-rate badge color shifts (green / brass / coral) based on threshold — good.
- **No charts anywhere.** A multi-location dashboard without a trend chart is not enterprise-grade.

### Verdict
The dashboard is **a starter template, not an enterprise-grade product.** Every page is functionally complete and visually consistent, but none of them have the polish that would make a paying customer feel they're using a $50k-designed tool. The biggest gaps: no charts, no skeletons, no empty-state illustrations, no avatars, no relative timestamps, no command palette, no keyboard shortcuts, no filters/sort/search on lists, no bulk actions, no toast notifications, native checkboxes instead of switches.

---

## 7. Mobile Responsiveness Assessment

### What's responsive
- Hero grid: `lg:grid-cols-[1.05fr_0.95fr]` collapses to 1 col below `lg`.
- Stats grid: `grid-cols-2 lg:grid-cols-4`.
- Pricing grid: `sm:grid-cols-2` (marketing) / `md:grid-cols-3` (solutions).
- Feature rows: `lg:grid-cols-2` with `reverse` ordering.
- Testimonial carousel: `cardsPerView` adjusts via `window.innerWidth` (1 / 2 / 3).
- Tables: `overflow-x-auto` wrapper.

### What's broken or weak
1. **Marketing nav has no mobile menu.** `nav-links` is `hidden md:flex`, and the only mobile-visible items are "Log in" + "Start free trial." Users on phones cannot reach #how / #features / #pricing / #faq from the top of the page. They have to scroll. **This is a critical UX failure.**
2. **App nav uses horizontal overflow scroll on mobile** (`flex gap-1 overflow-x-auto px-6 pb-2 md:hidden`). This is the laziest possible mobile nav pattern. No hamburger, no drawer, no bottom tab bar. Users have to swipe-scroll through 5–6 items. **Not premium.**
3. **Stat cards stay 2-wide on mobile** (`grid-cols-2 lg:grid-cols-4`). The mono `text-3xl` numbers can overflow on small screens (e.g., "$249" + label).
4. **The hero typewriter demo card has no mobile-specific layout.** On a 375px screen, the `rounded-[18px] p-5` card with nested `rounded-xl p-4` cards becomes visually crowded.
5. **Tables (`org-dashboard`, `vs/birdeye`, `vs/podium`)** rely on `overflow-x-auto` — on mobile, the leaderboard table requires horizontal scroll with no indication that it scrolls.
6. **The `BillingManager` 3-col plan grid** collapses to 1 col on mobile (`md:grid-cols-3` → default 1), but each plan card is `p-5` with a long feature list — the page becomes very long.
7. **The `OnboardingForm` is `max-w-lg`** — fine on mobile, but the 3-step progress indicator (`h-1.5 flex-1 rounded-full`) is tiny and hard to tap.
8. **The login page** is `max-w-sm` centered — fine, but there's no brand context (no logo, no tagline, no "what is ReviewReply-Lite?"). Just a bare form on dark background. **Mobile users landing on /login from a deep link have no idea where they are.**
9. **No `viewport-fit=cover`** in the meta tag, no safe-area insets for iOS notch.
10. **No `theme-color` meta** — browser chrome on mobile stays default.
11. **No bottom-sheet modals** — every "modal" (the account menu in AppNav, the "Post to Google" tooltip in LiveDemo) is `absolute right-0 mt-2` positioned, which on mobile can render off-screen.
12. **Tap targets are mostly OK** (buttons are `py-2.5` minimum = ~36px tall, close to the 44px iOS minimum) but the nav links in `AppNav` are `py-1.5` on mobile = ~28px tall — **below the 44px minimum**.

### Mobile-first redesign priorities
1. Replace marketing nav `hidden md:flex` with a proper hamburger → full-screen drawer (Framer Motion slide-down with stagger).
2. Replace app nav horizontal-scroll with a **bottom tab bar** on mobile (Dashboard / Reviews / Requests / Settings — 4 items, 56px tall, fixed bottom).
3. Add a sticky bottom CTA bar on the landing page ("Start free trial" + "Talk to us") on mobile.
4. Add `viewport-fit=cover` + safe-area insets.
5. Add `<meta name="theme-color" content="#13261D">`.
6. Replace native `<select>` business picker with a custom **sheet picker** on mobile.
7. Increase all tap targets to `min-h-[44px] min-w-[44px]`.
8. Add pull-to-refresh on `/reviews` and `/requests` lists.
9. Test the hero typewriter demo on a 360px viewport — the `font-mono text-xs` labels may need to shrink further.
10. Add `overscroll-behavior: contain` to scrollable lists to prevent body scroll bleed.

---

## 8. Animation / Motion Assessment

### Current inventory
| Component | Motion | Tech |
|---|---|---|
| Hero typewriter | char-by-char type + blinking cursor + posted-check fade | `setInterval` + CSS `@keyframes blink` |
| Scroll reveal | opacity + translateY(28px) → 0 | IntersectionObserver + CSS transition `0.65s cubic-bezier(0.16, 1, 0.3, 1)` |
| Stagger children | hardcoded `:nth-child(1..5)` delays | CSS |
| Stat counter | count-up with cubic ease-out | `requestAnimationFrame` |
| Logo carousel | infinite horizontal scroll | CSS `animation: scroll-left 28s linear infinite` |
| Testimonial carousel | `translateX` + dot pagination | `setTimeout` + CSS `transition: transform 0.4s ease-out` |
| Button hover | `translateY(-2px)` + shadow | CSS `transition: 0.15s ease` |
| Card hover | `translateY(-3px)` + shadow | CSS `transition: 0.2s ease` |
| Price card hover | border-color + shadow + `translateY(-2px)` | CSS |
| Star click (LiveDemo) | `scale(1.25)` on hover | CSS |
| FAQ accordion | `+` rotates to `×`, content shows via `display: block` | CSS + React state |
| Pricing toggle | price opacity fades 0→1 over 200ms | React state + CSS |

### What's missing
1. **`framer-motion` is not installed.** This is the single biggest motion gap. Every premium SaaS in the benchmark list uses it (or Motion One, which is the same team).
2. **No spring physics.** Everything is `ease`-based cubic-bezier. Linear's signature feel is spring-based: `{ stiffness: 300, damping: 30 }`.
3. **No `AnimatePresence`** — components mount/unmount hard. The FAQ accordion shows/hides via conditional render (`{openFaq === i && <p>...</p>}`) with no enter/exit. The Before/After tabs and RequestsManager tabs do the same.
4. **No layout animations.** When a review posts, the card should morph from "draft state" to "posted state" with `layoutId`. Currently it just re-renders.
5. **No scroll-linked transforms.** The hero demo card never moves on scroll. The nav never shrinks/changes on scroll. No progress bar at the top of long pages.
6. **No gesture interactions.** No drag-to-dismiss. No swipe on the testimonial carousel (you have to tap dots). No hover-following gradient on cards.
7. **No `whileHover` / `whileTap` / `whileFocus`** — these are the bread and butter of Framer Motion micro-interactions.
8. **No `useInView` once-shot triggers** — the ScrollReveal adds `.visible` permanently, but never removes it for re-trigger.
9. **No reduced-motion fallback.** No `@media (prefers-reduced-motion: reduce)` rule anywhere. Users with vestibular sensitivity get full motion.
10. **No view transitions API** for route changes — page transitions are hard cuts.

### Specific Framer Motion patterns to adopt
```tsx
// 1. Spring-based hover on all buttons
<motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}>

// 2. Staggered reveal
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0,
  transition: { type: "spring", stiffness: 300, damping: 30 } } };

// 3. AnimatePresence on modals / tabs / accordions
<AnimatePresence initial={false}>
  {open && <motion.div initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} />}
</AnimatePresence>

// 4. Scroll-linked parallax on hero
const { scrollY } = useScroll();
const heroY = useTransform(scrollY, [0, 500], [0, -80]);
const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);

// 5. Layout animations on state change
<motion.div layoutId={`review-${review.id}`}>

// 6. Magnetic button (hover-following)
const x = useMotionValue(0); const y = useMotionValue(0);
<motion.button onMouseMove={(e) => { x.set((e.clientX - center) * 0.2); y.set(...); }}
  style={{ x, y }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>

// 7. Page transitions (App Router)
// Wrap children in layout.tsx with AnimatePresence mode="wait"
```

---

## 9. Component Design Quality

### Buttons
**Current:** 1 variant. `<button className="rounded-lg bg-brass px-6 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">`. No size variants (sm/md/lg/xl), no variant system (primary/secondary/ghost/danger/subtle), no icon slots, no loading spinner, no `aria-busy`, no `whileTap`, no focus ring (uses default `:focus` outline removed by Tailwind preflight).

**Premium target:** shadcn/ui-style Button with variants, sizes, icon-left/icon-right slots, loading state with spinner, `focus-visible:ring-2 ring-brass ring-offset-2 ring-offset-ink`, `whileTap scale 0.97`.

### Cards
**Current:** `rounded-xl border border-cream/10 bg-ink-2 p-5` everywhere. No header/footer structure, no hover state on most, no `card-hover` class on dashboard cards (only on marketing cards).

**Premium target:** Card primitive with `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`, `CardDescription` subcomponents. Subtle hover lift + border highlight. Optional gradient border variant.

### Inputs
**Current:** `border-cream/15 bg-ink-3 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none`. No label association on most (label is a sibling `<label>` not wrapped), no helper text, no error state, no icon-left, no clear button, no character counter, no autofill styling.

**Premium target:** Input with `label`, `helperText`, `error`, `leftIcon`, `rightSlot`, character counter, `aria-invalid`, `aria-describedby`, autofill-fix CSS.

### Modals / Dialogs
**Current:** None exist. The "Post to Google" tooltip in LiveDemo is `absolute left-0 top-full mt-2` — not a modal. The account menu in AppNav is `absolute right-0 mt-2` — not a modal. The "Cancel subscription" confirm is an inline conditional render — not a modal.

**Premium target:** Radix `Dialog` with overlay blur, `AnimatePresence` enter/exit, focus trap, Esc-to-close, click-outside-to-close.

### Tables
**Current:** Raw `<table className="w-full border-collapse text-left text-sm">` with `<thead>` and `<tbody>`. Used in `org-dashboard`, `vs/birdeye`, `vs/podium`. No sort, no filter, no pagination, no row selection, no column resizing, no sticky header, no row hover state beyond `hover:bg-cream/5`.

**Premium target:** TanStack Table or shadcn/ui DataTable with sortable columns, filterable, paginated, row selection, sticky header, hover state, row click action, responsive collapse to cards on mobile.

### Tabs
**Current:** Hand-rolled. In `BeforeAfter`: 2 buttons with `setTab` state. In `RequestsManager`: 3 buttons with `setTab` state. No `role="tablist"`, no `role="tab"`, no `aria-selected`, no keyboard arrow navigation, no `AnimatePresence` on tab content.

**Premium target:** Radix `Tabs` with proper ARIA, keyboard nav, animated underline indicator (Framer Motion `layoutId`).

### Toast / Notifications
**Current:** None. Errors render inline as `<p className="text-sm text-coral">{error}</p>`. Success renders inline as `<span className="text-sm text-green-400">✓ Saved</span>`.

**Premium target:** Sonner or Radix Toast with stacked queue, swipe-to-dismiss, action buttons, auto-dismiss timing.

### Badges
**Current:** Raw `<span className="rounded px-2 py-0.5 text-xs bg-cream/5 text-cream-dim">`. Inconsistent: status badges use `bg-coral/15 text-coral`, `bg-brass/15 text-brass-light`, `bg-green-500/15 text-green-400`. No badge primitive.

**Premium target:** Badge component with variants (default, secondary, success, warning, danger, outline) and sizes.

### Skeletons
**Current:** None. Loading states are text ("Saving…", "Drafting…", "Posting…", "Regenerating…", "Canceling…", "Parsing…", "Uploading…").

**Premium target:** `Skeleton` primitive (`animate-pulse rounded bg-cream/10`), used in dashboard stat cards, review list, request list, billing usage.

---

## 10. Information Architecture

### Marketing nav
- Top: Logo · [How it works · Features · Pricing · FAQ] · Log in · Start free trial
- Footer: Product / Company / Contact columns
- Comparison pages live at `/vs/birdeye` and `/vs/podium` — accessible only from footer
- Solutions live at `/solutions/[slug]` (dental / salon / restaurant / contractor) — **not linked from the nav or footer at all**. These pages exist but are orphaned. SEO value wasted.

### App nav
- Top: Logo · [Dashboard · Reviews · Requests · Settings · Billing] · Business picker · Avatar menu
- "Organization" item appears only when `businesses.length > 1` — good conditional logic
- No breadcrumbs anywhere
- No contextual subnav (e.g., on `/reviews` there's no filter bar that follows scroll)
- No command palette trigger

### Page structure issues
1. **`/solutions/[slug]` pages are orphaned** — no nav link, no footer link, no sitemap reference. The 4 SEO-optimized industry pages exist but are unreachable from anywhere on the site. **This is an IA bug.**
2. **The `/vs/birdeye` and `/vs/podium` pages have no nav** — they render as bare `min-h-screen bg-ink px-6 py-16` with no header, no footer, no way back to the main site except a "Start your free trial →" button and an implicit browser back. **Not premium.**
3. **The `/onboarding` page is outside the `(app)` layout** — correct, but it renders as a bare `max-w-lg` form on dark background with no header, no logo, no exit option. **Premium onboarding (Linear, Vercel, Stripe) all keep the logo and a "skip for now" escape hatch.**
4. **The `/login` page is bare** — no logo context, no "what is this product?" link, no SSO option shown, no "forgot password" (mock mode, but still). **Premium login pages (Linear, Vercel, Cal.com) all show the logo, a one-line value prop, social SSO buttons, and a back-to-home link.**
5. **The app has no settings sub-pages** — Settings is a single long scroll with 3 sections. As features grow (team management, integrations, API keys, webhooks, billing history, invoices), this will become unmanageable. **Premium apps split settings into sub-routes with a left nav.**
6. **No `/blog`, `/docs`, `/changelog`, `/status`, `/security`, `/about`, `/customers`** — table-stakes for a $50k-positioned SaaS. The footer only has Terms / Privacy / vs Birdeye / vs Podium.
7. **No 404 page** — relies on Next.js default.
8. **No `/sitemap.xml` or `/robots.txt`** reference in the codebase.

---

## 11. Empty / Loading / Error State Design

### Empty states
| Surface | Current | Premium target |
|---|---|---|
| Dashboard, no reviews | "No reviews yet. New ones will appear here once the poll job runs." | Illustrated empty state + "Connect Google to start" CTA |
| Dashboard, no requests | "No requests sent yet. Add a customer to get started." | Illustrated + quick-add CTA |
| Reviews page, no reviews | "No reviews yet. Reviews will appear here automatically once the poll job runs (every 20 minutes)." | Illustrated + "Refresh now" button + explanation |
| Requests page, no requests | "No requests yet. Add a customer above to get started." | Illustrated + tab-aware CTA |
| Search results, no matches | N/A (no search exists) | — |

**Verdict:** All empty states are plain text in a `rounded-xl border-cream/10 bg-ink-2 p-8 text-center` box. **Zero illustrations. Zero CTAs to act. Zero personality.** Premium empty states (Linear, Mercury, Notion, Stripe) all use custom illustrations + a clear next action + empathetic copy.

### Loading states
| Surface | Current | Premium target |
|---|---|---|
| Button click | "Saving…" / "Drafting…" / "Posting…" / "Regenerating…" / "Canceling…" / "Parsing…" / "Uploading…" / "Sending…" text | Spinner + text, or `aria-busy` with opacity |
| Page load (server component) | Blocks until data ready, then renders | Streaming with Suspense + skeleton |
| ReviewCard draft generation | "Drafting…" button text | Skeleton lines in the textarea area |
| ReviewCard post | "Posting…" button text | Optimistic update + rollback on error |
| Testimonial carousel | None (instant) | — |
| StatCounter | Count-up animation | Good, keep — add `tabular-nums` |

**Verdict:** Loading is uniformly text-based. No skeletons, no spinners, no optimistic updates, no Suspense boundaries. **This is the second-biggest "feels cheap" tell after the emoji icons.**

### Error states
| Surface | Current | Premium target |
|---|---|---|
| Login error | `<p className="mt-3 text-sm text-coral">{error}</p>` inline | Inline + icon + retry CTA |
| ReviewCard draft error | `<p className="mt-2 text-sm text-coral">{error}</p>` inline | Toast + retry button |
| ReviewCard post error | Same inline | Toast + undo (if posted) |
| Settings save error | `<span className="text-sm text-coral">{error}</span>` inline | Toast + field-level error |
| Billing error | `<p className="text-sm text-coral">{error}</p>` inline | Toast + support link |
| RequestsManager error | Inline `<p>` or `<span>` | Toast + retry |
| Onboarding error | `rounded-lg border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral` box | Same but with icon + dismiss |
| Network error | None (no error boundary) | Full-page error boundary with "Reload" + "Report" |
| 404 | Next.js default | Custom 404 with search + back-home |
| 500 | Next.js default | Custom 500 with error ID + support link |

**Verdict:** Error states are minimal, inline, and inconsistent. No toast system, no error boundary, no retry patterns, no error IDs for support. **Premium error handling (Linear, Vercel) all use toasts + error boundaries + actionable copy.**

---

## 12. Iconography, Illustration, Imagery

### Icons
- **Icon library:** None installed.
- **Usage:** Unicode glyphs throughout: `★ ☆ ✓ → ● ◆ ◈ ⬡ ▣ ❋ ✦ ◎ 🍕`.
- **Logo mark:** A `<span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-brass" />` rotated square. Acceptable, on-brand, but used everywhere with no variation.
- **Nav icons:** None. Dashboard, Reviews, Requests, Settings, Billing are text-only.
- **Status icons:** None. `✓` and `→` are the only "icons" used.

**Premium target:** Install `lucide-react` (the de facto standard, used by shadcn/ui, Vercel, Cal.com). Replace all unicode with proper SVG icons. Add icons to nav items, button slots, status badges, empty states, error states, settings rows, etc.

### Illustrations
- **Custom illustrations:** None.
- **Empty-state illustrations:** None.
- **Hero illustration:** None — uses the typewriter demo card instead (good choice, but no fallback illustration).
- **Onboarding illustrations:** None.
- **Marketing illustrations:** None.

**Premium target:** Commission a custom illustration set in the "storefront signage" brand mood (think: warm, tactile, hand-drawn, like Mercury's illustrations but in pine-green + brass). Use in: empty states, onboarding step headers, 404/500 pages, marketing feature rows (replace the `placehold.co` images).

### Imagery
- **Marketing feature-row mockups:** `https://placehold.co/640x460/1c3327/f6f1e4?font=roboto&text=...` — three of them, each with a `MOCKUP — REPLACE` coral tag.
- **Logo carousel:** 8 emoji-in-colored-square fake business logos.
- **Testimonial avatars:** 6 gradient circles with initials.
- **OG image:** None defined in metadata.
- **Favicon:** None defined.

**Premium target:**
1. Replace `placehold.co` images with real product screenshots (or illustrated mockups if the product isn't built yet).
2. Replace emoji logo carousel with real SVG logos (grayscale by default, color on hover — the Vercel/Linear pattern).
3. Replace initial-circle avatars with real customer photos (collected during beta) or illustrated avatars (like Notion's).
4. Add `opengraph-image` and `twitter-image` to metadata (Next.js 14 supports this natively via file convention).
5. Add `app/icon.tsx` and `app/apple-icon.tsx` for favicons.

---

## 13. Top 15 Design Problems (Ranked by Impact)

| # | Problem | Impact | Fix effort |
|---|---|---|---|
| 1 | **No icon library** — every icon is unicode/emoji (★ ☆ ✓ → ● ◆ 🍕) | Disqualifying | Low (`pnpm add lucide-react`, swap glyphs) |
| 2 | **No Framer Motion** — all motion is CSS `transition: 0.2s ease` | Disqualifying | Medium (install + refactor micro-interactions) |
| 3 | **Placeholder content shipped** — stat cards say "Placeholder stat — replace with sourced figure," feature rows use `placehold.co`, logo carousel uses emoji | Disqualifying | Low (replace content) — needs real data |
| 4 | **No component primitives** — no shadcn/ui, no Radix; modals/dialogs/dropdowns/toasts/tabs/tooltip/combobox all missing or hand-rolled | High | High (full primitive layer build-out) |
| 5 | **Dashboard has no charts** — multi-location org-dashboard is a raw `<table>` with no trend viz | High | Medium (install Recharts, build 3 chart types) |
| 6 | **No skeleton loaders** — every loading state is "Saving…" / "Drafting…" text | High | Low (Skeleton primitive + Suspense boundaries) |
| 7 | **No empty-state illustrations** — plain "No reviews yet" text everywhere | High | Medium (commission illustration set) |
| 8 | **Marketing nav has no mobile menu** — `nav-links` is `hidden md:flex` with no hamburger | High | Low (add drawer) |
| 9 | **App nav mobile is horizontal overflow scroll** — not a premium pattern | High | Medium (bottom tab bar + drawer) |
| 10 | **`/solutions/[slug]` pages are orphaned** — no nav or footer links to them | High (SEO) | Low (add to footer + nav dropdown) |
| 11 | **`/vs/birdeye` and `/vs/podium` have no header/footer** — dead-end pages | Medium | Low (wrap in marketing layout) |
| 12 | **Login page has zero brand context** — bare form on dark background | Medium | Low (add logo + tagline + back link) |
| 13 | **Native checkboxes instead of switches** — Settings page uses `<input type="checkbox">` | Medium | Low (Switch primitive) |
| 14 | **No dark/light toggle** — locked to dark mode; paper sections are jarring alternating strips | Medium | Medium (CSS variables + `prefers-color-scheme`) |
| 15 | **Color system leaks Tailwind defaults** — `green-400`, `green-500` used inline; no semantic tokens | Medium | Low (extend `tailwind.config.ts`) |

---

## 14. Top 10 Premium Touches to Add (Specific, with Examples)

### 1. Linear-style command palette (Cmd+K)
Fuzzy-search across all pages, recent reviews, recent requests, settings, and docs. Triggered by `⌘K` globally. Uses `cmdk` library (shadcn/ui wraps this). Linear's palette is the gold standard — sticky at top, keyboard-navigable, recent items section, action shortcuts.

### 2. Stripe-style animated gradient mesh hero background
Replace the flat `bg-ink` hero with a layered animated mesh: 2–3 radial gradients (`radial-gradient(at 20% 30%, rgba(200,155,60,0.15), transparent 50%)`) that slowly drift via `@keyframes`. Add a subtle SVG grain overlay (`<svg filter="url(#noise)">`) at 4% opacity. Stripe's homepage hero does exactly this — it's the difference between "flat dark" and "alive dark."

### 3. Vercel-style geometric logo grid
Replace the 8 emoji-in-square fake logos with real SVG customer logos, rendered in `grayscale opacity-60` by default, transitioning to full color + `opacity-100` on hover. Vercel's customer logo strip is the reference. Use a CSS grid (not a carousel) — carousels feel cheap, grids feel permanent.

### 4. Linear-style glassmorphic sticky nav with gradient border
Add a 1px gradient border to the bottom of the nav: `border-image: linear-gradient(to right, transparent, rgba(200,155,60,0.3), transparent) 1`. Combine with `backdrop-blur-xl bg-ink/70`. On scroll, shrink the nav from `py-4` to `py-2` via Framer Motion `useScroll`. Linear's nav is the reference.

### 5. Framer-style 3D product mockup with parallax
The hero demo card should respond to scroll and mouse: tilt slightly on mouse move (CSS `perspective` + `transform: rotateX/Y` based on cursor position), parallax drift on scroll (Framer Motion `useTransform(scrollY, [0, 500], [0, -40])`). Framer's hero phone mockup is the reference.

### 6. Cal.com-style generous whitespace + content-first cards
Increase section padding from `py-20` (80px) to `py-32 lg:py-40` (128–160px). Increase card padding from `p-5` (20px) to `p-8 lg:p-10` (32–40px). Cal.com's pricing and feature sections feel expensive because of negative space — give the content room to breathe.

### 7. Stripe-style animated stat counters with tabular numerals
The current `StatCounter` is functional but jittery (numbers shift width as they count). Add `font-variant-numeric: tabular-nums` and a spring-based ease-out curve. Stripe's homepage stat row does this — the numbers feel weighted and final, not jumpy.

### 8. Mercury-style custom empty-state illustrations
Commission a set of 6–8 illustrations in the storefront-signage mood (warm, hand-drawn, pine + brass palette). Use them in: empty review list, empty request list, onboarding step headers, 404/500 pages, "no search results." Mercury's empty states are the reference — friendly, on-brand, never generic.

### 9. Arc-style playful micro-interactions
- Buttons: `whileHover={{ y: -2 }}` + `whileTap={{ scale: 0.97 }}` with spring `{ stiffness: 400, damping: 25 }`.
- Cards: `whileHover={{ y: -4 }}` + subtle border glow.
- Magnetic buttons: track mouse position within the button, translate by 20% of the offset, spring back on mouse leave.
- Star ratings: each star `whileHover={{ scale: 1.2, rotate: 5 }}` with stagger.
Arc's button hover feel is the reference — playful, springy, alive.

### 10. Notion-style keyboard shortcut hints
Add `⌘K` (command palette), `⌘/` (show shortcuts), `G then D` (go to dashboard), `G then R` (go to reviews), `?` (help). Render with proper `<kbd>` styling: `rounded border border-cream/20 bg-ink-3 px-1.5 py-0.5 font-mono text-xs`. Show a shortcuts modal on `?`. Notion and Linear both do this — it signals "built for power users."

---

## 15. Reference Design Inspirations

| Site | What to borrow |
|---|---|
| **Linear** (linear.app) | Glassmorphic sticky nav with gradient border; command palette pattern; spring-based micro-interactions; `IBM Plex Mono` accents (already present — double down); dark-mode polish; tight `letter-spacing: -0.02em` display type (already present); the way their hero headline is 64–72px with a colored accent span (mirror this exactly). |
| **Vercel** (vercel.com) | Geometric logo grid (grayscale → color on hover); monochrome + single-accent color discipline; sharp typography hierarchy with H1 → H2 → H3 → body clearly stepped; the way their nav shrinks on scroll; the way their footer is dense but legible. |
| **Stripe** (stripe.com) | Animated gradient mesh hero background (the single most-copied premium touch of the last 5 years); tabular numerals on stats; editorial layout with generous side margins; the way their pricing page has a "most popular" card with a floating badge (already present — refine); animated count-up stats with spring ease. |
| **Framer** (framer.com) | 3D product mockup in hero with mouse-parallax tilt; vibrant gradient accents (brass-on-pine is already vibrant — push it further); bold display type at 72–96px; scroll-tied transforms on every section; the way their CTAs have a subtle inner glow. |
| **Cal.com** (cal.com) | Open-source polish; generous whitespace (py-32+); content-first cards with subtle borders; dark/light toggle done right; the way their settings page is split into sub-routes with a left nav; the way their empty states have illustrations. |
| **Mercury** (mercury.com) | Editorial illustration-led storytelling; pastel accent colors used sparingly; friendly copywriting paired with custom illustrations; the way their feature rows alternate copy-left/visual-right with hand-drawn mockups (replace your `placehold.co` images with this style). |
| **Arc Browser** (arc.net) | Playful glass UI; custom illustration style for empty states and onboarding; vibrant gradient accents; friendly micro-copy in tooltips; the way their onboarding has personality (your onboarding is currently a bare 3-step form — add Arc-style warmth). |

---

## 16. Component-by-Component Redesign Priorities

| Component | Current State | Premium Target | Priority | Effort |
|---|---|---|---|---|
| **Button** | 1 variant, flat, no focus ring | shadcn/ui Button with 5 variants × 4 sizes, icon slots, loading spinner, focus-visible ring, `whileTap` spring | **P0** | Low |
| **Input** | Bare `<input>` with sibling `<label>` | shadcn/ui Input with label, helperText, error, leftIcon, rightSlot, char counter, autofill fix | **P0** | Low |
| **Card** | `rounded-xl border bg-ink-2 p-5` | Card primitive with Header/Title/Content/Footer subcomponents, hover-lift variant, gradient-border variant | **P0** | Low |
| **Badge** | Inline `<span>` with ad-hoc colors | Badge primitive with 6 variants (default/secondary/success/warning/danger/outline) × 2 sizes | **P0** | Low |
| **Modal/Dialog** | None | Radix Dialog with overlay blur, AnimatePresence enter/exit, focus trap, Esc-to-close | **P0** | Medium |
| **Dropdown Menu** | None (account menu is `absolute`) | Radix DropdownMenu with items, separators, labels, keyboard nav | **P0** | Medium |
| **Toast** | None (inline errors) | Sonner or Radix Toast with stacked queue, swipe-to-dismiss, action buttons | **P0** | Low |
| **Tabs** | Hand-rolled with `setTab` | Radix Tabs with ARIA, keyboard nav, animated underline (`layoutId`) | **P1** | Low |
| **Tooltip** | None (LiveDemo uses `absolute` box) | Radix Tooltip with delay, arrow, AnimatePresence | **P1** | Low |
| **Switch** | Native `<input type="checkbox">` | Radix Switch with spring animation, on/off labels | **P1** | Low |
| **Accordion** | Hand-rolled `+` rotate | Radix Accordion with height animation, ARIA, multiple/single mode | **P1** | Low |
| **Skeleton** | None | `Skeleton` primitive (`animate-pulse rounded bg-cream/10`) | **P0** | Low |
| **Avatar** | Initials in gradient circle | shadcn/ui Avatar with image, fallback initials, size variants | **P1** | Low |
| **DataTable** | Raw `<table>` | TanStack Table + shadcn/ui DataTable with sort/filter/pagination/selection/sticky header | **P1** | High |
| **Command Palette** | None | `cmdk` + shadcn/ui Command with fuzzy search, recent items, action shortcuts | **P1** | Medium |
| **Sheet/Drawer** | None | Radix Sheet for mobile nav, filters, quick-add forms | **P1** | Medium |
| **Combobox** | Native `<select>` | Radix Combobox with search, multi-select option | **P2** | Medium |
| **Popover** | None | Radix Popover for color pickers, date pickers, rich filters | **P2** | Medium |
| **ReviewCard** | Functional but utilitarian | Add: avatar, relative timestamp, review URL link, "view on Google" link, char counter on draft, 3-variant draft picker, undo on post, optimistic update with rollback | **P0** | High |
| **StatCounter** | Functional, jittery | Add: `tabular-nums`, spring ease, unit suffix, trend indicator (+12% vs last month), sparkline | **P1** | Medium |
| **LogoCarousel** | Emoji-in-square fakes | Replace with real SVG logos, grayscale → color on hover, CSS grid (not carousel) | **P0** | Medium |
| **TestimonialCarousel** | `translateX` jump | Add: drag-to-advance, AnimatePresence on slide change, real photos or illustrated avatars | **P1** | Medium |
| **LiveDemo** | Functional, clever funnel | Add: drag-to-reorder stars, variant picker (3 drafts), tone slider, shareable permalink | **P2** | High |
| **BeforeAfter** | `display: none` swap | Add: AnimatePresence on tab switch, side-by-side compare mode, draggable timeline scrubber | **P2** | Medium |
| **PricingToggle** | Pill toggle, no spring | Add: Framer Motion `layoutId` for the active pill background, "Save $X" badge animation | **P2** | Low |
| **AppNav** | Top nav + horizontal-scroll mobile | Add: scroll-shrink behavior, gradient border, command palette trigger, mobile bottom tab bar | **P0** | Medium |
| **ScrollReveal** | IntersectionObserver + CSS | Replace with Framer Motion `whileInView` + `viewport={{ once: true }}` + stagger | **P1** | Low |

---

## 17. Color Palette Recommendation (Premium Dark + Light)

### Dark mode (primary — keep the pine/brass/cream identity, refine it)

```css
:root {
  /* Surfaces — 5-step elevation scale (currently only 3) */
  --bg:              #0A0F0C;  /* true near-black green-ink (deeper than current #13261D) */
  --bg-elevated-1:   #131A16;  /* cards (was #1C3327, slightly cool) */
  --bg-elevated-2:   #1B2520;  /* nested cards / inputs (was #24402F) */
  --bg-elevated-3:   #232F29;  /* hover states */
  --bg-overlay:      rgba(10, 15, 12, 0.80);  /* nav backdrop-blur */

  /* Borders — opacity-based for adaptive blending */
  --border:          rgba(245, 242, 234, 0.08);
  --border-strong:   rgba(245, 242, 234, 0.14);
  --border-accent:   rgba(212, 162, 74, 0.40);

  /* Text — 4-step hierarchy (was only 2) */
  --text-primary:    #F5F2EA;  /* was cream #F6F1E4 — slightly warmer */
  --text-secondary:  #B8BEB3;  /* was cream-dim #CFC9B4 — better contrast */
  --text-tertiary:   #8A908A;  /* new — for captions, timestamps */
  --text-quaternary: #5C6360;  /* new — for disabled, placeholders */

  /* Brand accent — refined brass (slightly more saturated) */
  --accent:          #D4A24A;  /* was #C89B3C */
  --accent-hover:    #E0B25A;  /* was #E0BC6E */
  --accent-muted:    rgba(212, 162, 74, 0.12);

  /* Semantic — proper token system (currently leaks green-400 etc) */
  --success:         #4ADE80;
  --success-muted:   rgba(74, 222, 128, 0.12);
  --warning:         #FBBF24;
  --warning-muted:   rgba(251, 191, 36, 0.12);
  --danger:          #F87171;  /* was coral #E8604A — coral is fine for marketing, this is for UI errors */
  --danger-muted:    rgba(248, 113, 113, 0.12);
  --info:            #60A5FA;
  --info-muted:      rgba(96, 165, 250, 0.12);

  /* Keep coral for marketing-only accent (star ratings, awning stripe) */
  --coral:           #E8604A;  /* unchanged */
}
```

### Light mode (new — currently doesn't exist)

```css
:root[data-theme="light"] {
  /* Surfaces */
  --bg:              #FAF7F0;  /* warm off-white, warmer than pure white */
  --bg-elevated-1:   #FFFFFF;  /* cards */
  --bg-elevated-2:   #F2EDE0;  /* nested cards / inputs */
  --bg-elevated-3:   #E8E2D0;  /* hover states */
  --bg-overlay:      rgba(250, 247, 240, 0.85);

  /* Borders */
  --border:          rgba(19, 38, 29, 0.08);
  --border-strong:   rgba(19, 38, 29, 0.14);
  --border-accent:   rgba(180, 130, 50, 0.40);

  /* Text */
  --text-primary:    #13261D;  /* ink */
  --text-secondary:  #4A5A4F;
  --text-tertiary:   #6E756C;
  --text-quaternary: #9CA39E;

  /* Brand accent — slightly darker for contrast on light */
  --accent:          #A87820;
  --accent-hover:    #8A621A;
  --accent-muted:    rgba(168, 120, 32, 0.10);

  /* Semantic */
  --success:         #16A34A;
  --success-muted:   rgba(22, 163, 74, 0.10);
  --warning:         #D97706;
  --warning-muted:   rgba(217, 119, 6, 0.10);
  --danger:          #DC2626;
  --danger-muted:    rgba(220, 38, 38, 0.10);
  --info:            #2563EB;
  --info-muted:      rgba(37, 99, 235, 0.10);

  --coral:           #E8604A;  /* unchanged */
}
```

### Gradients (new — currently none defined)

```css
--gradient-mesh-hero:    radial-gradient(at 20% 30%, rgba(212,162,74,0.15), transparent 50%),
                        radial-gradient(at 80% 70%, rgba(232,96,74,0.10), transparent 50%),
                        radial-gradient(at 50% 50%, rgba(74,222,128,0.05), transparent 50%);
--gradient-border:       linear-gradient(to right, transparent, rgba(212,162,74,0.4), transparent);
--gradient-accent:        linear-gradient(135deg, #D4A24A 0%, #E0B25A 100%);
--gradient-card-hover:    linear-gradient(135deg, rgba(212,162,74,0.05), rgba(232,96,74,0.03));
```

### Shadows (new — currently leaks Tailwind defaults)

```css
--shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.10);
--shadow-md:    0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-lg:    0 12px 32px rgba(0, 0, 0, 0.20);
--shadow-xl:    0 24px 64px rgba(0, 0, 0, 0.30);
--shadow-glow:  0 0 0 4px rgba(212, 162, 74, 0.12), 0 8px 24px rgba(0, 0, 0, 0.20);
```

---

## 18. Typography Recommendation

### Display (headlines, hero)
**Recommended:** **Geist** (Vercel's open-source font, free, designed for UI) or **Satoshi** (Fontshare, free, geometric).
**Current:** Space Grotesk — keep as fallback, but Geist has better optical sizing and a tighter, more "Linear/Vercel" feel.

```css
font-family: 'Geist', 'Space Grotesk', sans-serif;
font-feature-settings: 'ss01', 'ss02';  /* stylistic sets */
font-variation-settings: 'opsz' 32;      /* optical size */
```

### Body (paragraphs, UI text)
**Recommended:** **Inter** (keep — proven, free, designed for UI).
**Add:** `font-feature-settings: 'cv11', 'ss01'` for the alternate single-storey `a` and `g` (Vercel and Linear both enable these).

### Mono (stats, prices, labels, code)
**Recommended:** **JetBrains Mono** or **Geist Mono**.
**Current:** IBM Plex Mono — fine, but JetBrains Mono has better readability at small sizes and Geist Mono matches the display font.
**Add:** `font-variant-numeric: tabular-nums` on all stat/price displays.

### Editorial accent (new — Stripe-style)
**Recommended:** **Instrument Serif** (free, Google Fonts) for occasional editorial moments — pull quotes in testimonials, the final-cta headline, the marketing hero subhead.

```css
.editorial { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; }
```

### Type scale (new — fluid, clamp-based)

```css
--text-xs:    0.75rem;     /* 12px */
--text-sm:    0.875rem;    /* 14px */
--text-base:  1rem;        /* 16px */
--text-lg:    1.125rem;    /* 18px */
--text-xl:    clamp(1.25rem, 1.2vw + 1rem, 1.5rem);     /* 20–24px */
--text-2xl:   clamp(1.5rem, 1.5vw + 1rem, 2rem);        /* 24–32px */
--text-3xl:   clamp(2rem, 2vw + 1rem, 2.5rem);          /* 32–40px */
--text-4xl:   clamp(2.5rem, 3vw + 1rem, 3.5rem);        /* 40–56px */
--text-5xl:   clamp(3.25rem, 5vw + 1rem, 5rem);         /* 52–80px */
--text-6xl:   clamp(4rem, 7vw + 1rem, 6rem);            /* 64–96px */
```

This replaces the current hard-coded `text-4xl` (36px) section headings with fluid scaling that hits 56px on desktop — closer to the Linear/Vercel/Stripe hero scale.

---

## 19. Motion / Interaction Recommendation

### Install
```bash
pnpm add framer-motion
pnpm add lucide-react
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-switch @radix-ui/react-accordion @radix-ui/react-popover @radix-ui/react-avatar @radix-ui/react-toast
pnpm add cmdk          # command palette
pnpm add sonner        # toasts (or use radix)
pnpm add recharts      # charts
pnpm add @tanstack/react-table  # data tables
```

### Spring config (project-wide standard)
```ts
// lib/motion.ts
export const springSoft    = { type: "spring", stiffness: 200, damping: 30, mass: 0.8 };
export const springMedium  = { type: "spring", stiffness: 300, damping: 25, mass: 0.8 };
export const springSnappy  = { type: "spring", stiffness: 400, damping: 25, mass: 0.6 };
export const springBouncy  = { type: "spring", stiffness: 500, damping: 15, mass: 0.5 };

export const revealVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: springMedium },
};

export const staggerContainer = {
  hidden:  { },
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
```

### Specific patterns to adopt

**1. Scroll reveal (replace ScrollReveal.tsx)**
```tsx
<motion.div
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: "-40px" }}
  variants={revealVariants}
>
```

**2. Stagger children**
```tsx
<motion.div initial="hidden" whileInView="visible"
  viewport={{ once: true }} variants={staggerContainer}>
  {items.map(item => <motion.div key={item.id} variants={revealVariants} />)}
</motion.div>
```

**3. AnimatePresence on tabs / modals / accordions**
```tsx
<AnimatePresence mode="wait">
  {tab === "quick" && (
    <motion.div key="quick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }} transition={springMedium}>
      {/* quick add form */}
    </motion.div>
  )}
</AnimatePresence>
```

**4. Magnetic button**
```tsx
function MagneticButton({ children, ...props }) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, springBouncy);
  const sy = useSpring(y, springBouncy);
  function onMove(e) {
    const rect = ref.current!.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.2);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.2);
  }
  function onLeave() { x.set(0); y.set(0); }
  return (
    <motion.button ref={ref} style={{ x: sx, y: sy }}
      onMouseMove={onMove} onMouseLeave={onLeave}
      whileTap={{ scale: 0.97 }} {...props}>
      {children}
    </motion.button>
  );
}
```

**5. Scroll-linked hero parallax**
```tsx
const { scrollY } = useScroll();
const heroY = useTransform(scrollY, [0, 600], [0, -80]);
const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
const heroScale = useTransform(scrollY, [0, 600], [1, 0.95]);

<motion.div style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}>
  {/* hero content */}
</motion.div>
```

**6. Layout animation on ReviewCard state change**
```tsx
<motion.div layout>
  <AnimatePresence mode="wait">
    {status === "replied" ? (
      <motion.div key="replied" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}>
        {/* posted reply view */}
      </motion.div>
    ) : (
      <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}>
        {/* draft editor */}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

**7. Tab indicator with `layoutId`**
```tsx
{tabs.map(tab => (
  <button onClick={() => setActive(tab.id)}>
    {active === tab.id && (
      <motion.div layoutId="tab-indicator" className="absolute inset-0 bg-brass"
        transition={springMedium} />
    )}
    <span className="relative z-10">{tab.label}</span>
  </button>
))}
```

**8. Reduced motion**
```tsx
// lib/motion.ts
import { useReducedMotion } from "framer-motion";
export function useMotionConfig() {
  const reduced = useReducedMotion();
  return reduced ? { initial: false, animate: undefined } : { /* normal config */ };
}
```

---

## 20. Mobile-First Redesign Priorities

### P0 (must-have for premium mobile feel)
1. **Replace marketing nav `hidden md:flex` with a hamburger → full-screen drawer.** Framer Motion slide-down with staggered link reveal. The drawer should cover the full viewport with a close button top-right and the CTA button at the bottom.
2. **Replace app nav horizontal-scroll with a bottom tab bar on mobile.** 4 items (Dashboard / Reviews / Requests / Settings), 56px tall, fixed bottom, with the active item highlighted in brass. Billing accessible from the avatar menu.
3. **Add `viewport-fit=cover` and safe-area insets** (`env(safe-area-inset-bottom)` on the bottom tab bar; `env(safe-area-inset-top)` on the sticky nav).
4. **Add `<meta name="theme-color" content="#0A0F0C">`** to root layout.
5. **Increase all tap targets to `min-h-[44px] min-w-[44px]`** — current nav links on mobile are `py-1.5` (~28px tall).
6. **Add a sticky bottom CTA bar on the landing page** on mobile (`lg:hidden`): "Start your 14-day free trial" full-width, dismissible.

### P1 (polish for premium mobile feel)
7. **Replace native `<select>` business picker** with a custom bottom-sheet picker (Radix Sheet) on mobile.
8. **Add pull-to-refresh** on `/reviews` and `/requests` lists (Framer Motion drag with `drag="y"` constraint).
9. **Make the hero typewriter demo responsive** — on `< 400px` screens, the nested `rounded-xl p-4` cards should reduce to `p-3`, and the `font-mono text-xs` labels to `text-[10px]`.
10. **Add `overscroll-behavior: contain`** to scrollable lists (reviews, requests) to prevent body scroll bleed.
11. **Make tables collapse to cards on mobile** — the org-dashboard leaderboard and the vs/birdeye/vs/podium comparison tables should render as stacked cards on `< 640px` screens, not horizontal-scroll.

### P2 (delight for premium mobile feel)
12. **Add haptic feedback** (via `navigator.vibrate(10)` on button tap, where supported).
13. **Add a long-press context menu** on review cards (Pin / Mark as read / Share).
14. **Add swipe-to-act** on review request list items (swipe right = "Resend", swipe left = "Delete").
15. **Add a "share to home screen" prompt** via PWA manifest (`app/manifest.ts`).

---

## 21. Summary: Path to "$50k Design Budget" Feel

**Phase 1 (1–2 days, lowest effort, highest impact):**
- Install `lucide-react` and replace every unicode/emoji icon.
- Replace `placehold.co` images with real screenshots or illustrated mockups.
- Replace emoji logo carousel with real SVG logos in a CSS grid.
- Remove "Placeholder stat — replace with sourced figure" tags (replace with sourced stats or remove the claim).
- Add `<meta name="theme-color">`, `viewport-fit=cover`, safe-area insets.
- Add a mobile hamburger drawer to the marketing nav.

**Phase 2 (3–5 days, foundation):**
- Install `framer-motion`. Refactor `ScrollReveal`, button hovers, card hovers, tab switches, modal/dropdown open/close.
- Install shadcn/ui + Radix primitives. Build Button, Input, Card, Badge, Modal, Dropdown, Toast, Tabs, Switch, Accordion, Tooltip, Skeleton.
- Replace native checkboxes with Switch. Replace native `<select>` with Combobox.
- Add skeleton loaders on dashboard, reviews, requests, billing.
- Add toast notifications (Sonner) for all async errors and successes.
- Add empty-state illustrations (commission or use a service like unDraw / Storyset, recolored to brand).

**Phase 3 (5–7 days, signature touches):**
- Add command palette (Cmd+K).
- Add gradient mesh hero background + grain overlay.
- Add scroll-linked hero parallax (demo card drifts on scroll).
- Add magnetic buttons on primary CTAs.
- Add `layoutId` tab indicator on PricingToggle, BeforeAfter, RequestsManager.
- Add Recharts trend chart on dashboard (reviews over time) and org-dashboard (response rate by location).
- Add dark/light mode toggle with `prefers-color-scheme` + localStorage persistence.
- Redesign ReviewCard with avatar, relative timestamp, char counter, 3-variant draft picker, undo.

**Phase 4 (3–5 days, polish):**
- Bottom tab bar on mobile app.
- Mobile bottom-sheet pickers.
- Custom 404/500/error-boundary pages.
- Onboarding redesign (keep logo, add Arc-style warmth, add "skip for now").
- Login redesign (logo + tagline + SSO buttons + back-to-home).
- Add OG image + favicon system.
- Add `prefers-reduced-motion` handling throughout.

**Total: ~12–19 days of focused design work to reach Linear/Vercel/Stripe quality.** The brand direction is right — the execution needs the dependencies, primitives, and motion layer that every premium SaaS ships today.

---

*End of audit. Report saved at `/home/z/my-project/audit-design.md`. Worklog entry appended to `/home/z/my-project/worklog.md` under Task ID `audit-4`.*

# ReviewReply Enterprise — Full QA, Content & Security Audit Report

**Audit Date:** August 7, 2026
**Auditor:** Senior QA Engineer + Security Auditor
**Environment:** Local development (Next.js 16, React 19, Prisma 6, Tailwind 4)
**App URL:** http://localhost:3000

---

## 1. Executive Summary

**Overall Health Score: 6.5 / 10** — The app is structurally complete (24 pages, 14 API routes, real LLM integration) but has significant gaps in security, content completeness, and button functionality that block a commercial launch.

### Setup & Stack Confirmation
- **Stack:** Next.js 16.1.1, React 19, Prisma 6.11, Tailwind CSS 4, SQLite (via Prisma)
- **Setup:** App was already running on port 3000. Dependencies installed via `bun install`. Database via Prisma (`bun run db:push` + seed script).
- **Blockers:** None for local dev. The `fullstack-dev` skill auto-starts the dev server.
- **Real LLM:** Confirmed working — z-ai-web-dev-sdk (GLM-4.6) generates contextually relevant AI drafts.

### Top 5 Most Critical Issues

1. **CRITICAL — No authentication on any route:** Every page (including `/admin` and `/api/admin`) is accessible without login. Any visitor can see all user data, all reviews, and the full admin dashboard with MRR, user counts, and revenue.
2. **CRITICAL — Export API exposes all data without auth:** `/api/export?type=reviews` returns a CSV of every review, reply, and business name in the database — no login required.
3. **HIGH — Blog post links all 404:** All 6 blog "Read more" links point to `/blog/[slug]` routes that don't exist. Users hit a 404 page.
4. **HIGH — All help center article links are dead:** 30+ help article titles link to `href="#"` — clicking does nothing.
5. **HIGH — Misleading marketing claims:** Landing page claims "Powered by Claude 3.5" but the app uses GLM-4.6. Claims "7,200+ businesses" but DB has 6. Claims "SOC2-ready" but compliance page says "In Progress." Claims "26 languages" but no language detection exists.

---

## 2. Issue Table

| ID | Page/Flow | Issue | Severity | Steps to Reproduce | Suggested Fix |
|----|-----------|-------|----------|-------------------|---------------|
| SEC-01 | All app routes (`/dashboard`, `/inbox`, `/admin`, etc.) | **No authentication required.** Every page renders fully without login. `/admin` shows total users, MRR, revenue, trial users. | Critical | Visit `http://localhost:3000/admin` or `/dashboard` in incognito — full data loads. | Add Next.js middleware to check session cookie on all `/dashboard`, `/inbox`, `/admin`, etc. routes. Redirect to `/login` if no session. |
| SEC-02 | `/api/admin`, `/api/dashboard`, `/api/inbox`, `/api/export` | **API routes have no auth.** Anyone can fetch all reviews, all user data, export CSV, and see admin stats without login. | Critical | `curl http://localhost:3000/api/admin` returns full platform stats. `curl http://localhost:3000/api/export?type=reviews` downloads all reviews as CSV. | Add session check to every API route. Return 401 if no valid session. |
| SEC-03 | All responses | **Missing security headers.** No CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, or Permissions-Policy. | Critical | `curl -sI http://localhost:3000/` — no security headers present. | Add `next.config.ts` `headers()` config with all security headers. |
| SEC-04 | All responses | **`X-Powered-By: Next.js` header exposed.** Reveals framework to attackers. | Medium | `curl -sI http://localhost:3000/ | grep X-Powered-By` | Set `poweredByHeader: false` in `next.config.ts`. |
| CONT-01 | `/blog` | **All 6 blog "Read more" links 404.** Links point to `/blog/[slug]` but no dynamic route exists. | High | Click any "Read more" on `/blog` → 404 page. Verified: `/blog/how-ai-is-transforming-review-management` returns 404. | Create `src/app/blog/[slug]/page.tsx` dynamic route that renders the full post content. |
| CONT-02 | `/help` | **All 30+ help article links are dead.** Every article title has `href="#"`. | High | Click any article title on `/help` — nothing happens. Verified in HTML: `href="#"` for all articles. | Create `src/app/help/[slug]/page.tsx` dynamic route OR make articles expand inline (accordion). |
| CONT-03 | Landing page nav | **"Solutions" nav link points to `#solutions` but no section with `id="solutions"` exists.** | Medium | Click "Solutions" in nav — nothing happens. | Add `id="solutions"` to the bento features section OR remove the "Solutions" nav item. |
| CONT-04 | Landing page | **Misleading "Powered by Claude 3.5" claim.** App actually uses GLM-4.6 via z-ai-web-dev-sdk. The inbox drawer, landing hero, login page, and blog all say "Claude 3.5 Sonnet." | High | Read landing page, login page, inbox drawer, blog post — all say Claude 3.5. Actual model: `glm-4.6-real`. | Either (a) integrate real Anthropic Claude API, or (b) update all copy to say "GLM-4.6" or "AI-powered" without naming Claude. |
| CONT-05 | Landing page | **"7,200+ businesses" claim is false.** Actual DB has 6 businesses (seed data). | High | Visit `/admin` — shows real count. Landing says 7,200+. | Remove the specific number until real traction exists, or use "Join growing businesses" language. |
| CONT-06 | Landing page + `/compliance` | **"SOC2-ready" contradicts compliance page.** Landing says SOC2-ready; compliance page says "In Progress." | Medium | Compare landing footer "SOC2-ready" badge with `/compliance` overview tab showing "SOC2 Type I: In Progress." | Align both to "SOC2 in progress" until audit is complete. |
| CONT-07 | Landing page + `/status` | **"99.9% uptime" vs status page "99.98%".** Inconsistent numbers. | Low | Compare landing footer with `/status` page. | Pick one number and use it consistently. |
| CONT-08 | Landing page + pricing | **"26 languages supported" claim is vaporware.** No language detection in AI draft route. | High | Check `/api/reviews/[id]/draft` — no language detection, no multi-language support. | Either add language detection + multi-language draft generation, or remove the "26 languages" claim. |
| CONT-09 | Landing page | **"AI Brand Voice Training" claim — no training UI exists.** Settings has no Brand Voice tab. | High | Visit `/settings` — no brand voice training interface. The draft route uses a static system prompt, not a trained profile. | Add a Brand Voice training UI to Settings, or remove the claim. |
| CONT-10 | Landing page | **"WhatsApp / Apple Business Chat" claim — not supported.** Campaign builder only has SMS/Email/QR. | Medium | Open campaign builder — no WhatsApp or Apple Chat channel. | Remove from comparison table and feature list until implemented. |
| CONT-11 | Landing page | **"Local SEO + Schema Markup" claim — no feature exists.** No `/local-seo` page, no schema generator. | Medium | Search for SEO/schema routes — none exist. | Remove from feature list, or build the feature. |
| CONT-12 | Landing page | **"Public API + Webhooks" claim — no API docs, no API key management.** | Medium | No `/api-docs`, no API key UI in settings. | Remove claim or build API key management + docs page. |
| UX-01 | `/dashboard`, `/inbox`, `/analytics`, etc. | **No error state.** If API fails, `data` is null and the page renders blank between topbar and bottom nav. | High | Stop the DB or break the API → page shows nothing, no error message. | Add an error state: `if (!loading && !data) return <ErrorState onRetry={fetch} />`. |
| UX-02 | All app pages (topbar) | **"New campaign" button is dead.** The topbar button has no `onClick` on every page except `/campaigns`. | High | Click "New campaign" in topbar on `/dashboard`, `/inbox`, `/analytics`, etc. — nothing happens. | Add `onClick` that opens the CampaignBuilder modal (import it on every page, or make the topbar a shared component with state). |
| UX-03 | All app pages (topbar) | **"All businesses" button is dead.** No `onClick` handler. | Medium | Click "All businesses" in topbar — nothing happens. | Add a dropdown or modal to switch businesses. |
| UX-04 | Sidebar | **"Upgrade plan" button is dead.** No `onClick` handler. | Medium | Click "Upgrade plan" in sidebar — nothing happens. | Add `onClick` that navigates to `/billing`. |
| UX-05 | `/admin` | **All 4 "Admin Actions" buttons are dead.** "Extend trial", "Manage plans", "View audit log", "Send broadcast" — no `onClick`. | Medium | Click any admin action button — nothing happens. | Add `onClick` handlers (modals or route navigation). |
| UX-06 | `/agency` | **All buttons are dead.** "Configure" (white-label), "Add client", bulk actions — none have `onClick`. | Medium | Click any button on `/agency` — nothing happens. | Add `onClick` handlers. |
| UX-07 | `/contact` | **Contact form is fake.** `handleSubmit` does `setTimeout` and shows success toast — no email sent, no DB record, no API call. | High | Fill form, submit — shows "Sent!" but nothing happens. | Create `/api/contact` route that stores the message in DB and/or sends an email via Resend. |
| UX-08 | `/login` | **Google OAuth uses `window.prompt()`.** Not a real OAuth flow — asks user to type their Google email in a browser prompt dialog. | Medium | Click "Continue with Google" → browser prompt appears asking for email. | Implement real Google OAuth via NextAuth.js or the Google OAuth 2.0 flow. |
| UX-09 | No custom 404 page | **Next.js default 404.** No branded "not found" page. | Low | Visit `/nonexistent` — plain white 404. | Create `src/app/not-found.tsx` with branded design. |
| UX-10 | No error boundary | **No `error.tsx`.** Runtime errors show raw Next.js error page. | Medium | Trigger a runtime error → shows stack trace. | Create `src/app/error.tsx` with branded error page. |
| UX-11 | No loading state | **No `loading.tsx`.** Route transitions show blank page during load. | Low | Navigate between pages — brief blank flash. | Create `src/app/loading.tsx` with skeleton. |
| BUG-01 | Landing page, inbox, dashboard | **React key warnings — duplicate topic keys.** Console floods with "Encountered two children with the same key" errors. | Medium | Open browser console on landing page or inbox — dozens of key warnings. | Fix seed data to not duplicate topics, AND use `key={topic + index}` in `.map()` as a safety net. |
| BUG-02 | `/api/reviews/[id]/draft` | **Cached draft return crashes with `Cannot read properties of undefined (reading 'toISOString')`.** When returning a cached draft, `review.updatedAt` is sometimes undefined. | Medium | Generate a draft, then call the endpoint again without `forceRegenerate` — returns 500 error. | Fetch the review fresh before returning, or use `new Date().toISOString()`. |
| RESP-01 | Landing page | **Comparison table has `min-w-[700px]` — causes horizontal scroll on mobile.** | Medium | View landing page on 375px viewport — comparison table scrolls horizontally. | Make table responsive: stack columns vertically on mobile, or use a card layout. |
| RESP-02 | `/competitors` | **Benchmark table has `min-w-[640px]` — same mobile issue.** | Medium | View on mobile — horizontal scroll. | Same fix as RESP-01. |
| SEC-05 | `/api/auth/otp` | **OTP code returned in API response (`demoCode` field).** Anyone who can trigger an OTP send can see the code. | High | `curl -X POST /api/auth/otp -d '{"action":"send","email":"x@y.com"}'` → response includes `"demoCode":"317359"`. | Remove `demoCode` from the response. In dev mode only, log it server-side. Never expose in the API response. |
| SEC-06 | Session cookie | **Session is base64-encoded JSON, not signed/encrypted.** Anyone can forge a session by base64-encoding a JSON payload. | Critical | Read `src/lib/auth.ts` — `encodeSession` uses `Buffer.from(JSON.stringify(payload)).toString('base64')`. No signing, no encryption. | Use a proper JWT library (`jose` or `jsonwebtoken`) with a secret key, or use NextAuth.js. |
| SEC-07 | `/api/auth/google` | **Google "OAuth" accepts any email without verification.** No real Google token verification — the API just trusts the email from the request body. | High | `curl -X POST /api/auth/google -d '{"email":"admin@reviewreply.com"}'` — creates/logs in as that user. | Implement real Google OAuth with ID token verification, or remove the feature until ready. |

---

## 3. Severity Summary

| Severity | Count | Examples |
|----------|-------|----------|
| **Critical** | 4 | No auth on any route, no auth on any API, missing security headers, forgeable session |
| **High** | 10 | Blog 404s, dead help links, fake contact form, misleading Claude claim, no error states, dead topbar buttons, OTP in response, fake Google OAuth |
| **Medium** | 10 | Dead admin/agency buttons, mobile scroll, React key warnings, cached draft crash, X-Powered-By header, SOC2 inconsistency |
| **Low** | 3 | No 404 page, no loading state, uptime number inconsistency |

**Total findings: 27**

---

## 4. Content Completeness Audit

### Blog (`/blog`)
- ✅ 6 blog posts with full content (each has 5+ paragraphs of real, researched content)
- ❌ All "Read more" links 404 — no dynamic route exists

### Help Center (`/help`)
- ✅ 6 categories with 30 article titles
- ❌ All article links are `href="#"` — none go anywhere

### Footer Pages
- ✅ `/privacy` — full 13-section GDPR-compliant policy
- ✅ `/terms` — full 16-section terms of service
- ✅ `/about` — mission, story, values, stats
- ✅ `/contact` — form exists but is fake (no backend)
- ✅ `/status` — 8 services, 90-day uptime, incidents
- ✅ `/changelog` — 3 releases documented

### Marketing Claims vs Reality
| Claim | Reality | Status |
|-------|---------|--------|
| "Powered by Claude 3.5" | Uses GLM-4.6 | ❌ Misleading |
| "7,200+ businesses" | 6 in DB | ❌ False |
| "SOC2-ready" | "In Progress" on compliance page | ❌ Contradictory |
| "26 languages" | No language detection | ❌ Vaporware |
| "AI Brand Voice Training" | No training UI | ❌ Vaporware |
| "WhatsApp / Apple Business Chat" | Not in campaign builder | ❌ Vaporware |
| "Local SEO + Schema Markup" | No feature exists | ❌ Vaporware |
| "Public API + Webhooks" | No API docs or keys | ❌ Vaporware |
| "Unified Inbox (Google + FB + Yelp + Trustpilot + Apple Maps)" | Apple Maps not in sources | ⚠️ Partial |
| "99.9% uptime" | Status page says 99.98% | ⚠️ Inconsistent |

---

## 5. Security Audit Summary

### Critical Security Issues
1. **No authentication anywhere** — every page and API is publicly accessible
2. **Session tokens are forgeable** — base64 JSON, not signed
3. **OTP codes exposed in API responses** — `demoCode` field
4. **Google "OAuth" trusts any email** — no token verification

### Missing Security Headers
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
- Referrer-Policy
- Permissions-Policy

### Positive Findings
- ✅ No real API keys/secrets in the codebase (all use placeholder/dummy values)
- ✅ No SQL injection risk (Prisma parameterized queries)
- ✅ `.env` files not exposed (404)
- ✅ Source maps not exposed (404)
- ✅ No real payment credentials
- ✅ PII (passwords) stored as hashes (though weak — `demo_hash_` prefix)

---

## 6. Prioritized TODO / Backlog

### 🔴 Fix Before Anything Else Ships (Critical)

1. **[SEC-01] Add authentication middleware** — protect all `/dashboard`, `/inbox`, `/analytics`, `/campaigns`, `/settings`, `/widgets`, `/reports`, `/competitors`, `/agency`, `/billing`, `/compliance`, `/reviews`, `/admin` routes. Redirect to `/login` if no session.
2. **[SEC-02] Add auth to all API routes** — `/api/dashboard`, `/api/inbox`, `/api/analytics`, `/api/campaigns`, `/api/admin`, `/api/competitors`, `/api/integrations`, `/api/export`, `/api/reviews/[id]/draft`, `/api/reviews/[id]/approve` must all require a valid session.
3. **[SEC-03] Add security headers** — CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy in `next.config.ts`.
4. **[SEC-06] Sign session tokens** — replace base64 JSON with a proper JWT (use `jose` library).
5. **[SEC-05] Remove `demoCode` from OTP API response** — never expose OTP codes in API responses.

### 🟠 Fix Before Launch (High)

6. **[CONT-01] Create blog post dynamic routes** — `src/app/blog/[slug]/page.tsx` for all 6 posts.
7. **[CONT-02] Make help articles functional** — either dynamic routes or inline accordion.
8. **[CONT-04] Fix Claude claims** — update all copy to say "GLM-4.6" or "AI-powered" instead of "Claude 3.5."
9. **[CONT-05] Remove "7,200+ businesses" claim** — replace with honest language.
10. **[CONT-08] Remove "26 languages" claim** — or implement language detection.
11. **[CONT-09] Remove "Brand Voice Training" claim** — or build the feature.
12. **[UX-01] Add error states** — every page that fetches data needs a fallback UI for API failures.
13. **[UX-02] Fix topbar "New campaign" button** — add `onClick` to open CampaignBuilder modal on all pages.
14. **[UX-07] Make contact form functional** — create `/api/contact` route that stores messages.
15. **[SEC-07] Fix or remove Google OAuth** — implement real token verification or remove the button.

### 🟡 Fix Before Scale (Medium)

16. **[CONT-03] Fix "Solutions" nav anchor** — add `id="solutions"` or remove the link.
17. **[CONT-06] Align SOC2 messaging** — use "in progress" everywhere.
18. **[CONT-10] Remove WhatsApp/Apple Chat claims** — or add to campaign builder.
19. **[CONT-11] Remove Local SEO claim** — or build the feature.
20. **[CONT-12] Remove Public API claim** — or build API key management.
21. **[UX-03] Fix "All businesses" button** — add business switcher dropdown.
22. **[UX-04] Fix "Upgrade plan" button** — navigate to `/billing`.
23. **[UX-05] Fix admin action buttons** — add `onClick` handlers.
24. **[UX-06] Fix agency page buttons** — add `onClick` handlers.
25. **[UX-08] Replace Google `window.prompt`** — with real OAuth or a modal.
26. **[UX-10] Add error boundary** — `src/app/error.tsx`.
27. **[BUG-01] Fix React key warnings** — deduplicate topics in seed + use index in keys.
28. **[BUG-02] Fix cached draft crash** — use `new Date().toISOString()` instead of `review.updatedAt`.
29. **[RESP-01] Fix comparison table mobile** — responsive layout.
30. **[RESP-02] Fix competitor table mobile** — responsive layout.
31. **[SEC-04] Hide X-Powered-By header** — `poweredByHeader: false`.

### 🟢 Polish (Low)

32. **[UX-09] Create custom 404 page** — `src/app/not-found.tsx`.
33. **[UX-11] Add loading state** — `src/app/loading.tsx`.
34. **[CONT-07] Align uptime number** — use one consistent figure.

---

## 7. What's Working Well

- ✅ Real LLM integration (z-ai-web-dev-sdk) generates high-quality, contextually relevant drafts
- ✅ Premium design quality (glassmorphism, brass accents, dark theme)
- ✅ All 24 pages return HTTP 200
- ✅ All 14 API routes return HTTP 200
- ✅ Signup flow works end-to-end (creates user + org + business + seeds reviews)
- ✅ OTP login works (creates account for new users)
- ✅ Campaign builder creates real DB records
- ✅ CSV export works (file downloads correctly)
- ✅ Competitor add works (creates record)
- ✅ Integration connect/disconnect works (toggles state)
- ✅ Command palette (Cmd+K) works
- ✅ Footer pages have real, substantial content
- ✅ No real secrets exposed in codebase
- ✅ Mobile bottom tab bar works

---

## 8. Setup Documentation (De Facto)

### How to Run Locally

```bash
# 1. Install dependencies
bun install

# 2. Set up environment
cp .env.example .env  # (if exists, otherwise create manually)
# Minimum required: DATABASE_URL="file:./db/custom.db"

# 3. Set up database
bun run db:push    # Creates SQLite DB + schema
bun run scripts/seed.ts  # Seeds demo data (4 businesses, 119 reviews)

# 4. Start dev server
bun run dev        # Runs on port 3000

# 5. Access the app
# Open http://localhost:3000
# Demo login: owner@bamboogarden.com / any password
```

### Stack Summary
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Database:** Prisma + SQLite
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Auth:** Custom (base64 session cookie — needs JWT upgrade)
- **AI:** z-ai-web-dev-sdk (GLM-4.6)
- **Icons:** lucide-react
- **Fonts:** Inter, Space Grotesk, JetBrains Mono

---

**Audit complete. Awaiting your review before making any fixes.**

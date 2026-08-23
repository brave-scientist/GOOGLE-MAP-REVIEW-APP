# ReviewReply — Engineering & Product Master Roadmap
**Canonical Single Source of Truth for Architecture, Production State, and Future Execution**

- **Document Version:** 2.2.1 (Final Master Consistency & Traceability)
- **Date:** August 23, 2026
- **Author:** CTO / Principal Architect
- **Status:** CANONICAL PLANNING SOURCE — GOVERNANCE RATIFICATION REQUIRED
- **Target File Location:** `/ROADMAP.md` (Project Root)

---

## 0. Document Purpose & Forensic Baseline

This document is the **single authoritative source of truth** for the ReviewReply project. It replaces and supersedes all previous roadmaps, implementation plans, worklogs, and partial audit reports.

### Forensic Truth Statement:
- **The Audit & Forensic Reconstruction is COMPLETE.**
- **The Production Safety & Commercial Readiness is NOT COMPLETE.**
- **Canonical for Planning ≠ Production Launch Ready.** This document models both what is physically built today and the exact engineering path required before commercial traffic can be accepted.

---

## 1. Current Product Definition

ReviewReply is an AI-powered review management, customer feedback aggregation, and review acceleration platform.

### Core Value Proposition
- **Monitor & Ingest:** Ingest customer reviews from Google Business Profile, Facebook Pages, and manual sources.
- **AI-Powered Response Generation:** Contextually draft on-brand, sentiment-aware, policy-compliant review replies using LLM technology (with fallback heuristic logic) that respect individual brand voice guidelines and forbidden phrases.
- **One-Tap / Automated Publishing:** Enable business owners to review, edit, approve, and sync replies directly back to connected review platforms.
- **Review Generation & Acceleration:** Dispatch review requests via SMS (Twilio) and Email (Resend) with integrated opt-out/TCPA compliance, click-tracking redirect tokens (`/r/[token]`), and multi-platform review landing pages (`/review-us/[slug]`).
- **Multi-Location & Enterprise Governance:** Manage multiple business profiles under organizational hierarchies, support agency client views, competitor intelligence, embeddable review widgets, and compliance DSAR flows.

### Target Customer Segments
1. **Single-Location Small Businesses (SMB):** Restaurants, salons, medical/dental clinics, auto repair, local retail requiring zero-overhead review management.
2. **Multi-Location Regional Operators:** Franchisees and multi-unit brands needing centralized review response and brand voice uniformity.
3. **Marketing Agencies:** Service providers managing reputation and review campaigns on behalf of multiple client brands under a unified dashboard.

---

## 2. Current Architecture

The application is built on a modern, full-stack Next.js architecture hosted on Vercel/Node runtime with PostgreSQL persistence managed via Prisma ORM.

```
+--------------------------------------------------------------------------------------------------+
|                                      CLIENT INTERFACE LAYER                                      |
|  - Next.js 16.1 App Router (React 19, TypeScript 5)                                             |
|  - Tailwind CSS 4 + Radix UI Primitives (shadcn/ui) + Lucide Icons                              |
|  - Responsive Shell (Desktop Sidebar, Topbar, Mobile Bottom Tab Bar, Command Palette Cmd+K)     |
+--------------------------------------------------------------------------------------------------+
                                                │
                                                ▼
+--------------------------------------------------------------------------------------------------+
|                                    MIDDLEWARE & SECURITY GATEWAY                                 |
|  - Route Protection (`src/middleware.ts`): Public Whitelist vs. Protected App/API Routes        |
|  - Cryptographic Session Auth (`jose` JWT in HTTP-only `rr_session` cookie)                      |
|  - Rate Limiting (`src/lib/rate-limit.ts` - in-memory token bucket; Upstash Redis supported)      |
|  - Security Headers & Strict CSP (`next.config.ts`)                                              |
+--------------------------------------------------------------------------------------------------+
                                                │
                                                ▼
+--------------------------------------------------------------------------------------------------+
|                                     CORE SERVICE & API LAYER                                     |
|  - Multi-Tenant Isolation Helper (`src/lib/tenant-context.ts` - fail-closed org & business check)|
|  - Platform Admin Auth (`src/lib/admin-auth.ts` - fail-closed ADMIN_EMAILS allowlist)            |
|  - Plan Gating & Trial Lifecycle (`src/lib/plan-enforcement.ts` - auto-downgrades expired trials)|
|  - AES-256-GCM Token Encryption (`src/lib/crypto.ts` - encrypted OAuth secrets at rest)         |
+--------------------------------------------------------------------------------------------------+
         │                              │                               │
         ▼                              ▼                               ▼
+──────────────────+          +──────────────────+            +──────────────────+
|  AI DRAFT ENGINE |          |   INTEGRATIONS   |            | PERSISTENCE (DB) |
| - `z-ai-web-dev` |          | - Google GBP API |            | - PostgreSQL     |
|   (GLM-4.6 LLM)  |          | - Facebook Graph |            | - Prisma 6.11    |
| - Rule-Based     |          | - Twilio (SMS)   |            | - 12 Core Models |
|   Fallback Mode  |          | - Resend (Email) |            | - 6 Enums        |
| - Brand Voice    |          | - Opt-Out Engine |            | - Audit Logs     |
+──────────────────+          +──────────────────+            +──────────────────+
```

---

## 3. Historical Evolution & Artifact Hierarchy

```
[Generation A: ReviewReply-Lite] ────► [Generation B: Enterprise Scope]
(Next 14, Supabase Store, Mocks,       (Prisma Models, Multi-Location,
 Single-Location $29/$59 Scope)          Agency, Competitors, Widgets)
              │                                      │
              ▼                                      ▼
[Generation C: Custom Auth & Real LLM] ► [Generation D: Hardened Production SaaS]
(JWT Sessions, OTP, GLM-4.6 AI,         (PostgreSQL, Tenant Isolation Context,
 Admin Panel, Sentry Setup)              Security Headers, AES-256 OAuth Store)
```

- **Generation A (ReviewReply-Lite):** Baseline POC ($29/$59 single-location, Supabase Store, mock auth, hardcoded mock data). *Status: HISTORICAL.*
- **Generation B (Enterprise Scope):** Introduction of Prisma ORM, PostgreSQL schema (`Organization`, `Business`, `OrgMember`), agency views, and competitor benchmarking. *Status: HISTORICAL.*
- **Generation C (Custom Auth & Real LLM):** Integration of GLM-4.6 LLM via `z-ai-web-dev-sdk`, Email OTP, Google ID Token login, Next.js middleware protection. *Status: HISTORICAL.*
- **Generation D (Hardened Production SaaS - Current Baseline):** Complete multi-tenant isolation context (`tenant-context.ts`), fail-closed admin allowlist (`admin-auth.ts`), AES-256-GCM OAuth token encryption at rest (`crypto.ts`), dedicated review link landing pages (`/review-us/[slug]`), and TCPA/10DLC compliance with Twilio inbound STOP webhook. *Status: CANONICAL CODEBASE.*

---

## 4. Definitions: Severity vs. Blocking Status

To maintain engineering precision, defect severity and blocking state are treated as independent dimensions:

### Severity (Impact Level)
- **P0:** Critical safety, security, data-corruption, or commercial launch blocker. (Must be resolved before any commercial traffic is permitted).
- **P1:** Major production defect or launch-critical capability gap. (Must be resolved before public general availability).
- **P2:** Important but non-blocking defect, UX polish item, or operational enhancement.

### Blocking State (Action Requirement)
- **ENGINEERING BLOCKER:** Requires codebase implementation, refactoring, or architectural work.
- **CONFIG ACTION REQUIRED:** Code implementation exists; production deployment, environment variable, or DNS configuration is required.
- **VENDOR BLOCKED:** External vendor approval, account verification, or carrier vetting is required (Google, Meta, Twilio).
- **DECISION REQUIRED:** Formal founder / executive product decision is required.
- **UNKNOWN:** Evidence is currently insufficient to verify live behavior.

---

## 5. Production Verification Matrix

| Capability / Module | Code Implemented | Local Tested | Production Tested | Production Status | Evidence & Forensic Details |
|---|:---:|:---:|:---:|:---:|---|
| **Marketing Section Anchors** | NO | YES | YES | **PRODUCTION BROKEN** | `src/app/page.tsx` has no `id=` attributes; anchor clicks do not scroll. |
| **Marketing Subpage Nav** | NO | YES | YES | **PRODUCTION BROKEN** | `MarketingNav` links to `/features` & `/pricing` (returns 404 Not Found). |
| **Marketing Landing CTAs** | NO | YES | YES | **PRODUCTION BROKEN** | "Log in" and "Get Started" link to `/dashboard` instead of `/login` and `/signup`. |
| **Favicon Asset** | NO | YES | YES | **PRODUCTION BROKEN** | `public/favicon.ico` is missing; returns 404 on browser request. |
| **JWT Session Engine** | YES | YES | YES | **PRODUCTION WORKING** | `src/lib/auth.ts`, `src/middleware.ts` enforce signed `rr_session` cookies. |
| **Password Login Security** | YES — PARTIAL | YES | YES | **PRODUCTION BROKEN** | `src/app/api/auth/login/route.ts` uses pseudo-hashing and allows passwordless bypass. |
| **Logout Backend Route** | YES | YES | YES | **PRODUCTION WORKING** | `POST /api/auth/logout` destroys cookie session cleanly. |
| **Logout UI Control** | NO | YES | YES | **PRODUCTION BROKEN** | No sign-out button exists anywhere in Sidebar, Topbar, or Settings. |
| **Password Reset / Recovery** | NO | NO | NO | **ENGINEERING BLOCKER** | No forgot/reset endpoints or UI exist in the codebase. |
| **Email OTP Login** | YES | YES | NO | **CONFIG ACTION REQUIRED** | `/api/auth/otp` functional locally; requires production Resend API keys. |
| **Google ID Token Login** | YES — PARTIAL | YES | NO | **VENDOR BLOCKED** | `/api/auth/google` validates via Google; frontend button requires Client ID. |
| **Tenant Isolation Context** | YES | YES | YES | **PRODUCTION WORKING** | `scripts/sec-tier0-verify.sh` passes 100%; zero IDOR leaks across org boundaries. |
| **Admin Authorization** | YES | YES | YES | **CONFIG ACTION REQUIRED** | Fails closed (`403 ADMINS_NOT_CONFIGURED`) when `ADMIN_EMAILS` is unset. |
| **OAuth Token Encryption** | YES | YES | YES | **PRODUCTION WORKING** | `src/lib/crypto.ts` encrypts tokens at rest with AES-256-GCM. |
| **AI Reply Draft Generation** | YES | YES | YES | **PRODUCTION WORKING** | `src/app/api/reviews/[id]/draft` generates context-aware replies via GLM-4.6. |
| **Review Approval (Local DB)** | YES | YES | YES | **PRODUCTION WORKING** | `/api/reviews/[id]/approve` updates local DB `draftStatus` and audit log. |
| **Review Publishing (API Push)** | NO | NO | NO | **ENGINEERING BLOCKER** | `/api/reviews/[id]/approve` does not dispatch across the wire to Google/Facebook APIs. |
| **Billing Frontend UI** | YES | YES | YES | **PRODUCTION WORKING** | `/billing` page renders plans, toggles, and usage counters. |
| **Stripe Checkout / Portal** | NO | NO | NO | **ENGINEERING BLOCKER** | No `/api/billing/checkout` or `/api/billing/portal` backend routes exist. |
| **Stripe Webhook Sync** | NO | NO | NO | **ENGINEERING BLOCKER** | `src/app/api/webhooks/stripe/route.ts` does not exist. |
| **Google GBP OAuth & Sync** | YES | YES | NO | **VENDOR BLOCKED** | `/api/oauth/google`; blocked awaiting Google Cloud OAuth verification. |
| **Facebook Graph Sync** | YES | YES | NO | **VENDOR BLOCKED** | `/api/oauth/facebook`; blocked awaiting Meta App Review for permissions. |
| **Twilio SMS & Opt-Out** | YES | YES | NO | **VENDOR BLOCKED** | `/api/webhooks/twilio`; blocked awaiting US A2P 10DLC registration. |
| **Resend Email Review Req.** | YES | YES | NO | **CONFIG ACTION REQUIRED** | `src/lib/integrations/resend.ts`; requires DNS domain verification. |
| **Click Tracking `/r/[token]`** | YES | YES | YES | **PRODUCTION WORKING** | `src/app/r/[token]/page.tsx` records clicks and redirects to review pages. |
| **Review Us Hub (`/review-us`)** | YES | YES | YES | **PRODUCTION WORKING** | `src/app/review-us/[slug]/page.tsx` renders business review links cleanly. |
| **Campaign Recipient Parser** | YES — PARTIAL | YES | YES | **PRODUCTION BROKEN** | `src/lib/opt-out.ts` throws unhandled 500 when non-string contacts are passed. |
| **Agency Dashboard** | YES | YES | YES | **DECISION REQUIRED** | `/agency`, `/api/agency` renders multi-client metrics; awaits product decision. |
| **Competitor Intelligence** | YES | YES | YES | **DECISION REQUIRED** | `/competitors`, `/api/competitors` renders matrix; awaits product decision. |
| **Embeddable Widgets** | YES | YES | YES | **PRODUCTION WORKING** | `/widgets`, `/app/widget.js/route.ts` generates dynamic embed scripts. |
| **Compliance Hub & DSAR** | YES | YES | YES | **PRODUCTION WORKING** | `/compliance`, `/api/export` exports user and review data. |
| **Sentry Telemetry** | YES | YES | NO | **CONFIG ACTION REQUIRED** | SDK configured in `next.config.ts`; requires production `SENTRY_DSN`. |
| **Distributed Rate Limiting** | YES — PARTIAL | NO | NO | **CONFIG ACTION REQUIRED** | In-memory locally; requires Upstash Redis credentials for multi-instance. |

---

## 6. Canonical Roadmap ID Registry

Every canonical roadmap identifier is registered below with its type, severity, blocking state, target stage, status, and primary code/system reference:

| Canonical ID | Type | Severity | Blocking State | Stage | Status | Primary Code / System Reference |
|---|---|:---:|---|:---:|---|---|
| **`SEC-001`** | DEFECT | P0 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/api/auth/login/route.ts` (Password pseudo-hash bypass) |
| **`BILL-001`** | DEFECT | P0 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/billing/page.tsx` (Missing Stripe checkout/portal routes) |
| **`BILL-002`** | DEFECT | P0 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/api/webhooks/stripe/route.ts` (Missing Stripe webhook handler) |
| **`INT-001`** | DEFECT | P0 | ENGINEERING BLOCKER | Stage 1 & 2 | READY | `src/app/api/reviews/[id]/approve/route.ts` (Approval omits live API dispatch) |
| **`AUTH-001`** | DEFECT | P1 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/login/page.tsx` (Missing self-serve password recovery flow) |
| **`AUTH-002`** | DEFECT | P1 | ENGINEERING BLOCKER | Stage 1 | READY | `src/components/app/sidebar.tsx` (Missing logout UI control) |
| **`NAV-001`** | DEFECT | P1 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/page.tsx` (Landing CTAs route directly to `/dashboard`) |
| **`NAV-002`** | DEFECT | P1 | ENGINEERING BLOCKER | Stage 1 | READY | `src/components/app/marketing-shell.tsx` (Subpage nav 404 links) |
| **`API-001`** | DEFECT | P1 | ENGINEERING BLOCKER | Stage 1 | READY | `src/lib/opt-out.ts` (Recipient contact normalization TypeError 500) |
| **`ADMIN-001`**| DEFECT | P1 | CONFIG ACTION REQUIRED | Stage 1 | CONFIG ACTION REQUIRED | `src/lib/admin-auth.ts` (Admin panel requires `ADMIN_EMAILS`) |
| **`INT-002`** | DEFECT | P1 | VENDOR BLOCKED | Stage 2 | VENDOR BLOCKED | Google Cloud OAuth App Verification (`mybusiness.googleapis.com`) |
| **`INT-003`** | DEFECT | P1 | VENDOR BLOCKED | Stage 2 | VENDOR BLOCKED | Meta Business App Review (`pages_manage_engagement`) |
| **`INT-004`** | DEFECT | P1 | VENDOR BLOCKED | Stage 2 | VENDOR BLOCKED | Twilio Trust Hub A2P 10DLC Campaign Registration |
| **`NAV-003`** | DEFECT | P2 | ENGINEERING BLOCKER | Stage 1 | READY | `src/app/page.tsx` (Landing section components lack `id=` attributes) |
| **`ASSET-001`**| DEFECT | P2 | ENGINEERING BLOCKER | Stage 1 | READY | `public/favicon.ico` (Missing favicon asset returning 404) |
| **`INT-005`** | CONFIGURATION | N/A | CONFIG ACTION REQUIRED | Stage 2 | CONFIG ACTION REQUIRED | `src/lib/integrations/resend.ts` (Resend DNS sending domain verification) |
| **`INFRA-001`**| INFRASTRUCTURE | N/A | CONFIG ACTION REQUIRED | Stage 3 | CONFIG ACTION REQUIRED | `src/lib/rate-limit.ts` (Upstash Redis credentials for multi-instance limit) |
| **`INFRA-002`**| INFRASTRUCTURE | N/A | CONFIG ACTION REQUIRED | Stage 1 | CONFIG ACTION REQUIRED | `src/app/api/cron/downgrade-trials/route.ts` (Vercel Cron trigger setup) |
| **`OBS-001`** | INFRASTRUCTURE | N/A | CONFIG ACTION REQUIRED | Stage 3 | CONFIG ACTION REQUIRED | `next.config.ts` (Production `SENTRY_DSN` configuration & alerting) |
| **`DECISION-01`**| DECISION | N/A | DECISION REQUIRED | Governance | DECISION REQUIRED | Executive Founder Scope Decision (Multi-Tier SaaS vs. Solo SMB Lite) |
| **`DECISION-02`**| DECISION | N/A | DECISION REQUIRED | Stage 5 | DECISION REQUIRED | Agency White-Label Custom Domains Architecture |

### Dedicated Configuration Blocker Registry
1. **`CONFIG-001` (Auth / Email):** Resend API Keys (`RESEND_API_KEY`) for Email OTP delivery.
2. **`CONFIG-002` (Admin / Auth):** Platform Admin Allowlist (`ADMIN_EMAILS`) for `/admin` access (`ADMIN-001`).
3. **`CONFIG-003` (Campaigns / Email):** Resend DNS sending domain verification for outbound review requests (`INT-005`).
4. **`CONFIG-004` (Observability):** Production Sentry DSN (`SENTRY_DSN`) and alert webhook routing (`OBS-001`).
5. **`CONFIG-005` (Infrastructure):** Upstash Redis credentials (`UPSTASH_REDIS_REST_URL`, `TOKEN`) for distributed rate limiting (`INFRA-001`).

---

## 7. Current vs. Target Capability Map

| Capability | Current State | Target State | Implementation Gap | Canonical Backlog ID |
|---|---|---|---|---|
| **Password Auth** | Pseudo-hash base64; null hash bypass | Cryptographic `bcrypt` (10 rounds); reject null hashes | Replace hashing & login check | `SEC-001` |
| **Logout** | Backend `POST /api/auth/logout` exists | User profile menu in sidebar with working "Sign Out" button | Add UI dropdown & action | `AUTH-002` |
| **Password Recovery** | None | `/forgot-password` & `/reset-password` email flow via Resend | Build API routes & UI page | `AUTH-001` |
| **Marketing CTAs** | Hardcoded to `/dashboard` | Link to `/login` and `/signup` with redirect preservation | Fix anchor hrefs in `page.tsx` | `NAV-001` |
| **Marketing Subpage Nav** | Links to `/features` & `/pricing` (404) | Link to `/#features` and `/#pricing` | Fix hrefs in `MarketingNav` | `NAV-002` |
| **Section Anchors** | No `id=` attributes on sections | Smooth scroll to target sections on anchor click | Add `id=` props in `page.tsx` | `NAV-003` |
| **Favicon Asset** | Missing (returns 404) | Branded brass star `favicon.ico` in `public/` | Add binary asset | `ASSET-001` |
| **Review Approval** | Updates DB status to `POSTED` only | Updates DB AND dispatches live comment to Google/Facebook API | Wire integration adapters | `INT-001` |
| **Google Review Sync** | Integration code exists; blocked on OAuth | Live automated review sync via GBP REST v4 API | Complete Google verification | `INT-002` |
| **Facebook Review Sync** | Integration code exists; blocked on OAuth | Live review sync via Meta Graph API v19 | Complete Meta App Review | `INT-003` |
| **SMS Review Requests** | Code exists; unverified without 10DLC | Live carrier delivery with automated `STOP` handling | Complete Twilio 10DLC vetting | `INT-004` |
| **Email Review Requests** | Code exists; unverified domain | Live delivery with one-click unsubscribe headers | Verify Resend DNS records | `INT-005` |
| **Campaign Recipient Parse**| Throws 500 on non-string contact inputs | Zod validation returning 400 Bad Request with field errors | Defensive input parsing | `API-001` |
| **Stripe Checkout** | UI buttons trigger client-side toasts | Hosted Stripe Checkout creating customer & subscription | Build `/api/billing/checkout` | `BILL-001` |
| **Stripe Customer Portal** | UI button triggers client-side toast | Hosted Stripe Portal for card updates & cancellations | Build `/api/billing/portal` | `BILL-001` |
| **Stripe Webhooks** | None | Idempotent processor syncing `Organization.plan` in DB | Build `/api/webhooks/stripe` | `BILL-002` |
| **Admin Panel** | Inaccessible without `ADMIN_EMAILS` env | Accessible to authorized platform admin accounts | Set `ADMIN_EMAILS` in prod | `ADMIN-001` |
| **Distributed Rate Limit** | In-memory token bucket (single process) | Shared sliding-window limit across all serverless lambdas | Connect `@upstash/redis` | `INFRA-001` |
| **Trial Downgrade Cron** | `/api/cron/downgrade-trials` route exists | Daily automated trigger checking expired trials | Setup Vercel Cron job | `INFRA-002` |
| **Telemetry & Alerts** | `@sentry/nextjs` SDK in `package.json` | Real-time crash capture with Slack webhook alerting | Configure `SENTRY_DSN` | `OBS-001` |

---

## 8. Current Production Defect Register

Every known live production defect is cataloged below with its **Canonical Roadmap ID**, historical evidence reference, severity, and acceptance criteria:

```
                          CURRENT PRODUCTION DEFECT REGISTER
┌──────────────┬──────────────────┬──────────┬─────────────────────────────┬────────────────────┐
│ Canonical ID │ Evidence Ref ID  │ Severity │ Summary Problem             │ Affected Area      │
├──────────────┼──────────────────┼──────────┼─────────────────────────────┼────────────────────┤
│ SEC-001      │ SEC-AUTH-001     │ P0       │ Password Pseudo-Hash Bypass │ Auth Backend       │
│ BILL-001     │ BILL-ENG-01      │ P0       │ Missing Stripe Checkout/API │ Billing Backend    │
│ BILL-002     │ BILL-ENG-02      │ P0       │ Missing Stripe Webhooks     │ Billing Backend    │
│ INT-001      │ INT-ENG-01       │ P0       │ Approval Omits API Push     │ Reviews Backend    │
│ AUTH-001     │ AUTH-ENG-01      │ P1       │ Missing Password Reset Flow │ Auth / Email       │
│ AUTH-002     │ AUTH-UI-01       │ P1       │ Missing Logout UI Control   │ App Navigation     │
│ NAV-001      │ NAV-UI-01        │ P1       │ CTAs Route to /dashboard    │ Landing Page       │
│ NAV-002      │ NAV-UI-02        │ P1       │ Subpage Nav 404 Links       │ Marketing Nav      │
│ API-001      │ API-ENG-01       │ P1       │ Recipient Normalization 500 │ Campaigns / OptOut │
│ ADMIN-001    │ ADMIN-CFG-01     │ P1       │ Admin Inaccessible (Unset)  │ Admin Panel        │
│ INT-002      │ INT-VND-01       │ P1       │ Google OAuth Unverified     │ Integrations (VND) │
│ INT-003      │ INT-VND-02       │ P1       │ Meta App Review Pending     │ Integrations (VND) │
│ INT-004      │ INT-VND-03       │ P1       │ Twilio 10DLC Unregistered   │ Integrations (VND) │
│ NAV-003      │ NAV-UI-03        │ P2       │ Anchor Links Lack Element ID│ Landing Page       │
│ ASSET-001    │ ASSET-UI-01      │ P2       │ Missing favicon.ico (404)   │ Public Assets      │
└──────────────┴──────────────────┴──────────┴─────────────────────────────┴────────────────────┘
```

### Detailed Defect Records

#### `SEC-001` (Evidence Ref: `SEC-AUTH-001`) — Password Pseudo-Hashing & Null-Password Auth Bypass
- **Severity:** **P0 (Critical Security Blocker)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/api/auth/login/route.ts` lines 66–77:
  ```typescript
  const expectedHash = `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`
  if (user.passwordHash && user.passwordHash !== expectedHash) {
    if (!user.passwordHash) { /* allows any password */ } else { return 401 }
  }
  ```
- **Affected Workflow:** User Password Authentication (`/api/auth/login`).
- **Root Cause:** Placeholder demo code was never replaced with real cryptographic hashing (`bcrypt`/`argon2`). Accounts with null `passwordHash` allow login with any arbitrary password string.
- **Expected Behavior:** Passwords hashed with `bcrypt` (salt rounds ≥ 10); invalid passwords rejected; null hashes reject password auth.
- **Actual Behavior:** Reversible base64 pseudo-hashing; potential authentication bypass.
- **Fix Direction:** Replace login and signup hashing with `bcryptjs` (`hash` and `compare`); reject password auth if `passwordHash` is null.
- **Acceptance Criteria:**
  - Password login verifies against `bcrypt` hash.
  - Accounts with null `passwordHash` (e.g. OTP-only) return `401 Password authentication not configured for this account`.
- **Production Verification:** Verify against live signup + login with correct and incorrect passwords.

#### `BILL-001` (Evidence Ref: `BILL-ENG-01`) — Missing Stripe Checkout & Customer Portal Endpoints
- **Severity:** **P0 (Critical Commercial Blocker)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/billing/page.tsx` triggers UI toasts on upgrade clicks; zero files exist in `src/app/api/billing/`.
- **Affected Workflow:** Subscription Monetization & Upgrade Funnel.
- **Root Cause:** Billing UI built during Generation B/C without corresponding backend API handlers.
- **Expected Behavior:** Upgrade button redirects to Stripe Checkout session; customer portal manages cards.
- **Actual Behavior:** Button clicks display client-side toasts; subscriptions cannot be created.
- **Fix Direction:** Build `POST /api/billing/checkout` and `POST /api/billing/portal`.
- **Acceptance Criteria:** Live Stripe payment upgrades user organization in database within 3 seconds.

#### `BILL-002` (Evidence Ref: `BILL-ENG-02`) — Missing Stripe Webhook Processor
- **Severity:** **P0 (Critical Commercial Blocker)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/api/webhooks/stripe/route.ts` does not exist.
- **Affected Workflow:** Subscription Lifecycle & Payment Synchronization.
- **Root Cause:** Webhook listener was omitted during backend migration.
- **Expected Behavior:** Webhooks validate signature, handle renewals, upgrades, cancellations, and dunning.
- **Actual Behavior:** Subscriptions cannot synchronize state between Stripe and database.
- **Fix Direction:** Build `POST /api/webhooks/stripe` with raw signature validation and idempotent handlers.
- **Acceptance Criteria:** Stripe webhook events update `Organization.plan` and log audit events idempotently.

#### `INT-001` (Evidence Ref: `INT-ENG-01`) — Reply Approval Does Not Dispatch to Google/Facebook APIs
- **Severity:** **P0 (Critical Workflow Blocker)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/api/reviews/[id]/approve/route.ts` lines 55–85: Updates DB `draftStatus = POSTED` but never calls `postGoogleReply` or `postFacebookReply`.
- **Affected Workflow:** Core Review Response Loop (`/inbox`, `/reviews`).
- **Root Cause:** Approval route updates local persistence without invoking the third-party client integration layer.
- **Expected Behavior:** Approving a review dispatches the reply comment directly to Google Business Profile or Facebook Page API.
- **Actual Behavior:** Status is updated locally; no external network request is made.
- **Fix Direction:** Wire decrypted OAuth token retrieval and invoke `postGoogleReply` / `postFacebookReply` inside `approve/route.ts`.
- **Acceptance Criteria:** Approving a review triggers platform dispatch adapter; status updates upon platform confirmation.

#### `AUTH-001` (Evidence Ref: `AUTH-ENG-01`) — Missing Self-Serve Password Reset Flow
- **Severity:** **P1 (High)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/login/page.tsx` has no "Forgot password" link; no forgot/reset API routes exist.
- **Affected Workflow:** User Account Recovery & Retention.
- **Root Cause:** Self-serve recovery flow was omitted during custom JWT auth implementation.
- **Expected Behavior:** User requests password reset via email; receives short-lived signed link; resets password.
- **Actual Behavior:** Users who forget passwords are permanently locked out without manual database editing.
- **Fix Direction:** Implement `POST /api/auth/forgot-password`, `/reset-password` UI, and `POST /api/auth/reset-password`.
- **Acceptance Criteria:** Password reset email delivered; valid token resets password and invalidates previous sessions.

#### `AUTH-002` (Evidence Ref: `AUTH-UI-01`) — Missing Logout / Sign-Out UI Control
- **Severity:** **P1 (High)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/components/app/sidebar.tsx` contains 10 navigation links, settings, billing, compliance, and admin, but **zero logout button or user dropdown menu**.
- **Affected Workflow:** Session Termination & Security.
- **Root Cause:** UI navigation shell lacks user profile avatar and sign-out action button.
- **Expected Behavior:** Sidebar or Topbar displays user avatar, email, and a working "Sign Out" button that clears `rr_session` cookie and redirects to `/login`.
- **Actual Behavior:** User has no mechanism to log out from the application UI.
- **Fix Direction:** Add User Profile Dropdown to `AppSidebar` bottom and `AppTopbar` with working `handleLogout` calling `POST /api/auth/logout`.
- **Acceptance Criteria:** Clicking "Sign Out" destroys session cookie and redirects user to `/login`.

#### `NAV-001` (Evidence Ref: `NAV-UI-01`) — Marketing Landing Page CTAs Route to `/dashboard`
- **Severity:** **P1 (High)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/page.tsx` lines 122, 127, 159, 162, 203:
  `<Link href="/dashboard"><Button>Log in</Button></Link>`
  `<Link href="/dashboard"><Button>Get Started</Button></Link>`
  `<Link href="/dashboard"><Button>Start free trial</Button></Link>`
- **Affected Workflow:** User Acquisition & Conversion Funnel.
- **Root Cause:** CTAs hardcoded to `/dashboard` for internal previewing rather than routing to `/login` and `/signup`.
- **Expected Behavior:** "Log in" links to `/login`; "Get Started" and "Start free trial" link to `/signup`.
- **Actual Behavior:** Unauthenticated users clicking "Log in" hit middleware redirect cascade to `/login?redirect=%2Fdashboard`.
- **Fix Direction:** Update all CTA hrefs in `src/app/page.tsx` to `/login` or `/signup`.
- **Acceptance Criteria:** Clicking "Log in" navigates directly to `/login`; clicking "Get Started" navigates to `/signup`.

#### `NAV-002` (Evidence Ref: `NAV-UI-02`) — Subpage Marketing Navigation Links to Nonexistent Routes
- **Severity:** **P1 (High)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/components/app/marketing-shell.tsx` line 18:
  `{['Features', 'Pricing', 'About', 'Blog', 'Help'].map(item => <Link href={'/' + item.toLowerCase()}>...)}`
- **Affected Workflow:** Subpage Navigation (`/about`, `/blog`, `/help`, `/terms`, `/privacy`).
- **Root Cause:** Loop generates `/features` and `/pricing` routes which do not exist as pages in `src/app/`.
- **Expected Behavior:** Features and Pricing link to `/#features` and `/#pricing`.
- **Actual Behavior:** Clicking "Features" or "Pricing" from `/about` or `/blog` results in Next.js 404 page.
- **Fix Direction:** Map 'Features' to `/#features` and 'Pricing' to `/#pricing` in `MarketingNav`.
- **Acceptance Criteria:** Clicking "Features" or "Pricing" on any legal/marketing subpage returns user to landing page sections without 404s.

#### `API-001` (Evidence Ref: `API-ENG-01`) — Contact Normalization Throws HTTP 500 on Alternate Payload Shapes
- **Severity:** **P1 (High)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/lib/opt-out.ts` line 48: `let normalized = contact.trim().toLowerCase()`.
- **Affected Workflow:** Campaign Creation (`/api/campaigns/create`) & Review Us Send (`/api/review-us-page/send`).
- **Root Cause:** If a recipient object in the payload passes `contact: null`, `contact: undefined`, or an integer phone number, `.trim()` throws an unhandled `TypeError`, resulting in HTTP 500.
- **Expected Behavior:** Graceful validation returning 400 Bad Request with field-level error messages.
- **Actual Behavior:** Unhandled runtime exception crashing the route handler.
- **Fix Direction:** Wrap contact inputs in string coercion and Zod schema validation: `typeof contact === 'string' ? contact.trim() : ''`.
- **Acceptance Criteria:** Malformed contact payloads return HTTP 400 with descriptive JSON error.

#### `ADMIN-001` (Evidence Ref: `ADMIN-CFG-01`) — Admin Panel Inaccessible Without Configured `ADMIN_EMAILS`
- **Severity:** **P1 (High)**
- **Blocking Status:** **CONFIG ACTION REQUIRED**
- **Current Evidence:** `src/lib/admin-auth.ts` lines 49–58: Returns `403 ADMINS_NOT_CONFIGURED` if `ADMIN_EMAILS` is unset.
- **Affected Workflow:** Platform Owner Administration (`/admin`).
- **Root Cause:** Fail-closed design intentionally denies all users until production environment variable is configured.
- **Expected Behavior:** Configured platform admins access platform stats, audit logs, and trial tools.
- **Actual Behavior:** Without env var, platform owner receives 403 Forbidden.
- **Fix Direction:** Inject `ADMIN_EMAILS="owner@yourdomain.com"` in production environment settings.
- **Acceptance Criteria:** Owner email logs in and views platform-wide metrics.

#### `INT-002` (Evidence Ref: `INT-VND-01`) — Google Business Profile API OAuth Unverified
- **Severity:** **P1 (High)**
- **Blocking Status:** **VENDOR BLOCKED**
- **Current Evidence:** Google Cloud OAuth App Verification required for `mybusiness.googleapis.com`.
- **Affected Workflow:** Google Account Connection & Review Sync.
- **Fix Direction:** Submit Google Cloud OAuth Consent Screen verification.
- **Acceptance Criteria:** Google consent screen displays verified ReviewReply branding without unverified warnings.

#### `INT-003` (Evidence Ref: `INT-VND-02`) — Meta / Facebook App Review Permissions Pending
- **Severity:** **P1 (High)**
- **Blocking Status:** **VENDOR BLOCKED**
- **Current Evidence:** Meta requires App Review for `pages_read_engagement` and `pages_manage_engagement`.
- **Affected Workflow:** Facebook Page Connection & Review Sync.
- **Fix Direction:** Submit Meta Business App Review.
- **Acceptance Criteria:** Production users can connect Facebook Pages and sync ratings.

#### `INT-004` (Evidence Ref: `INT-VND-03`) — Twilio A2P 10DLC Brand & Campaign Unregistered
- **Severity:** **P1 (High)**
- **Blocking Status:** **VENDOR BLOCKED**
- **Current Evidence:** US carriers filter unregistered transactional A2P SMS.
- **Affected Workflow:** Outbound SMS Review Request Delivery.
- **Fix Direction:** Register Standard Brand and Campaign in Twilio Trust Hub.
- **Acceptance Criteria:** Outbound SMS delivery rate exceeds 98% across US wireless carriers.

#### `NAV-003` (Evidence Ref: `NAV-UI-03`) — Marketing Page Anchor Links Lack Target Element IDs
- **Severity:** **P2 (Medium)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `src/app/page.tsx` has links to `#features`, `#solutions`, `#pricing`, `#comparisons`, `#resources`, but **zero matching `id=` attributes exist on section components**.
- **Fix Direction:** Add `id="features"`, `id="pricing"`, `id="solutions"`, `id="comparisons"`, `id="resources"` to respective section components.
- **Acceptance Criteria:** Clicking any nav header link smoothly scrolls viewport to target section.

#### `ASSET-001` (Evidence Ref: `ASSET-UI-01`) — `favicon.ico` Missing (Returns HTTP 404)
- **Severity:** **P2 (Low)**
- **Blocking Status:** **ENGINEERING BLOCKER**
- **Current Evidence:** `public/` directory contains `logo.svg` and `robots.txt`, but no `favicon.ico`.
- **Fix Direction:** Generate and place branded `favicon.ico` in `public/`.
- **Acceptance Criteria:** Browser tab displays crisp icon without 404 network errors.

---

## 9. Core E2E Journey Models (Current vs. Target)

Below are the canonical end-to-end execution graphs detailing both the **Current State** (with implementation boundaries/stops) and the **Target State** (complete lifecycle with error handling):

### 1. Visitor → Signup → Onboarding → Dashboard
```
CURRENT STATE:
  [Visitor on /] ──► [Clicks "Get Started"] ──► [Routes to /dashboard (BUG NAV-001)]
        │ (Middleware redirects to /login)
        ▼
  [User manually visits /signup] ──► [Submits Form] ──► [POST /api/auth/signup]
        │
        ▼
  [Creates User + Org + Biz + Demo Reviews in DB] ──► [Issues JWT Session] ──► [Renders /dashboard]

TARGET STATE:
  [Visitor on /] ──► [Clicks "Get Started"] ──► [Navigates to /signup] ──► [Submits Form]
        │
        ▼
  [POST /api/auth/signup]
    ├── FAIL (Email In Use) ──────► [Return 409] ──► [Show "Account exists" + Link to /login]
    ├── FAIL (Invalid Schema) ────► [Return 400] ──► [Inline Field Validation Errors]
    └── SUCCESS
          │
          ▼
    [Create User (Bcrypt Salt=10) + Org + Biz in DB]
          │
          ▼
    [Issue Signed JWT in rr_session Cookie] ──► [Launch 3-Step Setup Wizard] ──► [/dashboard]
```

### 2. Login → Session Verification → Dashboard
```
CURRENT STATE:
  [User on /login] ──► [Submits Email + Password] ──► [POST /api/auth/login]
        │
        ▼
  [Pseudo-Hash Base64 Check (BUG SEC-001: allows null hash bypass)] ──► [Issues JWT Session] ──► [/dashboard]

TARGET STATE:
  [User on /login] ──► [Submits Email + Password] ──► [POST /api/auth/login]
        │
        ▼
    ├── FAIL (User Not Found) ────► [Return 404] ──► [Show "No account found. Sign up."]
    ├── FAIL (Bcrypt Mismatch) ───► [Return 401] ──► [Show "Incorrect email or password"]
    ├── FAIL (Null Password Hash) ► [Return 401] ──► [Show "Use Email OTP to log in"]
    └── SUCCESS
          │
          ▼
    [Generate JWT Session Token] ──► [Set HttpOnly Cookie] ──► [Redirect /dashboard]
```

### 3. Review Ingestion → AI Draft → Edit → Approve → Live Publish
```
CURRENT STATE:
  [Review Ingested / Seeded] ──► [User in /inbox] ──► [Generate AI Draft (GLM-4.6)]
        │
        ▼
  [User Edits Text] ──► [Clicks "Approve & Post Reply"] ──► [POST /api/reviews/[id]/approve]
        │
        ▼
  [Database draftStatus updated to POSTED]
        │
        ▼
  [STOP: External Google/Facebook API is NOT called (BUG INT-001)]

TARGET STATE:
  [Review Ingested / Seeded] ──► [User in /inbox] ──► [Generate AI Draft]
        │
        ▼
  [POST /api/reviews/[id]/draft]
    ├── FAIL (Tenant IDOR Violation) ─► [Return 404] ──► [Halt]
    ├── FAIL (LLM Service Timeout) ───► [Trigger Heuristic Rule Engine] ──► [Return Fallback Draft]
    └── SUCCESS (GLM-4.6) ────────────► [Return AI Draft Text]
        │
        ▼
  [User Edits Text] ──► [Clicks "Approve & Post Reply"] ──► [POST /api/reviews/[id]/approve]
        │
        ▼
    ├── FAIL (No OAuth Token) ────────► [Update DB draftStatus=APPROVED] ──► [Toast "Connect platform to post live"]
    ├── FAIL (Google API 401/403) ────► [Log Audit Error + Status=FAILED] ──► [Toast "Failed to publish. Click to retry."]
    └── SUCCESS
          │
          ▼
    [Invoke Google GBP / Facebook API] ──► [Publish Comment Live] ──► [Update DB draftStatus=POSTED]
```

### 4. Connect Google Business Profile → OAuth 2.0 Flow
```
CURRENT STATE:
  [User in Settings → Integrations] ──► [Clicks "Connect Google"]
        │
        ▼
  [GET /api/oauth/google] ──► [Code exists, but blocked without production Client ID / Verification (BUG INT-002)]

TARGET STATE:
  [User in Settings → Integrations] ──► [Clicks "Connect Google"] ──► [GET /api/oauth/google]
        │
        ▼
  [Redirect to accounts.google.com Consent Screen] ──► [User Grants Permission]
        │
        ▼
  [Google Redirects to /api/oauth/google/callback?code=...]
        │
        ▼
  [Exchange Code for Tokens] ──► [Encrypt Tokens via AES-256-GCM] ──► [Upsert into OAuthToken Table]
        │
        ▼
  [Redirect to /settings?connected=google] ──► [Trigger Initial Review Ingestion Sync]
```

### 5. Review Request Dispatch → SMS/Email → `/r/[token]` Redirect
```
CURRENT STATE:
  [User in /campaigns] ──► [Creates Campaign + Recipient List] ──► [POST /api/campaigns/create]
        │
        ▼
  [If non-string contact passed: Crashes with TypeError 500 (BUG API-001)]
        │
        ▼
  [If valid contact: Code exists, but live SMS blocked without Twilio 10DLC registration (BUG INT-004)]

TARGET STATE:
  [User in /campaigns] ──► [Creates Campaign + Recipient List] ──► [POST /api/campaigns/create]
        │
        ▼
  [Zod Validation] ──► [Query OptOut Table] ──► [Filter Unsubscribed Contacts]
        │
        ▼
    ├── CHANNEL: SMS (Twilio) ────────► [Format Message + "Reply STOP"] ──► [Twilio API Dispatch]
    └── CHANNEL: Email (Resend) ──────► [Format HTML + Unsubscribe Link] ─► [Resend API Dispatch]
        │
        ▼
  [Customer Receives SMS/Email with https://app.reviewreply.com/r/{token}]
        │
        ▼
  [GET /r/{token}] ──► [Record clickedAt Timestamp in DB] ──► [Redirect to Google Review Page]
```

### 6. Stripe Subscription Checkout & Webhook Lifecycle
```
CURRENT STATE:
  [User on /billing] ──► [Clicks "Upgrade to Pro"]
        │
        ▼
  [Client-side Toast: "Redirecting to checkout..."]
        │
        ▼
  [STOP: No backend Stripe API route exists; no payment occurs (BUG BILL-001 / BILL-002)]

TARGET STATE:
  [User on /billing] ──► [Clicks "Upgrade to Pro"] ──► [POST /api/billing/checkout]
        │
        ▼
  [Create Stripe Checkout Session] ──► [Redirect to checkout.stripe.com] ──► [Customer Pays]
        │
        ▼
  [Stripe Sends Webhook: checkout.session.completed] ──► [POST /api/webhooks/stripe]
    ├── FAIL (Invalid Signature) ─────► [Return 400 Bad Request]
    └── SUCCESS
          │
          ▼
    [Verify Event Idempotency] ──► [Update Organization.plan = PRO] ──► [Save stripeCustomerId in DB]
```

### 7. User Logout & Session Invalidation
```
CURRENT STATE:
  [User in /dashboard]
        │
        ▼
  [STOP: No Logout button or profile menu exists in UI (BUG AUTH-002)]
        │ (User can only log out by manually clearing browser cookies or calling API via curl)

TARGET STATE:
  [User Clicks "Sign Out" in Sidebar Profile Menu] ──► [POST /api/auth/logout]
        │
        ▼
  [Clear rr_session Cookie] ──► [Client Clears Local State] ──► [Redirect to /login]
        │
        ▼
  [User Clicks Browser Back Button] ──► [Middleware Intercepts] ──► [Redirect to /login?redirect=%2Fdashboard]
```

---

## 10. Product Direction Decisions Required

```
                      STRATEGIC PRODUCT DIRECTION DECISIONS
┌─────────────────────────────────────────────────────────────────────────────┐
│ DECISION-01: Product Scope & Packaging Architecture                         │
│  - Option A: Single-Location SMB Lite ($29 Starter / $59 Pro)               │
│  - Option B: Multi-Tier Modern SaaS ($0 Free / $49 Starter / $99 Pro / $299)│
│                                                                             │
│  Status: DECISION REQUIRED (Awaiting Executive Founder Approval)            │
│  CTO Recommendation: Adopt Option B (Multi-Tier Modern SaaS)                │
│  Rationale: Multi-location and agency code is already built, tested, and     │
│             hardened. High ACV ($299/mo) and agency scale vastly improve    │
│             unit economics compared to high-churn solo SMB tools.           │
├─────────────────────────────────────────────────────────────────────────────┤
│ DECISION-02: Agency White-Label Custom Domain Architecture                  │
│  - Option A: Retain ReviewReply branding on all public pages                │
│  - Option B: Support custom agency subdomains (reviews.agencyname.com)      │
│                                                                             │
│  Status: DECISION REQUIRED                                                  │
│  CTO Recommendation: Defer to Stage 5 post-commercial launch.               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Master Backlog: Epics, Tasks & Acceptance Tests

### Epic 1: Authentication, Security & Navigation Baseline (SEC / AUTH / NAV)

#### `SEC-001` (Evidence Ref: `SEC-AUTH-001`): Cryptographic Password Hashing & Null-Auth Lockdown
- **Area:** Security / Auth | **Priority:** **P0** | **Status:** **READY**
- **Tasks:**
  1. Install `bcryptjs` and `@types/bcryptjs`.
  2. Refactor `src/app/api/auth/signup/route.ts` to hash passwords with salt rounds = 10.
  3. Refactor `src/app/api/auth/login/route.ts` to verify passwords using `bcrypt.compare`.
  4. Block password authentication attempts on accounts where `passwordHash` is null.
- **Acceptance Tests:**
  - `test_bcrypt_verification`: Valid password returns JWT session; invalid returns 401.
  - `test_null_hash_rejection`: Account with null hash cannot be authenticated via password.

#### `AUTH-001` (Evidence Ref: `AUTH-ENG-01`): Self-Serve Forgot & Reset Password Flow
- **Area:** Auth | **Priority:** **P1** | **Status:** **READY**
- **Tasks:**
  1. Build `POST /api/auth/forgot-password` generating 1-hour signed JWT reset tokens and sending email via Resend.
  2. Build `/reset-password` frontend page.
  3. Build `POST /api/auth/reset-password` updating user password hash.
- **Acceptance Tests:**
  - Token email delivered; valid reset token updates password and invalidates previous sessions.

#### `AUTH-002` (Evidence Ref: `AUTH-UI-01`): User Logout & Profile Controls in UI
- **Area:** Navigation / Auth | **Priority:** **P1** | **Status:** **READY**
- **Tasks:**
  1. Add user account section at bottom of `AppSidebar` with avatar, email, and "Sign Out" button.
  2. Wire sign-out handler calling `POST /api/auth/logout` and redirecting to `/login`.
- **Acceptance Tests:**
  - Clicking "Sign Out" destroys session cookie and redirects user to `/login`.

#### `NAV-001` (Evidence Ref: `NAV-UI-01`): Correct Marketing CTA Routing
- **Area:** Marketing | **Priority:** **P1** | **Status:** **READY**
- **Tasks:**
  1. Update `src/app/page.tsx` "Log in" button to link to `/login`.
  2. Update "Get Started" and "Start free trial" buttons to link to `/signup`.
- **Acceptance Tests:**
  - Clicks navigate directly to `/login` and `/signup` without middleware redirect cascades.

#### `NAV-002` (Evidence Ref: `NAV-UI-02`): Fix Subpage Navigation & Dead Routes
- **Area:** Marketing | **Priority:** **P1** | **Status:** **READY**
- **Tasks:**
  1. Update `MarketingNav` in `src/components/app/marketing-shell.tsx` to map Features and Pricing to `/#features` and `/#pricing`.
- **Acceptance Tests:**
  - Navigating from `/about` or `/blog` via Features/Pricing returns user to home sections without 404s.

#### `NAV-003` (Evidence Ref: `NAV-UI-03`): Add Target Section IDs for In-Page Anchors
- **Area:** Marketing | **Priority:** **P2** | **Status:** **READY**
- **Tasks:**
  1. Add `id="features"`, `id="pricing"`, `id="solutions"`, `id="comparisons"`, `id="resources"` in `src/app/page.tsx`.
- **Acceptance Tests:**
  - In-page navigation smoothly scrolls viewport to target sections.

#### `ASSET-001` (Evidence Ref: `ASSET-UI-01`): Branded Favicon Asset Placement
- **Area:** Public Assets | **Priority:** **P2** | **Status:** **READY**
- **Tasks:**
  1. Place branded `favicon.ico` in `public/`.
- **Acceptance Tests:**
  - `/favicon.ico` returns HTTP 200 with valid image header.

---

### Epic 2: Billing & Monetization Infrastructure (BILL)

#### `BILL-001` (Evidence Ref: `BILL-ENG-01`): Production Stripe Checkout & Customer Portal
- **Area:** Billing | **Priority:** **P0** | **Status:** **READY**
- **Tasks:**
  1. Install official `stripe` SDK.
  2. Create `POST /api/billing/checkout` creating Checkout Sessions for Starter ($49), Pro ($99), Enterprise ($299).
  3. Create `POST /api/billing/portal` creating Customer Billing Portal sessions.
- **Acceptance Tests:**
  - Upgrade button redirects to Stripe Checkout with correct price IDs and metadata.

#### `BILL-002` (Evidence Ref: `BILL-ENG-02`): Idempotent Stripe Webhook Processor
- **Area:** Billing | **Priority:** **P0** | **Status:** **READY**
- **Tasks:**
  1. Create `POST /api/webhooks/stripe` with raw request body signature validation.
  2. Process `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
  3. Synchronize `Organization.plan` and `stripeCustomerId` in database.
- **Acceptance Tests:**
  - Webhook updates database plan state; duplicated webhook deliveries are handled idempotently.

---

### Epic 3: Core Review Loop & Third-Party Integrations (INT / API)

#### `INT-001` (Evidence Ref: `INT-ENG-01`): Wire Review Approval to External Publishing APIs
- **Area:** Reviews / Integrations | **Priority:** **P0** | **Status:** **READY**
- **Tasks:**
  1. Update `src/app/api/reviews/[id]/approve/route.ts` to inspect review source.
  2. For Google: Fetch decrypted OAuth token, invoke `postGoogleReply`.
  3. For Facebook: Fetch decrypted Page Access Token, invoke `postFacebookReply`.
  4. Handle API error responses by rolling back status and logging audit failure.
- **Acceptance Tests:**
  - Approving a review dispatches HTTP PUT/POST to Google/Facebook API and marks status `POSTED`.

#### `API-001` (Evidence Ref: `API-ENG-01`): Robust Recipient & Contact Payload Normalization
- **Area:** Campaigns / OptOut | **Priority:** **P1** | **Status:** **READY**
- **Tasks:**
  1. Wrap contact strings in defensive parsing in `src/lib/opt-out.ts`.
  2. Validate payload arrays with Zod schema in `/api/campaigns/create` and `/api/review-us-page/send`.
- **Acceptance Tests:**
  - Invalid contact types return 400 Bad Request without crashing the route with HTTP 500.

#### `INT-002` (Evidence Ref: `INT-VND-01`): Google Business Profile API OAuth Verification
- **Area:** Integrations (Vendor) | **Priority:** **P1** | **Status:** **VENDOR BLOCKED**
- **Tasks:**
  1. Submit OAuth Consent Screen verification on Google Cloud Console.
  2. Submit commercial GBP API access questionnaire.
- **Acceptance Tests:**
  - Google OAuth consent screen displays verified ReviewReply branding.

#### `INT-003` (Evidence Ref: `INT-VND-02`): Meta / Facebook App Review Permissions
- **Area:** Integrations (Vendor) | **Priority:** **P1** | **Status:** **VENDOR BLOCKED**
- **Tasks:**
  1. Submit Facebook App Review for `pages_read_engagement` & `pages_manage_engagement`.
- **Acceptance Tests:**
  - Live Facebook Pages can be connected without test-user restrictions.

#### `INT-004` (Evidence Ref: `INT-VND-03`): Twilio A2P 10DLC Brand & Campaign Registration
- **Area:** Integrations (Vendor) | **Priority:** **P1** | **Status:** **VENDOR BLOCKED**
- **Tasks:**
  1. Register Standard Brand and Customer Care Campaign in Twilio Trust Hub.
- **Acceptance Tests:**
  - Outbound SMS delivery exceeds 98% across US wireless carriers.

#### `INT-005`: Resend Sending Domain Verification & Email Review Requests
- **Area:** Integrations (Email) | **Severity:** **N/A (Config)** | **Status:** **CONFIG ACTION REQUIRED**
- **Current State:** Code implementation exists in `src/lib/integrations/resend.ts`; requires DNS sending domain verification.
- **Target State:** Verified sending domain with SPF, DKIM, DMARC records and one-click unsubscribe headers.
- **Tasks:**
  1. Add DNS TXT and CNAME records in domain provider for Resend sending identity.
  2. Verify domain status in Resend Dashboard.
- **Acceptance Tests:**
  - Email review requests pass SPF/DKIM verification and land in primary inbox.

---

### Epic 4: Infrastructure, Automation & Observability (INFRA / OBS / ADMIN)

#### `ADMIN-001` (Evidence Ref: `ADMIN-CFG-01`): Production Platform Admin Configuration
- **Area:** Admin Panel | **Priority:** **P1** | **Status:** **CONFIG ACTION REQUIRED**
- **Tasks:**
  1. Set `ADMIN_EMAILS="owner@yourdomain.com"` in production environment.
- **Acceptance Tests:**
  - Platform administrator logs in and accesses `/admin` metrics and management tools.

#### `INFRA-001`: Multi-Instance Distributed Rate Limiting via Upstash Redis
- **Area:** Infrastructure | **Severity:** **N/A (Config)** | **Status:** **CONFIG ACTION REQUIRED**
- **Current State:** In-memory token bucket operates per serverless process; Upstash client code supported in `src/lib/rate-limit.ts`.
- **Target State:** Shared sliding-window rate limit across all serverless lambda instances.
- **Tasks:**
  1. Provision Upstash Redis database.
  2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in production environment.
- **Acceptance Tests:**
  - Rate limits are shared and enforced accurately across multiple concurrent serverless invocations.

#### `INFRA-002`: Automated Trial Expiration & Downgrade Scheduled Cron
- **Area:** Infrastructure | **Severity:** **N/A (Config)** | **Status:** **CONFIG ACTION REQUIRED**
- **Current State:** Endpoint `/api/cron/downgrade-trials` exists and works via manual invocation; automatic schedule not yet configured.
- **Target State:** Daily automated trigger executing trial downgrade sweep idempotently.
- **Tasks:**
  1. Configure `vercel.json` cron job triggering `/api/cron/downgrade-trials` daily at 00:00 UTC.
  2. Protect cron endpoint using `CRON_SECRET` header authorization.
- **Acceptance Tests:**
  - Cron executes on schedule, identifies expired trials, downgrades plan state idempotently, and logs audit events.

#### `OBS-001`: Production Sentry Telemetry & Error Alert Routing
- **Area:** Observability | **Severity:** **N/A (Config)** | **Status:** **CONFIG ACTION REQUIRED**
- **Current State:** Sentry SDK installed and configured in `next.config.ts`; `SENTRY_DSN` unset in production.
- **Target State:** Real-time exception capture with source map resolution and instant Slack/Email alerts.
- **Tasks:**
  1. Create Sentry project and inject `SENTRY_DSN` into production deployment environment.
  2. Configure Slack alert webhook for unhandled 500 exceptions.
- **Acceptance Tests:**
  - Uncaught backend errors generate alerts in Sentry with complete stack trace and function context.

---

## 12. Execution Roadmap & Stage Exit Criteria

Progress is gated by **Exit Criteria**, not calendar timelines.

```
                              STAGE GATING & EXIT CRITERIA
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0: Baseline & Safety Verification                                     │
│  - Forensic Baseline: COMPLETE ✅                                           │
│  - Production Safety: NOT COMPLETE ❌                                        │
│  - Exit Gate: Forensic reconciliation ratified; canonical roadmap active.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 1: Production Security, Core Navigation & Monetization Baseline       │
│  - Exit Gate:                                                               │
│    [ ] P0 Blockers = 0                                                      │
│    [ ] SEC-001 (Password security) resolved & production verified           │
│    [ ] BILL-001 & BILL-002 (Stripe Checkout & Webhooks) live & verified    │
│    [ ] INT-001 implementation complete and integration adapter tests pass   │
│        (production live verification deferred until vendor approval)         │
│    [ ] AUTH-002 (Logout UI) implemented & verified                         │
│    [ ] AUTH-001 (Password reset flow) implemented & verified               │
│    [ ] NAV-001 & NAV-002 (CTA & subpage nav links) fixed                   │
│    [ ] API-001 (Contact normalization 500) fixed                           │
│    [ ] ADMIN-001 (ADMIN_EMAILS allowlist) configured in production          │
│    [ ] INFRA-002 (Trial downgrade cron) configured & verified               │
│    [ ] Production authentication & session destruction E2E passes           │
│    [ ] Tenant isolation regression suite passes 100%                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 2: Vendor Approvals & Live Integration Verification                   │
│  - Exit Gate:                                                               │
│    [ ] INT-001 production live publishing verified against Google/Facebook  │
│        after vendor approvals                                               │
│    [ ] Google GBP OAuth verification approved (INT-002)                     │
│    [ ] Meta App Review permissions granted (INT-003)                        │
│    [ ] Twilio 10DLC registration active & live SMS verified (INT-004)       │
│    [ ] Resend DNS sending domain verified (INT-005)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 3: Closed Beta Pilot & Observability                                  │
│  - Exit Gate:                                                               │
│    [ ] 8-10 business cohort onboarded                                       │
│    [ ] Sentry production DSN & alert routing active (OBS-001)               │
│    [ ] Upstash Redis distributed rate limiting active (INFRA-001)           │
│    [ ] ≥5 businesses actively approving and posting live replies            │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 4: Commercial Launch Readiness                                        │
│  - Exit Gate:                                                               │
│    [ ] Self-serve onboarding wizard complete                                │
│    [ ] Legal counsel sign-off on Terms & Privacy                            │
│    [ ] Zero P0 or P1 defects remaining                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 5: Multi-Location & Agency Scale (Post-Launch)                        │
│  - Exit Gate: Automated PDF reports, multi-client bulk management.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 6: Growth & Defensibility (Future Horizon)                            │
│  - Exit Gate: Multi-lingual AI replies, POS CRM webhook integrations.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Explicitly Deferred / Do Not Build Yet

1. **Native iOS & Android Mobile Apps:** Responsive web application fully covers mobile phone workflows. *(Trigger: >50% active users request native push).*
2. **Custom LLM Fine-Tuning:** Prompt engineering with few-shot examples and brand voice constraints delivers target quality. *(Trigger: Monthly token spend > $10,000).*
3. **Social Media Post Scheduling (Instagram/TikTok):** Outside core reputation management value proposition.
4. **Unofficial Yelp / TripAdvisor Scraping:** Violates platform terms; official review links (`/review-us/[slug]`) are used instead.

---

## 14. Evidence Register

### Primary Current Evidence (Canonical Truth)
- `src/app/api/auth/login/route.ts`: Proves password pseudo-hashing and null bypass (`SEC-001`).
- `src/app/billing/page.tsx` & `src/app/api/`: Proves billing is UI-only without backend Stripe handlers (`BILL-001`, `BILL-002`).
- `src/app/api/reviews/[id]/approve/route.ts`: Proves approve route updates local DB only and omits live API push (`INT-001`).
- `src/components/app/sidebar.tsx`: Proves complete absence of logout / sign-out UI controls (`AUTH-002`).
- `src/app/page.tsx`: Proves CTAs link to `/dashboard` (`NAV-001`) and section components lack `id=` attributes (`NAV-003`).
- `src/components/app/marketing-shell.tsx`: Proves subpage nav links to nonexistent `/features` & `/pricing` (`NAV-002`).
- `src/lib/opt-out.ts`: Proves potential TypeError 500 on non-string contact inputs (`API-001`).
- `src/lib/admin-auth.ts`: Proves fail-closed admin gate requiring `ADMIN_EMAILS` (`ADMIN-001`).
- `public/`: Proves missing `favicon.ico` asset (`ASSET-001`).
- `src/lib/integrations/resend.ts`: Proves email review request capability requiring domain verification (`INT-005`).
- `src/lib/rate-limit.ts`: Proves in-memory rate limiting with Upstash Redis hook (`INFRA-001`).
- `src/app/api/cron/downgrade-trials/route.ts`: Proves trial downgrade route requiring scheduled trigger (`INFRA-002`).
- `next.config.ts`: Proves Sentry SDK integration requiring production DSN (`OBS-001`).
- `scripts/sec-tier0-verify.sh`: Proves tenant isolation and anti-IDOR checks pass 100%.

### Historical Evidence (Superseded Context)
- `review-app-extracted/Product-Roadmap.md`: Legacy $29/$59 single-location roadmap. Obsolete.
- `audit-backend.md` & `audit-product.md`: Legacy mock-era audit reports. Superseded by Gen D.
- `worklog.md`: Historical narrative across development milestones.

---

## 15. Roadmap Governance

1. **Single Source of Truth:** `ROADMAP.md` is the only canonical roadmap for ReviewReply.
2. **Evidence Hierarchy:** Source code and live test results take absolute precedence over worklogs or marketing claims.
3. **P0 Security Policy:** Any authentication bypass or tenant isolation failure is an automatic P0 blocker that halts feature development.
4. **Standard Vocabulary:** Use **ONLY**: `NOT STARTED`, `PLANNED`, `READY`, `IN PROGRESS`, `PARTIALLY BUILT`, `IMPLEMENTED`, `PRODUCTION VERIFIED`, `PRODUCTION WORKING`, `PRODUCTION BROKEN`, `ENGINEERING BLOCKER`, `CONFIG ACTION REQUIRED`, `VENDOR BLOCKED`, `DECISION REQUIRED`, `DEFERRED`, `REJECTED`, `HISTORICAL`.

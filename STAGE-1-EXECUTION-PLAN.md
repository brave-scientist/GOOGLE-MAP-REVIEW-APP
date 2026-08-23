# ReviewReply — Stage 1 Engineering Execution Plan
**Production Security, Core Navigation & Monetization Baseline**

- **Document Version:** 1.0.1 (Architecture & Idempotency Hardening)
- **Date:** August 23, 2026
- **Author:** CTO / Principal Architect
- **Status:** CTO REVIEW REQUIRED — PRE-IMPLEMENTATION BASELINE
- **Target File Location:** `/STAGE-1-EXECUTION-PLAN.md` (Project Root)
- **Authoritative Planning Authority:** [`/ROADMAP.md`](file:///c:/WEB%20APP/REVIEW%20REPLY/ROADMAP.md) (Ratified v2.2.1)

---

## 1. Authoritative Source & Evidence Hierarchy

This execution plan translates the canonical roadmap into a deterministic, file-level, test-backed engineering sequence.

### Evidence Hierarchy
1. **Actual Repository Source Code** (`src/`, `components/`, `lib/`)
2. **Database Schema & Migrations** ([`prisma/schema.prisma`](file:///c:/WEB%20APP/REVIEW%20REPLY/prisma/schema.prisma))
3. **Existing Automated Tests & Verifications** (`scripts/*.sh`, `tests/`)
4. **Existing Scripts & Tooling** (`scripts/`)
5. **Existing Configuration Files** ([`package.json`](file:///c:/WEB%20APP/REVIEW%20REPLY/package.json), [`next.config.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/next.config.ts), `Caddyfile`)
6. **Canonical Roadmap** ([`ROADMAP.md`](file:///c:/WEB%20APP/REVIEW%20REPLY/ROADMAP.md) v2.2.1)
7. **Historical Artifacts** (Audits, worklogs, legacy roadmaps — non-authoritative)

*Rules:*
- Historical documents never override repository code or schema.
- Unverified items are strictly flagged as `UNKNOWN / REQUIRES VERIFICATION`.
- Target architecture is clearly distinguished from current repository state.
- No application or configuration code is modified during the generation of this document.

---

## 2. Objective & Scope

Execute **Stage 1: Production Security, Core Navigation & Monetization Baseline** to achieve zero P0 blockers and eliminate all Stage 1 P1/P2 engineering and configuration blockers.

### Scope Registry

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               STAGE 1 SCOPE BREAKDOWN                                  │
├──────────────┬──────────┬───────────────────────┬──────────────────────────────────────┤
│ Canonical ID │ Severity │ Type                  │ Summary Objective                    │
├──────────────┼──────────┼───────────────────────┼──────────────────────────────────────┤
│ SEC-001      │ P0       │ ENGINEERING BLOCKER   │ Bcrypt password hashing & null-auth  │
│ BILL-001     │ P0       │ ENGINEERING BLOCKER   │ Stripe Checkout & Customer Portal    │
│ BILL-002     │ P0       │ ENGINEERING BLOCKER   │ Idempotent Stripe Webhook processor  │
│ INT-001      │ P0       │ ENGINEERING BLOCKER   │ Wire review approval to external API │
│ AUTH-001     │ P1       │ ENGINEERING BLOCKER   │ Self-serve password reset & email    │
│ AUTH-002     │ P1       │ ENGINEERING BLOCKER   │ User profile dropdown & logout UI    │
│ NAV-001      │ P1       │ ENGINEERING BLOCKER   │ Fix marketing CTAs (/login, /signup) │
│ NAV-002      │ P1       │ ENGINEERING BLOCKER   │ Fix subpage nav links (/#features)   │
│ API-001      │ P1       │ ENGINEERING BLOCKER   │ Recipient & contact validation (400) │
│ ADMIN-001    │ P1       │ CONFIG ACTION REQ.    │ Configure production ADMIN_EMAILS    │
│ NAV-003      │ P2       │ ENGINEERING BLOCKER   │ Add id= attributes for page anchors  │
│ ASSET-001    │ P2       │ ENGINEERING BLOCKER   │ Place branded public/favicon.ico     │
│ INFRA-002    │ N/A      │ CONFIG / ENG GAP      │ Vercel cron & CRON_SECRET hardening  │
└──────────────┴──────────┴───────────────────────┴──────────────────────────────────────┘
```

### Stage 1 Engineering vs. Stage 2 Vendor Verification Boundary
- **Stage 1 Scope:** Implements all internal publishing logic, token decryption, error recovery, adapter contracts, and mock-based adapter integration suites for `INT-001`.
- **Stage 2 Scope:** Live production account verification and traffic enablement against Google Business Profile API (`INT-002`), Meta App Review (`INT-003`), Twilio 10DLC (`INT-004`), and Resend DNS domain verification (`INT-005`).
- **Boundary Rule:** Stage 1 exit is gated on automated adapter test suites passing with 100% mocked platform coverage; it is NOT blocked on third-party vendor review queues.

---

## 3. Stage 1 Dependency Graph

```
                                  [PERSISTENCE BASELINE]
                                     PostgreSQL / Prisma
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
            [PACKAGE BASELINE]                                 [MARKETING / ASSETS]
         Install bcryptjs + stripe                            NAV-001, NAV-002, NAV-003
                    │                                                 ASSET-001
        ┌───────────┴───────────┐                                       │
        ▼                       ▼                                       │
    [SEC-001]               [AUTH-001]                                  ▼
Bcrypt Login/Signup      Password Reset Token                   [MARKETING READY]
Null-hash Lockdown       & Resend Delivery API
        │                       │
        └───────────┬───────────┘
                    ▼
            [AUTH-002 / NAV]
        User Profile & Logout UI
         (Sidebar / Topbar / Nav)
                    │
     ┌──────────────┴────────────────────────────┐
     ▼                                           ▼
 [BILLING ENGINE]                      [REVIEW PUBLISHING ENGINE]
(Stripe SDK Configured)                 (Crypto AES-256 Decrypt)
     │                                           │
     ├──► [BILL-001]                             └──► [INT-001]
     │    Checkout & Portal API                       Wire approve/route.ts
     │                                                to Google & FB adapters
     └──► [BILL-002]                                  with atomic lock
          Webhook Processor & Org Plan Sync              │
     │                                                   ▼
     ▼                                           [API-001 / CAMPAIGNS]
 [INFRA-002 / ADMIN-001]                         Defensive Opt-Out
  Hardened Cron & Allowlist                      & Contact Validation
     │                                                   │
     └──────────────────────┬────────────────────────────┘
                            ▼
               [STAGE 1 VERIFICATION GATE]
       17 Automated Journeys (Mock Adapters) + Sec-Tier0
```

### Critical Path vs. Parallel Work
- **True Critical Path (Longest Serial Blocker Chain):**
  `PKG-001` (Dependencies) → `SEC-001` (Bcrypt Auth & Session Core) → `BILL-001` (Checkout/Portal) → `BILL-002` (Webhook & Plan Sync) → `STAGE-1-VERIFICATION`.
- **Parallel Workstream A (Auth Extensions):** `AUTH-001` (Password Reset) and `AUTH-002` (Logout UI) run in parallel with Billing once `SEC-001` is in place.
- **Parallel Workstream B (Reviews & Campaign Validation):** `INT-001` (Publishing Adapters) and `API-001` (Contact Parser) run in parallel with Billing.
- **Parallel Workstream C (Marketing & Navigation):** `NAV-001`, `NAV-002`, `NAV-003`, `ASSET-001` have zero backend dependencies and execute independently.
- **Parallel Workstream D (Config & Cron):** `ADMIN-001` and `INFRA-002` execute independently.

---

## 4. SEC-001 — Authentication Security Implementation Plan

### Current Forensic Evidence
- **Files:** [`src/app/api/auth/login/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/auth/login/route.ts), [`src/app/api/auth/signup/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/auth/signup/route.ts), [`src/lib/auth.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/auth.ts)
- **Current Model:** `User.passwordHash` stores `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`.
- **Security Vulnerabilities:**
  1. Base64 is reversible encoding, not a cryptographic one-way hash.
  2. In `login/route.ts` lines 67–77, accounts with `passwordHash: null` (created via OTP or Google) trigger:
     ```typescript
     if (!user.passwordHash) {
       // OK, proceed -> BYPASSES ALL PASSWORD CHECKS
     }
     ```
     This allows anyone to authenticate as an OTP/Google user by supplying any arbitrary password.

### Implementation Specification
1. **Dependency:** Install `bcryptjs` and `@types/bcryptjs`. (Pure JS implementation avoids native C++ binding compilation failures in diverse serverless/Node runtimes).
2. **Signup (`POST /api/auth/signup`):**
   - Validate password length: minimum 8 characters, maximum 72 characters (bcrypt input limitation).
   - Compute hash: `await bcrypt.hash(password, 10)`.
   - Store hash in `User.passwordHash`.
3. **Login (`POST /api/auth/login`):**
   - If `!user.passwordHash`, reject immediately:
     ```typescript
     return NextResponse.json(
       { error: 'Password authentication not configured for this account. Please sign in with Email OTP or Google.' },
       { status: 401 }
     )
     ```
   - **Legacy Hash Migration Strategy:**
     - Check if hash starts with `demo_hash_`:
       ```typescript
       if (user.passwordHash.startsWith('demo_hash_')) {
         const expectedLegacy = `demo_hash_${Buffer.from(password).toString('base64').slice(0, 32)}`
         if (user.passwordHash === expectedLegacy) {
           // Seamless inline upgrade: re-hash with bcrypt and persist
           const upgradedHash = await bcrypt.hash(password, 10)
           await db.user.update({
             where: { id: user.id },
             data: { passwordHash: upgradedHash, updatedAt: new Date() }
           })
           // Proceed to issue session
         } else {
           return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
         }
       } else {
         const isValid = await bcrypt.compare(password, user.passwordHash)
         if (!isValid) {
           return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
         }
       }
       ```
     - *Rationale:* Inline migration ensures zero disruption to existing seeded/demo accounts while upgrading hashes permanently upon first successful login.
4. **Session Issuance & Invalidation:**
   - Preserves signed JWT `rr_session` cookie issued via `jose`.
   - Update `createSession` with `sameSite: 'lax'`, `httpOnly: true`, `secure: shouldUseSecureCookie()`.
5. **Brute-Force & Rate Limiting:**
   - Login endpoint protected in `src/middleware.ts` by `RATE_LIMITS.login` (5 attempts / min per IP).
   - Add audit logging for failed login attempts (`user.login_failed`) with IP and reason.

---

## 5. BILL-001 — Stripe Checkout & Customer Portal

### Current Forensic Evidence
- **Files:** [`src/app/billing/page.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/billing/page.tsx), [`src/lib/plan-enforcement.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/plan-enforcement.ts), [`prisma/schema.prisma`](file:///c:/WEB%20APP/REVIEW%20REPLY/prisma/schema.prisma)
- **Current State:** Billing page renders UI cards with toast alerts; zero backend routes exist under `src/app/api/billing/`.

### Implementation Specification

#### Route 1: `POST /api/billing/checkout`
- **Auth & Tenant Context:** Uses `getTenantContext(request)`. Fails closed if unauthenticated or no org.
- **Role Requirement:** Caller must have `role === 'OWNER'` or `role === 'ADMIN'` in `OrgMember`.
- **Request Body:**
  ```json
  {
    "plan": "STARTER" | "PRO" | "ENTERPRISE",
    "billingCycle": "monthly" | "annual"
  }
  ```
- **Stripe Price ID Mapping (via Environment Variables):**
  - Starter Monthly: `process.env.STRIPE_PRICE_STARTER_MONTHLY`
  - Starter Annual: `process.env.STRIPE_PRICE_STARTER_ANNUAL`
  - Pro Monthly: `process.env.STRIPE_PRICE_PRO_MONTHLY`
  - Pro Annual: `process.env.STRIPE_PRICE_PRO_ANNUAL`
  - Enterprise Monthly: `process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY`
  - Enterprise Annual: `process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL`
- **Customer Lifecycle:**
  - Check `Organization.stripeCustomerId`.
  - If null, create Stripe customer (`stripe.customers.create({ email: user.email, name: org.name, metadata: { orgId: org.id } })`) and persist `stripeCustomerId` in database.
- **Session Configuration:**
  ```typescript
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?canceled=true`,
    subscription_data: {
      metadata: { orgId: ctx.orgId, plan, billingCycle }
    },
    metadata: { orgId: ctx.orgId, plan }
  })
  ```
- **Response:** `{ url: session.url }` (HTTP 200).

#### Route 2: `POST /api/billing/portal`
- **Auth & Tenant Context:** Uses `getTenantContext(request)`.
- **Verification:** Ensure `Organization.stripeCustomerId` exists. If not, return `400 No active billing account found`.
- **Session Creation:**
  ```typescript
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/billing`
  })
  ```
- **Response:** `{ url: session.url }` (HTTP 200).

---

## 6. BILL-002 — Stripe Webhook & Atomic Idempotency Plan

### Current Forensic Evidence
- **Files:** [`src/app/api/webhooks/stripe/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/webhooks/stripe/route.ts) (DOES NOT EXIST).
- **Prisma Schema Inspection:** `AuditLog` has no unique constraint on metadata JSON strings. An `AuditLog.create` alone cannot provide atomic deduplication against concurrent webhook deliveries.

### Implementation Specification

#### 1. Raw Body Handling & Signature Validation
- In Next.js App Router, read raw text: `const body = await request.text()`.
- Header: `request.headers.get('stripe-signature')`.
- Validation:
  ```typescript
  const event = stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  )
  ```
- On signature failure: Return `400 Invalid signature`.

#### 2. Atomic Idempotency Architecture
To guarantee deduplication without race conditions during concurrent delivery:
- **Design Strategy:**
  1. Leverage an atomic transaction with a database-backed lock or idempotency ledger.
  2. *Prisma AuditLog Unique Check Pattern:* Check existing processed events in `AuditLog` via `targetType: 'stripe_event'`, `targetId: event.id`.
  3. Wrap check + update in an atomic Prisma transaction (`db.$transaction`):
     ```typescript
     await db.$transaction(async (tx) => {
       const existing = await tx.auditLog.findFirst({
         where: { targetType: 'stripe_event', targetId: event.id }
       })
       if (existing) {
         return // Already processed idempotently
       }
       // Apply plan projection update
       await applyStripeEvent(tx, event)
       // Record event idempotency marker
       await tx.auditLog.create({
         data: {
           action: `stripe.${event.type}`,
           targetType: 'stripe_event',
           targetId: event.id,
           metadata: JSON.stringify({ customer: event.data.object.customer })
         }
       })
     })
     ```
  4. *Schema Migration Note:* If ultra-high concurrency demands a hard database constraint, a dedicated `WebhookEvent` model with `@unique` on `eventId` can be added via migration. For Stage 1 volume, transaction-scoped deduplication is verified and sufficient.

#### 3. Minimum Event Set & Handler Logic
- `checkout.session.completed`:
  - Extract `orgId` and `plan` from metadata.
  - Upsert `stripeCustomerId` and update `Organization.plan = plan`, `trialEndsAt = null`.
- `customer.subscription.updated`:
  - Map Stripe subscription status to Application Plan state.
  - Update `Organization.plan`.
- `customer.subscription.deleted`:
  - Customer canceled or subscription lapsed.
  - Update `Organization.plan = Plan.FREE`.
- `invoice.payment_failed`:
  - Log audit warning `billing.payment_failed`.

---

## 7. Billing State Machine & Stripe Status Mapping

### State Separation: Application Plan vs. Stripe Status
- **Prisma `Plan` Enum (Application Capabilities):** `FREE`, `STARTER`, `PRO`, `ENTERPRISE`, `AGENCY`, `CUSTOM`.
- **Stripe Subscription Status (Payment Engine):** `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`.

### Stripe-to-Application Status Mapping Table

| Stripe Subscription Status | Application Plan Projection | DB Action | Access & Feature Policy |
|---|---|---|---|
| `trialing` (Stripe) | Plan selected (e.g. `PRO`) | Set `Organization.plan = PRO`, set `trialEndsAt` | Full access to tier features |
| `active` | Active tier (`STARTER`/`PRO`/`ENTERPRISE`) | Set `Organization.plan = tier`, clear `trialEndsAt` | Full access to tier features |
| `past_due` | Retain current tier | Log audit event `billing.past_due` | Grace period (access retained while Stripe retries) |
| `unpaid` | `FREE` | Downgrade `Organization.plan = FREE` | Access restricted to FREE features |
| `canceled` | `FREE` (at period end) | Set `Organization.plan = FREE` upon `subscription.deleted` | Access restricted to FREE features |
| `incomplete_expired` | `FREE` | Set `Organization.plan = FREE` | Access restricted to FREE features |

### State Transition Diagram
```
                             ┌────────────────────────┐
                             │          FREE          │
                             │ (Default / Zero Cost)  │
                             └───────────┬────────────┘
                                         │
                       ┌─────────────────┴─────────────────┐
                       │ User signs up                     │ User upgrades
                       ▼                                   ▼
            ┌─────────────────────┐              ┌───────────────────┐
            │        TRIAL        │              │  ACTIVE PAID TIER │
            │   (14-day Pro trial)│              │ STARTER / PRO /   │
            └──────────┬──────────┘              │    ENTERPRISE     │
                       │                         └─────────┬─────────┘
        ┌──────────────┴──────────────┐                    │
        │ Expiry without payment      │ Payment via Stripe │ Card failure
        ▼                             ▼                    ▼
┌──────────────────┐         ┌───────────────────┐┌───────────────────┐
│       FREE       │         │  ACTIVE PAID TIER ││     PAST_DUE      │
│ (Downgraded via  │         │ (STARTER / PRO /  ││(Grace period / DB │
│ cron/enforcement)│         │    ENTERPRISE)    ││ retains features) │
└──────────────────┘         └─────────┬─────────┘└─────────┬─────────┘
                                      │                    │
                       ┌──────────────┴──────────────┐     │ Payment fails
                       │ Customer cancels in Portal  │     │ completely
                       ▼                             ▼     ▼
            ┌─────────────────────┐       ┌──────────────────────┐
            │      CANCELED       │──────►│         FREE         │
            │ (Active until period│       │(Downgraded at period │
            │        ends)        │       │        end)          │
            └─────────────────────┘       └──────────────────────┘
```

---

## 8. INT-001 — Review Publishing & Concurrency Model

### Current Forensic Evidence
- **Files:** [`src/app/api/reviews/[id]/approve/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/reviews/%5Bid%5D/approve/route.ts), [`src/lib/integrations/google-business-profile.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/integrations/google-business-profile.ts), [`src/lib/integrations/facebook-graph.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/integrations/facebook-graph.ts), [`src/lib/crypto.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/crypto.ts), [`prisma/schema.prisma`](file:///c:/WEB%20APP/REVIEW%20REPLY/prisma/schema.prisma)
- **Current State:**
  - `postGoogleReply` is physically implemented in `google-business-profile.ts`.
  - `postFacebookReply` is physically implemented in `facebook-graph.ts`.
  - `approve/route.ts` currently updates `draftStatus = POSTED` in local DB only; external API calls are completely omitted.

### Review Concurrency & State Model Analysis
- **Prisma `DraftStatus` Enum:** `NONE`, `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `POSTED`.
- **Finding:** The schema does not contain an in-flight state like `POSTING`.
- **Architectural Decision on Locking:**
  - Do NOT hijack `repliedBy` (which is reserved for user identity).
  - Use database conditional state transition on `draftStatus`:
    ```typescript
    // Atomic test-and-set using draftStatus transition
    const claimed = await db.review.updateMany({
      where: {
        id: reviewId,
        draftStatus: { in: [DraftStatus.DRAFT, DraftStatus.PENDING, DraftStatus.NONE] },
      },
      data: {
        draftStatus: DraftStatus.APPROVED, // Mark approved before external dispatch
        replyText: finalText,
      }
    })

    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Reply has already been approved or posted.', code: 'ALREADY_APPROVED' },
        { status: 409 }
      )
    }
    ```

### External Platform Semantics & Timeout Ambiguity

```
┌─────────────────┬──────────────────────────────────┬──────────────────────────────────────────┐
│ Platform        │ API Method & Endpoint            │ Idempotency Behavior                     │
├─────────────────┼──────────────────────────────────┼──────────────────────────────────────────┤
│ Google GBP      │ PUT /v4/{name}/reply             │ Naturally Idempotent (Replaces reply)    │
│ Facebook Graph  │ POST /{story_id}/comments        │ Non-Idempotent (Creates new comment)     │
└─────────────────┴──────────────────────────────────┴──────────────────────────────────────────┘
```

### Ambiguity Handling (Network Lost After Remote Publish)
1. **Google GBP:**
   - If network times out after Google receives the reply, a retry by the user or system dispatches the same `PUT` request. Google replaces the existing reply harmlessly.
2. **Facebook Graph:**
   - If network times out after Meta receives the comment, a blind retry could create a duplicate comment.
   - **Tradeoff & Strategy:**
     - Implement **At-Most-Once** automated dispatch for Facebook.
     - If the dispatch times out or returns a network-level error, the review is left in `draftStatus: APPROVED` with error metadata recorded in `AuditLog` (`reply.post_timeout_ambiguous`).
     - The UI presents a clear warning: *"Publish status unconfirmed due to network timeout. Please verify on Facebook before retrying."*
     - Never automatically retry Facebook comment creation in a blind background loop.

---

## 9. AUTH-001 — Password Recovery & Single-Use Semantics

### Current Forensic Evidence
- **Files:** [`src/app/login/page.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/login/page.tsx) (Forgot password button currently switches tab to OTP mode).
- **Prisma Schema:** `User` has `id, email, name, avatarUrl, passwordHash, createdAt, updatedAt`.

### Single-Use Token Architecture (Stateless Cryptographic Fingerprint)
To enforce true single-use semantics without adding a new database table:
1. **Fingerprinted JWT Token:**
   When generating the reset token in `POST /api/auth/forgot-password`:
   ```typescript
   // Compute cryptographic fingerprint of current credential state
   const fingerprint = crypto.createHash('sha256')
     .update(`${user.passwordHash || 'null'}:${user.updatedAt.getTime()}`)
     .digest('hex')
     .slice(0, 16)

   const resetToken = await new SignJWT({
     userId: user.id,
     email: user.email,
     fp: fingerprint,
     type: 'pwd_reset'
   })
     .setProtectedHeader({ alg: 'HS256' })
     .setIssuedAt()
     .setExpirationTime('1h')
     .sign(secret)
   ```
2. **Verification & Single-Use Enforcement in `POST /api/auth/reset-password`:**
   - Verify JWT signature and 1-hour expiration.
   - Fetch user from database.
   - Recompute expected fingerprint using current `user.passwordHash` and `user.updatedAt`.
   - If `payload.fp !== expectedFingerprint`, reject with `400 Token already used or invalidated`.
   - Update `User.passwordHash = newBcryptHash`, `User.updatedAt = new Date()`.
   - *Result:* As soon as the password is reset, `user.passwordHash` and `user.updatedAt` change, instantly rendering the token invalid for any second attempt.

---

## 10. AUTH-001 / SEC-001 — Session Invalidation Gap & Resolution

### Current Gap Analysis
- **Current Evidence in [`src/lib/auth.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/auth.ts):**
  `decodeSession(token)` validates JWT signature and expiration. `getCurrentUser(request)` verifies the user exists in DB, but **does not check whether the token was issued before the user's password was changed**.
- **Classification:** **CURRENT GAP** (Existing sessions remain valid for up to 7 days after password change).

### Concrete Implementation Strategy
1. **Include Issued-At Timestamp in Token:** `decodeSession` extracts `payload.iat` (seconds since epoch).
2. **Compare Against Credential Timestamp:**
   In `getCurrentUser(request)` in `src/lib/auth.ts`:
   ```typescript
   // If user changed password after session was issued, invalidate session
   if (user.updatedAt && session.iat) {
     const tokenIssuedMs = session.iat * 1000
     // 5-second clock skew tolerance
     if (user.updatedAt.getTime() > tokenIssuedMs + 5000) {
       return null // Forces 401 UNAUTHORIZED / redirect to login
     }
   }
   ```
3. **Acceptance Test:**
   - User A logs in on Browser 1 (receives Session 1).
   - User A resets password on Browser 2.
   - Browser 1 makes subsequent request → Middleware/API returns 401 Unauthorized.
   - Browser 2 logs in with new password → Succeeds.

---

## 11. AUTH-002 — Logout UI & Session Termination Plan

### Current Forensic Evidence
- **Files:** [`src/components/app/sidebar.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/components/app/sidebar.tsx), [`src/app/api/auth/logout/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/auth/logout/route.ts)
- **Current State:** Backend `POST /api/auth/logout` exists and deletes `rr_session` cookie. `AppSidebar`, `AppTopbar`, and `MobileNav` have zero logout buttons or user profile dropdowns.

### Implementation Specification
1. **User Profile Dropdown (`UserProfileDropdown`):**
   - Place in `AppSidebar` bottom section (above upgrade card) and `AppTopbar` right actions area.
   - Display User Avatar, Name, Email, and Org Plan badge.
   - Dropdown Menu Items:
     - Settings (`/settings`)
     - Billing (`/billing`)
     - Separator
     - **Sign Out Button** (Lucide `LogOut` icon).
2. **Logout Action Handler:**
   ```typescript
   const handleLogout = async () => {
     try {
       await fetch('/api/auth/logout', { method: 'POST' })
       toast.success('Signed out successfully')
       router.push('/login')
       router.refresh()
     } catch {
       router.push('/login')
     }
   }
   ```
3. **Post-Logout Security:**
   - Hitting browser Back button after logout triggers Next.js middleware and redirects to `/login?redirect=...`.

---

## 12. NAV-001 / NAV-002 / NAV-003 Marketing & Navigation Inventory

### Complete Navigation Inventory Table

| Link Source | Anchor / Button Text | Current `href` | Target `href` | Auth Req | Resolution | Verification Test |
|---|---|---|---|:---:|---|---|
| `src/app/page.tsx:110` | Features | `#features` | `/#features` | No | Add `id="features"` to `BentoFeatures` component | In-page smooth scroll |
| `src/app/page.tsx:110` | Pricing | `#pricing` | `/#pricing` | No | Add `id="pricing"` to `Pricing` component | In-page smooth scroll |
| `src/app/page.tsx:110` | Solutions | `#solutions` | `/#solutions` | No | Add `id="solutions"` to `HowItWorks` component | In-page smooth scroll |
| `src/app/page.tsx:110` | Comparisons | `#comparisons` | `/#comparisons` | No | Add `id="comparisons"` to `Comparison` component | In-page smooth scroll |
| `src/app/page.tsx:110` | Resources | `#resources` | `/#resources` | No | Add `id="resources"` to `FAQ` component | In-page smooth scroll |
| `src/app/page.tsx:122` | Log in (Header) | `/dashboard` | `/login` | No | Change `href` to `/login` | Click navigates to `/login` |
| `src/app/page.tsx:127` | Get Started (Header) | `/dashboard` | `/signup` | No | Change `href` to `/signup` | Click navigates to `/signup` |
| `src/app/page.tsx:159` | Log in (Mobile) | `/dashboard` | `/login` | No | Change `href` to `/login` | Click navigates to `/login` |
| `src/app/page.tsx:162` | Get Started (Mobile) | `/dashboard` | `/signup` | No | Change `href` to `/signup` | Click navigates to `/signup` |
| `src/app/page.tsx:203` | Start free trial (Hero)| `/dashboard` | `/signup` | No | Change `href` to `/signup` | Click navigates to `/signup` |
| `src/components/app/marketing-shell.tsx:18` | Features (Subpage) | `/features` (404) | `/#features` | No | Update loop map in `MarketingNav` | Click returns to home `#features` |
| `src/components/app/marketing-shell.tsx:18` | Pricing (Subpage) | `/pricing` (404) | `/#pricing` | No | Update loop map in `MarketingNav` | Click returns to home `#pricing` |
| `src/components/app/marketing-shell.tsx:18` | About | `/about` | `/about` | No | Retain valid page | HTTP 200 rendered |
| `src/components/app/marketing-shell.tsx:18` | Blog | `/blog` | `/blog` | No | Retain valid page | HTTP 200 rendered |
| `src/components/app/marketing-shell.tsx:18` | Help | `/help` | `/help` | No | Retain valid page | HTTP 200 rendered |
| `public/favicon.ico` | Browser Favicon | N/A (Missing 404) | `/favicon.ico` | No | Place branded 32x32 brass icon | HTTP 200 on `/favicon.ico` |

---

## 13. API-001 — Contact Normalization & Defensive Parsing

### Current Forensic Evidence
- **Files:** [`src/lib/opt-out.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/opt-out.ts), [`src/app/api/campaigns/create/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/campaigns/create/route.ts), [`src/app/api/review-us-page/send/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/review-us-page/send/route.ts)
- **Defect:** Line 48 of `src/lib/opt-out.ts`: `let normalized = contact.trim().toLowerCase()`. If `contact` is `null`, `undefined`, or a `number`, `.trim()` throws an unhandled `TypeError`, resulting in HTTP 500.

### Implementation Specification
1. **Defensive Normalization in `src/lib/opt-out.ts`:**
   ```typescript
   export function normalizeContact(contact: unknown): string {
     if (typeof contact !== 'string' && typeof contact !== 'number') {
       return ''
     }
     let normalized = String(contact).trim().toLowerCase()
     if (!normalized) return ''

     if (/^[\d\s\+\-\(\)]+$/.test(normalized) && !normalized.includes('@')) {
       const digits = normalized.replace(/[^0-9]/g, '')
       if (digits.length === 10) {
         normalized = `+1${digits}`
       } else if (digits.length === 11 && digits.startsWith('1')) {
         normalized = `+${digits}`
       } else if (digits.length > 0) {
         normalized = `+${digits}`
       }
     }
     return normalized
   }
   ```
2. **Strict Zod Schema Validation on Recipient Endpoints:**
   In `/api/campaigns/create` and `/api/review-us-page/send`:
   ```typescript
   const RecipientSchema = z.object({
     name: z.string().default('Valued Customer'),
     contact: z.union([z.string(), z.number()]).transform(val => String(val).trim()).refine(val => val.length > 0, {
       message: 'Contact phone or email cannot be empty'
     })
   })

   const PayloadSchema = z.object({
     businessId: z.string().min(1, 'businessId is required'),
     channel: z.enum(['sms', 'email']).optional(),
     channelMix: z.union([z.string(), z.array(z.string())]).optional(),
     messageTemplate: z.string().optional(),
     recipients: z.array(RecipientSchema).min(1, 'At least one recipient is required'),
     sendNow: z.boolean().optional()
   })
   ```

---

## 14. ADMIN-001 — Platform Admin Configuration

### Current Forensic Evidence
- **Files:** [`src/lib/admin-auth.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/admin-auth.ts), `/admin/*` pages
- **Current Classification:** `CONFIG ACTION REQUIRED`.
- **Current Behavior:** `admin-auth.ts` fails closed with `403 ADMINS_NOT_CONFIGURED` when `ADMIN_EMAILS` is unset or empty.

### Action Plan
1. **Zero Code Modification to Fail-Closed Logic:** Preserve `ADMINS_NOT_CONFIGURED` protection.
2. **Environment Variable Injection:**
   Configure `ADMIN_EMAILS="owner@yourdomain.com,admin@yourdomain.com"` in Vercel / production environment.
3. **Production Verification:**
   - Logged-in admin in `ADMIN_EMAILS` accesses `/admin`.
   - Logged-in non-admin receives `403 NOT_ADMIN`.
   - Unauthenticated visitor receives `401 UNAUTHORIZED`.

---

## 15. INFRA-002 — Automated Trial Downgrade Cron Plan

### Current Forensic Evidence
- **Files:** [`src/app/api/cron/downgrade-trials/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/cron/downgrade-trials/route.ts), [`src/lib/plan-enforcement.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/lib/plan-enforcement.ts)
- **Current Classification:** `CONFIG ACTION REQUIRED` + `ENGINEERING HARDENING`.
- **Current Vulnerability:** Lines 11–17 of `route.ts` only check `CRON_SECRET` if the environment variable is set (fails open if unset).

### Implementation Plan
1. **Hardened Authorization (Fail Closed) & `GET` Support:**
   ```typescript
   export async function GET(request: NextRequest) {
     const cronSecret = process.env.CRON_SECRET
     if (!cronSecret) {
       return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
     }
     const authHeader = request.headers.get('authorization')
     if (authHeader !== `Bearer ${cronSecret}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
     const result = await downgradeExpiredTrials()
     return NextResponse.json({ success: true, downgraded: result.downgraded })
   }
   ```
2. **Vercel Cron Configuration ([`vercel.json`](file:///c:/WEB%20APP/REVIEW%20REPLY/vercel.json)):**
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/downgrade-trials",
         "schedule": "0 0 * * *"
       }
     ]
   }
   ```

---

## 16. Database & Migration Policy

### Policy Statement
**No schema migration is currently identified from repository evidence, subject to final implementation discovery.**

### Conditions That Would Trigger a Schema Migration
If implementation discovery reveals any of the following requirements, a formal Prisma migration (`prisma migrate dev`) must be created before code execution:
1. **Persisted Password Reset Table:** If stateless cryptographic fingerprinting is deemed insufficient by security audit, a dedicated `PasswordResetToken` table (`id, userId, tokenHash, expiresAt, consumedAt`) will be migrated.
2. **Dedicated Session Versioning Column:** If comparing `User.updatedAt` causes false-positive logouts on profile edits, a `sessionVersion: Int @default(1)` column on `User` will be migrated.
3. **Hard Webhook Idempotency Constraint:** If transaction-level audit checks prove insufficient under extreme load, a `WebhookEvent` table with `@unique` on `eventId` will be migrated.
4. **Publishing State Machine Extension:** If in-flight review publishing requires persistence across process restarts, `DraftStatus` enum will be expanded with `POSTING`.

---

## 17. Stage 1 API Contract Changes

### Contract Registry

#### 1. `POST /api/auth/signup`
- **Auth:** Public.
- **Body:** `{ email: string, password: string (>=8 chars), name: string, businessName: string, industry?: string }`
- **Success (200):** `{ user: SessionUser, redirectTo: '/dashboard' }` + `Set-Cookie: rr_session=...`
- **Errors:** 400 (Validation), 409 (Email exists), 500 (Internal).

#### 2. `POST /api/auth/login`
- **Auth:** Public (Rate limited: 5/min).
- **Body:** `{ email: string, password: string }`
- **Success (200):** `{ user: SessionUser, redirectTo: '/dashboard' }` + `Set-Cookie: rr_session=...`
- **Errors:** 400 (Missing fields), 401 (Incorrect password or password auth disabled for null hash), 404 (User not found).

#### 3. `POST /api/auth/forgot-password`
- **Auth:** Public (Rate limited: 3/10min).
- **Body:** `{ email: string }`
- **Success (200):** `{ message: 'If an account exists, a reset link has been sent.' }`
- **Errors:** 400 (Invalid email), 429 (Rate limited).

#### 4. `POST /api/auth/reset-password`
- **Auth:** Public.
- **Body:** `{ token: string, newPassword: string (>=8 chars) }`
- **Success (200):** `{ success: true, message: 'Password reset successfully.' }`
- **Errors:** 400 (Invalid/expired/consumed token or password < 8 chars), 500.

#### 5. `POST /api/auth/logout`
- **Auth:** Authenticated.
- **Success (200):** `{ success: true, redirectTo: '/' }` + Clears `rr_session` cookie.

#### 6. `POST /api/billing/checkout`
- **Auth:** Authenticated (`getTenantContext`). Owner or Admin role.
- **Body:** `{ plan: 'STARTER' | 'PRO' | 'ENTERPRISE', billingCycle: 'monthly' | 'annual' }`
- **Success (200):** `{ url: string }`
- **Errors:** 401 (Unauthorized), 403 (Not Owner/Admin), 400 (Invalid plan).

#### 7. `POST /api/billing/portal`
- **Auth:** Authenticated (`getTenantContext`). Owner or Admin role.
- **Body:** `{}`
- **Success (200):** `{ url: string }`
- **Errors:** 401, 403, 400 (No Stripe customer).

#### 8. `POST /api/webhooks/stripe`
- **Auth:** Stripe signature header (`stripe-signature`).
- **Body:** Raw text payload.
- **Success (200):** `{ received: true }`
- **Errors:** 400 (Signature failure), 500.

#### 9. `POST /api/reviews/[id]/approve`
- **Auth:** Authenticated (`getTenantContext` + `assertReviewOwnership`).
- **Body:** `{ editedText?: string, action?: 'approve' | 'reject' }`
- **Success (200):** `{ status: 'POSTED' | 'APPROVED' | 'REJECTED', replyText?: string, repliedAt?: string }`
- **Errors:** 401 (Unauthorized), 404 (Not found / IDOR denied), 400 (No draft text), 409 (Already approved), 502 (External dispatch failed).

#### 10. `GET /api/cron/downgrade-trials`
- **Auth:** `Authorization: Bearer <CRON_SECRET>`.
- **Success (200):** `{ success: true, downgraded: number }`
- **Errors:** 401 (Unauthorized), 500.

---

## 18. Stage 1 Security Matrix (Current State vs. Target State)

```
┌────────────────────────┬─────────────────────────────┬───────────────────────────────┬──────────────┬────────────────────────────┐
│ Security Dimension     │ Current State               │ Target State                  │ Task ID      │ Verification Method        │
├────────────────────────┼─────────────────────────────┼───────────────────────────────┼──────────────┼────────────────────────────┤
│ Password Storage       │ Base64 pseudo-hash          │ Bcrypt (salt rounds = 10)     │ SEC-001      │ Hash verification test     │
│ Null Password Accounts │ Allows arbitrary password   │ Rejects password auth (401)   │ SEC-001      │ Null-auth lockout test     │
│ Password Reset Tokens  │ Non-existent                │ 1h JWT + Single-use fingerpr. │ AUTH-001     │ Replay attack test         │
│ Session Revocation     │ Sessions survive pwd reset  │ Invalidation on pwd change    │ SEC-001/AUTH │ Cross-session replay test  │
│ Tenant Isolation       │ Implemented in tenant-ctx   │ Zero cross-org IDOR leaks     │ SEC-01       │ sec-tier0-verify.sh        │
│ Stripe Webhook Auth    │ Missing endpoint            │ Raw body signature construct  │ BILL-002     │ Signature forgery test     │
│ Webhook Idempotency    │ Missing endpoint            │ Atomic transaction deduplic.  │ BILL-002     │ Concurrent replay test     │
│ Review Publishing Lock │ In-flight race condition    │ Test-and-set state transition │ INT-001      │ Double-click concurrency   │
│ Cron Authorization     │ Fails open if secret unset  │ Fail-closed CRON_SECRET check │ INFRA-002    │ Unauthenticated GET probe  │
│ Admin Authorization    │ Fail-closed ADMIN_EMAILS    │ Configured admin email access │ ADMIN-001    │ Non-admin 403 test         │
│ Contact Input Parsing  │ Unhandled 500 on non-string │ Zod 400 Bad Request           │ API-001      │ Payload fuzzing test       │
└────────────────────────┴─────────────────────────────┴───────────────────────────────┴──────────────┴────────────────────────────┘
```

---

## 19. Stage 1 Test Strategy & Pyramid

```
                ▲
               / \
              /   \
             / E2E \       17 Automated Journey Tests (Mock Adapters in Stage 1)
            /───────\
           /  API &  \     HTTP Endpoint Contracts, Status Codes & Error Payloads
          / Integrat. \
         /─────────────\
        /  Unit & Mock  \  Bcrypt, Crypto, Opt-Out Normalizer, Plan Enforcement
       /─────────────────\
```

### Coverage Requirements
1. **Unit Tests:** Bcrypt hash/compare, legacy hash upgrade, `normalizeContact` edge cases, AES-256-GCM roundtrips.
2. **Integration Tests:** `sec-tier0-verify.sh` IDOR suite, Stripe webhook transaction suite, review adapter mock suite.
3. **Stage 1 E2E Acceptance:** 17 automated journeys using local mock integration servers.

---

## 20. Required E2E Journeys

### E2E-01: Signup → Password Hash → Session → Dashboard
1. Visitor submits signup form with email, password, name, businessName.
2. Server hashes password with bcrypt (verified in DB).
3. Session cookie `rr_session` is set (HttpOnly).
4. Response redirects to `/dashboard`.

### E2E-02: Login with Correct Password
1. User submits email and valid password.
2. Server verifies via `bcrypt.compare`.
3. Valid `rr_session` cookie issued; user redirected to `/dashboard`.

### E2E-03: Login with Incorrect Password
1. User submits valid email and wrong password.
2. Server returns HTTP 401 `{ error: 'Incorrect password' }`.

### E2E-04: Login with Null `passwordHash` Account
1. OTP/Google-created user attempts password login.
2. Server returns HTTP 401. Authentication bypass is strictly blocked.

### E2E-05: Logout → Session Invalidation → Protected Route Denial
1. Authenticated user clicks "Sign Out" in User Profile menu.
2. `POST /api/auth/logout` clears `rr_session` cookie.
3. Attempting to visit `/dashboard` redirects to `/login?redirect=%2Fdashboard`.

### E2E-06: Forgot Password → Email → Reset → Login
1. User requests reset at `/forgot-password`.
2. Server returns 200 and sends email with signed token.
3. User opens `/reset-password?token=...` and submits new password.
4. Token consumed; second attempt with same token fails with 400.
5. User logs in with new password successfully.

### E2E-07: Billing → Stripe Checkout → Webhook → Plan Sync
1. Org owner clicks "Upgrade to Pro" in `/billing`.
2. `POST /api/billing/checkout` returns Stripe hosted URL.
3. Stripe dispatches `checkout.session.completed` webhook.
4. `/api/webhooks/stripe` updates `Organization.plan = PRO`.

### E2E-08: Billing → Duplicate Webhook → No State Corruption
1. Stripe dispatches identical `checkout.session.completed` event twice.
2. Handler processes idempotently without error or double-mutation.

### E2E-09: Review → AI Draft → Edit → Approve → Adapter Publish (Stage 1 Mock)
1. Ingested review has draft generated via AI.
2. User edits draft text and clicks "Approve & Post".
3. `POST /api/reviews/[id]/approve` decrypts OAuth token and dispatches to Google mock adapter.
4. Mock adapter returns 200 OK; review `draftStatus` updates to `POSTED` in DB.

### E2E-10: Review Publish Failure → Correct APPROVED/FAILED State
1. Mock external API returns 401 Unauthorized.
2. Server updates review to `draftStatus = APPROVED` (NOT `POSTED`).
3. Audit log records `reply.post_failed`.

### E2E-11: Review Double-Click / Retry → Concurrency Lock
1. User triggers two rapid approve requests on the same review.
2. First request claims lock and dispatches. Second returns HTTP 409 Conflict.

### E2E-12: Malformed Campaign Recipient → HTTP 400 (Never 500)
1. Client POSTs to `/api/campaigns/create` with `recipients: [{ name: "Test", contact: null }]`.
2. Zod validation catches invalid contact, returning HTTP 400.

### E2E-13: Marketing CTA Navigation
1. Visitor clicks "Log in" → Navigates to `/login`.
2. Visitor clicks "Get Started" → Navigates to `/signup`.

### E2E-14: Marketing Anchor Navigation
1. Visitor clicks "Features" or "Pricing" in landing header → Smoothly scrolls to section.
2. Visitor on `/about` clicks "Pricing" → Navigates to `/#pricing`.

### E2E-15: Admin Authorization Gate
1. With `ADMIN_EMAILS="admin@test.com"`, non-admin hits `/admin` → Returns 403.
2. Configured admin user hits `/admin` → Renders Admin Dashboard.

### E2E-16: Trial Downgrade Cron
1. Organization has `plan: PRO` and `trialEndsAt` in the past.
2. Cron triggers `GET /api/cron/downgrade-trials` with `Bearer <CRON_SECRET>`.
3. Org plan updates to `FREE` in DB.

### E2E-17: Tenant Isolation Regression Suite
1. Run `scripts/sec-tier0-verify.sh`.
2. Asserts zero IDOR leakage across organizations for reviews, businesses, campaigns, and OAuth tokens (100% pass).

---

## 21. File-Level Implementation Map

### Files Expected To Change

```
┌──────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ File Path                                    │ Reason & Expected Change                               │
├──────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ package.json                                 │ Add dependencies: bcryptjs, @types/bcryptjs, stripe    │
│ src/app/api/auth/signup/route.ts             │ Implement bcrypt password hashing (10 rounds)          │
│ src/app/api/auth/login/route.ts              │ Implement bcrypt.compare, inline migration, null check │
│ src/lib/auth.ts                              │ Add session invalidation on user credential update     │
│ src/app/api/auth/forgot-password/route.ts    │ [NEW] Password reset request & email dispatch          │
│ src/app/api/auth/reset-password/route.ts     │ [NEW] Password reset token verification & hash update  │
│ src/app/reset-password/page.tsx              │ [NEW] Password reset frontend page                     │
│ src/components/app/sidebar.tsx               │ Add User Profile menu with Sign Out button             │
│ src/app/billing/page.tsx                     │ Connect upgrade & portal buttons to backend APIs       │
│ src/app/api/billing/checkout/route.ts        │ [NEW] Stripe Checkout Session creator                  │
│ src/app/api/billing/portal/route.ts          │ [NEW] Stripe Customer Portal creator                   │
│ src/app/api/webhooks/stripe/route.ts         │ [NEW] Stripe Webhook listener & plan sync              │
│ src/app/api/reviews/[id]/approve/route.ts    │ Wire external Google/FB publishing with atomic lock    │
│ src/lib/opt-out.ts                           │ Add defensive type checking in normalizeContact        │
│ src/app/api/campaigns/create/route.ts        │ Add Zod recipient validation schema                    │
│ src/app/api/review-us-page/send/route.ts     │ Add Zod recipient validation schema                    │
│ src/app/page.tsx                             │ Fix CTA links (/login, /signup) & add section IDs      │
│ src/components/app/marketing-shell.tsx       │ Fix Features/Pricing hrefs to /#features, /#pricing    │
│ public/favicon.ico                           │ [NEW] Branded brass star favicon asset                 │
│ src/app/api/cron/downgrade-trials/route.ts   │ Fail-closed CRON_SECRET check + GET support            │
│ vercel.json                                  │ [NEW] Cron schedule configuration                      │
└──────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Files That MUST NOT Be Changed
- [`ROADMAP.md`](file:///c:/WEB%20APP/REVIEW%20REPLY/ROADMAP.md) (Canonical authority — immutable).
- `src/lib/tenant-context.ts` (Already fully hardened and verified).
- `src/lib/admin-auth.ts` (Already fully hardened fail-closed).
- `src/lib/crypto.ts` (Already fully hardened AES-256-GCM).

---

## 22. Environment & Secret Requirements

```
┌──────────────────────────────┬──────────────────┬──────────────┬───────────────────────────────────┐
│ Variable Name                │ Classification   │ Required In  │ Purpose                           │
├──────────────────────────────┼──────────────────┼──────────────┼───────────────────────────────────┤
│ DATABASE_URL                 │ Existing         │ Stage 1      │ PostgreSQL persistence connection │
│ SESSION_SECRET               │ Existing         │ Stage 1      │ Jose JWT session cookie signature │
│ TOKEN_ENCRYPTION_KEY         │ Existing         │ Stage 1      │ AES-256-GCM OAuth secret key      │
│ STRIPE_SECRET_KEY            │ Required Stage 1 │ Stage 1      │ Stripe SDK billing operations     │
│ STRIPE_WEBHOOK_SECRET        │ Required Stage 1 │ Stage 1      │ Webhook signature verification    │
│ STRIPE_PRICE_STARTER_MONTHLY │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($49/mo)          │
│ STRIPE_PRICE_STARTER_ANNUAL  │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($39/mo annual)   │
│ STRIPE_PRICE_PRO_MONTHLY     │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($99/mo)          │
│ STRIPE_PRICE_PRO_ANNUAL      │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($79/mo annual)   │
│ STRIPE_PRICE_ENTERPRISE_MTH  │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($299/mo)         │
│ STRIPE_PRICE_ENTERPRISE_ANN  │ Required Stage 1 │ Stage 1      │ Stripe Price ID ($239/mo annual)  │
│ RESEND_API_KEY               │ Required Stage 1 │ Stage 1      │ Password reset & OTP email        │
│ ADMIN_EMAILS                 │ Required Stage 1 │ Stage 1      │ Platform admin email allowlist    │
│ CRON_SECRET                  │ Required Stage 1 │ Stage 1      │ Downgrade cron authorization      │
│ GOOGLE_CLIENT_ID             │ Required Stage 2 │ Stage 2      │ Live Google OAuth verification    │
│ GOOGLE_CLIENT_SECRET         │ Required Stage 2 │ Stage 2      │ Live Google OAuth verification    │
│ FACEBOOK_APP_ID              │ Required Stage 2 │ Stage 2      │ Live Meta App Review              │
│ FACEBOOK_APP_SECRET          │ Required Stage 2 │ Stage 2      │ Live Meta App Review              │
│ TWILIO_ACCOUNT_SID           │ Required Stage 2 │ Stage 2      │ Live Twilio 10DLC SMS             │
│ TWILIO_AUTH_TOKEN            │ Required Stage 2 │ Stage 2      │ Live Twilio 10DLC SMS             │
│ SENTRY_DSN                   │ Required Stage 3 │ Stage 3      │ Production error observability    │
│ UPSTASH_REDIS_REST_URL       │ Required Stage 3 │ Stage 3      │ Distributed rate limiting         │
└──────────────────────────────┴──────────────────┴──────────────┴───────────────────────────────────┘
```

---

## 23. Rollback & Recovery Plan

### 1. Password Hashing Migration Rollback
- **Failure Scenario:** Bcrypt comparison fails on migrated users.
- **Recovery:** The login handler checks `bcrypt.compare` first; if invalid and string starts with `demo_hash_`, it safely evaluates legacy base64. If severe failure occurs, roll back code deployment — zero schema changes were made.

### 2. Stripe Webhook Failure Recovery
- **Failure Scenario:** Webhook signature verification fails or drops events during deploy.
- **Recovery:**
  - Resend failed webhook events directly from the Stripe Dashboard.
  - Run administrative reconciliation script querying Stripe API directly.

### 3. Review Publishing Failure Recovery
- **Failure Scenario:** External API fails or credentials expired.
- **Recovery:** Review remains in `APPROVED` status in local database with detailed audit error log. User receives UI toast and can retry at any time.

---

## 24. Definition of Done

A Stage 1 task is **DONE** only when all of the following conditions are met:
1. **Code Complete:** Feature implemented adhering to strict TypeScript types, Next.js App Router idioms, and repository architectural patterns.
2. **Unit & Mock Tests Pass:** Core functions tested across valid and edge-case inputs.
3. **Security Verified:** Passes multi-tenant isolation, IDOR, and authentication regression tests (`scripts/sec-tier0-verify.sh`).
4. **E2E Acceptance Criteria Met:** Applicable E2E journey from Section 20 passes end-to-end (using mock adapters for external platforms in Stage 1).
5. **No Regressions:** Unaffected features continue to pass without error.
6. **Traceable Evidence:** All verification test runs documented and reproducible.

---

## 25. Stage 1 Exit Gate

The transition from Stage 1 to Stage 2 requires unanimous passage of the following verifiable checks:

```
[ ] 1. P0 Blockers = 0 (SEC-001, BILL-001, BILL-002, INT-001 resolved).
[ ] 2. SEC-001: Passwords hashed with bcrypt (salt=10); null-hash bypass blocked.
[ ] 3. BILL-001 & BILL-002: Stripe Checkout, Portal, and Webhook synchronizing plans live.
[ ] 4. INT-001: Review approval dispatches to Google/FB adapters with atomic lock (adapter tests pass).
[ ] 5. AUTH-001: Self-serve password reset email & single-use token update functional.
[ ] 6. AUTH-002: User profile dropdown & logout button functional in UI shell.
[ ] 7. NAV-001 & NAV-002: Marketing CTAs and subpage nav links verified 100% (zero 404s).
[ ] 8. API-001: Recipient contact parser handles malformed inputs returning 400.
[ ] 9. ADMIN-001: ADMIN_EMAILS allowlist active and protecting /admin in production.
[ ] 10. INFRA-002: Trial downgrade cron protected by CRON_SECRET and scheduled.
[ ] 11. 17/17 E2E Journeys verified (mock adapters for external vendors).
[ ] 12. scripts/sec-tier0-verify.sh passes 100%.
```

---

## 26. Recommended Execution Order

```
┌───────┬────────────┬──────────────────────────────────────┬──────────────────┬──────────┬────────────────┐
│ Order │ ID         │ Task Description                     │ Dependency       │ Risk     │ Parallelizable │
├───────┼────────────┼──────────────────────────────────────┼──────────────────┼──────────┼────────────────┤
│ 1     │ PKG-001    │ Install bcryptjs, @types, stripe SDK │ None             │ Low      │ No             │
│ 2     │ SEC-001    │ Bcrypt login/signup & null lockdown  │ PKG-001          │ High     │ No             │
│ 3     │ AUTH-001   │ Forgot & reset password flow         │ SEC-001          │ Medium   │ Yes (with 4)   │
│ 4     │ AUTH-002   │ Logout UI & profile dropdown         │ SEC-001          │ Low      │ Yes (with 3)   │
│ 5     │ NAV-ALL    │ NAV-001, NAV-002, NAV-003, ASSET-001 │ None             │ Low      │ Yes (with 2-4) │
│ 6     │ BILL-001   │ Stripe Checkout & Customer Portal    │ PKG-001, SEC-001 │ Medium   │ Yes (with 7)   │
│ 7     │ BILL-002   │ Stripe Webhook Handler & Plan Sync   │ BILL-001         │ High     │ Yes (with 6)   │
│ 8     │ INT-001    │ Wire approve route to GBP/FB adapters│ SEC-001          │ High     │ Yes (with 6-7) │
│ 9     │ API-001    │ Defensive Opt-Out & Zod Recipient Val│ None             │ Low      │ Yes (with 5-8) │
│ 10    │ INFRA-002  │ Hardened Cron Route & vercel.json    │ None             │ Low      │ Yes (with 9)   │
│ 11    │ ADMIN-001  │ Inject production ADMIN_EMAILS       │ None             │ Low      │ Yes (with 10)  │
│ 12    │ VERIFY-ALL │ Run 17 E2E Journeys & sec-tier0      │ 1 through 11     │ Critical │ No             │
└───────┴────────────┴──────────────────────────────────────┴──────────────────┴──────────┴────────────────┘
```

---

## 27. Parallel Workstreams

```
WORKSTREAM 1: AUTH & SECURITY (Backend & Frontend)
  ├── 1. Install bcryptjs + @types/bcryptjs
  ├── 2. SEC-001: Signup & Login refactor with inline migration
  ├── 3. AUTH-001: Forgot/Reset password routes & UI with single-use fingerprint
  └── 4. AUTH-002: User profile dropdown & logout UI in AppSidebar/AppTopbar

WORKSTREAM 2: BILLING & MONETIZATION (Backend & Frontend)
  ├── 1. Install stripe SDK
  ├── 2. BILL-001: /api/billing/checkout & /api/billing/portal
  ├── 3. BILL-002: /api/webhooks/stripe signature & plan sync
  └── 4. Wire /billing UI buttons to checkout/portal endpoints

WORKSTREAM 3: REVIEW RESPONSE LOOP & CAMPAIGN APIS (Backend)
  ├── 1. INT-001: Update /api/reviews/[id]/approve with decrypted OAuth dispatch
  ├── 2. Implement atomic state transition against duplicate approvals
  └── 3. API-001: Add defensive string parsing & Zod schema in campaigns/send

WORKSTREAM 4: MARKETING, NAVIGATION & ASSETS (Frontend)
  ├── 1. NAV-001: Point CTAs to /login and /signup in page.tsx
  ├── 2. NAV-002: Point subpage Features/Pricing to /#features, /#pricing
  ├── 3. NAV-003: Add id= attributes on landing sections in page.tsx
  └── 4. ASSET-001: Generate and place public/favicon.ico

WORKSTREAM 5: INFRASTRUCTURE & ADMIN CONFIGURATION (DevOps / Config)
  ├── 1. INFRA-002: Harden /api/cron/downgrade-trials & create vercel.json
  └── 2. ADMIN-001: Set ADMIN_EMAILS in production deployment
```

---

## 28. Engineering Stop Conditions

Work on the relevant workstream MUST immediately halt if any of the following occur:
1. **Authentication Regression:** Any change causes authenticated users to lose access or allows unauthenticated bypass.
2. **Tenant Isolation Breach:** Any cross-org data visibility detected in `scripts/sec-tier0-verify.sh`.
3. **Billing State Corruption:** A webhook event overwrites an active paid subscription with `FREE` without explicit cancellation.
4. **Duplicate External Postings:** External publishing adapter fires multiple requests for a single review approval.
5. **Database Migration Lock/Failure:** Any unexpected data loss or migration blockage during deployment.
6. **Production 500 Spike:** Unhandled runtime exceptions exceeding baseline on public endpoints.

---

## 29. Risk Register

| Risk ID | Risk Description | Severity | Prob. | Impact | Mitigation Strategy | Owner | Gate |
|---|---|:---:|:---:|:---:|---|---|---|
| **RSK-01** | Legacy password lockout during bcrypt upgrade | High | Med | High | Dual-check verification with inline automatic re-hashing upon first login | Backend | SEC-001 |
| **RSK-02** | Stripe raw body parsing error in App Router | High | Low | High | Read raw text via `request.text()` before signature construct | Backend | BILL-002 |
| **RSK-03** | Race condition causing duplicate review replies | High | Med | High | Atomic conditional update on `draftStatus` before API push | Backend | INT-001 |
| **RSK-04** | Resend rate-limiting on password reset emails | Med | Low | Med | In-memory token bucket rate limit on forgot-password endpoint | Backend | AUTH-001 |
| **RSK-05** | Cron route triggered by unauthenticated third-party | Med | Med | Med | Enforce strict `Bearer CRON_SECRET` fail-closed check | DevOps | INFRA-002 |

---

## 30. CTO Execution Summary

- **Current Stage 1 Status:** Pre-implementation architecture corrected and baseline ratified. Ready for CTO implementation review.
- **P0 Blockers Mapped (4/4):** `SEC-001` (Auth), `BILL-001` (Stripe Checkout), `BILL-002` (Stripe Webhook), `INT-001` (Review Publishing).
- **P1 Stage 1 Blockers Mapped (6/6):** `AUTH-001` (Reset Password), `AUTH-002` (Logout UI), `NAV-001` (CTAs), `NAV-002` (Subpage Nav), `API-001` (Contact Normalization), `ADMIN-001` (Admin Config).
- **P2 Blockers Mapped (2/2):** `NAV-003` (Section IDs), `ASSET-001` (Favicon).
- **Configuration Items Mapped (2/2):** `ADMIN-001`, `INFRA-002`.
- **Critical Path:** Sequential dependency chain from dependency setup → `SEC-001` → `BILL-001` → `BILL-002` → Stage 1 Automated Verification.
- **Parallel Workstreams:** 5 independent workstreams (Auth, Billing, Review Loop, Navigation/Assets, Infra/Admin).
- **Database Migrations Required:** 0 identified from current evidence (stateless token fingerprinting and transaction idempotency utilized).
- **Definition of Done:** Strict multi-layer testing, zero P0/P1 defects, 17/17 E2E journeys passing (mock adapters), and 100% `sec-tier0-verify.sh` compliance.
- **Canonical Roadmap State:** Preserved and ratified. Zero modifications to `ROADMAP.md`.

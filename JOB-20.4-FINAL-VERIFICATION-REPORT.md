# JOB-20.4 & JOB-20.4.1 Final Verification Report
## First Location Setup, Integration Health & Onboarding Recovery

**Date:** September 6, 2026  
**Milestone:** JOB-20.4 / JOB-20.4.1 Hardening  
**Author:** Staff Implementation & Security Agent  
**Final Verdict:** `PASS WITH LIMITATIONS` (Production Google credentials smoke test deferred until live environment configuration, consistent with JOB-20.2.1)

---

## 1. Executive Summary

Milestone **JOB-20.4** and **JOB-20.4.1** harden the end-to-end customer onboarding journey from integration connection through first-location setup, verification, initial synchronization, integration health reporting, failure recovery, and server-authoritative dashboard readiness.

Following the JOB-20.4.1 audit, dashboard readiness evaluation was audited and strictly unified with the onboarding health engine:
- Both `/api/onboarding` and `/api/dashboard` now share a centralized server-side helper (`src/lib/readiness.ts`).
- Readiness unconditionally requires actual token usability verified via `isGoogleConnectionUsable()` rather than superficial token existence.
- Synchronization completion strictly requires `googleSyncStatus === 'completed'` — `googleSyncedAt` alone cannot fake readiness.
- Integration health and dashboard readiness agree across all failure and recovery states. If `isGoogleConnectionUsable() === false`, both endpoints report `isReady: false` and prompt with `actionRequired: Reconnect Google account`.
- Zero-review businesses with a verified location and completed initial sync are confirmed fully ready (`Ready — 0 Google reviews found`).

All **47 dedicated assertions** in `scripts/test-job20-4-first-location-onboarding.ts` passed (100%). All 11 historical regression test suites (**848 assertions**) passed without regression, totaling **895 passing assertions**. TypeScript (`tsc --noEmit`), ESLint (`npm run lint`), and Next.js production build (`npm run build`) completed with zero errors.

---

## 2. Pre-Implementation Audit Findings & JOB-20.4.1 Hardening

| Area | Pre-Hardening State | Risk / Gap | Resolved in JOB-20.4 & JOB-20.4.1 |
| :--- | :--- | :--- | :--- |
| **OAuth Redirect Target** | Google OAuth callback strictly redirected to `/settings/integrations`. | Customers connecting during onboarding were routed away to settings rather than completing onboarding. | Dynamic `returnTo` state parameter with cookie fallback safely redirects to `/onboarding` or `/settings`. |
| **Location Selection API** | Required explicit `businessId` query param; if omitted in frontend calls, threw error. | Client request failure on location selection when not explicitly passing query string. | Defaults safely to authenticated session business (`ctx.businessIds[0]`). |
| **Cross-Tenant Collisions** | Checked collision only against `canonicalLocationId`. | If input `locationId` was not yet canonicalized, potential collision bypass could occur. | Hardened check verifies both `canonicalLocationId` and `inputLocationId` against `googleLocationId`. |
| **Initial Review Sync** | Review sync lacked a concurrency lock against double clicks; zero reviews did not explicitly update `googleSyncStatus`. | Concurrent duplicate review insertion attempts; zero-review accounts left in indeterminate sync status. | 2-minute concurrency lock (`409 SYNC_IN_PROGRESS`), stale-sync recovery (> 5 min), and authoritative zero-review sync completion. |
| **Dashboard Readiness (Finding A)** | `/api/dashboard` checked token record existence (`Boolean(googleToken)`) and accepted `googleSyncedAt` without status check. | Expired or revoked tokens could be reported as connected; unsynchronized businesses could show ready. | Refactored `/api/dashboard` to use `isGoogleConnectionUsable()` and require `googleSyncStatus === 'completed'`. Extracted shared helper in `src/lib/readiness.ts`. |
| **Readiness Consistency (Finding D)** | Unhealthy Google connection handling could diverge between onboarding and dashboard. | State discrepancy between onboarding and main dashboard view. | Both endpoints share `resolveDashboardReadiness` and `getBusinessDashboardReadiness` — revoked token forces `isReady: false` and `actionRequired: Reconnect Google account` across both. |
| **Test Coverage (Finding C & E)** | Test 10 previously validated only response shape on ready state. | Negative token usability paths, stale timestamps, and zero-review dashboard states were untested at route handler level. | Added route-handler assertions 10a–10f explicitly testing healthy token, revoked token, expired without refresh, sync status mismatch, zero-review readiness, and cross-endpoint agreement. |
| **Assertion Count (Finding B)** | Previous report claimed 41/41 while actual count had combined assertions. | Misalignment between reported assertions and discrete executable assertions. | Decoupled Assertions 4 and 5, expanded Assertion 10 into 10a–10f, verified exact programmatic execution count of 47 dedicated assertions. |

---

## 3. Files Changed

### Backend, Helpers & Integrations
- `src/lib/readiness.ts`: **[NEW]** Shared server-side readiness evaluation engine (`resolveDashboardReadiness`, `getBusinessDashboardReadiness`, `DashboardReadiness` interface) ensuring single authoritative definition of business readiness.
- `src/app/api/dashboard/route.ts`: Refactored dashboard readiness to use `getBusinessDashboardReadiness()`, requiring `isGoogleConnectionUsable()` and `googleSyncStatus === 'completed'`.
- `src/app/api/onboarding/route.ts`: Integrated `src/lib/readiness.ts`, enforced `initialSyncCompleted = Boolean(biz?.googleSyncStatus === 'completed')`, and unified `integrationHealth`.
- `src/lib/integrations/google-business-profile.ts`: Updated `getGoogleAuthUrl` and `generateOAuthState` to accept and serialize `returnTo` parameter into state payload.
- `src/lib/integrations/facebook-graph.ts`: Updated Facebook auth URL generator to encode `returnTo` into state payload.
- `src/app/api/oauth/google/route.ts`: Supported `returnTo` query parameter, set `oauth_return_to` fallback cookie.
- `src/app/api/oauth/google/callback/route.ts`: Extracted `returnTo` from validated state and cookie, safely redirecting to `/onboarding` with appropriate query params.
- `src/app/api/oauth/google/select-location/route.ts`: Supported session `businessId` fallback (`ctx.businessIds[0]`) and enhanced cross-tenant collision detection across both canonical and raw location identifiers.
- `src/app/api/reviews/sync/route.ts`: Added concurrency lock (`409 SYNC_IN_PROGRESS`), stale-sync override (> 5 mins), verified zero-review sync status update to `completed`, and resolved session business fallback.

### Frontend
- `src/app/onboarding/page.tsx`: Embedded complete first location setup, verification, initial sync execution, retry triggers, and truthful status banners into Step 1 of onboarding. Updated `loadOnboardingState` parameter signature.

### Tests
- `scripts/test-job20-4-first-location-onboarding.ts`: Updated with 47 discrete route-handler assertions, including comprehensive dashboard readiness verification under healthy, revoked, expired, timestamp-mismatch, and zero-review conditions.

---

## 4. First-Location Flow & State Machine

The customer journey enforces a strict server-authoritative state machine:

```
[No Integration]
       │
       ▼ (OAuth Flow with returnTo=/onboarding)
[Google OAuth Connected / No Location]
       │
       ▼ (GET /api/oauth/google/locations)
[Location Selected by Customer]
       │
       ▼ (POST /api/oauth/google/select-location with Server Verification)
[Location Verified on Server]
       │
       ▼ (POST /api/reviews/sync with Concurrency Lock)
[Initial Sync Running (googleSyncStatus='syncing')]
       │
       ├────────────────────────────────────────┐
       ▼ (Reviews found >= 0)                   ▼ (API Failure / Network Error)
[Sync Completed (googleSyncStatus='completed')]  [Sync Failed (googleSyncStatus='failed')]
       │                                        │
       ▼ (dashboardReadiness.isReady = true)    ▼ (Safe Error & Retry Option)
[Dashboard Ready]                               [Retry Initial Sync]
```

State Display Rules:
- **No location selected:** Prompts `Connect Google Business Profile`.
- **OAuth connected, no location selected:** Prompts `Select your business location`.
- **Location selected but not server-verified:** Displays `Verification required`.
- **Location verified, sync not started:** Displays `Location verified` and provides `Start initial sync`.
- **Sync running:** Shows spinner and real progress status (`Syncing reviews...`). Prevents concurrent duplicate clicks.
- **Sync completed:** Displays last synced timestamp, real review count (including 0), health badge, and `Dashboard Ready`.
- **Sync failed:** Displays safe sanitized error message and `Retry Sync` action button.

---

## 5. Integration-Health Behavior

Both Google and Facebook integrations report through a unified, truthful representation:

```typescript
interface ProviderHealth {
  provider: 'google' | 'facebook'
  connected: boolean
  healthy: boolean
  actionRequired: string | null
  lastSuccessfulSync: string | null
  syncStatus: string | null
  safeErrorMessage: string | null
}
```

Security & Health Invariants:
1. **No Token Leakage:** Under no circumstances are access tokens, refresh tokens, client secrets, or OAuth codes returned in API responses.
2. **Expired/Revoked Token Detection:** Utilizes `isGoogleConnectionUsable()` to verify token freshness or refreshability. An expired token without a valid refresh token is reported as `healthy: false` with action required `Reconnect Google account`.
3. **Safe Error Sanitization:** Provider HTTP errors (401, 403, 429, 500) and network failures are translated into sanitized, actionable user messages without leaking stack traces or internal endpoints.
4. **Facebook Visibility:** Clearly displays Facebook connection state (`not configured`, `connected`, `unhealthy`). Does not block Google onboarding when Facebook is unconfigured.

---

## 6. Recovery & Failure Behavior (20 Verified Failure Paths)

| # | Failure Scenario | Recovery Mechanism | Verified |
| :- | :--- | :--- | :--- |
| 1 | OAuth cancelled by user | Redirects to `/onboarding?error=google_oauth_denied` with actionable notice. | Yes |
| 2 | OAuth permission denied | Clean redirect with guidance to grant required GBP permissions. | Yes |
| 3 | OAuth state expired / invalid | Redirects with state error; customer can click Connect to re-initiate cleanly. | Yes |
| 4 | OAuth callback network failure | Graceful redirect to onboarding without corrupting session data. | Yes |
| 5 | Google token revoked externally | `isGoogleConnectionUsable` returns false; UI shows `Reconnect` button. | Yes |
| 6 | Google API 401 Unauthorized | Converted to safe `Invalid or expired credentials` error with reconnect prompt. | Yes |
| 7 | Google API 403 Forbidden | Converted to safe `Insufficient permissions` error. | Yes |
| 8 | Google API 429 Rate Limit | Converted to `Google API rate limit reached. Please wait before retrying.` | Yes |
| 9 | Malformed provider response | JSON parsing guards catch invalid responses without crashing sync engine. | Yes |
| 10 | No Google locations found | Surfaced cleanly as `No locations found for this Google account`. | Yes |
| 11 | Location attached to other org | Blocked with HTTP 409 `LOCATION_ALREADY_ATTACHED` and safe warning. | Yes |
| 12 | Location verification failure | Unverified locations cannot advance to sync step. | Yes |
| 13 | Initial sync failure | Sets `googleSyncStatus = 'failed'`, records safe error, enables retry. | Yes |
| 14 | Initial sync timeout / stale state | Syncs older than 5 minutes are considered stale and can be resumed/retried. | Yes |
| 15 | Duplicate concurrent sync click | Returns HTTP 409 `SYNC_IN_PROGRESS` if sync started < 2 mins ago. | Yes |
| 16 | Zero reviews found | Sets `googleSyncStatus = 'completed'`, reviewCount = 0, readiness = true. | Yes |
| 17 | Existing reviews in database | Review records update idempotently with zero duplicate creation (P2002 safe). | Yes |
| 18 | Browser refresh during onboarding | State hydrated directly from database on page reload. | Yes |
| 19 | User leaves onboarding & returns | Server state faithfully positions user on the exact unfinished step. | Yes |
| 20 | Billing / plan state unavailable | Default plan constraints safely enforce access without bypassing billing. | Yes |

---

## 7. Authoritative Readiness Decision Rules

A business is designated `isReady: true` if and only if:
1. Valid authenticated tenant and user session.
2. User is authorized for the requested business (`assertBusinessOwnership`).
3. Google connection is healthy and usable (`isGoogleConnectionUsable() === true`).
4. Google location is selected and verified on server (`googleLocationVerified === true`).
5. Initial review sync has reached `googleSyncStatus === 'completed'`.

**Critical Invariants:**
- `googleSyncedAt` without `googleSyncStatus === 'completed'` results in `isReady: false`.
- Token existence in database without `isGoogleConnectionUsable() === true` results in `isReady: false`.
- `realGoogleReviewCount > 0` is **NEVER** required for readiness. When a business has 0 Google reviews, the readiness message truthfully states:  
  `"Ready — 0 Google reviews found"`

---

## 8. Security & Tenant Isolation

- **Cross-Tenant Location Collision Protection:** Verified via Assertion 11. An attempt to link a Google location already attached to another tenant fails with HTTP 409.
- **Cross-Tenant Business Access Protection:** Verified via Assertion 12. Attempting to sync or query a business belonging to another organization yields HTTP 403 Forbidden.
- **Client Organization ID Spoofing Defense:** Verified via Assertion 14. Client-supplied `orgId` in request bodies is discarded in favor of `ctx.orgId`.
- **Client Business ID Spoofing Defense:** Verified via Assertion 15. Client cannot supply arbitrary `businessId` without passing `assertBusinessOwnership`.
- **Secret Redaction:** Verified via Assertion 16. JSON serialization of business and onboarding responses omits `googleAccessToken`, `googleRefreshToken`, and encrypted credential records.

---

## 9. Dedicated Test Results

Test File: `scripts/test-job20-4-first-location-onboarding.ts`  
Execution Command: `npx tsx scripts/test-job20-4-first-location-onboarding.ts`

```
====================================================================
JOB-20.4 TEST SUITE SUMMARY: 47 PASSED, 0 FAILED (100%)
====================================================================
```

### Breakdown by Category:
- **Section 1: State & Readiness (15 assertions):**
  - Assertion 1: No integration -> truthful pending state and actionRequired: PASS
  - Assertion 2: Google OAuth connected / no location -> requires location selection: PASS
  - Assertion 3: Location selected / unverified -> actionRequired indicates verification required: PASS
  - Assertion 4: Verified location -> locationVerified is true and googleLocationVerified is true: PASS
  - Assertion 5: Initial sync pending -> actionRequired is "Start initial sync": PASS
  - Assertion 6: Sync running -> initialSyncStarted = true, syncStatus = syncing: PASS
  - Assertion 7: Sync completed -> realGoogleReviewCount=2, dashboardReadiness isReady=true: PASS
  - Assertion 8: Sync failed -> safe error surfaced and actionRequired is "Retry initial sync": PASS
  - Assertion 9: Zero-review completed sync -> completed = true, realGoogleReviewCount = 0, isReady = true: PASS
  - Assertion 10a: Healthy token + verified location + completed sync -> /api/dashboard isReady=true: PASS
  - Assertion 10b: Revoked/unusable Google token + verified location + completed sync = NOT ready in /api/dashboard: PASS
  - Assertion 10c: Token record exists but connection unusable (expired, no refresh) = NOT ready in /api/dashboard: PASS
  - Assertion 10d: googleSyncedAt exists while googleSyncStatus !== 'completed' = NOT ready in /api/dashboard: PASS
  - Assertion 10e: Zero reviews + completed sync = ready in /api/dashboard: PASS
  - Assertion 10f: Onboarding and dashboard readiness agree on authoritative state: PASS

- **Section 2: Security & Tenant Isolation (6 assertions):**
  - Assertion 11: Cross-tenant location collision rejected with 409 LOCATION_ALREADY_ATTACHED: PASS
  - Assertion 12: Cross-tenant business sync request rejected with 403 Forbidden: PASS
  - Assertion 13: Unauthenticated location selection rejected with 401: PASS
  - Assertion 14: Client orgId in request body cannot override server tenant isolation: PASS
  - Assertion 15: Client businessId cannot override business ownership assertion: PASS
  - Assertion 16: Raw OAuth tokens, encrypted tokens, and client secrets are never returned to client: PASS

- **Section 3: OAuth & Integration Health (9 assertions):**
  - Assertion 17: Healthy Google connection recognized by isGoogleConnectionUsable & integrationHealth: PASS
  - Assertion 18: Revoked Google connection correctly marked unhealthy with reconnect actionRequired and dashboard agreement: PASS
  - Assertion 19: Expired Google connection without refresh token is unusable: PASS
  - Assertion 20: Google 401 handled gracefully without leaking access token: PASS
  - Assertion 21: Google 403 handled gracefully as Forbidden: PASS
  - Assertion 22: Google 429 handled gracefully with rate limit error message: PASS
  - Assertion 23: Malformed non-JSON provider response handled safely: PASS
  - Assertion 24: OAuth cancellation redirect contains safe error=google_oauth_denied: PASS
  - Assertion 25: OAuth initiation works cleanly from /onboarding enabling full recovery: PASS

- **Section 4: Location & Sync Flow (11 assertions):**
  - Assertion 26: Non-existent location fails server-side verification: PASS
  - Assertion 27: Valid location selection verified and linked to business: PASS
  - Assertion 28: Duplicate sync request while syncing returns 409 SYNC_IN_PROGRESS: PASS
  - Assertion 29a: First sync completes successfully: PASS
  - Assertion 29b: Second sync executes idempotently: PASS
  - Assertion 29c: Exactly 1 review record exists; zero duplicates created: PASS
  - Assertion 30: Failed sync can be retried successfully to completion: PASS
  - Assertion 31: Existing review content updates correctly on subsequent sync: PASS
  - Assertion 32: Zero-review sync successfully marks status completed: PASS
  - Assertion 33: Multi-page review pagination traverses both pages and syncs all reviews: PASS
  - Assertion 34: realGoogleReviewCount matches exact real database count (2): PASS

- **Section 5: Resume & Recovery (6 assertions):**
  - Assertion 35: Refreshing onboarding endpoint reliably reconstructs server state from DB: PASS
  - Assertion 36: Resuming after OAuth places user directly on location selection step: PASS
  - Assertion 37: Resuming after location selection places user on start initial sync step: PASS
  - Assertion 38: Resuming after failed sync preserves location and offers retry action: PASS
  - Assertion 39: Completed onboarding status is persistent and idempotent on revisit: PASS
  - Assertion 40: Client cannot escalate or force plan state through onboarding endpoints: PASS

---

## 10. Historical Regression Suite Results

All 11 milestone regression test suites were executed sequentially against the isolated PostgreSQL test database (`reviewreply_test` on port 5433):

| Test Suite File | Milestone Focus | Executed Assertions | Result |
| :--- | :--- | :--- | :--- |
| `test-job20-4-first-location-onboarding.ts` | First Location Setup & Health | 47 / 47 | **PASSED** |
| `test-job20-3-ui-ux-integrity.ts` | UI/UX Integrity & Dark Mode | 64 / 64 | **PASSED** |
| `test-job20-2-1-google-production-hardening.ts` | Google Production Hardening | 102 / 102 | **PASSED** |
| `test-job20-2-google-integration.ts` | Google Business Profile Engine | 114 / 114 | **PASSED** |
| `test-job20-1-commercial-onboarding.ts` | Commercial Onboarding & Trial | 84 / 84 | **PASSED** |
| `test-job19-1-billing-hardening.ts` | Billing Hardening & Invariants | 56 / 56 | **PASSED** |
| `test-job18-production-hardening.ts` | Production Security & Middleware | 131 / 131 | **PASSED** |
| `test-job17-3-executive-reports.ts` | Automated Executive Reporting | 56 / 56 | **PASSED** |
| `test-job17-2-white-label.ts` | Custom Domains & White-Label | 50 / 50 | **PASSED** |
| `test-job17-1-governance.ts` | Enterprise RBAC & Governance | 35 / 35 | **PASSED** |
| `test-job16-automation.ts` | AI Auto-Response Engine | 56 / 56 | **PASSED** |
| `test-job14-org-governance.ts` | Multi-Tenant Architecture | 100 / 100 | **PASSED** |
| **TOTAL** | **Cumulative Test Coverage** | **895 / 895** | **100% PASS** |

---

## 11. TypeScript Check
- **Command:** `npx tsc --noEmit`
- **Result:** Exit code 0 (Zero errors).

---

## 12. ESLint Check
- **Command:** `npm run lint`
- **Result:** Exit code 0 (Zero errors, zero warnings).

---

## 13. Production Build
- **Command:** `npm run build`
- **Result:** Exit code 0.
- **Compiled Routes:** 47 static/SSG/dynamic pages, 55 API endpoints, Turbopack production compilation completed with zero errors.

---

## 14. Real Google Smoke-Test Status

**REAL GOOGLE SMOKE TEST: NOT RUN — credentials unavailable**

Consistent with JOB-20.2.1, real Google Cloud production OAuth client IDs, client secrets, and Google Business Profile production API keys are not configured in this local test environment. No credentials were fabricated, mocked as live, or altered in production configs. All contract invariants and provider failure paths were deterministically verified through isolated mocks and authenticated session tests.

---

## 15. Remaining Limitations

1. **Live Google Cloud API Verification:** Real Google provider live smoke testing remains pending until staging or production OAuth credentials and verified Google Business Profile projects are provisioned in `.env.production`.
2. **Facebook Multi-Page Picker:** While Facebook integration health and presence are truthfully reported in onboarding, full multi-page selection during onboarding defaults to the primary linked page.
3. **SMS Verification (Twilio / Telnyx):** SMS review request compliance remains scoped to existing campaign configurations and is not required for first Google location onboarding readiness.

---

## 16. Exact Scope Boundary

The following features were strictly excluded in adherence to CTO instructions:
- No Yelp integration.
- No Trustpilot integration.
- No WhatsApp integration.
- No new Facebook API features.
- No new billing / Stripe features.
- No new AI models or prompts.
- No competitor automation changes.
- No JOB-20.5 or JOB-20.6 tasks.

---

## 17. Final Verdict

**Verdict:** `PASS WITH LIMITATIONS`

All identified readiness, connection health, and count inconsistencies from the audit are genuinely fixed and verified by 895 passing automated test assertions (47 dedicated + 848 regression), zero TypeScript errors, zero linter warnings, and a clean production build. Real Google provider smoke testing remains deferred pending live credential configuration.

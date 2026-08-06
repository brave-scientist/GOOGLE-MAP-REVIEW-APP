# Backend Audit Report — ReviewReply-Lite

**Audit date:** 2025-01-30  
**Auditor:** Backend Auditor (Explore sub-agent)  
**Task ID:** `audit-2`  
**Scope:** All files in `app/api/`, `lib/`, `supabase/migrations/`, `scripts/seed.ts`  
**Codebase root:** `/home/z/my-project/review-app-extracted/REVIEW APP/`  
**Files inspected end-to-end:** 29 backend files (10 API routes, 13 lib modules, 2 migrations, 1 script, 3 store/auth helpers)

---

## 1. Executive Summary

- **The backend is a well-architected mock-mode demo, NOT a production-ready SaaS.** It runs end-to-end with zero real credentials (`USE_MOCKS=true` default), but flipping to production mode (`USE_MOCKS=false`) would break auth, billing, Google, and Facebook paths immediately.
- **Real Supabase Auth is not wired.** `app/api/auth/route.ts` returns `501 Not Implemented` in real mode. `SupabaseStore.signIn()` always throws `"not implemented in real mode"`. There is no signup, password reset, or email verification endpoint.
- **No Stripe webhook handler exists**, despite `lib/integrations/stripe.ts` referencing `app/api/webhooks/stripe/route.ts`. The checkout endpoint calls `finalizeCheckout()` directly, which writes a subscription row even in real mode — bypassing Stripe entirely and creating phantom subscriptions.
- **No OAuth callback handlers for Google or Facebook.** The mock connect flow at `/api/businesses/[id]/connect/google` uses `MOCK_GOOGLE_LOCATIONS` from `mock-data.ts` in the **production code path with no `isMockMode()` guard** — this is a real mock-data leak.
- **The real Google Business Profile integration is broken:** `fetchReviews()` hardcodes `accountId = ""` (line 51), and `postReply()` literally `throw new Error("real path requires review name resolution — see MOCK-TO-REAL.md")`. Same for Facebook `postReply()` — throws unconditionally in real mode.
- **No rate limiting anywhere.** No CSRF protection. No audit log table. No idempotency keys for billing. No webhook signature verification for Stripe/Inngest.
- **PII is not encrypted at rest.** `review_requests.customer_contact` is plain `text` in the schema. `*_oauth_token_encrypted` columns are named `*_encrypted` but nothing actually encrypts them — mock values like `mock-enc-token-${Date.now()}` are stored as-is.
- **Critical type/schema mismatch:** `lib/types.ts` exports `SubscriptionPlan = "starter" | "pro" | "enterprise"` and `PLAN_LIMITS`/`PLAN_PRICES` include `enterprise: $249`, but the SQL enum `subscription_plan` only allows `('starter','pro')`. Inserting an `enterprise` row will throw a Postgres enum violation. No API route accepts `enterprise` either.
- **N+1 query problem in 4 hot paths:** `reviews/[id]/draft/route.ts`, `reviews/[id]/reply/route.ts`, `inngest/generate-reply-draft.ts`, `inngest/send-review-request.ts` all iterate `getBusinessesForUser()` (or `listConnectedBusinesses()`) and call `listReviews()` / `listReviewRequests()` for each — instead of fetching the review/request directly by ID. This is O(n) calls per request and will not scale.
- **`/api/dev/trigger` has NO authentication** — anyone on the internet can POST to `?job=poll-reviews` or `?job=send-review-request&request_id=<any-uuid>` and trigger background jobs. This is a critical security hole.
- **No background job for review-request click tracking.** The `click_token` field is generated, and the send job includes `${NEXT_PUBLIC_APP_URL}/r/${request.click_token}` in SMS/email bodies, but there is **no `/r/[token]` route** anywhere in the codebase. Clicks are never recorded; `status = "clicked"` is unreachable from real flows.
- **No daily-digest cron, no new-review notification job.** The `notify_new_review_email`, `notify_new_review_sms`, `daily_digest` business flags are stored but nothing acts on them.

---

## 2. Per-File Findings Table

| File | Status | Issues | Severity |
|---|---|---|---|
| `app/api/auth/route.ts` | ⚠️ Mock-only | Real mode returns 501; no signup, no password reset, no email verification; `email.includes("@")` is the only validation; no rate limiting on sign-in (brute-force vector) | Critical |
| `app/api/auth/active-business/route.ts` | ⚠️ Partial | Uses `(cookieStore as any).set(...)` type-unsafe cast; no validation that `businessId` is a UUID or belongs to the user (relies on downstream checks); no signed cookie | Medium |
| `app/api/businesses/route.ts` | ⚠️ Partial | Manual validation instead of Zod (despite `zod` being a dependency); no length cap on `name`/`brand_voice_notes`; no rate limiting; no audit log | Medium |
| `app/api/businesses/[id]/route.ts` | ⚠️ Partial | PATCH uses allow-set but accepts arbitrary types for each field (no validation); `Partial<Business>` cast — owner could set `category` to invalid string bypassing the enum | Medium |
| `app/api/businesses/[id]/connect/google/route.ts` | ❌ Mock-leak | **Imports `MOCK_GOOGLE_LOCATIONS` in production path with no `isMockMode()` guard**; stores `mock-enc-token-${Date.now()}` as if it were encrypted; no real OAuth code; Facebook connect endpoint is missing entirely | Critical |
| `app/api/businesses/[id]/review-requests/route.ts` | ✅ OK | Simple list endpoint; auth check present; no issues | Low |
| `app/api/businesses/[id]/review-requests/upload/route.ts` | ⚠️ Partial | No file size limit (DoS via huge CSV); no MIME type check; no virus scan; reuses paste-list parser (fine) | Medium |
| `app/api/businesses/[id]/review-requests/parse-paste/route.ts` | ⚠️ Partial | No length cap on input text (DoS); no rate limiting | Low |
| `app/api/businesses/[id]/review-requests/quick-add/route.ts` | ⚠️ Partial | Phone validation is `replace(/\D/g, "").length >= 10` (accepts 15-digit junk); email validation is `includes("@")`; calls `runSendReviewRequest` synchronously in request handler — blocks response until SMS/email sent; no plan-limit enforcement via `countRequestsThisMonth` | High |
| `app/api/businesses/[id]/review-requests/send-batch/route.ts` | ⚠️ Partial | Same synchronous send loop (no queue); no max-batch-size cap; no idempotency; no per-business rate limiting; no plan-limit check before sending | High |
| `app/api/reviews/[id]/draft/route.ts` | ❌ N+1 | Iterates ALL user businesses, calls `listReviews()` for each to find one review by ID — should be a single `getReviewById(id)` query; no rate limiting on AI generation | High |
| `app/api/reviews/[id]/reply/route.ts` | ❌ N+1 | Same N+1 pattern to find the review; posts to platform integration which **throws unconditionally in real mode** (Google/Facebook `postReply`); stores `"mock-token"` fallback in real mode if `oauth_token_encrypted` is null | Critical |
| `app/api/billing/checkout/route.ts` | ❌ Broken in real mode | Calls `finalizeCheckout()` directly instead of `createCheckoutSession()` — even when `USE_MOCKS=false`, this writes a fake subscription row with `stripe_customer_id: null` and `stripe_subscription_id: null`; never redirects to real Stripe Checkout | Critical |
| `app/api/billing/manage/route.ts` | ⚠️ Partial | Uses `businesses[0]` — assumes single business per user (breaks multi-location enterprise plan); no idempotency key; no audit log of plan changes | High |
| `app/api/inngest/route.ts` | ❌ No auth | `serve()` is called with no `signatureKey`, no auth middleware — anyone can POST fake Inngest events; Inngest SDK supports `streaming: "allow"` and signature verification but neither is configured | Critical |
| `app/api/dev/trigger/route.ts` | ❌ No auth | **Anyone can trigger any background job** — `POST /api/dev/trigger?job=send-review-request&request_id=<uuid>` with no auth check; not gated by `process.env.NODE_ENV !== 'production'` | Critical |
| `lib/auth.ts` | ⚠️ Mock-only | `getCurrentUser()` calls `store.getCurrentUser()` in both branches — real mode is identical to mock mode (the comment "Real mode: SupabaseStore.getCurrentUser resolves via the server client" is misleading — it just calls the same interface method); `setActiveBusinessId` uses `(cookieStore as any)` cast | High |
| `lib/db.ts` | ✅ OK | Clean interface; singleton store; `_resetStoreForTest` helper; good separation | Low |
| `lib/types.ts` | ⚠️ Mismatch | `SubscriptionPlan` includes `"enterprise"` but SQL enum and API routes only accept `starter`/`pro`; `PLAN_PRICES.enterprise` is $249 but `priceForPlan()` returns starter or pro only; `AI_MODEL = "claude-sonnet-4-6"` is a non-existent model name (real Anthropic model is `claude-sonnet-4-5` or `claude-3-5-sonnet-20241022`) | High |
| `lib/ai/draft-reply.ts` | ⚠️ Partial | Rule-based engine is genuinely good. Real Anthropic path uses `process.env.ANTHROPIC_API_KEY!` non-null assertion (would crash if missing); no retry/backoff; no token usage logging; no timeout on the fetch; uses a non-existent model name | Medium |
| `lib/inngest/client.ts` | ⚠️ Partial | `triggerJob()` swallows errors silently with `console.log` — failures are invisible; no Inngest Event Key configuration; no local dev-server detection | Medium |
| `lib/inngest/index.ts` | ✅ OK | Clean registry of 3 functions | Low |
| `lib/inngest/poll-reviews.ts` | ⚠️ Partial | Cron `*/20 * * * *` is configured; uses `business.google_oauth_token_encrypted ?? "mock-token"` — in real mode with null token, passes `"mock-token"` to real Google API (would 401); dedup logic relies on `Date.now() - fetched_at < 5000` which is fragile (race condition if the DB write is slow) | High |
| `lib/inngest/generate-reply-draft.ts` | ❌ N+1 + bug | Iterates `listConnectedBusinesses()` then `listReviews()` for each — same N+1; `autoPostIfEligible` uses `const token = "mock-token"` hardcoded — in real mode with auto-post on, it would post via mock integration, not real Google/Facebook | Critical |
| `lib/inngest/send-review-request.ts` | ❌ N+1 + missing click | Same N+1 to find request by ID; `${APP_URL}/r/${request.click_token}` is generated but **no `/r/[token]` route exists** — links in SMS/emails 404; `runSendBatch` is exported but never called by any route (the send-batch route calls `runSendReviewRequest` in a loop instead) | Critical |
| `lib/integrations/resend.ts` | ⚠️ Partial | Real path uses `from: "ReviewReply-Lite <notifications@reviewreply.app>"` — hardcoded domain that may not be verified in Resend; no retry; no bounce handling; no webhook for delivery status | Medium |
| `lib/integrations/stripe.ts` | ⚠️ Partial | `createCheckoutSession` exists and works in real mode, but **is never called** by the checkout route; `changePlan` uses `process.env.STRIPE_PRICE_ID_STARTER!` non-null assertion; no idempotency key passed to Stripe; `reportOverageUsage` exists but is never called anywhere; `priceForPlan` doesn't handle enterprise | High |
| `lib/integrations/twilio.ts` | ⚠️ Partial | Real path is correct; no retry; no webhook for delivery status; no STOP/HELP keyword handling (10DLC compliance); no phone number validation/E.164 normalization | Medium |
| `lib/integrations/google-business-profile.ts` | ❌ Broken real path | `fetchReviews` real path: `const accountId = "";` hardcoded empty — URL becomes `accounts//locations/{id}/reviews`; `postReply` real path: `throw new Error(...)` unconditionally — never works in real mode | Critical |
| `lib/integrations/facebook-graph.ts` | ❌ Broken real path | `fetchPageRatings` real path looks correct but uses URL-embedded access token (should be header); `postReply` real path: `throw new Error(...)` unconditionally — never works in real mode | Critical |
| `lib/integrations/mock-data.ts` | ⚠️ Leak risk | Used by `connect/google/route.ts` (production path, no mock guard); used by `google-business-profile.ts` and `facebook-graph.ts` (properly guarded by `USE_MOCKS`); `MOCK_FACEBOOK_PAGES` is exported but never used anywhere | Medium |
| `lib/parsing/paste-list-parser.ts` | ✅ OK | Pure function; handles edge cases; no injection risk (returns structured data, not SQL) | Low |
| `lib/supabase/server.ts` | ⚠️ Partial | `createServerSupabaseClient` swallows `setAll` errors silently (acceptable for Server Components but hides bugs); `createServiceRoleClient` bypasses RLS — must never be called from a request-scoped path (currently used by SupabaseStore for writes, which is correct) | Medium |
| `lib/supabase/local-store.ts` | ⚠️ Partial | File-based JSON store with in-process write lock — works for single-process dev only; not safe for multi-instance deploys; no file rotation; `structuredClone(EMPTY_DB)` is fine; `listConnectedBusinesses` correctly checks for connected identifiers | Medium |
| `lib/supabase/supabase-store.ts` | ❌ Multiple bugs | `signIn()` always throws "not implemented in real mode" — real auth flow is dead; `listConnectedBusinesses()` uses `.or("google_business_profile_account_id.neq.,...")` which is syntactically wrong (empty values after `.neq.`); `upsertSubscription` uses service-role client (bypasses RLS) even for user-initiated checkout; `createReviewRequest` doesn't generate `click_token` if not provided (will be NULL, breaking `/r/{token}` links) | Critical |
| `supabase/migrations/0001_init.sql` | ⚠️ Incomplete | Missing `organizations` table (added in 0002); missing `audit_logs` table; missing `webhook_events` table for idempotency; no index on `businesses.owner_user_id`; no index on `subscriptions.business_id`; no index on `review_requests.click_token`; no index on `review_request_batches.business_id`; `customer_contact` is plain `text` (no encryption); RLS policies only cover `owner_user_id` — no organization-based RLS after 0002 | High |
| `supabase/migrations/0002_add_organizations.sql` | ⚠️ Incomplete | **No RLS policies on `organizations` table** — `alter table public.organizations enable row level security;` is missing entirely; no `org_members` junction table for multi-user orgs; `businesses_owner_org_fkey` drops the original `businesses_owner_user_id_fkey` but doesn't add an index on `(organization_id, owner_user_id)`; `role` column added but no RLS policy uses it; no policy allowing `org_admin` to manage all businesses in their org | Critical |
| `scripts/seed.ts` | ⚠️ Mock-only | Only seeds `local-store/db.json` — no Supabase seed; uses `generateMockReviews` (fine for dev); hardcodes `desired[i % desired.length]!` non-null assertions; `console.log` formatting is slightly off (missing newline before "Run") | Low |

---

## 3. Top 20 Critical Backend Bugs (Ranked)

| # | Bug | Location | Impact |
|---|---|---|---|
| 1 | **`/api/dev/trigger` has no auth** — anyone can trigger any background job via query params | `app/api/dev/trigger/route.ts` | Remote code execution of background jobs; mass SMS/email sending via `send-review-request` |
| 2 | **No Stripe webhook handler** — checkout bypasses Stripe entirely, writes phantom subscriptions | `app/api/billing/checkout/route.ts` → `finalizeCheckout()` | Real payments never processed; subscriptions created without payment; revenue loss |
| 3 | **`/api/inngest` has no signature verification** — forged Inngest events accepted | `app/api/inngest/route.ts` | Attacker can trigger `review.received` events, causing AI draft generation + auto-posting |
| 4 | **Google `postReply` throws unconditionally in real mode** | `lib/integrations/google-business-profile.ts:82` | Replying to Google reviews is impossible in production |
| 5 | **Facebook `postReply` throws unconditionally in real mode** | `lib/integrations/facebook-graph.ts:75` | Replying to Facebook reviews is impossible in production |
| 6 | **Google `fetchReviews` hardcodes `accountId = ""`** | `lib/integrations/google-business-profile.ts:51` | Review polling 404s in real mode |
| 7 | **`SupabaseStore.signIn()` always throws** even in real mode | `lib/supabase/supabase-store.ts:55` | Real Supabase Auth is non-functional |
| 8 | **`autoPostIfEligible` uses `const token = "mock-token"` hardcoded** — auto-posts via mock integration even in real mode | `lib/inngest/generate-reply-draft.ts:75` | Auto-posted replies silently fail in production |
| 9 | **No `/r/[click_token]` route exists** — review request links in SMS/emails 404 | Missing route | Click tracking broken; `status = "clicked"` unreachable; conversion analytics lost |
| 10 | **`SubscriptionPlan` type includes `"enterprise"` but SQL enum doesn't** — inserting enterprise plan throws | `lib/types.ts:20` vs `0001_init.sql:29` | Enterprise plan cannot be persisted; type system lies |
| 11 | **`organizations` table has no RLS enabled** | `0002_add_organizations.sql` | Any authenticated user can read/modify any organization |
| 12 | **`MOCK_GOOGLE_LOCATIONS` used in production path with no `isMockMode()` guard** | `app/api/businesses/[id]/connect/google/route.ts:15` | Mock data leaks into production database |
| 13 | **N+1 query: 4 hot paths iterate all businesses to find one review/request by ID** | `reviews/[id]/draft`, `reviews/[id]/reply`, `inngest/generate-reply-draft`, `inngest/send-review-request` | O(n) DB calls per request; will not scale past ~10 businesses per user |
| 14 | **PII (`customer_contact`) stored as plain text** — no encryption despite `*_encrypted` naming convention elsewhere | `0001_init.sql:157` | Phone numbers/emails exposed in DB dumps; violates Data-Handling-Policy.md §2.2 |
| 15 | **No rate limiting anywhere** — sign-in, signup, AI draft, send-batch all unthrottled | All API routes | Brute-force, abuse, cost runaway (AI/SMS) |
| 16 | **Quick-add/batch send call `runSendReviewRequest` synchronously in the request handler** — blocks HTTP response until Twilio/Resend returns | `quick-add/route.ts:68`, `send-batch/route.ts:57` | 504 timeouts on large batches; poor UX |
| 17 | **No plan-limit enforcement** — `countRequestsThisMonth` exists but is never called before sending | `quick-add/route.ts`, `send-batch/route.ts` | Users can exceed plan limits; no overage billing |
| 18 | **`triggerJob` swallows errors silently** | `lib/inngest/client.ts:35` | Failed event delivery is invisible; `review.received` events lost without retry |
| 19 | **`createReviewRequest` in SupabaseStore doesn't auto-generate `click_token`** | `lib/supabase/supabase-store.ts:374` | NULL click_token breaks `/r/{token}` links for Supabase users |
| 20 | **`AI_MODEL = "claude-sonnet-4-6"`** is a non-existent Anthropic model | `lib/types.ts:151` | Real AI draft generation would 404 |

---

## 4. Top 10 Security Issues

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | `/api/dev/trigger` is unauthenticated and allows remote job invocation | **Critical** | `app/api/dev/trigger/route.ts` |
| 2 | `/api/inngest` has no Inngest signature verification — accepts forged events | **Critical** | `app/api/inngest/route.ts` |
| 3 | No Stripe webhook signature verification (no webhook handler at all) | **Critical** | Missing `app/api/webhooks/stripe/route.ts` |
| 4 | `organizations` table has RLS disabled — any authed user can read/modify any org | **Critical** | `0002_add_organizations.sql` |
| 5 | No rate limiting on auth, AI, or send endpoints — brute-force and abuse vectors | **High** | All API routes |
| 6 | PII (`customer_contact`) stored unencrypted despite policy mandate | **High** | `0001_init.sql:157` |
| 7 | No CSRF protection on state-changing POST routes (Next.js Server Actions have built-in CSRF, but these are route handlers) | **High** | All POST API routes |
| 8 | `active-business` cookie is not signed — users can tamper with it (mitigated by owner check downstream, but defense-in-depth violated) | **Medium** | `app/api/auth/active-business/route.ts` |
| 9 | OAuth tokens stored in columns named `*_encrypted` but never actually encrypted — mock values like `mock-enc-token-...` stored as plaintext | **High** | `connect/google/route.ts:52-53` |
| 10 | No input sanitization on `renderTemplate` — if `business.name` contains `{customer_name}`, template injection occurs (low impact but sloppy) | **Low** | `lib/inngest/send-review-request.ts:24-32` |

---

## 5. Missing API Endpoints (Essential for Enterprise SaaS)

| Endpoint | Purpose | Priority |
|---|---|---|
| `POST /api/auth/signup` | User registration with email verification | **Critical** |
| `POST /api/auth/signin` | Password-based sign-in (current `POST /api/auth` is mock-only) | **Critical** |
| `POST /api/auth/password-reset` | Password reset flow | **Critical** |
| `POST /api/auth/password-update` | Set new password after reset | **Critical** |
| `GET /api/auth/verify-email` | Email verification callback | High |
| `POST /api/auth/oauth/google` | Google OAuth sign-in initiation | High |
| `POST /api/auth/oauth/facebook` | Facebook OAuth sign-in initiation | High |
| `GET /api/oauth/google/callback` | Google OAuth callback (exchanges code for token) | **Critical** |
| `GET /api/oauth/facebook/callback` | Facebook OAuth callback | **Critical** |
| `POST /api/businesses/[id]/connect/facebook` | Facebook Page connect (only Google connect exists) | High |
| `POST /api/webhooks/stripe` | Stripe webhook receiver (checkout, invoice, subscription events) | **Critical** |
| `POST /api/webhooks/twilio` | Twilio delivery status + inbound SMS (STOP/HELP) | High |
| `POST /api/webhooks/resend` | Resend delivery/bounce webhook | Medium |
| `GET /api/r/[token]` | Click tracking redirect for review requests | **Critical** |
| `GET /api/reviews` | List reviews across businesses (currently only via business-scoped store method) | Medium |
| `GET /api/reviews/[id]` | Get single review directly (eliminates N+1) | **Critical** |
| `POST /api/reviews/[id]/ignore` | Mark review as ignored | Medium |
| `GET /api/dashboard/stats` | Aggregated dashboard metrics | Medium |
| `POST /api/organizations` | Create organization | High |
| `GET /api/organizations` | List user's organizations | High |
| `POST /api/organizations/[id]/members` | Invite team member | Medium |
| `DELETE /api/organizations/[id]/members/[userId]` | Remove team member | Medium |
| `POST /api/billing/portal` | Stripe Customer Portal session (function exists, no route) | High |
| `GET /api/billing/usage` | Current month usage / overage | Medium |
| `POST /api/unsubscribe` | SMS/email unsubscribe (10DLC compliance) | High |

---

## 6. Missing Background Jobs / Cron Tasks

| Job | Schedule | Purpose | Status |
|---|---|---|---|
| `poll-reviews` | Every 20 min | Pull new reviews from Google/Facebook | ✅ Registered (but broken in real mode) |
| `generate-reply-draft` | Event-driven | Draft AI reply on new review | ✅ Registered |
| `send-review-request` | Event-driven | Send SMS/email request | ✅ Registered (but no click tracking) |
| `daily-digest-email` | Daily 9am user-local | Send daily review summary when `daily_digest=true` | ❌ **Missing** |
| `new-review-notification` | Event-driven | Email/SMS owner on new review when `notify_new_review_email/sms=true` | ❌ **Missing** |
| `trial-expiration` | Daily midnight | Convert trialing subscriptions to active/past_due when `trial_ends_at` passes | ❌ **Missing** |
| `subscription-renewal-reminder` | 3 days before period end | Email owner before renewal | ❌ **Missing** |
| `review-request-cleanup` | Daily | Delete `review_requests` older than 30 days (Data-Handling-Policy §2.2) | ❌ **Missing** |
| `pii-retention-purge` | Monthly | Purge `customer_contact` for canceled subscriptions (policy mandate) | ❌ **Missing** |
| `oauth-token-refresh` | Hourly | Refresh expiring Google/Facebook OAuth tokens | ❌ **Missing** |
| `overage-usage-report` | Hourly | Report accumulated metered usage to Stripe | ❌ **Missing** (function exists, never called) |
| `bounce-handler` | Event-driven | Process Twilio/Resend bounce webhooks, mark contacts as undeliverable | ❌ **Missing** |

---

## 7. Database Schema Gaps

### Missing Tables
| Table | Purpose |
|---|---|
| `audit_logs` | Immutable record of state-changing actions (who/what/when) for compliance |
| `webhook_events` | Idempotency key store for Stripe/Twilio/Resend webhooks (prevent duplicate processing) |
| `oauth_tokens` | Separate table for Google/Facebook tokens with `expires_at`, `refresh_token`, `scopes` (currently crammed into `businesses`) |
| `org_members` | Junction table for multi-user organization membership with roles |
| `unsubscribe_list` | Phone/email denylist for 10DLC compliance |
| `review_request_clicks` | Click tracking analytics (currently `click_token` exists but no click event table) |
| `ai_usage` | Per-business AI token usage for billing/limits |

### Missing Columns
| Table | Column | Purpose |
|---|---|---|
| `businesses` | `phone_number` | Business phone for negative-review resolution (referenced in `draft-reply.ts` but not in schema) |
| `businesses` | `facebook_page_name` | Display name for connected FB page |
| `subscriptions` | `cancel_at_period_end` | Stripe cancellation semantics |
| `subscriptions` | `metered_usage_this_period` | Running overage counter |
| `review_requests` | `clicked_at` | When the click was registered |
| `review_requests` | `unsubscribed_at` | When the customer opted out |
| `users` | `last_sign_in_at` | Security audit |
| `users` | `trial_used` | Prevent multiple free trials |

### Missing RLS Policies
| Table | Issue |
|---|---|
| `organizations` | **RLS not enabled at all** — critical |
| `businesses` | Policy uses `owner_user_id = auth.uid()` but doesn't account for `org_admin`/`location_manager` roles added in 0002 |
| `subscriptions` | No policy for `org_admin` to view all subscriptions in their org |
| `review_requests` | No policy for `location_manager` role |

### Missing Indexes
| Index | Purpose |
|---|---|
| `businesses(owner_user_id)` | Speed up `getBusinessesForUser` |
| `businesses(organization_id)` | Speed up `getBusinessesForOrganization` |
| `subscriptions(business_id)` | Unique constraint + lookup (currently no index) |
| `review_requests(click_token)` | Click tracking lookup (currently full table scan) |
| `review_requests(status, created_at)` | Queue processing |
| `review_request_batches(business_id)` | List batches for a business |
| `review_replies(status)` | Find pending/failed replies |
| `reviews(status, business_id)` | Dashboard "new reviews" count |

### Other Schema Issues
- `subscription_plan` enum missing `'enterprise'` value (type mismatch with TypeScript)
- `customer_contact` is plain `text` — should be `bytea` or use `pgcrypto` encryption
- `*_oauth_token_encrypted` columns are `text` — should store encrypted blobs with key version metadata
- No `updated_at` columns on any table (no audit trail of last modification)
- No `deleted_at` soft-delete columns (hard deletes via `ON DELETE CASCADE`)

---

## 8. Integration Readiness Matrix

| Integration | Mock Mode | Real Mode | Notes |
|---|---|---|---|
| **Stripe** | ✅ 100% | 🟡 40% | `createCheckoutSession`, `changePlan`, `cancelSubscription`, `createPortalSession`, `reportOverageUsage` all have real implementations. **But:** checkout route doesn't call `createCheckoutSession`, no webhook handler, no idempotency keys, no signature verification, no enterprise price ID, `priceForPlan` doesn't handle enterprise. |
| **Twilio (SMS)** | ✅ 100% | 🟡 70% | Real `sendSms` works. **Missing:** delivery webhooks, STOP/HELP handling, E.164 normalization, retry/backoff, bounce tracking. |
| **Resend (Email)** | ✅ 100% | 🟡 60% | Real `sendEmail` works. **Missing:** verified domain config, delivery/bounce webhooks, retry, HTML template rendering, unsubscribe headers. |
| **Google Business Profile** | ✅ 100% | ❌ 10% | `fetchReviews` hardcodes empty `accountId`; `postReply` throws unconditionally. **Missing:** OAuth flow, token refresh, account/location resolution, real API integration. |
| **Facebook Graph** | ✅ 100% | ❌ 20% | `fetchPageRatings` looks plausible but URL-embeds access token; `postReply` throws unconditionally. **Missing:** OAuth flow, page token management, real comment posting. |
| **Anthropic (AI)** | N/A | 🟡 50% | Real `callAnthropic` works structurally. **Missing:** wrong model name (`claude-sonnet-4-6` doesn't exist), no retry, no timeout, no token usage tracking, no prompt injection defense. |
| **Inngest (Queue)** | ✅ 100% | 🟡 30% | Client + 3 functions registered. **Missing:** no signature verification on `/api/inngest`, `triggerJob` swallows errors, no Inngest Event Key configured, no dead-letter queue. |
| **Supabase (DB)** | ✅ 100% (local) | 🟡 50% | Store interface is clean. **Missing:** `signIn` throws in real mode, `listConnectedBusinesses` `.or()` filter is malformed, no migration runner script (referenced in package.json as `pnpm migrate` but `scripts/migrate.ts` doesn't exist). |

---

## 9. Mock Data Leak Audit

| Location | Mock Usage | Guarded? | Severity |
|---|---|---|---|
| `lib/integrations/google-business-profile.ts` | `generateMockReviews` | ✅ `if (USE_MOCKS \|\| !accessToken)` | OK |
| `lib/integrations/facebook-graph.ts` | `generateMockReviews` | ✅ `if (USE_MOCKS \|\| !accessToken)` | OK |
| `app/api/businesses/[id]/connect/google/route.ts` | `MOCK_GOOGLE_LOCATIONS` | ❌ **No `isMockMode()` check** | **Critical** |
| `scripts/seed.ts` | `generateMockReviews` | ✅ Dev-only script | OK |
| `lib/integrations/mock-data.ts` | Defines `MOCK_GOOGLE_LOCATIONS`, `MOCK_FACEBOOK_PAGES` | N/A (definition) | `MOCK_FACEBOOK_PAGES` is unused dead code |
| `lib/inngest/poll-reviews.ts` | `?? "mock-token"` fallback | ❌ Falls back to mock token in real mode if `oauth_token_encrypted` is null | High |
| `lib/inngest/generate-reply-draft.ts` | `const token = "mock-token"` | ❌ Hardcoded mock token in `autoPostIfEligible` | Critical |
| `app/api/reviews/[id]/reply/route.ts` | `?? "mock-token"` fallback | ❌ Falls back to mock token in real mode | High |

---

## 10. Type Safety Audit

| Issue | Location | Count |
|---|---|---|
| `as any` casts | `lib/auth.ts:50`, `app/api/auth/active-business/route.ts:19` | 2 |
| `as unknown as` casts | `lib/auth.ts:60,77`, `lib/integrations/stripe.ts:184` | 3 |
| Non-null assertions (`!`) | `lib/integrations/stripe.ts:131,132`, `lib/ai/draft-reply.ts:285`, `scripts/seed.ts` (multiple) | ~8 |
| `Partial<Business>` body casts without Zod | All POST/PATCH routes | 7 routes |
| Zod schemas defined | None — `zod` is a dependency but **never imported** | 0 |
| Untyped external API responses | Anthropic, Resend, Twilio, Google, Facebook all use inline `as` casts | 5 integrations |
| `event?.data as { review_id?: string }` | Inngest functions | 3 |

**Recommendation:** Add Zod schemas for all request bodies and webhook payloads. Replace `as any`/`as unknown as` with proper Next.js cookie typing (`Promise<ReadonlyRequestCookies>` in Next 14.2+).

---

## 11. Error Handling Audit

| Issue | Location |
|---|---|
| `triggerJob` catches and `console.log`s errors silently — no retry, no alerting | `lib/inngest/client.ts:33-40` |
| Most API routes have no top-level `try/catch` — unhandled errors produce Next.js default 500 with stack trace | All routes except `dev/trigger` and `active-business` |
| `runSendReviewRequest` doesn't catch integration errors — a Twilio throw kills the Inngest function | `lib/inngest/send-review-request.ts:72-81` |
| `runPollReviews` doesn't catch per-business errors — one bad business kills the whole poll cycle | `lib/inngest/poll-reviews.ts:29-85` |
| `draftReply` real path throws on non-OK response — no fallback to rule-based | `lib/ai/draft-reply.ts:295-298` |
| `SupabaseStore` methods throw raw Supabase errors — no wrapping, no PII redaction | `lib/supabase/supabase-store.ts` (all methods) |
| `setAll` in `server.ts` swallows errors silently | `lib/supabase/server.ts:46-53` |

---

## 12. Local-Store vs Supabase-Store Abstraction

**The abstraction is properly wired** via the `DataStore` interface in `lib/db.ts`. Both implementations conform to the same interface. The store is selected once at process start based on `USE_MOCKS` + presence of Supabase credentials.

**Issues:**
1. `SupabaseStore.signIn()` always throws — real auth flow is dead code.
2. `SupabaseStore.listConnectedBusinesses()` has a malformed `.or()` filter that won't work as intended.
3. `SupabaseStore.createReviewRequest` doesn't auto-generate `click_token` (LocalStore does).
4. `SupabaseStore.upsertSubscription` uses the service-role client (bypasses RLS) even for user-initiated actions — should use the server client with proper RLS policies.
5. `SupabaseStore.upsertReview` always sets `fetched_at` to now on conflict — should preserve original `fetched_at` for existing reviews (LocalStore does this correctly by returning the existing row).
6. Neither store implements a `getReviewById(id)` method — forcing the N+1 pattern in routes.

---

## 13. Recommendations (Prioritized)

### P0 — Block Production
1. Add authentication to `/api/dev/trigger` (gate behind `process.env.NODE_ENV !== 'production'` + admin check).
2. Add Inngest signature verification to `/api/inngest`.
3. Implement `/api/webhooks/stripe` with signature verification.
4. Fix `app/api/billing/checkout/route.ts` to call `createCheckoutSession()` in real mode.
5. Implement real Google/Facebook `postReply` (currently throws).
6. Fix Google `fetchReviews` `accountId` resolution.
7. Add RLS to `organizations` table.
8. Implement real Supabase Auth (signup/signin/password reset) or remove the real-mode branch.

### P1 — Ship-Blocker
9. Add `/api/r/[token]` click tracking route.
10. Add `getReviewById` / `getReviewRequestById` to `DataStore` to fix N+1.
11. Add `enterprise` to SQL enum or remove from TypeScript types.
12. Add rate limiting (Upstash Ratelimit + Redis).
13. Add Zod schemas to all request bodies.
14. Add `audit_logs` table + write on every state change.
15. Add `webhook_events` table for idempotency.

### P2 — Enterprise-Ready
16. Implement daily-digest + new-review-notification jobs.
17. Implement trial-expiration + renewal-reminder jobs.
18. Implement PII encryption for `customer_contact`.
19. Add OAuth token refresh job.
20. Add unsubscribe/bounce handling.
21. Add Stripe Customer Portal route.
22. Add org_members table + team invitation flow.

---

*End of backend audit report.*

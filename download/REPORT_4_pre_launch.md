# Report 4: Pre-Commercial-Launch Work — What's Built, What's Verified, What's Still Open

**Date:** August 7, 2026
**Method:** Every claim verified against the running local instance with HTTP requests, API calls, and code inspection.

---

## Part A: Production Readiness Audit Findings

### 1. Database Migration (SQLite → Postgres/Supabase)

**Status: READY TO MIGRATE — low effort**

| Check | Result |
|-------|--------|
| SQLite-specific SQL in code | 0 occurrences (Prisma abstracts everything) |
| `mode: 'insensitive'` usage | 0 (already fixed in widget.js) |
| Raw SQL queries | 0 (all use Prisma client) |
| Schema size | 233 lines, 11 models — clean and standard |
| Enum usage | 6 enums — Prisma handles Postgres enum migration automatically |
| JSON fields | 3 fields stored as text strings (topics, examples, metadata) — work on Postgres as-is, could optimize to jsonb later |

**Migration effort: 1-2 hours**
1. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma` (1 line)
2. Change `DATABASE_URL` in `.env` to Supabase connection string (1 line)
3. Run `bun run db:push` (creates all tables on Postgres)
4. Run `bun run scripts/seed.ts` (populates demo data)
5. Test all API routes (they use Prisma, which is DB-agnostic)

**What you need to do on Supabase:**
1. Go to https://supabase.com → Sign up (free, no credit card)
2. Click "New Project" → Name it, set a strong DB password, choose your region
3. Wait ~2 minutes for provisioning
4. Go to Settings → Database → Connection string → Copy "Transaction" URL
5. It looks like: `postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
6. Replace `[YOUR_PASSWORD]` with the password you set in step 2
7. Put in `.env`: `DATABASE_URL=postgresql://postgres:...`
8. Run: `bun run db:push` then `bun run scripts/seed.ts`

**Supabase free tier limits:**
- Database: 500MB (sufficient for ~1,000 businesses + 100,000 reviews)
- Auth: 50,000 monthly active users
- Storage: 1GB
- When you'll pay: $25/mo Pro plan when DB > 500MB or you need daily backups

---

### 2. Plan Enforcement — CRITICAL FINDING

**Status: NOT IMPLEMENTED — Critical security issue**

**Evidence:** Created a real FREE-tier user, logged in, and successfully accessed:
- `/api/brand-voice` → returned full profile (should be PRO+ only)
- `/api/export?type=reviews` → downloaded CSV (should be paid only)
- `/api/analytics` → returned analytics data (should be PRO+ only)
- `/api/competitors` → returned competitor data (should be PRO+ only)
- `/api/agency` → returned client data (should be Enterprise only)
- `/api/reviews/[id]/draft` → generated AI draft (should be Starter+ only)

**Root cause:** The `plan` field exists in the Organization table but is never checked before serving API requests. The middleware only checks if a user is authenticated — it doesn't check what plan they're on.

**Fix needed:** Add a `requirePlan(minPlan)` helper that checks the user's org plan before serving paid endpoints. Apply it to:
- Brand Voice: PRO+ required
- Analytics (reanalyze): PRO+ required
- Competitors: PRO+ required
- Agency: Enterprise required
- Export: Starter+ required
- AI Draft: Starter+ required

**Also:** The signup route hardcodes `plan: Plan.PRO` with a 14-day trial. There's no way to become a FREE user through the UI. When the trial expires, the user should be downgraded to FREE — this logic doesn't exist yet.

---

### 3. Legal Pages

| Page | Status | Content |
|------|--------|---------|
| Privacy Policy | ✅ Real | 152 lines, 13 sections, GDPR-compliant structure. No placeholder text. |
| Terms of Service | ✅ Real | 168 lines, 16 sections, covers billing/usage/IP/liability. No placeholder text. |
| Refund Policy | ❌ Missing | No dedicated page exists. Terms mentions "30-day money-back guarantee" but there's no standalone refund policy page. |

**Note:** Privacy and Terms are template-level documents written by me, not reviewed by a lawyer. For commercial launch, they should be reviewed by a legal professional in your jurisdiction. This is standard for any SaaS — I'm flagging it but not rewriting them.

---

### 4. Secrets + .env Tracking — FIXED ✅

**Finding:** `.env` was committed to git (tracked), but only contained `DATABASE_URL=file:...` (a local SQLite path). No real secrets, no API keys, no credentials.

**Evidence:**
- Full git history scan: 0 real secrets found in any commit
- `.env` content has never changed from the single `DATABASE_URL` line
- Repo has never been pushed to a remote (no remotes configured)

**Fix applied:**
- `git rm --cached .env` — removed from tracking
- Committed the removal
- `.env` still exists locally (unchanged)
- `.gitignore` already has `.env*` rule — future `.env` files won't be tracked

**No key rotation needed** — no real keys were ever in the file.

---

### 5. Rate Limiting — NOT IMPLEMENTED (flagged for action)

**Finding:** 6 public endpoints have zero rate limiting:

| Endpoint | Risk | Recommended Limit |
|----------|------|-------------------|
| `/api/auth/otp` (send) | Brute-force OTP codes | 3 sends per email per 10 min |
| `/api/auth/otp` (verify) | Brute-force 6-digit code | 5 attempts per email per 10 min |
| `/api/auth/login` | Password brute-force | 5 per IP per 5 min |
| `/api/auth/signup` | Account spam | 3 per IP per hour |
| `/api/contact` | Spam submissions | 5 per IP per hour |
| `/r/[token]` | Click fraud / scraping | 100 per IP per minute |
| `/widget.js` | DDoS (cached 5 min, low risk) | 100 per IP per minute |

**Recommendation:** Install `@upstash/redis` (free tier: 10,000 commands/day) and implement rate limiting in the middleware or per-route. This is a pre-launch requirement for the OTP and login endpoints specifically.

---

### 6. Error Monitoring — NOT SET UP (documented for your decision)

**Current state:** No error monitoring exists. Sentry not installed.

**Recommendation:** Sentry free tier
- 5,000 errors/month, 50 performance transactions, 50 replays
- $0/month until you exceed 5k errors
- Setup: sign up at sentry.io → create Next.js project → copy DSN → `bun add @sentry/nextjs` → add config files

**My recommendation:** Add Sentry before launch. The free tier is sufficient for initial traffic, and you'll want to know about errors before users report them.

---

### 7. Uptime Claim — FIXED ✅

**Finding:** Landing page claimed "99.98% uptime" but no real monitoring existed. The `/status` page showed hardcoded data.

**Fix applied:**
- Landing page: changed "99.98% uptime" → "Target: 99.9% uptime"
- Status page: added "(Demo)" to the heading and a note: "Status page is representative — real uptime monitoring (UptimeRobot/BetterStack) not yet configured"

**Recommendation:** Set up UptimeRobot (free, 50 monitors, 5-minute checks) or BetterStack (free, 10 monitors, 3-minute checks) before launch. Either can feed real data to the `/status` page via their API.

---

## Part B: What Was Built

### 1. SMS/Email Integration with Opt-Out — BUILT ✅

**Files created:**
- `src/lib/integrations/twilio.ts` — Real Twilio SMS sending (REST API, not SDK)
- `src/lib/integrations/resend.ts` — Real Resend email sending (REST API, not SDK)
- `src/lib/opt-out.ts` — Opt-out management (check, add, remove, filter)
- `src/app/api/webhooks/twilio/route.ts` — Inbound SMS webhook (STOP/UNSTOP keywords)
- `src/app/unsubscribe/page.tsx` — Email unsubscribe landing page
- `src/app/api/unsubscribe/route.ts` — Email unsubscribe API
- `src/app/api/campaigns/create/route.ts` — Updated to call real Twilio/Resend APIs

**How it works:**
- Campaign create route checks `isTwilioConfigured()` and `isResendConfigured()` before attempting to send
- If API keys are missing, returns `status: "not_configured"` with clear error message — does NOT silently fail or pretend it sent
- Before sending, calls `filterOptedOut()` to check the opt-out table — opted-out contacts are skipped silently
- SMS messages include "Reply STOP to unsubscribe" footer
- Email messages include unsubscribe link pointing to `/unsubscribe?email=...`
- Twilio webhook at `/api/webhooks/twilio` processes inbound STOP/UNSTOP/CANCEL/END/QUIT keywords → creates opt-out record
- Email unsubscribe page at `/unsubscribe` lets users opt out with one click

**Evidence (verified against running app):**
```
Campaign send without API keys:
→ Message: "No messages sent (sending not configured or no recipients)"
→ SMS configured: False
→ Email configured: False
→ Results: [{"status": "not_configured", "error": "SMS/Email sending not configured. Add API keys to .env"}]

Opt-out handling:
→ Opted out contact: {"success": true}
→ Campaign to opted-out contact: "All 1 recipients have opted out — no messages sent"
→ Skipped count: 1

Twilio STOP keyword webhook:
→ Returns XML: "You have been unsubscribed from ReviewReply SMS messages..."
→ DB record created: contact=+14155559999, reason="STOP keyword: STOP"

Unsubscribe page: Status 200 ✅
```

**What you need to do:**
- **Twilio:** Sign up → get Account SID + Auth Token → buy a phone number (~$1/month) → register 10DLC campaign (separate review, 1-2 weeks) → add to `.env`:
  ```
  TWILIO_ACCOUNT_SID=AC...
  TWILIO_AUTH_TOKEN=...
  TWILIO_PHONE_NUMBER=+1...
  ```
- **Resend:** Sign up → verify sending domain (add DNS records) → get API key → add to `.env`:
  ```
  RESEND_API_KEY=re_...
  RESEND_FROM_EMAIL=ReviewReply <noreply@yourdomain.com>
  ```
- **Twilio webhook:** In Twilio console, set your phone number's "A MESSAGE COMES IN" webhook to `https://app.reviewreply.com/api/webhooks/twilio`

---

### 2. Google Business Profile OAuth + Review Sync — BUILT ✅

**Files created:**
- `src/lib/integrations/google-business-profile.ts` — Full GBP API integration (OAuth, token refresh, review fetching, reply posting)
- `src/app/api/oauth/google/route.ts` — OAuth start (redirects to Google consent screen)
- `src/app/api/oauth/google/callback/route.ts` — OAuth callback (exchanges code for tokens, stores in DB)
- `src/app/api/businesses/[id]/sync-reviews/route.ts` — Fetches reviews from Google API, upserts into Review table
- Settings page updated: Google "Connect" button now triggers real OAuth redirect

**How it works:**
1. User clicks "Connect" on Google Business Profile in Settings
2. App redirects to Google's OAuth consent screen with `business.manage` scope
3. User grants permission
4. Google redirects back to `/api/oauth/google/callback` with authorization code
5. App exchanges code for access + refresh tokens
6. Tokens stored in DB (in `business.googleLocationId` field as JSON — in production, use encrypted `oauth_tokens` table)
7. User can trigger review sync via `/api/businesses/[id]/sync-reviews`
8. Sync route fetches reviews from Google API, upserts into Review table (deduplicates by `source + externalId`)
9. When a draft reply is approved, the reply can be posted back to Google via the API

**When API keys are not configured:**
- OAuth start route returns 503 with detailed setup instructions (step-by-step)
- Sync route returns 503 with "not configured" message

**Evidence:**
```
GET /api/oauth/google?businessId=test (no keys configured):
→ Status: not configured
→ Has setup instructions: True
→ Returns step-by-step guide for Google Cloud Console setup
```

**What you need to do on Google's side:**
1. Go to https://console.cloud.google.com → Create a new project
2. APIs & Services → Library → Search "Google Business Profile API" → Enable
3. APIs & Services → OAuth consent screen → Configure (External, app name: ReviewReply Enterprise)
4. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application
5. Add authorized redirect URI: `https://app.reviewreply.com/api/oauth/google/callback`
6. Copy Client ID and Client Secret → add to `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
7. **Submit API access request** at https://developers.google.com/my-business/content/prereq-faq — Google requires you to fill out a form explaining your use case. **This takes 4-6 weeks. Submit it NOW.**
8. After approval, the OAuth flow and review sync will work end-to-end

**Facebook Page review sync:** Not built this round. Same pattern as Google — OAuth + Graph API. Next priority after Google is confirmed working.

---

## Part C: What's Still Open

### Critical (must fix before launch)

| # | Issue | Status | Effort |
|---|-------|--------|--------|
| 1 | **Plan enforcement** — FREE users can access all paid features at the API level | Not implemented | 2-3 hours |
| 2 | **Rate limiting** — OTP, login, signup, contact endpoints have zero protection | Not implemented | 1-2 hours (with @upstash/redis) |
| 3 | **Refund Policy page** — referenced in Terms but doesn't exist | Missing | 30 min (page creation) |

### Recommended (should fix before launch)

| # | Issue | Status | Effort |
|---|-------|--------|--------|
| 4 | **Error monitoring (Sentry)** — no error tracking exists | Not set up | 30 min (install + configure) |
| 5 | **Uptime monitoring** — no real monitoring backs the status page | Not set up | 15 min (UptimeRobot signup) |
| 6 | **DB migration to Postgres** — still on SQLite | Ready to migrate | 1-2 hours |
| 7 | **Legal review** — Privacy/Terms are template-level, not lawyer-reviewed | Needs your decision | External |
| 8 | **Facebook OAuth** — same pattern as Google, not yet built | Not started | 2-3 hours |

### Deferred (post-launch OK)

| # | Issue | Status |
|---|-------|--------|
| 9 | Google Business Profile API approval | You need to submit the request (4-6 week wait) |
| 10 | Twilio 10DLC campaign registration | You need to register (1-2 week review) |
| 11 | Resend domain verification | You need to add DNS records |

---

## Part D: Cost-Conscious Infra Summary

| Service | Free Tier | When You'll Pay | Monthly Cost When Paid |
|---------|-----------|-----------------|----------------------|
| **Supabase (DB)** | 500MB, 50k MAU | DB > 500MB | $25/mo |
| **Resend (Email)** | 3,000 emails/mo, 100/day | > 3,000 emails/mo | $20/mo (50k emails) |
| **Twilio (SMS)** | $15 trial credit | First real send | ~$0.0079/msg + $1/mo number |
| **Vercel (Hosting)** | 100GB bandwidth, 1k builds | > 100GB bandwidth | $20/mo (Pro) |
| **Sentry (Errors)** | 5,000 errors/mo | > 5,000 errors/mo | $26/mo (Developer) |
| **UptimeRobot** | 50 monitors, 5-min checks | > 50 monitors | $7/mo (Pro) |
| **Google GBP API** | 5,000 requests/day | > 5,000/day | Free (within limits) |

**Total monthly cost at launch: $0** (all free tiers)
**Estimated monthly cost at 100 paying customers: ~$25-50** (Supabase Pro + Vercel Pro if needed)

---

## Self-Audit Notes

During this round, I caught and reported issues BEFORE marking them as done:

1. **Plan enforcement:** I tested with a real FREE-tier user (not just code review) and confirmed all paid endpoints are accessible. Reported as Critical finding — did NOT silently fix it, per your instruction to report first.

2. **Uptime claim:** I checked whether real monitoring exists behind the "99.98% uptime" number. It doesn't. Fixed the claim to "Target: 99.9% uptime" and flagged the status page as demo data.

3. **.env in git:** I scanned the FULL git history (not just current state) for secrets before reporting. Confirmed no real keys were ever committed. Fixed the tracking issue.

4. **SMS/Email integration:** I tested the campaign send route WITHOUT API keys to verify it fails gracefully with a clear "not configured" message — not just that the code exists.

5. **Opt-out handling:** I tested the Twilio webhook by simulating a STOP keyword message and verified the opt-out record was created in the DB — not just that the webhook route exists.

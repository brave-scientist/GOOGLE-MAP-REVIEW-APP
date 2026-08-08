# ReviewReply Enterprise — Production Deployment Guide

This document covers the **required production environment variables** and the
security model. Forgetting to set any of these will cause the app to **fail
closed** (deny access) rather than fail open (grant unintended access).

## Required environment variables

| Variable | Required? | Purpose | If unset |
|---|---|---|---|
| `DATABASE_URL` | **Required** | Prisma datasource URL (SQLite path or Postgres URL). | App will not start. |
| `SESSION_SECRET` | **Required in production** | Secret used to sign JWT session cookies. Must be at least 32 characters of high entropy. | Falls back to a hardcoded dev string — **detectable and forgeable** in production. App logs a warning but does NOT block startup; you MUST set this before exposing the app to the internet. |
| `ADMIN_EMAILS` | **Required for admin access** | Comma-separated list of email addresses that may access `/api/admin/*` routes (platform admin dashboard, trial extension, broadcast email). Example: `ADMIN_EMAILS="alice@yourco.com,bob@yourco.com"`. | **Fails closed** — every request to `/api/admin/*` returns `403 ADMINS_NOT_CONFIGURED`. No one, including the demo `owner@bamboogarden.com` account, has admin access. This is intentional: an unset `ADMIN_EMAILS` must NOT silently fall back to a hardcoded email (that email is documented in the demo login and would be a guessable admin backdoor). |
| `CRON_SECRET` | Optional but recommended | Bearer token required to call `/api/cron/downgrade-trials`. | Cron endpoint is open (anyone can trigger trial downgrades). Set this and have your scheduler send `Authorization: Bearer <token>`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth credentials for Google Business Profile integration. | Google integration disabled; `/api/oauth/google` returns 503 with setup instructions. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Optional | Twilio credentials for SMS sending. | SMS campaigns are queued but not sent; status `not_configured`. |
| `RESEND_API_KEY` | Optional | Resend API key for transactional email. | Email broadcasts and review-request emails are queued but not sent. |
| `NEXT_PUBLIC_APP_URL` | **Required in production** | Public URL of the deployment. Used in email links (unsubscribe, review-request) **and** for Twilio webhook signature validation. | Email links point to `http://localhost:3000` (broken in prod). **Twilio webhooks silently fail validation and return 403** — because the validator reconstructs the URL Twilio signed against, and if `NEXT_PUBLIC_APP_URL` is unset it falls back to the internal request URL (e.g. `http://10.0.0.5:3000/...`) which doesn't match what Twilio signed. Fails safe (rejects), but breaks all SMS opt-out/opt-in processing with no obvious error. |
| `SENTRY_DSN` | Optional but recommended | Sentry Data Source Name for error monitoring. Get from Sentry.io → Project Settings → Client Keys. Sentry is installed (`@sentry/nextjs`) and configured (`sentry.{client,server,edge}.config.ts`), but remains a **no-op until you set this**. Free tier covers 5K errors/month. | No error monitoring — unhandled exceptions are only visible in server logs. |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Optional | Sentry organization slug and project slug. Used for source-map uploads during build. | Source maps not uploaded to Sentry — stack traces in production errors will be minified. |
| `DATABASE_URL` (Postgres) | **Required for production** | Postgres connection string. Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`. Run `bash scripts/migrate-to-postgres.sh` after updating `.env` to migrate from SQLite. | App uses SQLite (`db/custom.db`) — fine for dev, **not suitable for production** (no concurrent writes, no backups, single-file). |

## Security model

### Multi-tenant isolation (SEC-01)

Every API route that reads or writes org-scoped data calls
`getTenantContext(request, minPlan?)` from `src/lib/tenant-context.ts`. This
helper:

1. Reads the session cookie and resolves the current user.
2. Verifies the user has an `orgId` (rejects with `403 NO_ORG` otherwise).
3. Fetches the org from the DB and applies trial-expiry downgrades (mirrors
   `src/lib/plan-enforcement.ts` so we don't need two DB round-trips).
4. Optionally enforces a minimum plan tier.
5. Returns `ctx.businessIds` — the list of `Business.id` rows in the user's
   org. **Every subsequent `db.review.*`, `db.campaign.*`, `db.business.*`
   query must filter on `businessId: { in: ctx.businessIds }` or
   `orgId: ctx.orgId`.**

For routes that take a `businessId` (URL param or body), call
`assertBusinessOwnership(ctx, businessId)` which returns `null` on success
or a `403` NextResponse on failure.

For routes that take a `reviewId`, call
`assertReviewOwnership(ctx, reviewId)` which fetches the review, checks
`businessId` is in `ctx.businessIds`, and returns the review on success
or `404` (NOT `403` — to avoid leaking that the review exists) on failure.

### Platform admin authorization (SEC-02)

Every route under `/api/admin/*` calls `requireAdmin(request)` from
`src/lib/admin-auth.ts`. This helper:

1. Reads the session cookie and resolves the current user.
2. Reads `process.env.ADMIN_EMAILS`.
3. **If `ADMIN_EMAILS` is unset or empty, denies everyone** with
   `403 ADMINS_NOT_CONFIGURED`. There is NO hardcoded fallback — the demo
   `owner@bamboogarden.com` email is NOT an admin by default.
4. If set, splits on commas, trims, lowercases, and checks if the user's
   email is in the list.

To grant admin access in production:
```bash
# .env (or your hosting provider's env var UI)
ADMIN_EMAILS="alice@yourco.com,bob@yourco.com"
```

To revoke admin access, remove the email from `ADMIN_EMAILS` and restart
the app. Existing sessions will continue to work until they expire (7 days)
or the user logs out; for immediate revocation, rotate `SESSION_SECRET`
(which forces all sessions to re-authenticate).

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up the database
npx prisma migrate dev --name init
npx prisma db seed   # seeds the demo Bamboo Garden org

# 3. (Optional) Grant yourself admin access for local admin-dashboard testing
#    Add to .env:
#    ADMIN_EMAILS="owner@bamboogarden.com"
#    Note: this is the demo login email. In production, use your real email.

# 4. Start the dev server
npm run dev
```

The demo login (`owner@bamboogarden.com` / any password) gives you a PRO-plan
account on the "Bamboo Garden Restaurant" org. Without `ADMIN_EMAILS` set in
`.env`, `/api/admin` returns `403 ADMINS_NOT_CONFIGURED` — this is the
correct production-safe behavior.

## Before scaling horizontally

The rate-limit store (`src/lib/rate-limit.ts`) is an in-memory `Map` —
**per-process**. This is fine for a single server instance, but if you deploy
multiple instances behind a load balancer, each instance gets its own counter
and the effective rate limit multiplies by your instance count (e.g. 4
instances → 12 OTP sends per 10 min per email instead of 3).

**Before adding a second server instance**, swap the in-memory store for a
shared backend. `@upstash/redis` is the recommended drop-in (the function
signature stays the same — only the storage backend changes). This affects:

- OTP send rate limit (SEC-04, 3/10min per email)
- OTP verify rate limit (SEC-04, 5/10min per email)
- Any future rate-limited routes that use the same `rateLimit()` helper

This is a known dev-scale limitation, not a bug — the file's header comment
flags it. Just don't forget when you scale.

## UptimeRobot setup (external, ~5 min)

UptimeRobot monitors your site from outside — it pings a URL every 5 minutes
and alerts you if it doesn't get a 200. This is purely external (account
creation on their side), but the code-side piece is ready:

1. **Health-check endpoint:** `GET /api/health` returns `200 {"status":"ok"}`
   if the app + DB are healthy, `503` if not. This is what UptimeRobot should
   monitor — it's a real signal, not just "is the process running".

2. **In UptimeRobot:** create a new monitor of type "HTTP(s)", URL
   `https://yourapp.com/api/health`, check interval 5 minutes. Set it to
   alert you (email/SMS/Discord) on 2 consecutive failures (avoids flapping).

3. **Status page (optional):** the `/status` page currently shows hardcoded
   uptime values. To show real UptimeRobot data, you can either:
   - Embed UptimeRobot's public status-page widget (requires their paid plan
     for custom domain), or
   - Fetch from UptimeRobot's API (`api.uptimerobot.com/v2/getMonitors`) and
     render the values server-side. This needs an `UPTIMEROBOT_API_KEY` env
     var. Not implemented yet — the hardcoded values are a placeholder.

No code-side work needed beyond what's already done — just create the
UptimeRobot account and point it at `/api/health`.

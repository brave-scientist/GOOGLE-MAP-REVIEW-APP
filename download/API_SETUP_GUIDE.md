# API Integration Setup Guide

This document explains how to obtain, configure, and integrate the third-party APIs needed to take ReviewReply Enterprise from demo mode to full production. Each section includes: what the API does, where to get it, how to integrate, the setup procedure, cost, and free tier availability.

## Table of Contents

1. [AI/LLM — z-ai-web-dev-sdk (ALREADY INTEGRATED)](#1-aillm--z-ai-web-dev-sdk-already-integrated)
2. [Google Business Profile OAuth](#2-google-business-profile-oauth)
3. [Facebook Graph API](#3-facebook-graph-api)
4. [Stripe — Payments & Billing](#4-stripe--payments--billing)
5. [Twilio — SMS & WhatsApp](#5-twilio--sms--whatsapp)
6. [Resend — Transactional Email](#6-resend--transactional-email)
7. [Google OAuth — Sign-in with Google](#7-google-oauth--sign-in-with-google)
8. [Slack — Real-time Alerts](#8-slack--real-time-alerts)
9. [Yelp Fusion API](#9-yelp-fusion-api)
10. [Trustpilot API](#10-trustpilot-api)
11. [Environment Variables Summary](#11-environment-variables-summary)

---

## 1. AI/LLM — z-ai-web-dev-sdk (ALREADY INTEGRATED)

**Status:** ✅ Integrated and working

**What it does:** Powers AI draft reply generation using GLM-4.6 (Claude 3.5 Sonnet equivalent).

**Where to get it:** Pre-installed in this project. The SDK is `z-ai-web-dev-sdk` and is imported server-side only.

**How it's integrated:**
- File: `src/app/api/reviews/[id]/draft/route.ts`
- The route calls `ZAI.create()` then `zai.chat.completions.create()` with a brand-voice system prompt
- Falls back to rule-based generation if the SDK is unavailable

**Cost:** Free (included with the Z.ai platform)

**Free tier:** Unlimited usage within the platform

---

## 2. Google Business Profile OAuth

**Status:** ⚠️ Requires manual setup

**What it does:** Fetches reviews from a business's Google Business Profile and posts replies on their behalf.

**Where to get it:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Business Profile API** (formerly Google My Business API)
4. Configure the OAuth consent screen
5. Create OAuth 2.0 Client ID credentials

**Setup procedure:**
1. **Create project:** Google Cloud Console → New Project → Name it "ReviewReply Production"
2. **Enable API:** APIs & Services → Library → Search "Google Business Profile API" → Enable
3. **Configure consent screen:**
   - APIs & Services → OAuth consent screen
   - User type: External (or Internal if you have a Google Workspace)
   - App name: ReviewReply Enterprise
   - Authorized domains: `reviewreply.pw`
   - Scopes needed:
     - `https://www.googleapis.com/auth/business.manage` (read reviews + post replies)
4. **Create credentials:**
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Web application
   - Authorized JavaScript origins: `https://reviewreply.pw`
   - Authorized redirect URIs: `https://reviewreply.pw/api/oauth/google/callback`
5. **Store credentials:**
   - Copy the Client ID and Client Secret
   - Add to `.env`: `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`

**Verification & approval:**
- The Google Business Profile API requires **verification** for production use
- Submit the OAuth consent screen for verification (can take 4-6 weeks)
- During development, add test users to the consent screen

**Cost:** Free

**Free tier:** 5,000 requests/day (sufficient for most use cases)

**Integration code location:** `src/app/api/businesses/[id]/connect/google/route.ts` (needs implementation)

---

## 3. Facebook Graph API

**Status:** ⚠️ Requires manual setup

**What it does:** Fetches reviews/ratings from Facebook Pages and posts replies.

**Where to get it:**
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app → App type: Business
3. Add the **Facebook Login** product
4. Add the **Pages** product
5. Generate an App ID and App Secret

**Setup procedure:**
1. **Create app:** developers.facebook.com → My Apps → Create App → Business
2. **Add products:**
   - Facebook Login (for OAuth)
   - Pages (for page management)
3. **Configure permissions:**
   - `pages_manage_metadata`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `read_page_mailboxes`
4. **Set OAuth redirect:**
   - Facebook Login → Settings → Valid OAuth Redirect URIs
   - Add: `https://reviewreply.pw/api/oauth/facebook/callback`
5. **App Review:** Submit for review to get advanced access to permissions
6. **Store credentials:**
   - `.env`: `FACEBOOK_APP_ID=...` and `FACEBOOK_APP_SECRET=...`

**Cost:** Free

**Free tier:** No hard limits, but rate-limited (200 calls/hour per user per app)

**Integration code location:** `src/app/api/businesses/[id]/connect/facebook/route.ts` (needs implementation)

---

## 4. Stripe — Payments & Billing

**Status:** ⚠️ Requires manual setup

**What it does:** Processes subscription payments, handles checkout, customer portal, webhooks, and metered billing.

**Where to get it:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Create a Stripe account (or log in)
3. Get your API keys from Developers → API Keys
4. Set up products and pricing

**Setup procedure:**
1. **Get API keys:**
   - Stripe Dashboard → Developers → API Keys
   - Copy the **Publishable key** (starts with `pk_`) and **Secret key** (starts with `sk_`)
   - `.env`: `STRIPE_SECRET_KEY=sk_...` and `STRIPE_PUBLISHABLE_KEY=pk_...`
2. **Create products:**
   - Stripe Dashboard → Products → Add product
   - Create 5 products: Free, Starter ($49), Pro ($99), Enterprise ($299), Agency ($499)
   - For each, create a monthly price and an annual price (20% discount)
   - Copy the Price IDs (`price_...`) and add to your config
3. **Configure webhook:**
   - Stripe Dashboard → Developers → Webhooks → Add endpoint
   - Endpoint URL: `https://reviewreply.pw/api/webhooks/stripe`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the **Signing secret** (starts with `whsec_`)
   - `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`
4. **Enable customer portal:**
   - Stripe Dashboard → Settings → Billing → Customer portal
   - Configure which features customers can self-manage

**Cost:** 2.9% + $0.30 per transaction (US cards), no monthly fee

**Free tier:** No monthly fee — you only pay when you process payments

**Integration code location:** `src/app/api/webhooks/stripe/route.ts` (needs implementation) and `src/app/api/billing/checkout/route.ts`

---

## 5. Twilio — SMS & WhatsApp

**Status:** ⚠️ Requires manual setup

**What it does:** Sends SMS review request messages, handles inbound SMS (STOP/UNSTOP opt-out keywords), supports WhatsApp Business messaging.

**Where to get it:**
1. Go to [Twilio Console](https://console.twilio.com/)
2. Sign up for a free account (gets $15 trial credit)
3. Get a phone number (trial numbers are free)
4. Register for A2P 10DLC (required for US business SMS)

**Setup procedure:**
1. **Get credentials:**
   - Twilio Console → Dashboard
   - Copy Account SID (starts with `AC`) and Auth Token
   - `.env`: `TWILIO_ACCOUNT_SID=AC...` and `TWILIO_AUTH_TOKEN=...`
2. **Get a phone number:**
   - Phone Numbers → Manage → Buy a number
   - For production: purchase a dedicated number (~$1/month)
   - `.env`: `TWILIO_PHONE_NUMBER=+1...`
3. **Register A2P 10DLC campaign (US only):**
   - Messaging → A2P 10DLC Registration
   - Register your brand (your business)
   - Create a campaign (use case: "Customer Care" or "Marketing")
   - This is required by US carriers — non-registered SMS will be blocked
   - Cost: $4-$50/month depending on campaign type
4. **Configure webhook for inbound SMS:**
   - Phone Numbers → Active numbers → Your number
   - A MESSAGE COMES IN: Webhook → `https://reviewreply.pw/api/webhooks/twilio`
   - This handles STOP/UNSTOP/START keywords for TCPA compliance
5. **WhatsApp Business (optional):**
   - Twilio Console → Messaging → WhatsApp
   - Submit WhatsApp Business profile for approval (Meta review, ~1 week)
   - Create message templates (must be pre-approved by Meta)

**Cost:**
- SMS: $0.0079 per message (US)
- WhatsApp: $0.005 per message (US)
- Phone number: $1.15/month (US local)
- A2P 10DLC: $4-$50/month depending on campaign

**Free tier:** $15 trial credit, trial phone number free, can only send to verified numbers

**Integration code location:** `src/app/api/webhooks/twilio/route.ts` (needs implementation) and `src/lib/integrations/twilio.ts`

---

## 6. Resend — Transactional Email

**Status:** ⚠️ Requires manual setup

**What it does:** Sends transactional emails (review requests, daily digests, trial expiration, win-back campaigns).

**Where to get it:**
1. Go to [Resend.com](https://resend.com/)
2. Sign up for a free account
3. Verify your sending domain
4. Get your API key

**Setup procedure:**
1. **Get API key:**
   - Resend Dashboard → API Keys → Create API Key
   - Permissions: Sending access
   - Copy the key (starts with `re_`)
   - `.env`: `RESEND_API_KEY=re_...`
2. **Verify sending domain:**
   - Resend Dashboard → Domains → Add Domain
   - Enter: `mail.reviewreply.pw` (or your domain)
   - Add the DNS records Resend provides (MX, SPF, DKIM)
   - Wait for verification (usually 5-30 minutes)
   - `.env`: `RESEND_FROM_EMAIL=ReviewReply <noreply@reviewreply.pw>`
3. **Create email templates:**
   - Resend Dashboard → Templates (optional)
   - Or use React Email for templating (recommended)
   - Templates needed: review-request, daily-digest, trial-expiring, trial-ended, welcome
4. **Configure webhook (optional):**
   - Resend Dashboard → Webhooks → Add webhook
   - URL: `https://reviewreply.pw/api/webhooks/resend`
   - Events: `email.bounced`, `email.complained`, `email.delivered`
   - `.env`: `RESEND_WEBHOOK_SECRET=...`

**Cost:**
- Free tier: 3,000 emails/month, 100 emails/day
- Pro: $20/month for 50,000 emails/month
- Scale: $80/month for 250,000 emails/month

**Free tier:** ✅ 3,000 emails/month free (perfect for getting started)

**Integration code location:** `src/lib/integrations/resend.ts` and `src/app/api/webhooks/resend/route.ts`

---

## 7. Google OAuth — Sign-in with Google

**Status:** ⚠️ Demo mode (simulated OAuth) — requires real setup

**What it does:** Lets users sign up/log in with their Google account instead of creating a password.

**Where to get it:** Same as Google Business Profile (Section 2) — use the same Google Cloud project.

**Setup procedure:**
1. **Use the same Google Cloud project** from Section 2
2. **Create separate OAuth credentials** (or reuse the same):
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Web application
   - Authorized JavaScript origins: `https://reviewreply.pw`
   - Authorized redirect URIs: `https://reviewreply.pw/api/auth/google/callback`
3. **Configure scopes:**
   - `openid` (required)
   - `email` (required)
   - `profile` (required for name + avatar)
4. **Install NextAuth.js (recommended):**
   ```bash
   bun add next-auth @auth/prisma-adapter
   ```
5. **Implement OAuth callback:**
   - Replace the demo `/api/auth/google` route with real NextAuth Google provider
   - Or implement the OAuth flow manually using `googleapis` package

**Cost:** Free

**Free tier:** Unlimited

**Current demo behavior:** The login page prompts for an email, then calls `/api/auth/google` which auto-creates/logs in the user. In production, this should redirect to Google's consent screen.

**Integration code location:** `src/app/api/auth/google/route.ts` (needs replacement with real OAuth)

---

## 8. Slack — Real-time Alerts

**Status:** ⚠️ Requires manual setup

**What it does:** Sends real-time alerts to Slack channels when negative reviews arrive, sentiment anomalies are detected, or competitor ratings change.

**Where to get it:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new Slack App
3. Configure OAuth scopes and permissions
4. Install the app to your workspace

**Setup procedure:**
1. **Create Slack App:**
   - api.slack.com/apps → Create New App → From scratch
   - App name: ReviewReply
   - Pick a workspace
2. **Configure OAuth scopes:**
   - OAuth & Permissions → Bot Token Scopes
   - Add: `chat:write` (send messages)
   - Add: `channels:read` (list channels)
   - Add: `incoming-webhook` (alternative: use webhooks instead of bot tokens)
3. **Install to workspace:**
   - OAuth & Permissions → Install to Workspace
   - Copy the Bot User OAuth Token (starts with `xoxb-`)
   - `.env`: `SLACK_BOT_TOKEN=xoxb-...`
4. **Invite bot to channels:** In Slack, type `/invite @ReviewReply` in the channels where you want alerts
5. **Alternative — Incoming Webhooks (simpler):**
   - Slack App → Incoming Webhooks → Activate
   - Create webhook for each channel
   - Store webhook URLs in DB per-business (let user pick channel during setup)

**Cost:** Free

**Free tier:** Free for standard usage (up to 10,000 messages/month per workspace)

**Integration code location:** `src/lib/integrations/slack.ts` (needs implementation)

---

## 9. Yelp Fusion API

**Status:** ⚠️ Requires manual setup

**What it does:** Fetches business reviews and ratings from Yelp.

**Where to get it:**
1. Go to [Yelp Developers](https://www.yelp.com/developers)
2. Create an app
3. Get your API Key

**Setup procedure:**
1. **Create app:**
   - Yelp Developers → Manage App → Create New App
   - App name: ReviewReply
   - Description: Review management platform
   - Accept terms
2. **Get API key:**
   - Copy the API Key
   - `.env`: `YELP_API_KEY=...`
3. **Use the API:**
   - `GET https://api.yelp.com/v3/businesses/{id}/reviews` — fetch reviews
   - `GET https://api.yelp.com/v3/businesses/matches` — find a business by name+phone
   - Rate limit: 5000 requests/day

**Cost:** Free

**Free tier:** 5,000 requests/day

**⚠️ Note:** Yelp's API terms prohibit displaying Yelp reviews alongside reviews from other platforms. ReviewReply currently shows them in the unified inbox — review Yelp's terms before enabling in production.

**Integration code location:** `src/lib/integrations/yelp.ts` (needs implementation)

---

## 10. Trustpilot API

**Status:** ⚠️ Requires manual setup

**What it does:** Fetches business reviews from Trustpilot.

**Where to get it:**
1. Go to [Trustpilot Business](https://business.trustpilot.com/)
2. Sign up for a business account
3. Apply for API access

**Setup procedure:**
1. **Apply for API access:**
   - Trustpilot Business → Settings → API
   - Apply for API access (requires a paid Trustpilot plan)
2. **Get credentials:**
   - Once approved, get your API Key and Secret
   - `.env`: `TRUSTPILOT_API_KEY=...` and `TRUSTPILOT_API_SECRET=...`
3. **Find your Business Unit ID:**
   - Use `GET https://api.trustpilot.com/v1/business-units/find?name=YourBusinessName`
4. **Use the API:**
   - `GET https://api.trustpilot.com/v1/business-units/{id}/reviews` — fetch reviews

**Cost:** Requires Trustpilot paid plan (starts at $250/month)

**Free tier:** ❌ No free tier — requires paid Trustpilot subscription

**Integration code location:** `src/lib/integrations/trustpilot.ts` (needs implementation)

---

## 11. Environment Variables Summary

Create a `.env.local` file with the following variables to enable all integrations:

```env
# Database
DATABASE_URL="file:./db/custom.db"

# AI/LLM (already configured — no env var needed, SDK handles auth)

# Google Business Profile + OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Facebook Graph API
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Stripe
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
# Add _ANNUAL variants for each plan

# Twilio (SMS + WhatsApp)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_WHATSAPP_NUMBER=whatsapp:+1...

# Resend (Email)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=ReviewReply <noreply@reviewreply.pw>
RESEND_WEBHOOK_SECRET=...

# Slack
SLACK_BOT_TOKEN=xoxb-...

# Yelp
YELP_API_KEY=...

# Trustpilot (requires paid plan)
TRUSTPILOT_API_KEY=...
TRUSTPILOT_API_SECRET=...

# App
NEXTAUTH_URL=https://reviewreply.pw
NEXTAUTH_SECRET=generate_a_random_32_char_string
```

## Priority Order for Setup

If you are setting up APIs for the first time, follow this order:

1. **AI/LLM** ✅ Already done (z-ai-web-dev-sdk)
2. **Stripe** — needed to collect payments (1-2 hours setup)
3. **Resend** — needed for email (30 min setup, free tier)
4. **Twilio** — needed for SMS (1-2 hours, requires 10DLC registration)
5. **Google Business Profile** — needed for review fetching (1 hour setup + 4-6 week verification)
6. **Google OAuth** — needed for Google sign-in (30 min, same project as GBP)
7. **Facebook** — needed for FB review fetching (1 hour setup + app review)
8. **Slack** — nice-to-have for alerts (15 min setup)
9. **Yelp** — nice-to-have (15 min setup, but review ToS)
10. **Trustpilot** — only if customers demand it (expensive)

## What Works Right Now (Without Any API Keys)

- ✅ Full app UI (all 24 pages)
- ✅ AI draft generation (real LLM via z-ai-web-dev-sdk)
- ✅ Auth (email/password + OTP + Google demo)
- ✅ Dashboard, Inbox, Analytics, Campaigns, Reviews
- ✅ Competitor Intelligence (mock data)
- ✅ Agency Dashboard (mock data)
- ✅ Compliance Center
- ✅ Billing UI (mock — no real charges)
- ✅ All footer pages (Privacy, Terms, About, Blog, Help, Contact, Status, Changelog)
- ✅ Command Palette
- ✅ Developer/Admin Dashboard
- ✅ Export to CSV
- ✅ Campaign builder (creates DB records, doesn't actually send SMS/email)
- ✅ Integration connect/disconnect (toggles state in DB)

## What Requires API Keys to Go Live

- ❌ Real Google review fetching (needs Google Business Profile API)
- ❌ Real Facebook review fetching (needs Facebook Graph API)
- ❌ Real SMS sending (needs Twilio)
- ❌ Real email sending (needs Resend)
- ❌ Real payment processing (needs Stripe)
- ❌ Real Google OAuth sign-in (needs Google OAuth setup)
- ❌ Real Slack alerts (needs Slack app)
- ❌ Real Yelp reviews (needs Yelp API key)
- ❌ Real Trustpilot reviews (needs Trustpilot paid plan)
